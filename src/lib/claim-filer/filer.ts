// =============================================================================
// Filer — the orchestrator.
// =============================================================================
// State machine: QUEUED -> PREFLIGHT -> FILING -> (FILED | FAILED | ABORTED)
//
// Called from:
//   - worker/handlers/file_claim (queued via POST /api/claims/[id]/file)
//
// In shadow mode the flow is:
//   preflight → nav → capture empty → fill → capture filled → capture
//   attestation → STOP (status FILED with shadow=true payload, no submit)
//
// In live mode the flow is:
//   ...same as shadow through attestation → click submit → wait nav →
//   extract confirmation → capture confirmation screenshot → status FILED
//
// Any error or abort transitions the claim to ABORTED (preflight) or
// FAILED (runtime).
// =============================================================================

import { db, schema } from '@db/client';
import { eq } from 'drizzle-orm';
import { writeAudit } from '@lib/audit';
import {
  preflight,
  recordPreflightAbort,
  recordPreflightPass,
  type PreflightContext,
} from './preflight';
import { getContext } from './browser-pool';
import { fillGeneric, FRIENDLY_SLOT_NAMES } from './fillers/generic';
import { captureAttestation } from './attestation-capture';
import {
  captureEmptyForm,
  captureFilledForm,
  captureConfirmation,
  currentMode,
  findSubmitButton,
  extractConfirmationId,
  type FilerMode,
} from './submit';
import { emitProgress, emitScreenshot } from './progress';
import { notifyClaimFiled, notifyClaimFailed } from '@lib/notifier/discord';

export interface FilerResult {
  claimId: number;
  mode: FilerMode;
  status: 'FILED' | 'FAILED' | 'ABORTED';
  confirmationId: string | null;
  screenshots: {
    emptyForm: string | null;
    filledForm: string | null;
    confirmation: string | null;
  };
  attestationText: string | null;
  reason: string | null;
}

export async function fileClaim(claimId: number): Promise<FilerResult> {
  const mode = currentMode();
  console.log(`[filer] ${mode.toUpperCase()} mode — starting claim #${claimId}`);

  // ---------- Preflight ----------
  const pre = await preflight(claimId);

  // We need userId for audit even on failure; pull from DB if preflight
  // couldn't load the claim.
  let userIdForAudit: number | null = null;
  if (pre.ok) {
    userIdForAudit = pre.ctx.claim.userId;
  } else {
    const rows = await db
      .select({ userId: schema.claims.userId })
      .from(schema.claims)
      .where(eq(schema.claims.id, claimId))
      .limit(1);
    userIdForAudit = rows[0]?.userId ?? null;
  }

  if (!pre.ok) {
    if (userIdForAudit != null) {
      await recordPreflightAbort(claimId, userIdForAudit, pre.reason, pre.detail);
    }
    return {
      claimId,
      mode,
      status: 'ABORTED',
      confirmationId: null,
      screenshots: { emptyForm: null, filledForm: null, confirmation: null },
      attestationText: null,
      reason: `${pre.reason}: ${pre.detail}`,
    };
  }

  const { ctx } = pre;
  const userId = ctx.claim.userId;
  await recordPreflightPass(claimId, userId);

  // ---------- Mark as FILING ----------
  await db
    .update(schema.claims)
    .set({ status: 'FILING' })
    .where(eq(schema.claims.id, claimId));
  await writeAudit({
    userId,
    eventType: 'CLAIM_FILING_STARTED',
    entityType: 'claim',
    entityId: claimId,
    payload: { mode },
    actor: 'filer',
  });

  // ---------- Browser + navigate ----------
  let emptyPath: string | null = null;
  let filledPath: string | null = null;
  let confirmPath: string | null = null;
  let confirmationId: string | null = null;
  let attestationText: string | null = null;

  try {
    emitProgress({ claimId, type: 'status', message: 'Opening browser...' });
    // headless: false = opens a VISIBLE Chrome window so the user can watch
    const browserCtx = await getContext(ctx.settlement.administrator, { headless: false });
    const page = await browserCtx.newPage();

    try {
      if (!ctx.settlement.claimFormUrl) {
        throw new Error('claim form url missing at fill time');
      }

      emitProgress({ claimId, type: 'status', message: `Navigating to claim form...` });
      await page.goto(ctx.settlement.claimFormUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      });
      await page.waitForTimeout(1500);

      // Screenshot 1 — empty form
      emptyPath = await captureEmptyForm(page, claimId);
      await emitScreenshot(page, claimId, 'Empty form loaded');

      // Load profile
      const profileRows = await db
        .select()
        .from(schema.profile)
        .where(eq(schema.profile.userId, userId))
        .limit(1);
      const profile = profileRows[0] ?? null;

      emitProgress({ claimId, type: 'status', message: 'Filling out the form...' });

      // Fill generic slots WITH progress callbacks
      const fillResult = await fillGeneric(page, profile, {
        onField: async (slot, value, filled, total) => {
          const friendlyName = FRIENDLY_SLOT_NAMES[slot] ?? slot;
          emitProgress({
            claimId,
            type: 'field',
            message: `Typing ${friendlyName}...`,
            fieldName: friendlyName,
            fieldValue: slot === 'email' ? value.replace(/(.{2}).*(@.*)/, '$1***$2') : value,
            filledCount: filled,
            totalFields: total,
          });
          // Take a screenshot after every 2 fields so viewer sees progress
          if (filled % 2 === 0 || filled === total) {
            await emitScreenshot(page, claimId, `Filled ${filled} of ${total} fields`);
          }
        },
      });
      console.log(
        `[filer] filled ${fillResult.filled}/${fillResult.filled + fillResult.skipped} fields`,
      );
      await page.waitForTimeout(500);

      // Screenshot 2 — filled form
      filledPath = await captureFilledForm(page, claimId);
      await emitScreenshot(page, claimId, 'All fields filled');

      // ---------- Attestation capture (legally critical) ----------
      emitProgress({ claimId, type: 'status', message: 'Finding attestation checkbox...' });
      const attestation = await captureAttestation(page);
      if (!attestation.checkboxFound) {
        throw new Error(
          `attestation capture failed (source=${attestation.source}) — refusing to submit`,
        );
      }
      attestationText = attestation.text;
      emitProgress({ claimId, type: 'status', message: 'Attestation found — preparing to submit' });

      // Persist submitted data + attestation snapshot BEFORE clicking submit
      await db
        .update(schema.claims)
        .set({
          submittedFormDataJson: {
            plans: fillResult.plans,
            filled: fillResult.filled,
            skipped: fillResult.skipped,
            mode,
          },
          submittedAttestationText: attestationText,
          screenshotEmptyFormPath: emptyPath,
          screenshotFilledFormPath: filledPath,
        })
        .where(eq(schema.claims.id, claimId));

      if (mode === 'shadow') {
        // Stop here. Transition to FILED with a "shadow" marker in the
        // audit payload so it's distinguishable from a real filing.
        await db
          .update(schema.claims)
          .set({ status: 'FILED', filedAt: new Date() })
          .where(eq(schema.claims.id, claimId));
        await writeAudit({
          userId,
          eventType: 'CLAIM_FILED',
          entityType: 'claim',
          entityId: claimId,
          payload: { mode: 'shadow', attestationSource: attestation.source, confirmationId: null },
          actor: 'filer',
        });
        notifyClaimFiled({
          caseName: ctx.settlement.caseName,
          confirmationId: null,
          payoutEstimate: ctx.settlement.payoutEstimate,
        }).catch(() => undefined);
        emitProgress({ claimId, type: 'done', message: 'Claim submitted in preview mode! Switch to Live mode to actually submit.' });
        return {
          claimId,
          mode,
          status: 'FILED',
          confirmationId: null,
          screenshots: { emptyForm: emptyPath, filledForm: filledPath, confirmation: null },
          attestationText,
          reason: null,
        };
      }

      // ---------- LIVE: click the attestation checkbox, then submit ----------
      emitProgress({ claimId, type: 'status', message: 'Checking attestation box...' });
      if (attestation.selector) {
        try {
          await page.locator(attestation.selector).first().check({ force: false });
        } catch {
          // Some sites style the label not the checkbox; try clicking the
          // associated label.
          try {
            await page.locator(attestation.selector).first().click();
          } catch {
            // Still failed — abort rather than submit unattested.
            throw new Error('failed to check attestation checkbox');
          }
        }
      }

      emitProgress({ claimId, type: 'status', message: 'Looking for submit button...' });
      const submitBtn = await findSubmitButton(page);
      if (!submitBtn) {
        throw new Error('submit button not found');
      }
      emitProgress({ claimId, type: 'status', message: 'Form complete — submitting in 3 seconds...' });
      await emitScreenshot(page, claimId, 'Form filled — about to submit');
      // Pause so the user can see the completed form before we click submit
      await page.waitForTimeout(3000);
      emitProgress({ claimId, type: 'status', message: 'Clicking submit...' });

      await Promise.all([
        page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => undefined),
        submitBtn.click(),
      ]);
      await page.waitForTimeout(2000);

      emitProgress({ claimId, type: 'status', message: 'Waiting for confirmation...' });
      confirmationId = await extractConfirmationId(page);
      confirmPath = await captureConfirmation(page, claimId);
      await emitScreenshot(page, claimId, confirmationId ? `Confirmed! #${confirmationId}` : 'Submitted — checking for confirmation');

      await db
        .update(schema.claims)
        .set({
          status: 'FILED',
          filedAt: new Date(),
          confirmationId,
          screenshotConfirmationPath: confirmPath,
        })
        .where(eq(schema.claims.id, claimId));
      await writeAudit({
        userId,
        eventType: 'CLAIM_FILED',
        entityType: 'claim',
        entityId: claimId,
        payload: { mode: 'live', confirmationId, attestationSource: attestation.source },
        actor: 'filer',
      });
      notifyClaimFiled({
        caseName: ctx.settlement.caseName,
        confirmationId,
        payoutEstimate: ctx.settlement.payoutEstimate,
      }).catch(() => undefined);
      emitProgress({ claimId, type: 'done', message: confirmationId ? `Claim submitted! Confirmation: ${confirmationId}` : 'Claim submitted successfully!' });

      return {
        claimId,
        mode,
        status: 'FILED',
        confirmationId,
        screenshots: { emptyForm: emptyPath, filledForm: filledPath, confirmation: confirmPath },
        attestationText,
        reason: null,
      };
    } finally {
      try {
        await page.close();
      } catch {
        // ignore
      }
    }
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`[filer] claim ${claimId} failed: ${msg}`);
    await db
      .update(schema.claims)
      .set({
        status: 'FAILED',
        lastError: msg,
        retryCount: (ctx.claim.retryCount ?? 0) + 1,
        screenshotEmptyFormPath: emptyPath,
        screenshotFilledFormPath: filledPath,
      })
      .where(eq(schema.claims.id, claimId));
    await writeAudit({
      userId,
      eventType: 'CLAIM_FAILED',
      entityType: 'claim',
      entityId: claimId,
      payload: { error: msg, mode },
      actor: 'filer',
    });
    notifyClaimFailed({
      caseName: ctx.settlement.caseName,
      reason: msg,
    }).catch(() => undefined);
    return {
      claimId,
      mode,
      status: 'FAILED',
      confirmationId: null,
      screenshots: { emptyForm: emptyPath, filledForm: filledPath, confirmation: null },
      attestationText,
      reason: msg,
    };
  }
}

// Queue a claim row for a given match. Called from POST /api/claims/[id]/file
// or from a "File this" button on the review page.
export async function queueClaim(
  matchId: number,
): Promise<{ claimId: number } | { error: string }> {
  const rows = await db
    .select({
      m: schema.matches,
      s: schema.settlements,
    })
    .from(schema.matches)
    .innerJoin(schema.settlements, eq(schema.matches.settlementId, schema.settlements.id))
    .where(eq(schema.matches.id, matchId))
    .limit(1);
  const joined = rows[0];
  if (!joined) return { error: 'match not found' };

  if (joined.m.verdict !== 'ELIGIBLE') {
    return { error: `cannot queue a ${joined.m.verdict} match` };
  }
  if (joined.s.proofRequired) {
    return { error: 'settlement requires proof — excluded from auto-filing' };
  }

  // Find an active authorization for the settlement's category
  const authRows = await db
    .select()
    .from(schema.classAuthorizations)
    .where(eq(schema.classAuthorizations.userId, joined.m.userId))
    .limit(100);
  const auth = authRows.find(
    (a) => a.category === joined.s.category && a.enabled && !a.revokedAt,
  );
  if (!auth) {
    return { error: `no active authorization for category ${joined.s.category}` };
  }

  // Don't double-queue the same match
  const existing = await db
    .select()
    .from(schema.claims)
    .where(eq(schema.claims.matchId, matchId))
    .limit(1);
  if (existing[0]) return { claimId: existing[0].id };

  const inserted = await db
    .insert(schema.claims)
    .values({
      userId: joined.m.userId,
      settlementId: joined.s.id,
      matchId: joined.m.id,
      classAuthorizationId: auth.id,
      status: 'QUEUED',
    })
    .returning();

  const claimId = inserted[0]!.id;

  // Enqueue a file_claim job
  await db.insert(schema.jobs).values({
    userId: joined.m.userId,
    type: 'file_claim',
    payloadJson: { claimId },
    priority: 50,
  });

  await writeAudit({
    userId: joined.m.userId,
    eventType: 'CLAIM_QUEUED',
    entityType: 'claim',
    entityId: claimId,
    payload: { matchId, settlementId: joined.s.id },
    actor: 'user',
  });

  return { claimId };
}

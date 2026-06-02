import { db, schema } from '@db/client';
import { SETTLEMENT_CATEGORIES, type SettlementCategory } from '@db/schema';
import { eq } from 'drizzle-orm';
import { currentUserId } from '@lib/auth/current-user';
import { isSettlementCategoryEnabled } from '@lib/features';
import AuthorizationCard from '../authorizations/AuthorizationCard';
import AuthorizationCommandBrowser, { type AuthorizationBrowserRow } from '../authorizations/AuthorizationCommandBrowser';

export const dynamic = 'force-dynamic';

const DEFAULT_ATTESTATIONS: Record<SettlementCategory, string> = {
  CONSUMER_PRODUCT_PURCHASE:
    'I certify under penalty of perjury that I purchased the listed consumer products during the relevant class periods.',
  SUBSCRIPTION_SERVICE:
    'I certify under penalty of perjury that I subscribed to the listed services during the relevant class periods.',
  DATA_BREACH:
    'I certify under penalty of perjury that my personal information was exposed in the listed data breaches.',
  ROBOCALL_TCPA:
    'I certify under penalty of perjury that I received unsolicited calls or texts at the listed phone numbers.',
  DECEPTIVE_ADVERTISING:
    'I certify under penalty of perjury that I purchased the listed products in reliance on the advertising at issue.',
  AUTO_DEFECT:
    'I certify under penalty of perjury that I owned or leased the listed vehicles during the relevant periods.',
  EMPLOYMENT:
    'I certify under penalty of perjury that I was employed by the listed employers during the relevant periods.',
  UNKNOWN: '',
};

function categoryLabel(category: string) {
  return category
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function fmtDate(date: Date | null | undefined) {
  return date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
}

export default async function PermissionsPage() {
  const userId = await currentUserId();
  const rows = await db
    .select()
    .from(schema.classAuthorizations)
    .where(eq(schema.classAuthorizations.userId, userId));

  const byCategory = new Map(rows.map((row) => [row.category, row]));
  const categories = SETTLEMENT_CATEGORIES.filter((category) => (
    category !== 'UNKNOWN' && isSettlementCategoryEnabled(category)
  ));
  const enabledCount = rows.filter((row) => (
    row.enabled && !row.revokedAt && isSettlementCategoryEnabled(row.category)
  )).length;
  const disabledCount = Math.max(categories.length - enabledCount, 0);
  const revokedCount = rows.filter((row) => row.revokedAt && isSettlementCategoryEnabled(row.category)).length;
  const versionedCount = rows.filter((row) => (
    row.attestationVersion > 1 && isSettlementCategoryEnabled(row.category)
  )).length;
  const automationLedgerRows: Array<{
    title: string;
    body: string;
    status: 'pass' | 'warn';
  }> = [
    {
      title: 'Review mode by default',
      body: `${enabledCount} allowed categories can move into claim review, but live filing stays behind runtime mode and explicit category permission.`,
      status: 'pass',
    },
    {
      title: 'No made-up facts',
      body: 'Permission never lets ClaimBot invent purchases, breach notices, signatures, or proof documents.',
      status: 'pass',
    },
    {
      title: 'Instant category pause',
      body: `${disabledCount + revokedCount} blocked or revoked categories are excluded from new claim tracking and filing attempts.`,
      status: disabledCount + revokedCount > 0 ? 'warn' : 'pass',
    },
    {
      title: 'Saved activity history',
      body: 'Every save records the exact attestation text, version, timestamp, and category rule used for review.',
      status: 'pass',
    },
  ];
  const authorizationBrowserRows: AuthorizationBrowserRow[] = categories.map((category) => {
    const existing = byCategory.get(category);
    const isEnabled = !!(existing?.enabled && !existing?.revokedAt);
    const isRevoked = !!existing?.revokedAt;
    const defaultAttestation = DEFAULT_ATTESTATIONS[category];
    const attestationText = existing?.attestationText ?? defaultAttestation;
    const status = isEnabled ? 'active' : isRevoked ? 'revoked' : 'shadow';

    return {
      category,
      label: categoryLabel(category),
      status,
      statusLabel: isEnabled ? 'Permission saved' : isRevoked ? 'Paused' : 'Review only',
      statusDetail: isEnabled
        ? 'This category can enter paid full automation after matcher, proof, plan, form, and account checks pass.'
        : isRevoked
          ? 'This category is blocked from new claim tracking until the user saves a fresh attestation.'
          : 'This category remains out of final checks until the user manually confirms the attestation.',
      version: existing?.attestationVersion ?? 1,
      authorizedAt: fmtDate(existing?.authorizedAt),
      revokedAt: fmtDate(existing?.revokedAt),
      attestationPreview: attestationText || 'No default attestation is available for this category.',
    };
  });

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Claim permissions</div>
          <h1>Permissions</h1>
          <p>
            Choose which claim types ClaimBot may review. ClaimBot refuses to track or submit a
            claim unless that category has saved permission.
          </p>
        </div>
      </div>

      {enabledCount === 0 && (
        <section className="authorization-zero-command" aria-label="Permission consent command">
          <div>
            <div className="eyebrow">Consent boundary</div>
            <h2>Permission required before automation</h2>
            <p>
              No category can enter the filing lane until the user makes a deliberate category choice
              and saves the verbatim attestation text.
            </p>
          </div>
          <div className="authorization-zero-actions">
            <a className="btn" href="#category-authorizations">Review claim types</a>
            <a className="btn ghost" href="/claims">Keep review only</a>
          </div>
          <div className="authorization-zero-safety">
            <strong>Safety boundary</strong>
            <p>
              All permission changes are recorded. Review mode is the default; no claim is submitted
              without verified proof and manual review.
            </p>
          </div>
        </section>
      )}

      <section className="dashboard-section section-flush">
        <header className="section-header">
          <h2>Permission coverage</h2>
          <p className="muted">
            Category permissions are the user-control step between possible matches and claim
            preparation. ClaimBot stores the exact attestation text and checks it again before final checks.
          </p>
        </header>
        <div className="stats-grid" aria-label="Permission coverage">
          <div className="stat-card">
            <div className="stat-label">Allowed categories</div>
            <div className="stat-value green">{enabledCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Blocked categories</div>
            <div className={`stat-value ${disabledCount > 0 ? 'warn' : 'green'}`}>{disabledCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Revoked records</div>
            <div className={`stat-value ${revokedCount > 0 ? 'warn' : 'text'}`}>{revokedCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Updated attestations</div>
            <div className="stat-value text">{versionedCount}</div>
          </div>
        </div>
        <div className="trust-strip">
          <div className="trust-item">
            <strong>Verbatim attestation</strong>
            <span>The saved text is preserved exactly for audit and claim records.</span>
          </div>
          <div className="trust-item">
            <strong>Category-level permission</strong>
            <span>Permission unlocks only matching settlements in that category.</span>
          </div>
          <div className="trust-item">
            <strong>Revocation aware</strong>
            <span>Revoked or disabled categories stop new claim tracking and live filing attempts.</span>
          </div>
          <div className="trust-item">
            <strong>Final checks enforced</strong>
            <span>Eligibility, proof, deadline, and permission checks are rechecked before form work.</span>
          </div>
        </div>
      </section>

      <section className="automation-safety-ledger" aria-label="Automation Safety Ledger">
        <div className="automation-safety-ledger-head">
          <div>
            <div className="automation-safety-ledger-kicker">Automation safety</div>
            <h2>Permission controls before paid full automation</h2>
            <p>
              Category permission is the hard boundary between a possible match and a drafted
              claim form. These safeguards keep paid full automation controlled, pausable, and auditable.
            </p>
          </div>
          <a className="btn ghost" href="#category-authorizations">Confirm safeguards</a>
        </div>
        <div className="automation-safety-ledger-grid">
          {automationLedgerRows.map((row) => (
            <div key={row.title} className={`automation-safety-ledger-item ${row.status}`}>
              <span className={`status-dot ${row.status}`} aria-hidden="true" />
              <div>
                <strong>{row.title}</strong>
                <p>{row.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <AuthorizationCommandBrowser rows={authorizationBrowserRows} />

      <div id="category-authorizations" className="authorization-grid">
        {categories.map((category) => {
          const existing = byCategory.get(category);
          const isEnabled = !!(existing?.enabled && !existing?.revokedAt);
          return (
            <AuthorizationCard
              key={category}
              category={category}
              label={categoryLabel(category)}
              defaultAttestation={DEFAULT_ATTESTATIONS[category]}
              initialEnabled={isEnabled}
              initialAttestationText={existing?.attestationText ?? DEFAULT_ATTESTATIONS[category]}
              version={existing?.attestationVersion ?? 1}
              authorizedAt={fmtDate(existing?.authorizedAt)}
              revokedAt={fmtDate(existing?.revokedAt)}
            />
          );
        })}
      </div>
    </>
  );
}

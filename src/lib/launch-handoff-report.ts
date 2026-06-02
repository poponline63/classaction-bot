import fs from 'node:fs';
import path from 'node:path';
import { readLatestMatcherRunReceipt } from '@lib/audit/support-packet';
import { buildLaunchActionPlan, buildLaunchCommandQueue, summarizeLaunchActionPlan } from '@lib/launch-action-plan';
import {
  getLaunchCriticalPath,
  getLaunchExternalBlockerSummary,
  getMatcherReceiptCriticalPathBlockers,
} from '@lib/launch-handoff';
import {
  buildFullAutomationLaunchBlockers,
  summarizeFullAutomationLaunchBlockers,
} from '@lib/full-automation-launch-blockers';
import { getLaunchPacketArtifactRows, summarizeLaunchPacketArtifactRows } from '@lib/launch-packet-stack';
import { getLaunchReadiness } from '@lib/launch-readiness';
import { formatLocalVerificationDuration, readLocalVerificationPacket } from '@lib/local-verification-packet';
import { evaluateNetlifyProjectSetupReceipt } from '@lib/netlify-project-setup-receipt';
import { hostedOperatorNotes, verificationCommands } from '@lib/hosted-remediation';
import { buildOwnerHandoffBriefs } from '@lib/owner-handoff-briefs';
import { buildClientPreviewChecklist } from '@lib/client-preview-checklist';

const launchHandoffArtifactPath = 'data/launch-handoff-report.md';

function fileEvidence(relativePath: string, root = process.cwd()) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return {
      path: relativePath,
      exists: false,
      bytes: 0,
      modifiedAt: null,
    };
  }

  const stat = fs.statSync(absolutePath);
  return {
    path: relativePath,
    exists: true,
    bytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
  };
}

export async function buildLaunchHandoffReport(userId: number, root = process.cwd()) {
  const generatedAt = new Date().toISOString();
  const launchReadiness = await getLaunchReadiness();
  const localVerificationPacket = readLocalVerificationPacket(root);
  const netlifyProjectSetup = evaluateNetlifyProjectSetupReceipt(root);
  const matcherReceipt = await readLatestMatcherRunReceipt(userId);
  const clientPreviewChecklist = await buildClientPreviewChecklist(userId, root);
  const matcherReceiptReady = matcherReceipt.exists && matcherReceipt.errorCount === 0;
  const launchBlockers = [
    ...launchReadiness.blockers,
    ...getMatcherReceiptCriticalPathBlockers(matcherReceipt),
  ];
  const launchCriticalPath = getLaunchCriticalPath(launchBlockers, {
    netlifyIdentityReady: netlifyProjectSetup.identityReady,
  });
  const actionPlan = buildLaunchActionPlan(launchCriticalPath);
  const actionPlanSummary = summarizeLaunchActionPlan(actionPlan);
  const commandQueue = buildLaunchCommandQueue(actionPlan);
  const externalBlockerSummary = getLaunchExternalBlockerSummary(launchBlockers);
  const launchPacketRows = getLaunchPacketArtifactRows(matcherReceipt, root).map((row) => (
    row.path === launchHandoffArtifactPath
      ? {
        ...row,
        ready: true,
        tone: 'pass' as const,
        statusLabel: 'Handoff current',
        statusDetail: 'This launch handoff export is being generated from the current app state.',
        missingInputs: [],
        nextAction: 'This handoff is current for this export; rerun npm run launch:handoff after packet, launch, or hosted setup changes.',
        updatedAtLabel: 'Current export',
      }
      : row
  ));
  const launchPacketStackSummary = summarizeLaunchPacketArtifactRows(launchPacketRows);
  const blockedPackets = launchPacketRows.filter((row) => !row.ready);
  const fullAutomationLaunchBlockers = buildFullAutomationLaunchBlockers(launchPacketRows);
  const fullAutomationLaunchBlockerSummary = summarizeFullAutomationLaunchBlockers(fullAutomationLaunchBlockers);
  const ownerHandoffBriefs = buildOwnerHandoffBriefs(actionPlan, commandQueue, blockedPackets);

  return {
    format: 'claimbot.launch-handoff-report.v1',
    generatedAt,
    artifact: launchHandoffArtifactPath,
    note: 'Non-secret hosted launch handoff export. It omits API keys, session secrets, billing secrets, database tokens, checkout URLs, support mailbox values, raw env values, private profile facts, and raw user data.',
    accountScope: {
      accountId: userId,
      scope: 'account-scoped',
      matcherReceiptRequired: true,
      note: 'Launch handoff matcher proof is account-scoped. Regenerate this export from the signed client account before treating client-facing match evidence as preview-ready.',
    },
    summary: {
      clientPreviewReady:
        launchReadiness.clientPreviewReady
        && matcherReceiptReady
        && launchPacketStackSummary.ready,
      blockerCount: launchBlockers.length,
      warningCount: launchReadiness.warnings.length,
      filingMode: launchReadiness.mode,
      liveFilingFeatureEnabled: launchReadiness.liveFilingFeatureEnabled,
      sourceCatalogReady: launchReadiness.sourceCatalogReadiness.ok,
      sourceQualityReady: launchReadiness.sourceCatalogReadiness.sourceQualityReady,
      pwaReady: launchReadiness.pwaReadiness.ok,
      netlifyIdentityReady: netlifyProjectSetup.identityReady,
      netlifyPreviewReady: launchReadiness.netlifyPreviewReadiness.ok,
      previewPromotionReceiptReady: launchReadiness.previewPromotionReceiptReadiness.ok,
      matcherRunReceiptReady: matcherReceiptReady,
      codexProductReady: clientPreviewChecklist.summary.codexProductReady,
      externalProductBlockerCount: clientPreviewChecklist.summary.externalProductBlockerCount,
      launchPacketStackReady: launchPacketStackSummary.ready,
      launchPacketReadyCount: launchPacketStackSummary.readyCount,
      launchPacketTotalCount: launchPacketStackSummary.totalCount,
    },
    readiness: {
      ready: true,
      handoffOnly: true,
      boundary: 'A ready handoff export means the current launch evidence was evaluated for this signed account; it does not clear blocked hosted database, support/contact, billing, legal, Identity, deployed preview, matcher, packet-stack, or promotion proof.',
    },
    clientPreviewChecklistSummary: {
      productReadyCount: clientPreviewChecklist.summary.readyCount,
      productTotalCount: clientPreviewChecklist.summary.totalCount,
      codexProductReady: clientPreviewChecklist.summary.codexProductReady,
      externalProductBlockerCount: clientPreviewChecklist.summary.externalProductBlockerCount,
      ownerReadiness: clientPreviewChecklist.summary.ownerReadiness,
      note: 'Product readiness is split by owner so local Codex-owned product work stays separate from hosted database, billing, legal, Identity, and deployment proof.',
    },
    localTooling: {
      netlifyCli: launchReadiness.netlifyCliReadiness,
      localVerificationPacket,
      ignoredOperatorEnvLoaded: launchReadiness.ignoredOperatorEnvLoaded,
      ignoredOperatorEnvAvailable: launchReadiness.ignoredOperatorEnvAvailable,
      ignoredOperatorEnvNote: 'Loaded non-placeholder values from ignored .env.hosted.local and .env.launch.local files before readiness checks; no raw env values are written to this export.',
    },
    remoteSetupEvidence: {
      hostedEnvironment: {
        ok: launchReadiness.readiness.ok,
        failureCount: launchReadiness.readiness.failures.length,
        warningCount: launchReadiness.readiness.warnings.length,
        items: launchReadiness.readiness.items,
        note: 'Masked hosted-readiness evidence only; no database URLs, tokens, checkout URLs, secrets, or support mailbox values are included.',
      },
      netlifyProjectSetupReceipt: {
        ok: netlifyProjectSetup.ok,
        identityReady: netlifyProjectSetup.identityReady,
        receiptPath: path.relative(root, netlifyProjectSetup.receiptPath).replace(/\\/g, '/'),
        siteName: netlifyProjectSetup.receipt?.siteName ?? null,
        dashboardUrl: netlifyProjectSetup.receipt?.dashboardUrl ?? null,
        warnings: netlifyProjectSetup.warnings,
        failures: netlifyProjectSetup.failures,
      },
      netlifyPreview: launchReadiness.netlifyPreviewReadiness,
      previewPromotionReceipt: launchReadiness.previewPromotionReceiptReadiness,
      pwaReadiness: launchReadiness.pwaReadiness,
      databaseSchemaReadiness: launchReadiness.databaseSchemaReadiness,
      sourceCatalogReadiness: launchReadiness.sourceCatalogReadiness,
    },
    userConsentGate: {
      requiredTermsAck: 'terms-boundary:v1',
      termsEventType: 'USER_TERMS_ACKNOWLEDGED',
      enforcedBy: '/api/setup/complete',
      visibleControl: 'Final setup checkbox: I acknowledge the ClaimBot Terms boundary.',
      boundary: 'No legal advice, no eligibility or payout guarantee, proof-required claims stay manual, and paid automation remains gated by authorization, proof, plan, form, preflight, and filing-mode controls.',
    },
    matcherRunReceipt: matcherReceipt,
    launchCriticalPath,
    launchActionPlan: {
      summary: actionPlanSummary,
      rows: actionPlan,
      commandQueue,
      ownerHandoffBriefs,
    },
    launchActionPlanSummary: actionPlanSummary,
    launchActionPlanRows: actionPlan,
    operatorCommandQueue: commandQueue,
    ownerHandoffBriefs,
    externalBlockerSummary,
    launchPacketStack: {
      summary: launchPacketStackSummary,
      rows: launchPacketRows,
      hostedExportPaths: {
        supportPacket: '/api/audit/support-packet',
        netlifyLaunchDoctor: '/api/audit/netlify-launch-doctor',
        externalActivationWorkbook: '/api/audit/external-activation-workbook',
        clientPreviewChecklist: '/api/audit/client-preview-checklist',
        launchHandoff: '/api/audit/launch-handoff',
      },
      note: 'Packet stack readiness is based on non-secret packet artifacts and JSON companions when available; generated markdown alone is not treated as launch-ready proof.',
    },
    fullAutomationLaunchBlockers: {
      summary: fullAutomationLaunchBlockerSummary,
      rows: fullAutomationLaunchBlockers,
      boundary: 'Paid full automation remains locked until this list is empty, the launch packet stack is ready, and the account-specific client-preview checklist is ready.',
    },
    exports: {
      supportPacket: '/api/audit/support-packet',
      netlifyLaunchDoctor: '/api/audit/netlify-launch-doctor',
      externalActivationWorkbook: '/api/audit/external-activation-workbook',
      clientPreviewChecklist: '/api/audit/client-preview-checklist',
      launchHandoff: '/api/audit/launch-handoff',
    },
    verificationCommands,
    operatorNotes: hostedOperatorNotes,
    sourceEvidence: [
      'src/lib/launch-handoff-report.ts',
      'src/app/api/audit/launch-handoff/route.ts',
      'src/lib/launch-handoff.ts',
      'src/lib/launch-action-plan.ts',
      'src/lib/launch-packet-stack.ts',
      'src/lib/launch-readiness.ts',
      'src/lib/netlify-cli-readiness.ts',
      'src/lib/external-activation-workbook.ts',
      'src/lib/client-preview-checklist.ts',
      'src/lib/netlify-launch-doctor-receipt.ts',
      'src/app/launch/page.tsx',
      'src/app/packets/page.tsx',
      'data/launch-handoff-report.md',
    ].map((file) => fileEvidence(file, root)),
  };
}

export type LaunchHandoffReport = Awaited<ReturnType<typeof buildLaunchHandoffReport>>;

export function markdownLaunchHandoffReport(packet: LaunchHandoffReport) {
  return [
    '# ClaimBot Launch Handoff',
    '',
    `Generated: ${packet.generatedAt}`,
    '',
    'This is a non-secret hosted launch handoff. It does not print API keys, session secrets, billing secrets, database tokens, checkout URLs, support mailbox values, raw environment values, private profile facts, or raw user data.',
    '',
    '## Current Gate',
    '',
    `Client preview ready: ${packet.summary.clientPreviewReady ? 'yes' : 'no'}`,
    `Account scope: ClaimBot account #${packet.accountScope.accountId}`,
    `Matcher proof scope: ${packet.accountScope.scope}; ${packet.accountScope.note}`,
    `Blockers: ${packet.summary.blockerCount}`,
    `Warnings: ${packet.summary.warningCount}`,
    `Filing mode: ${packet.summary.filingMode}`,
    `Live filing feature enabled: ${packet.summary.liveFilingFeatureEnabled ? 'yes' : 'no'}`,
    `Source catalog ready: ${packet.summary.sourceCatalogReady ? 'yes' : 'no'}`,
    `Source quality ready: ${packet.summary.sourceQualityReady ? 'yes' : 'no'}`,
    `PWA ready: ${packet.summary.pwaReady ? 'yes' : 'no'}`,
    `Netlify Identity ready: ${packet.summary.netlifyIdentityReady ? 'yes' : 'no'}`,
    `Netlify preview ready: ${packet.summary.netlifyPreviewReady ? 'yes' : 'no'}`,
    `Promotion receipt ready: ${packet.summary.previewPromotionReceiptReady ? 'yes' : 'no'}`,
    `Matcher receipt ready: ${packet.summary.matcherRunReceiptReady ? 'yes' : 'no'}`,
    `Codex-owned product work ready: ${packet.summary.codexProductReady ? 'yes' : 'no'}`,
    `External product blockers: ${packet.summary.externalProductBlockerCount}`,
    `Launch packet stack ready: ${packet.summary.launchPacketStackReady ? 'yes' : 'no'}`,
    `Launch packets ready: ${packet.summary.launchPacketReadyCount}/${packet.summary.launchPacketTotalCount}`,
    `Boundary: ${packet.readiness.boundary}`,
    '',
    '## Product Readiness Split',
    '',
    `Product requirements ready: ${packet.clientPreviewChecklistSummary.productReadyCount}/${packet.clientPreviewChecklistSummary.productTotalCount}`,
    `Codex-owned product work ready: ${packet.clientPreviewChecklistSummary.codexProductReady ? 'yes' : 'no'}`,
    `External product blockers: ${packet.clientPreviewChecklistSummary.externalProductBlockerCount}`,
    `Rule: ${packet.clientPreviewChecklistSummary.note}`,
    '',
    ...packet.clientPreviewChecklistSummary.ownerReadiness.map((row) => (
      `- ${row.owner}: ${row.readyCount}/${row.totalCount} ready, ${row.blockedCount} blocked, ${row.reviewCount} review${row.ready ? ' (clear)' : ''}`
    )),
    '',
    '## Local Tooling',
    '',
    `Netlify CLI: ${packet.localTooling.netlifyCli.available ? packet.localTooling.netlifyCli.version ?? 'available' : 'not available'}`,
    `Netlify authentication: ${packet.localTooling.netlifyCli.authenticated ? 'authenticated' : 'not authenticated'}`,
    `Local verification packet: ${packet.localTooling.localVerificationPacket.ready ? `${packet.localTooling.localVerificationPacket.passed}/${packet.localTooling.localVerificationPacket.total} passed` : 'not ready'}`,
    `Local verification evidence: ${packet.localTooling.localVerificationPacket.path}`,
    `Local verification duration: ${formatLocalVerificationDuration(packet.localTooling.localVerificationPacket.totalDurationMs)}`,
    `Local verification stale source files: ${packet.localTooling.localVerificationPacket.staleSourceFiles.length}`,
    ...(packet.localTooling.localVerificationPacket.staleSourceFiles.length > 0
      ? [`Local verification stale source list: ${packet.localTooling.localVerificationPacket.staleSourceFiles.slice(0, 5).join(', ')}`]
      : []),
    `Customer page guard: ${packet.localTooling.localVerificationPacket.guardEvidence.customerRenderedCopyGuard.ready ? 'ready' : 'blocked'}`,
    `Customer page guard source: ${packet.localTooling.localVerificationPacket.guardEvidence.customerRenderedCopyGuard.source}`,
    `Local verification boundary: ${packet.localTooling.localVerificationPacket.boundary}`,
    `Ignored operator env loaded: ${packet.localTooling.ignoredOperatorEnvLoaded}/${packet.localTooling.ignoredOperatorEnvAvailable}`,
    `Boundary: ${packet.localTooling.ignoredOperatorEnvNote}`,
    '',
    '## Next Launch Actions',
    '',
    ...packet.launchCriticalPath.flatMap((row, index) => [
      `${index + 1}. ${row.label}: ${row.status === 'confirmed' ? 'clear' : `${row.blockerCount} blocker${row.blockerCount === 1 ? '' : 's'}`}`,
      `   Owner: ${row.owner}`,
      `   Proof: ${row.proofNeeded}`,
      `   Next: ${row.nextAction}`,
      ...row.blockers.slice(0, 4).map((blocker) => `   - ${blocker.label}`),
      ...(row.blockers.length > 4 ? [`   - +${row.blockers.length - 4} more`] : []),
      '',
    ]),
    '## Launch Action Plan',
    '',
    `Action steps blocked: ${packet.launchActionPlan.summary.blockedSteps}/${packet.launchActionPlan.summary.totalSteps}`,
    ...(packet.launchActionPlan.summary.nextStep
      ? [
        `Next step: ${packet.launchActionPlan.summary.nextStep.label}`,
        `Owner: ${packet.launchActionPlan.summary.nextStep.owner}`,
        `Action: ${packet.launchActionPlan.summary.nextStep.nextAction}`,
        `Execution boundary: ${packet.launchActionPlan.summary.nextStep.executionBoundary}`,
        `Required inputs: ${packet.launchActionPlan.summary.nextStep.requiredInputs.join(', ')}`,
        `Proof artifacts: ${packet.launchActionPlan.summary.nextStep.proofArtifacts.join(', ')}`,
      ]
      : ['Next step: none']),
    '',
    ...packet.launchActionPlan.rows.flatMap((row) => [
      `${row.order}. ${row.label}: ${row.status}`,
      `   Owner: ${row.owner}`,
      `   Objective: ${row.objective}`,
      `   Client impact: ${row.clientImpact}`,
      `   Execution boundary: ${row.executionBoundary}`,
      `   Required inputs: ${row.requiredInputs.join(', ')}`,
      `   Proof needed: ${row.proofNeeded}`,
      `   Next action: ${row.nextAction}`,
      `   Proof artifacts: ${row.proofArtifacts.join(', ')}`,
      '   Starter commands:',
      ...row.commands.slice(0, 6).map((command) => `   - \`${command}\``),
      ...(row.commands.length > 6 ? [`   - +${row.commands.length - 6} more commands in JSON`] : []),
      '',
    ]),
    '## Owner Handoff Briefs',
    '',
    ...(packet.ownerHandoffBriefs.length === 0
      ? ['- No blocked owner workstreams are currently recorded.']
      : packet.ownerHandoffBriefs.flatMap((brief) => [
        `- ${brief.owner}: ${brief.blockedWorkstreamCount} blocked workstream${brief.blockedWorkstreamCount === 1 ? '' : 's'}, ${brief.blockedPacketCount} blocked packet${brief.blockedPacketCount === 1 ? '' : 's'}`,
        `  First action: ${brief.firstAction}`,
        `  Workstreams: ${brief.workstreams.map((step) => step.label).join('; ') || 'None'}`,
        `  Required inputs: ${brief.requiredInputs.join('; ') || 'None'}`,
        `  Proof records: ${brief.proofArtifacts.join('; ') || 'None'}`,
        `  Next packet actions: ${brief.blockedPackets.length > 0 ? brief.blockedPackets.map((packet) => `${packet.label}: ${packet.nextAction}`).join('; ') : 'None'}`,
        `  Safe local commands: ${brief.safeLocalCommands.length > 0 ? brief.safeLocalCommands.map((command) => `\`${command}\``).join('; ') : 'None'}`,
        `  External-input commands: ${brief.externalInputCommands.length > 0 ? brief.externalInputCommands.map((command) => `\`${command}\``).join('; ') : 'None'}`,
      ])),
    '',
    '## Operator Command Queue',
    '',
    `Boundary: ${packet.operatorCommandQueue.note}`,
    '',
    'Local commands available now:',
    ...(packet.operatorCommandQueue.localNow.length === 0
      ? ['- None']
      : packet.operatorCommandQueue.localNow.slice(0, 12).map((item) => `- \`${item.command}\` (${item.sourceStepLabel})`)),
    ...(packet.operatorCommandQueue.localNow.length > 12 ? [`- +${packet.operatorCommandQueue.localNow.length - 12} more local commands in JSON`] : []),
    '',
    'Commands waiting on external input:',
    ...(packet.operatorCommandQueue.externalRequired.length === 0
      ? ['- None']
      : packet.operatorCommandQueue.externalRequired.slice(0, 12).map((item) => `- \`${item.command}\` (${item.sourceStepLabel})`)),
    ...(packet.operatorCommandQueue.externalRequired.length > 12 ? [`- +${packet.operatorCommandQueue.externalRequired.length - 12} more external-input commands in JSON`] : []),
    '',
    '## Launch Packet Stack',
    '',
    `Packet stack ready: ${packet.launchPacketStack.summary.ready ? 'yes' : 'no'}`,
    `Packets ready: ${packet.launchPacketStack.summary.readyCount}/${packet.launchPacketStack.summary.totalCount}`,
    `Blocked packets: ${packet.launchPacketStack.summary.blockedCount}`,
    `Rule: ${packet.launchPacketStack.note}`,
    '',
    ...packet.launchPacketStack.rows.flatMap((row) => [
      `- ${row.label}: ${row.statusLabel}`,
      `  Artifact: ${row.path}`,
      `  Owner: ${row.owner}`,
      `  Command: ${row.command}`,
      `  Status: ${row.statusDetail}`,
      `  Next: ${row.nextAction}`,
      ...(row.missingInputs.length > 0 ? [`  Needed: ${row.missingInputs.join('; ')}`] : []),
    ]),
    '',
    '## Paid Full Automation Blockers',
    '',
    `Blocked gates: ${packet.fullAutomationLaunchBlockers.summary.blockedCount}`,
    `Boundary: ${packet.fullAutomationLaunchBlockers.boundary}`,
    '',
    ...(packet.fullAutomationLaunchBlockers.rows.length === 0
      ? ['- None']
      : packet.fullAutomationLaunchBlockers.rows.flatMap((row, index) => [
        `${index + 1}. ${row.gate}: ${row.statusLabel}`,
        `   Packet: ${row.label}`,
        `   Owner: ${row.owner}`,
        `   Impact: ${row.clientImpact}`,
        `   Proof boundary: ${row.proofBoundary}`,
        `   Command: ${row.command}`,
        ...(row.missingInputs.length > 0 ? [`   Missing: ${row.missingInputs.join('; ')}`] : []),
        '',
      ])),
    '## External Blockers',
    '',
    ...(packet.externalBlockerSummary.length === 0
      ? ['- None']
      : packet.externalBlockerSummary.flatMap((group) => [
        `- ${group.label}: ${group.count} blocker${group.count === 1 ? '' : 's'} (${group.owner})`,
        `  Proof needed: ${group.proofNeeded}`,
        `  Next: ${group.nextAction}`,
        ...group.blockers.map((blocker) => `  - ${blocker.label}`),
      ])),
    '',
    '## Remote Evidence',
    '',
    `Hosted readiness: ${packet.remoteSetupEvidence.hostedEnvironment.ok ? 'ready' : 'blocked'}`,
    `Hosted readiness failures: ${packet.remoteSetupEvidence.hostedEnvironment.failureCount}`,
    `Netlify project receipt: ${packet.remoteSetupEvidence.netlifyProjectSetupReceipt.ok ? 'recorded' : 'not complete'}`,
    `Netlify Identity dashboard proof: ${packet.remoteSetupEvidence.netlifyProjectSetupReceipt.identityReady ? 'recorded' : 'not complete'}`,
    `Netlify preview ready: ${packet.remoteSetupEvidence.netlifyPreview.ok ? 'yes' : 'no'}`,
    `Promotion receipt ready: ${packet.remoteSetupEvidence.previewPromotionReceipt.ok ? 'yes' : 'no'}`,
    `Database schema ready: ${packet.remoteSetupEvidence.databaseSchemaReadiness.ok ? 'yes' : 'no'}`,
    `Source catalog records: ${packet.remoteSetupEvidence.sourceCatalogReadiness.totalSettlements}`,
    `PWA readiness: ${packet.remoteSetupEvidence.pwaReadiness.ok ? 'ready' : 'blocked'}`,
    '',
    '## User Consent Gate',
    '',
    `Terms acknowledgement: ${packet.userConsentGate.requiredTermsAck}`,
    `Audit event: ${packet.userConsentGate.termsEventType}`,
    `Enforced by: ${packet.userConsentGate.enforcedBy}`,
    `Visible control: ${packet.userConsentGate.visibleControl}`,
    `Boundary: ${packet.userConsentGate.boundary}`,
    '',
    '## Exports',
    '',
    `- Support packet: ${packet.exports.supportPacket}`,
    `- Netlify launch doctor: ${packet.exports.netlifyLaunchDoctor}`,
    `- External activation workbook: ${packet.exports.externalActivationWorkbook}`,
    `- Client preview checklist: ${packet.exports.clientPreviewChecklist}`,
    `- Launch handoff: ${packet.exports.launchHandoff}`,
    '',
    '## Verification Commands',
    '',
    ...packet.verificationCommands.map((command) => `- \`${command}\``),
    '',
    '## Operator Notes',
    '',
    ...packet.operatorNotes.map((note) => `- ${note}`),
    '',
  ].join('\n');
}

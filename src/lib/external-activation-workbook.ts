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
import { buildClientPreviewChecklist } from '@lib/client-preview-checklist';
import { getLaunchPacketArtifactRows, summarizeLaunchPacketArtifactRows } from '@lib/launch-packet-stack';
import { getLaunchReadiness } from '@lib/launch-readiness';
import { formatLocalVerificationDuration, readLocalVerificationPacket } from '@lib/local-verification-packet';
import { evaluateNetlifyProjectSetupReceipt } from '@lib/netlify-project-setup-receipt';
import { buildOwnerHandoffBriefs } from '@lib/owner-handoff-briefs';

const defaultArtifactPath = 'data/external-activation-workbook.md';

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

function activationChecklist(step: ReturnType<typeof buildLaunchActionPlan>[number]) {
  return [
    `Owner: ${step.owner}`,
    `Why it matters: ${step.clientImpact}`,
    `Execution boundary: ${step.executionBoundary}`,
    `Required inputs: ${step.requiredInputs.join(', ')}`,
    `First action: ${step.nextAction}`,
    `Proof files: ${step.proofArtifacts.join(', ')}`,
    'Regenerate the relevant packet, then rerun npm run launch:handoff.',
  ];
}

export async function buildExternalActivationWorkbook(userId: number, root = process.cwd()) {
  const generatedAt = new Date().toISOString();
  const launchReadiness = await getLaunchReadiness();
  const localVerificationPacket = readLocalVerificationPacket(root);
  const clientPreviewChecklist = await buildClientPreviewChecklist(userId, root);
  const netlifyProjectSetup = evaluateNetlifyProjectSetupReceipt();
  const matcherReceipt = await readLatestMatcherRunReceipt(userId);
  const launchBlockers = [
    ...launchReadiness.blockers,
    ...getMatcherReceiptCriticalPathBlockers(matcherReceipt),
  ];
  const criticalPath = getLaunchCriticalPath(launchBlockers, {
    netlifyIdentityReady: netlifyProjectSetup.identityReady,
  });
  const actionPlan = buildLaunchActionPlan(criticalPath);
  const actionPlanSummary = summarizeLaunchActionPlan(actionPlan);
  const commandQueue = buildLaunchCommandQueue(actionPlan);
  const externalBlockerSummary = getLaunchExternalBlockerSummary(launchBlockers);
  const launchPacketRows = getLaunchPacketArtifactRows(matcherReceipt, root).map((row) => (
    row.path === defaultArtifactPath
      ? {
        ...row,
        ready: true,
        tone: 'pass' as const,
        statusLabel: 'Workbook current',
        statusDetail: 'This external activation workbook export is being generated from the current app state.',
        missingInputs: [],
        nextAction: 'This workbook is current for this export; rerun npm run activation:workbook after packet, launch, or hosted setup changes.',
        updatedAtLabel: 'Current export',
      }
      : row
  ));
  const launchPacketSummary = summarizeLaunchPacketArtifactRows(launchPacketRows);
  const blockedPackets = launchPacketRows.filter((row) => !row.ready);
  const fullAutomationLaunchBlockers = buildFullAutomationLaunchBlockers(launchPacketRows);
  const fullAutomationLaunchBlockerSummary = summarizeFullAutomationLaunchBlockers(fullAutomationLaunchBlockers);
  const sourceEvidenceFiles = [
    'src/lib/launch-handoff.ts',
    'src/lib/launch-action-plan.ts',
    'src/lib/launch-packet-stack.ts',
    'src/lib/launch-readiness.ts',
    'src/lib/hosted-remediation.ts',
    'src/lib/external-activation-workbook.ts',
    'src/lib/client-preview-checklist.ts',
    'src/lib/launch-handoff-report.ts',
    'src/lib/netlify-launch-doctor-receipt.ts',
    'src/app/launch/page.tsx',
    'src/app/packets/page.tsx',
    'src/app/api/audit/launch-handoff/route.ts',
    'src/app/api/audit/netlify-launch-doctor/route.ts',
    'src/app/api/audit/external-activation-workbook/route.ts',
    'src/app/api/audit/client-preview-checklist/route.ts',
    'data/launch-handoff-report.md',
  ];
  const workbookRows = actionPlan.map((step) => ({
    key: step.key,
    order: step.order,
    label: step.label,
    owner: step.owner,
    status: step.status,
    blockerCount: step.blockerCount,
    objective: step.objective,
    clientImpact: step.clientImpact,
    executionBoundary: step.executionBoundary,
    requiredInputs: step.requiredInputs,
    proofNeeded: step.proofNeeded,
    nextAction: step.nextAction,
    proofArtifacts: step.proofArtifacts,
    commands: step.commands,
    blockers: step.blockers,
    checklist: activationChecklist(step),
  }));
  const ownerHandoffBriefs = buildOwnerHandoffBriefs(workbookRows, commandQueue, blockedPackets);

  return {
    format: 'claimbot.external-activation-workbook.v1',
    generatedAt,
    artifact: defaultArtifactPath,
    accountScope: {
      accountId: userId,
      scope: 'account-scoped',
      matcherReceiptRequired: true,
      note: 'Matcher proof and signed exports are evaluated for this account; each client account needs its own matcher receipt before client-facing match evidence is trusted.',
    },
    note: 'Non-secret external activation workbook. This workbook captures the current launch blockers, owners, proof files, and commands only. It is not proof that hosted database, billing, legal, Identity, or preview promotion setup is complete.',
    readiness: {
      ready: true,
      workbookOnly: true,
      clientPreviewReady: launchReadiness.clientPreviewReady
        && matcherReceipt.exists
        && matcherReceipt.errorCount === 0
        && launchPacketSummary.ready,
      blockerCount: launchBlockers.length,
      warningCount: launchReadiness.warnings.length,
      workstreamCount: actionPlan.length,
      blockedWorkstreamCount: actionPlanSummary.blockedSteps,
      launchPacketReadyCount: launchPacketSummary.readyCount,
      launchPacketTotalCount: launchPacketSummary.totalCount,
      blockedPacketCount: launchPacketSummary.blockedCount,
      nextStep: actionPlanSummary.nextStep
        ? {
          key: actionPlanSummary.nextStep.key,
          label: actionPlanSummary.nextStep.label,
          owner: actionPlanSummary.nextStep.owner,
          nextAction: actionPlanSummary.nextStep.nextAction,
          executionBoundary: actionPlanSummary.nextStep.executionBoundary,
          requiredInputs: actionPlanSummary.nextStep.requiredInputs,
          proofArtifacts: actionPlanSummary.nextStep.proofArtifacts,
        }
        : null,
      boundary: 'A ready workbook means the current external activation path is documented; it does not clear external launch blockers or authorize client invites.',
    },
    clientPreviewChecklistSummary: {
      productReadyCount: clientPreviewChecklist.summary.readyCount,
      productTotalCount: clientPreviewChecklist.summary.totalCount,
      codexProductReady: clientPreviewChecklist.summary.codexProductReady,
      externalProductBlockerCount: clientPreviewChecklist.summary.externalProductBlockerCount,
      ownerReadiness: clientPreviewChecklist.summary.ownerReadiness,
      note: 'Codex-owned product work is separated from hosted database, billing, legal, Identity, and deployment proof so the next external owner is clear.',
    },
    workbookRows,
    ownerHandoffBriefs,
    operatorCommandQueue: commandQueue,
    externalBlockerSummary,
    blockedPackets: blockedPackets.map((row) => ({
      label: row.label,
      path: row.path,
      owner: row.owner,
      statusLabel: row.statusLabel,
      statusDetail: row.statusDetail,
      nextAction: row.nextAction,
      missingInputs: row.missingInputs,
    })),
    fullAutomationLaunchBlockers: {
      summary: fullAutomationLaunchBlockerSummary,
      rows: fullAutomationLaunchBlockers,
      boundary: 'Paid full automation remains locked until this list is empty, the launch packet stack is ready, and the account-specific client-preview checklist is ready.',
    },
    localTooling: {
      netlifyCli: launchReadiness.netlifyCliReadiness,
      localVerificationPacket,
      note: 'Activation workbook records local Netlify CLI/auth readiness as non-secret operator evidence; it does not include Netlify tokens or account credentials.',
    },
    commands: [
      'npm run activation:workbook',
      'npm run client:checklist',
      'npm run launch:handoff',
      'npm run hosted:db:packet',
      'npm run operator:packet',
      'npm run billing:packet',
      'npm run legal:packet',
      'npm run preview:packet',
    ],
    sourceEvidence: sourceEvidenceFiles.map((file) => fileEvidence(file, root)),
  };
}

export type ExternalActivationWorkbook = Awaited<ReturnType<typeof buildExternalActivationWorkbook>>;

export function markdownExternalActivationWorkbook(packet: ExternalActivationWorkbook) {
  return [
    '# ClaimBot External Activation Workbook',
    '',
    `Generated: ${packet.generatedAt}`,
    '',
    'This is a non-secret workbook for the remaining external setup. It is not launch approval and does not print database URLs, tokens, support mailbox values, checkout links, webhook secrets, or raw user data.',
    '',
    '## Current Gate',
    '',
    `Client preview ready: ${packet.readiness.clientPreviewReady ? 'yes' : 'no'}`,
    `Account scope: ClaimBot account #${packet.accountScope.accountId}`,
    `Matcher proof scope: ${packet.accountScope.scope}; ${packet.accountScope.note}`,
    `Launch blockers: ${packet.readiness.blockerCount}`,
    `Warnings: ${packet.readiness.warningCount}`,
    `Blocked workstreams: ${packet.readiness.blockedWorkstreamCount}/${packet.readiness.workstreamCount}`,
    `Launch packets ready: ${packet.readiness.launchPacketReadyCount}/${packet.readiness.launchPacketTotalCount}`,
    `Blocked packet artifacts: ${packet.readiness.blockedPacketCount}`,
    `Codex-owned product work ready: ${packet.clientPreviewChecklistSummary.codexProductReady ? 'yes' : 'no'}`,
    `External product blockers: ${packet.clientPreviewChecklistSummary.externalProductBlockerCount}`,
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
      `- ${row.owner}: ${row.ready ? 'ready' : 'blocked'} (${row.readyCount}/${row.totalCount} ready, ${row.blockedCount} blocked, ${row.reviewCount} review)`
    )),
    '',
    ...(packet.readiness.nextStep
      ? [
        '## Next Activation Step',
        '',
        `Owner: ${packet.readiness.nextStep.owner}`,
        `Step: ${packet.readiness.nextStep.label}`,
        `Action: ${packet.readiness.nextStep.nextAction}`,
        `Execution boundary: ${packet.readiness.nextStep.executionBoundary}`,
        `Required inputs: ${packet.readiness.nextStep.requiredInputs.join(', ')}`,
        `Proof artifacts: ${packet.readiness.nextStep.proofArtifacts.join(', ')}`,
        '',
      ]
      : []),
    '## Workstreams',
    '',
    ...packet.workbookRows.flatMap((step) => [
      `${step.order}. ${step.label}: ${step.status === 'confirmed' ? 'clear' : `${step.blockerCount} blocker${step.blockerCount === 1 ? '' : 's'}`}`,
      `   Owner: ${step.owner}`,
      `   Objective: ${step.objective}`,
      `   Client impact: ${step.clientImpact}`,
      `   Execution boundary: ${step.executionBoundary}`,
      `   Required inputs: ${step.requiredInputs.join(', ')}`,
      `   Proof needed: ${step.proofNeeded}`,
      `   Next action: ${step.nextAction}`,
      `   Proof artifacts: ${step.proofArtifacts.join(', ')}`,
      '   Checklist:',
      ...step.checklist.map((item) => `   - ${item}`),
      '   Starter commands:',
      ...step.commands.slice(0, 6).map((command) => `   - \`${command}\``),
      ...(step.commands.length > 6 ? [`   - +${step.commands.length - 6} more commands in JSON`] : []),
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
    '## Blocked Packet Artifacts',
    '',
    ...(packet.blockedPackets.length === 0
      ? ['- None']
      : packet.blockedPackets.flatMap((row) => [
        `- ${row.label}: ${row.statusLabel} (${row.path}) - ${row.statusDetail}`,
        `  Next: ${row.nextAction}`,
        ...(row.missingInputs.length > 0 ? [`  Needed: ${row.missingInputs.join('; ')}`] : []),
      ])),
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
    `Boundary: ${packet.localTooling.note}`,
    '',
    '## Commands',
    '',
    ...packet.commands.map((command) => `- \`${command}\``),
    '',
    '## Source Evidence',
    '',
    ...packet.sourceEvidence.map((item) => `- ${item.path}: ${item.exists ? `present, ${item.bytes} bytes` : 'missing'}`),
    '',
    '## Notes',
    '',
    '- Complete real hosted database, support/contact, billing, legal, Identity, preview, and receipt setup outside this workbook.',
    '- Rerun this workbook after any external setup change so the next step stays current.',
    '- No secret values were printed.',
    '',
  ].join('\n');
}

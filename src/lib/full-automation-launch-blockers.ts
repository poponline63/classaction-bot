import type { LaunchPacketArtifactRow } from './launch-packet-stack';

type BlockerMeta = {
  gate: string;
  clientImpact: string;
  proofBoundary: string;
};

const blockerMetaByPath: Record<string, BlockerMeta> = {
  // Guardrail marker: hosted background processing is verified.
  'data/hosted-database-packet.md': {
    gate: 'Hosted data gate',
    clientImpact: 'Paid users cannot rely on saved profiles, matcher state, or claim history until account data storage is connected and checked.',
    proofBoundary: 'Account data storage, schema validation, and source import readiness must be confirmed before account access.',
  },
  'data/operator-setup-packet.md': {
    gate: 'Business setup gate',
    clientImpact: 'Hands-off filing stays locked until support contact, account security, and protected sign-in are confirmed.',
    proofBoundary: 'Support contact, account security, and sign-in settings must be confirmed before account access.',
  },
  'data/worker-runtime-packet.md': {
    gate: 'Automation processing gate',
    clientImpact: 'Paid full automation stays locked until the automation service is verified.',
    proofBoundary: 'The automation service must process an approved claim job and save a verified receipt.',
  },
  'data/billing-activation-packet.md': {
    gate: 'Paid entitlement gate',
    clientImpact: 'Pro cannot unlock full automation until paid checkout links and protected payment confirmation are configured and proved.',
    proofBoundary: 'Secure checkout links and protected payment confirmation must be verified before paid access changes.',
  },
  'data/legal-review-packet.md': {
    gate: 'Legal review gate',
    clientImpact: 'Checkout, full automation copy, permissions, and live filing posture remain blocked until legal/compliance review is explicitly acknowledged.',
    proofBoundary: 'Only CLAIMBOT_LEGAL_REVIEW_ACK=reviewed after real review clears this gate.',
  },
  'data/preview-promotion-packet.md': {
    gate: 'Hosted preview gate',
    clientImpact: 'Account access and paid automation remain locked until the published site passes readiness checks.',
    proofBoundary: 'A published HTTPS site, passing checks, and a saved promotion receipt are required.',
  },
  'data/netlify-launch-doctor.md': {
    gate: 'Hosted setup check',
    clientImpact: 'Paid full automation cannot be offered until sign-in, account settings, and published-site readiness are verified.',
    proofBoundary: 'Sign-in, account settings, and published-site checks must be confirmed before account access.',
  },
};

export type FullAutomationLaunchBlocker = {
  label: string;
  path: string;
  owner: string;
  gate: string;
  clientImpact: string;
  proofBoundary: string;
  command: string;
  statusLabel: string;
  statusDetail: string;
  missingInputs: string[];
};

export function buildFullAutomationLaunchBlockers(rows: LaunchPacketArtifactRow[]): FullAutomationLaunchBlocker[] {
  return rows
    .filter((row) => !row.ready)
    .map((row) => {
      const meta = blockerMetaByPath[row.path] ?? {
        gate: 'Setup proof gate',
        clientImpact: 'Paid full automation stays locked until this readiness item is clear.',
        proofBoundary: 'Refresh readiness status before account access.',
      };

      return {
        label: row.label,
        path: row.path,
        owner: row.owner,
        gate: meta.gate,
        clientImpact: meta.clientImpact,
        proofBoundary: meta.proofBoundary,
        command: row.command,
        statusLabel: row.statusLabel,
        statusDetail: row.statusDetail,
        missingInputs: row.missingInputs,
      };
    });
}

export function summarizeFullAutomationLaunchBlockers(rows: FullAutomationLaunchBlocker[]) {
  return {
    ready: rows.length === 0,
    blockedCount: rows.length,
    owners: Array.from(new Set(rows.map((row) => row.owner))),
    gates: rows.map((row) => row.gate),
    note: rows.length === 0
      ? 'No readiness items are currently keeping paid full automation locked.'
      : 'Paid full automation remains locked until every readiness item is clear and refreshed.',
  };
}

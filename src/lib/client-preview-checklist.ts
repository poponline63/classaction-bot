import fs from 'node:fs';
import path from 'node:path';
import { readLatestMatcherRunReceipt } from '@lib/audit/support-packet';
import { getBillingCheckoutBlockReason, getBillingReadiness } from '@lib/billing/checkout';
import {
  buildFullAutomationLaunchBlockers,
  summarizeFullAutomationLaunchBlockers,
} from '@lib/full-automation-launch-blockers';
import { buildLaunchActionPlan, buildLaunchCommandQueue, summarizeLaunchActionPlan } from '@lib/launch-action-plan';
import { getLaunchCriticalPath, getMatcherReceiptCriticalPathBlockers } from '@lib/launch-handoff';
import { getLaunchPacketArtifactRows, summarizeLaunchPacketArtifactRows } from '@lib/launch-packet-stack';
import { getLaunchReadiness } from '@lib/launch-readiness';
import { formatLocalVerificationDuration, readLocalVerificationPacket } from '@lib/local-verification-packet';
import { evaluateNetlifyProjectSetupReceipt } from '@lib/netlify-project-setup-receipt';
import { buildOwnerHandoffBriefs } from '@lib/owner-handoff-briefs';

export type ClientPreviewChecklistStatus = 'ready' | 'blocked' | 'review';

export type ClientPreviewChecklistItem = {
  key: string;
  label: string;
  owner: 'codex' | 'operator' | 'business' | 'legal' | 'deployment';
  status: ClientPreviewChecklistStatus;
  evidence: string[];
  nextAction: string;
};

export type ClientPreviewChecklistOwnerReadiness = {
  owner: ClientPreviewChecklistItem['owner'];
  ready: boolean;
  readyCount: number;
  blockedCount: number;
  reviewCount: number;
  totalCount: number;
};

export type ClientPreviewChecklistSummary = {
  clientPreviewReady: boolean;
  readyCount: number;
  blockedCount: number;
  reviewCount: number;
  totalCount: number;
  codexProductReady: boolean;
  externalProductBlockerCount: number;
  ownerReadiness: ClientPreviewChecklistOwnerReadiness[];
  launchPacketReadyCount: number;
  launchPacketTotalCount: number;
  nextStep: {
    key: string;
    label: string;
    owner: string;
    nextAction: string;
    executionBoundary: string;
    requiredInputs: string[];
    proofArtifacts: string[];
    commands: string[];
  } | null;
};

function fileExists(relativePath: string, root = process.cwd()) {
  return fs.existsSync(path.join(root, relativePath));
}

function readTextIfExists(relativePath: string, root = process.cwd()) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return '';
  return fs.readFileSync(absolutePath, 'utf8');
}

function fileContainsAll(relativePath: string, needles: string[], root = process.cwd()) {
  const text = readTextIfExists(relativePath, root);
  return needles.every((needle) => text.includes(needle));
}

function collectRouteFiles(relativeDir: string, root = process.cwd()) {
  const absoluteDir = path.join(root, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];

  const files: string[] = [];
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const absoluteEntry = path.join(absoluteDir, entry.name);
    const relativeEntry = path.relative(root, absoluteEntry).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      files.push(...collectRouteFiles(relativeEntry, root));
    } else if (entry.isFile() && entry.name === 'route.ts') {
      files.push(relativeEntry);
    }
  }
  return files;
}

function implementationReady(files: string[], root = process.cwd()) {
  return files.every((file) => fileExists(file, root));
}

const routeExportAllowedNames = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
  'dynamic',
  'dynamicParams',
  'revalidate',
  'fetchCache',
  'runtime',
  'preferredRegion',
  'maxDuration',
  'config',
  'generateStaticParams',
]);

const routeExportNamePattern = /^[A-Za-z_$][\w$]*$/;

export function findRouteExportHygieneLeaks(root = process.cwd()) {
  const leaks: string[] = [];
  const routeFiles = collectRouteFiles('src/app', root);

  for (const file of routeFiles) {
    const content = readTextIfExists(file, root);
    for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
      const line = rawLine.trim();
      if (!line.startsWith('export ')) continue;

      const functionExport = line.match(/^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\b/);
      const constExport = line.match(/^export\s+const\s+([A-Za-z_$][\w$]*)\b/);
      const namedExport = line.match(/^export\s*\{([^}]+)\}/);
      const exportedNames: string[] = [];

      if (functionExport?.[1]) {
        exportedNames.push(functionExport[1]);
      } else if (constExport?.[1]) {
        exportedNames.push(constExport[1]);
      } else if (namedExport?.[1]) {
        for (const part of namedExport[1].split(',')) {
          const name = part.trim().split(/\s+as\s+/i).pop()?.trim();
          if (name) exportedNames.push(name);
        }
      } else {
        leaks.push(`${file}:${index + 1}: non-route export`);
        continue;
      }

      for (const name of exportedNames) {
        if (!routeExportNamePattern.test(name) || !routeExportAllowedNames.has(name)) {
          leaks.push(`${file}:${index + 1}: ${name}`);
        }
      }
    }
  }

  return {
    routeFiles,
    leaks,
  };
}

const clientSafePageFiles = [
  'src/app/page.tsx',
  'src/app/AppFooter.tsx',
  'src/app/AuthStatus.tsx',
  'src/app/EvidenceHandlingPanel.tsx',
  'src/app/FileAllButton.tsx',
  'src/app/InstallAppButton.tsx',
  'src/app/LegalBoundarySummary.tsx',
  'src/app/OperationalZeroState.tsx',
  'src/app/ProofGateBanner.tsx',
  'src/app/PwaConnectionStatus.tsx',
  'src/app/SupportEscalationPanel.tsx',
  'src/app/goal/page.tsx',
  'src/app/pricing/page.tsx',
  'src/app/pricing/PricingFaqBrowser.tsx',
  'src/app/pricing/PricingPlanCards.tsx',
  'src/app/login/page.tsx',
  'src/app/login/AuthAccessBrowser.tsx',
  'src/app/login/LoginPanel.tsx',
  'src/app/help/page.tsx',
  'src/app/help/HelpCommandBrowser.tsx',
  'src/app/contact/page.tsx',
  'src/app/contact/SupportCommandBrowser.tsx',
  'src/app/trust/page.tsx',
  'src/app/trust/TrustComplianceBrowser.tsx',
  'src/app/status/page.tsx',
  'src/app/status/StatusTimelineBrowser.tsx',
  'src/app/onboarding/page.tsx',
  'src/app/eligibility/page.tsx',
  'src/app/eligibility/EligibilityCandidateBrowser.tsx',
  'src/app/settlements/page.tsx',
  'src/app/settlements/SearchBar.tsx',
  'src/app/settlements/SettlementDiscoveryBrowser.tsx',
  'src/app/settlements/[id]/page.tsx',
  'src/app/settlements/[id]/SettlementDetailBrowser.tsx',
  'src/app/review/page.tsx',
  'src/app/review/ReviewMatchBrowser.tsx',
  'src/app/claims/page.tsx',
  'src/app/claims/ClaimsQueueBrowser.tsx',
  'src/app/claims/[id]/page.tsx',
  'src/app/claims/[id]/not-found.tsx',
  'src/app/claims/[id]/ClaimDetailPacketBrowser.tsx',
  'src/app/claims/[id]/LiveViewer.tsx',
  'src/app/profile/page.tsx',
  'src/app/setup/page.tsx',
  'src/app/setup/AuthGateBlock.tsx',
  'src/app/setup/SetupWizard.tsx',
  'src/app/permissions/page.tsx',
  'src/app/authorizations/page.tsx',
  'src/app/authorizations/AuthorizationCard.tsx',
  'src/app/authorizations/AuthorizationCommandBrowser.tsx',
  'src/app/purchases/page.tsx',
  'src/app/purchases/PurchaseEvidenceBrowser.tsx',
  'src/app/breaches/page.tsx',
  'src/app/breaches/BreachEvidenceBrowser.tsx',
  'src/app/privacy-policy/page.tsx',
  'src/app/terms/page.tsx',
];

const clientSafeLeakPatterns = [
  { pattern: /Export client preview checklist/i, label: 'client preview checklist export link' },
  { pattern: /Export launch handoff/i, label: 'launch handoff export link' },
  { pattern: /Export activation workbook/i, label: 'activation workbook export link' },
  { pattern: /Export support packet/i, label: 'support packet export link' },
  { pattern: /\/api\/audit\/(?:client-preview-checklist|launch-handoff|external-activation-workbook|netlify-launch-doctor|support-packet)/, label: 'raw audit export URL' },
  { pattern: /\/api\/claims\/.*audit-export/, label: 'raw claim audit export URL' },
  { pattern: /npm run [a-z0-9:-]+/i, label: 'raw npm command' },
  { pattern: /data\/[a-z0-9-]+\.(?:md|json)/i, label: 'raw proof artifact path' },
  { pattern: /\bsource setup needed\b/i, label: 'source-setup-needed wording' },
  { pattern: /\bsource setup required\b/i, label: 'source-setup-required wording' },
  { pattern: /\bsource setup issue\b/i, label: 'source-setup-issue wording' },
  { pattern: /\bsetup mode\b/i, label: 'setup-mode wording' },
  { pattern: /\blaunch setup issue\b/i, label: 'launch-setup wording' },
  { pattern: /\bcomplete launch source setup\b/i, label: 'launch-source-setup wording' },
  { pattern: /\breadiness files?\b/i, label: 'readiness-file wording' },
  { pattern: /\braw files?\b/i, label: 'raw-file wording' },
  { pattern: /\braw records?\b/i, label: 'raw-record wording' },
  { pattern: /\bexport files?\b/i, label: 'export-file wording' },
  { pattern: /\binternal records?\b/i, label: 'internal-record wording' },
  { pattern: /\binternal readiness details?\b/i, label: 'internal-readiness-detail wording' },
  { pattern: /\binternal details?\b/i, label: 'internal-detail wording' },
  { pattern: /\binternally clear\b/i, label: 'internally-clear wording' },
  { pattern: /\braw setup files?\b/i, label: 'raw setup-file wording' },
  { pattern: /\bsetup files?\b/i, label: 'setup-file wording' },
  { pattern: /\bsetup artifacts?\b/i, label: 'setup-artifact wording' },
  { pattern: /\bsetup evidence\b/i, label: 'setup-evidence wording' },
  { pattern: /\boperator proof\b/i, label: 'operator-proof wording' },
  { pattern: /\boperator-only commands?\b/i, label: 'operator-command wording' },
  { pattern: /\blaunch-console\b/i, label: 'launch-console wording' },
  { pattern: /\bproof artifact paths?\b/i, label: 'proof-artifact-path wording' },
  { pattern: /\bcommand surface\b/i, label: 'command-surface wording' },
  { pattern: /\benvironment variables?\b/i, label: 'environment-variable wording' },
  { pattern: /\bsupport packets?\b/i, label: 'support-packet wording' },
  { pattern: /\bclient handoff\b/i, label: 'client-handoff wording' },
  { pattern: /\binviting clients\b/i, label: 'inviting-clients wording' },
  { pattern: /\bbefore inviting clients\b/i, label: 'before-inviting-clients wording' },
  { pattern: /\binviting customers\b/i, label: 'inviting-customers wording' },
  { pattern: /\bbefore inviting customers\b/i, label: 'before-inviting-customers wording' },
  { pattern: /\bfirst client run\b/i, label: 'first-client-run wording' },
  { pattern: /\bclient deployment\b/i, label: 'client-deployment wording' },
  { pattern: /\bclient questions\b/i, label: 'client-questions wording' },
  { pattern: /\bclient-ready\b/i, label: 'client-ready wording' },
  { pattern: /\bclient workspace\b/i, label: 'client-workspace wording' },
  { pattern: /\bclient scope\b/i, label: 'client-scope wording' },
  { pattern: /\bclient portal\b/i, label: 'client-portal wording' },
  { pattern: /\bclients can\b/i, label: 'clients-can wording' },
  { pattern: /\bclients inspect\b/i, label: 'clients-inspect wording' },
  { pattern: /\bNetlify CLI\b/i, label: 'netlify-cli wording' },
  { pattern: /\bSMOKE_BASE_URL\b/, label: 'smoke-base-url wording' },
  { pattern: /proofArtifacts\.(?:slice|join|map)/, label: 'rendered proof artifact field' },
  { pattern: /\.(?:nextAction)\b/, label: 'raw launch next-action field' },
  { pattern: /owner\s*\?\?\s*['"`]owner needed['"`]/, label: 'raw owner fallback' },
  { pattern: /business-owned|deployment-owned|legal-owned|operator-owned|operator gate|business gate|deployment gate|legal gate|hosted data gate|business setup gate|automation processing gate|paid entitlement gate|hosted preview gate/i, label: 'raw owner/gate label' },
  { pattern: /\bplan gates?\b/i, label: 'internal plan gate wording' },
  { pattern: /\bproof gates?\b/i, label: 'internal proof gate wording' },
  { pattern: /\bpermission gates?\b/i, label: 'internal permission gate wording' },
  { pattern: /\bsafety gates?\b/i, label: 'internal safety gate wording' },
  { pattern: /\breadiness gates?\b/i, label: 'internal readiness gate wording' },
  { pattern: /\bblocked gates?\b/i, label: 'internal blocked gate wording' },
  { pattern: /\bgate filter\b/i, label: 'internal gate-filter wording' },
  { pattern: /\bevery gate\b/i, label: 'internal every-gate wording' },
  { pattern: /\bfiling gates\b/i, label: 'internal filing-gates wording' },
  { pattern: /\bautomation remains gated\b/i, label: 'internal automation-gated wording' },
  { pattern: /\bpaid billing gates\b/i, label: 'internal paid-billing-gates wording' },
  { pattern: /\brequired gates\b/i, label: 'internal required-gates wording' },
  { pattern: /\bpre-invite auth gate\b/i, label: 'internal auth-gate wording' },
  { pattern: /\bmanual approval gate\b/i, label: 'internal approval-gate wording' },
  { pattern: /\bgated automation\b/i, label: 'internal gated-automation wording' },
  { pattern: /\bbypass gates\b/i, label: 'internal bypass-gates wording' },
  { pattern: /\bgate used for review\b/i, label: 'internal gate-used wording' },
  { pattern: /\bgate between\b/i, label: 'internal gate-between wording' },
  { pattern: /\bpaid automation gate\b/i, label: 'internal paid-automation-gate wording' },
  { pattern: /\bgates? pass\b/i, label: 'internal gates-pass wording' },
  { pattern: /\bgates? clear\b/i, label: 'internal gates-clear wording' },
  { pattern: /\bgates? still apply\b/i, label: 'internal gates-still-apply wording' },
  { pattern: /\b(?:plan|permission|proof|review)-gated\b/i, label: 'internal gated wording' },
  { pattern: /\baudit gates?\b/i, label: 'internal audit-gate wording' },
  { pattern: /\bfiling-mode gates?\b/i, label: 'internal filing-mode-gate wording' },
  { pattern: /Hosted database, Identity, billing/i, label: 'raw hosted readiness component list' },
  { pattern: /\bIdentity and contact facts\b/i, label: 'identity-provider flavored profile wording' },
  { pattern: /\bIdentity and contact\b/i, label: 'identity-provider flavored contact wording' },
  { pattern: /\bidentity setup\b/i, label: 'identity-provider flavored setup wording' },
  { pattern: /\bOpen identity facts\b/i, label: 'identity-provider flavored profile action' },
  { pattern: /\bReview identity\b/i, label: 'identity-provider flavored profile review copy' },
  { pattern: /\bIdentity is not available\b/i, label: 'identity-provider flavored sign-in error' },
  { pattern: /\bIdentity is ready\b/i, label: 'identity-provider flavored sign-in status' },
  { pattern: /\bIdentity not ready\b/i, label: 'identity-provider flavored profile status' },
  { pattern: /\baudit capture\b/i, label: 'internal audit-capture wording' },
  { pattern: /\binternal launch readiness\b/i, label: 'internal launch-readiness wording' },
  { pattern: /\bfile-claim worker\b/i, label: 'internal worker job wording' },
  { pattern: /\ban owner can\b/i, label: 'owner-action wording' },
  { pattern: /\bdeployment switches\b/i, label: 'deployment-switches wording' },
  { pattern: /\bhandled by an administrator\b/i, label: 'administrator-handled wording' },
  { pattern: /<(?:strong|small|span|p)[^>]*>\{blocker\.gate\}/, label: 'raw blocker gate field' },
  { pattern: /<CliCommandRows\b/, label: 'copy-ready command rows' },
  { pattern: /nextStep\.commands\?\.\[0\]|step\.commands\[0\]|commands\[0\]|blockedPackets\[0\]\?\.command|blocker\.command/, label: 'rendered command field' },
  { pattern: /Next setup item:\s*\{(?:nextStep|clientPreviewGate\.nextStep)\.label/i, label: 'raw next setup label' },
  { pattern: /\bnextExternalProof\.label\b|\bclientPreviewNextStep\?\.label\b|\bclientPreviewGate\.nextStep\?\.label\b/, label: 'raw next setup label field' },
  { pattern: /key=\{blocker\.path\}/, label: 'raw proof path React key' },
];

function findClientSafeSurfaceLeaks(root = process.cwd()) {
  const leaks: string[] = [];
  for (const file of clientSafePageFiles) {
    const content = readTextIfExists(file, root);
    for (const { pattern, label } of clientSafeLeakPatterns) {
      if (pattern.test(content)) {
        leaks.push(`${file}: ${label}`);
      }
    }
  }
  return leaks;
}

export function hasCustomerRenderedCopyGuard(root = process.cwd()) {
  return fileContainsAll('scripts/smoke-webapp.cjs', [
    'customerCopyGuardedPaths',
    'forbiddenCustomerCopyText',
    'forbiddenCustomerHtmlText',
    'page.content()',
    'customer page serializes internal copy',
    "'CLAIMBOT_'",
    "'DATABASE_URL'",
    "'/api/audit'",
    "'Codex can'",
    "'execution boundary'",
    "'operator-owned'",
    "'business-owned'",
    "'deployment-owned'",
    "'legal-owned'",
    "'operator gate'",
    "'business gate'",
    "'deployment gate'",
    "'legal gate'",
    "'Hosted data gate'",
    "'Business setup gate'",
    "'Automation processing gate'",
    "'Paid entitlement gate'",
    "'Hosted preview gate'",
    "'hosted setup'",
    "'source setup needed'",
    "'source setup required'",
    "'source setup issue'",
    "'setup mode'",
    "'launch setup issue'",
    "'complete launch source setup'",
    "'setup readiness'",
    "'setup status'",
    "'setup locks'",
    "'Setup boundary'",
    "'readiness files'",
    "'raw files'",
    "'raw records'",
    "'export files'",
    "'internal records'",
    "'internal readiness details'",
    "'internal detail'",
    "'internally clear'",
    "'readiness records'",
    "'readiness record'",
    "'readiness evidence'",
    "'full launch records'",
    "'technical readiness details'",
    "'detailed readiness records'",
    "'advanced workspace details'",
    "'advanced pricing readiness'",
    "'advanced readiness view'",
    "'owner readiness summary'",
    "'owner view'",
    "'launch reviewer'",
    "'backend details'",
    "'technical readiness status'",
    "'backend'",
    "'server-side'",
    "'CLAIM_QUEUE_BLOCKED'",
    "'claim_queue_blocked'",
    "'server checks'",
    "'server check'",
    "'Backend release evidence'",
    "'backend release evidence'",
    "'Backend tracking check'",
    "'backend tracking check'",
    "'Blocked-at-server receipt'",
    "'blocked-at-server receipt'",
    "'An owner can'",
    "'an owner can'",
    "'Deployment switches'",
    "'deployment switches'",
    "'handled by an administrator'",
    "'setup files'",
    "'raw setup files'",
    "'setup artifact'",
    "'setup artifacts'",
    "'setup evidence'",
    "'Support setup pending'",
    "'setup items left'",
    "'setup-backed'",
    "'active blockers'",
    "'blockers remain'",
    "'Access blocked'",
    "'Customer access: blocked'",
    "'No external setup blocker'",
    "'Hands-off paid filing still blocked'",
    "'setup blocker'",
    "'business setup still'",
    "'client invites'",
    "'identity setup'",
    "'identity facts'",
    "'identity and contact'",
    "'open identity'",
    "'review identity'",
    "'identity is ready'",
    "'identity is not available'",
    "'identity not ready'",
    "'Netlify'",
    "'auth token'",
    "'billing secret'",
    "'webhook secret'",
    "'plan gate'",
    "'permission gate'",
    "'safety gates'",
    "'gate filter'",
    "'every gate'",
    "'filing gates'",
    "'automation remains gated'",
    "'paid billing gates'",
    "'required gates'",
    "'pre-invite auth gate'",
    "'manual approval gate'",
    "'gated automation'",
    "'bypass gates'",
    "'gate used for review'",
    "'gate between'",
    "'paid automation gate'",
    "'gates pass'",
    "'gates clear'",
    "'plan-gated'",
    "'claim gates'",
    "'operator proof'",
    "'operator-proof-note'",
    "'contact-operator-drawer'",
    "'profile-advanced-drawer'",
    "'operator-only commands'",
    "'launch-console'",
    "'proof artifact paths'",
    "'command surface'",
    "'environment variables'",
    "'support packets'",
    "'client handoff'",
    "'inviting clients'",
    "'before inviting clients'",
    "'inviting customers'",
    "'before inviting customers'",
    "'first client run'",
    "'client deployment'",
    "'client questions'",
    "'client-ready'",
    "'client workspace'",
    "'client scope'",
    "'client portal'",
    "'clients can'",
    "'clients inspect'",
    "'Netlify CLI'",
    "'SMOKE_BASE_URL'",
    "'Operator account settings'",
    "'Netlify Identity proof'",
    "'netlify-identity-proof'",
    "'data/worker-runtime-packet.md'",
    "'data/billing-activation-packet.md'",
    "'data/preview-promotion-packet.md'",
  ], root);
}

function packetReady(relativePath: string, root = process.cwd()) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return false;
  try {
    const parsed = JSON.parse(fs.readFileSync(absolutePath, 'utf8')) as {
      readiness?: { ready?: unknown };
    };
    return parsed.readiness?.ready === true;
  } catch {
    return false;
  }
}

export function readKimiVisualPacketEvidence(root = process.cwd()) {
  const absolutePath = path.join(root, 'data/kimi-visual-readiness-packet.json');
  if (!fs.existsSync(absolutePath)) {
    return {
      ready: false,
      routeCount: 0,
      viewportCount: 0,
      screenshotCount: 0,
      checkCount: 0,
      failureCount: null as number | null,
      dynamicNotes: [],
      dynamicClaimDetailChecked: false,
      dynamicSettlementDetailChecked: false,
      temporaryVisualDatabase: false,
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(absolutePath, 'utf8')) as {
      readiness?: {
        ready?: unknown;
        routeCount?: unknown;
        viewportCount?: unknown;
        screenshotCount?: unknown;
        checkCount?: unknown;
        failureCount?: unknown;
      };
      dynamicRouteDiscovery?: {
        notes?: unknown;
      };
    };
    const readiness = parsed.readiness ?? {};
    const dynamicNotes = Array.isArray(parsed.dynamicRouteDiscovery?.notes)
      ? parsed.dynamicRouteDiscovery.notes.filter((note): note is string => typeof note === 'string')
      : [];
    return {
      ready: readiness.ready === true,
      routeCount: typeof readiness.routeCount === 'number' ? readiness.routeCount : 0,
      viewportCount: typeof readiness.viewportCount === 'number' ? readiness.viewportCount : 0,
      screenshotCount: typeof readiness.screenshotCount === 'number' ? readiness.screenshotCount : 0,
      checkCount: typeof readiness.checkCount === 'number' ? readiness.checkCount : 0,
      failureCount: typeof readiness.failureCount === 'number' ? readiness.failureCount : null,
      dynamicNotes,
      dynamicClaimDetailChecked: dynamicNotes.some((note) => note.startsWith('claimDetail=checked:')),
      dynamicSettlementDetailChecked: dynamicNotes.some((note) => note.startsWith('settlementDetail=checked:')),
      temporaryVisualDatabase: dynamicNotes.includes('visualDatabase=temporary-copy'),
    };
  } catch {
    return {
      ready: false,
      routeCount: 0,
      viewportCount: 0,
      screenshotCount: 0,
      checkCount: 0,
      failureCount: null,
      dynamicNotes: [],
      dynamicClaimDetailChecked: false,
      dynamicSettlementDetailChecked: false,
      temporaryVisualDatabase: false,
    };
  }
}

function statusFromBoolean(value: boolean): ClientPreviewChecklistStatus {
  return value ? 'ready' : 'blocked';
}

function summarizeClientPreviewOwnerReadiness(items: ClientPreviewChecklistItem[]): ClientPreviewChecklistOwnerReadiness[] {
  const owners: ClientPreviewChecklistItem['owner'][] = ['codex', 'operator', 'business', 'legal', 'deployment'];

  return owners
    .map((owner) => {
      const ownerItems = items.filter((item) => item.owner === owner);
      const readyCount = ownerItems.filter((item) => item.status === 'ready').length;
      const blockedCount = ownerItems.filter((item) => item.status === 'blocked').length;
      const reviewCount = ownerItems.filter((item) => item.status === 'review').length;
      return {
        owner,
        ready: ownerItems.length > 0 && blockedCount === 0 && reviewCount === 0,
        readyCount,
        blockedCount,
        reviewCount,
        totalCount: ownerItems.length,
      };
    })
    .filter((row) => row.totalCount > 0);
}

export function summarizeClientPreviewChecklist(items: ClientPreviewChecklistItem[], input: {
  launchClientPreviewReady: boolean;
  matcherReceiptReady: boolean;
  launchPacketReadyCount: number;
  launchPacketTotalCount: number;
  nextStep: ClientPreviewChecklistSummary['nextStep'];
}): ClientPreviewChecklistSummary {
  const readyCount = items.filter((item) => item.status === 'ready').length;
  const blockedCount = items.filter((item) => item.status === 'blocked').length;
  const reviewCount = items.filter((item) => item.status === 'review').length;
  const ownerReadiness = summarizeClientPreviewOwnerReadiness(items);
  const codexProductReady = ownerReadiness.find((row) => row.owner === 'codex')?.ready === true;
  const externalProductBlockerCount = ownerReadiness
    .filter((row) => row.owner !== 'codex')
    .reduce((total, row) => total + row.blockedCount + row.reviewCount, 0);

  return {
    clientPreviewReady:
      input.launchClientPreviewReady
      && input.matcherReceiptReady
      && blockedCount === 0
      && reviewCount === 0
      && input.launchPacketReadyCount === input.launchPacketTotalCount,
    readyCount,
    blockedCount,
    reviewCount,
    totalCount: items.length,
    codexProductReady,
    externalProductBlockerCount,
    ownerReadiness,
    launchPacketReadyCount: input.launchPacketReadyCount,
    launchPacketTotalCount: input.launchPacketTotalCount,
    nextStep: input.nextStep,
  };
}

export async function buildClientPreviewChecklist(userId: number, root = process.cwd()) {
  const generatedAt = new Date().toISOString();
  const launchReadiness = await getLaunchReadiness();
  const localVerificationPacket = readLocalVerificationPacket(root);
  const billing = getBillingReadiness();
  const netlifyProjectSetup = evaluateNetlifyProjectSetupReceipt();
  const matcherReceipt = await readLatestMatcherRunReceipt(userId);
  const matcherReceiptReady = matcherReceipt.exists && matcherReceipt.errorCount === 0;
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
  const launchPacketRows = getLaunchPacketArtifactRows(matcherReceipt, root).map((row) => (
    row.path === 'data/client-preview-checklist.md'
      ? {
        ...row,
        ready: true,
        tone: 'pass' as const,
        statusLabel: 'Checklist current',
        statusDetail: 'This client-preview checklist export is being generated from the current app state.',
        missingInputs: [],
        nextAction: 'This checklist is current for this export; rerun npm run client:checklist after packet, launch, or UI changes.',
        updatedAtLabel: 'Current export',
      }
      : row
  ));
  const launchPacketSummary = summarizeLaunchPacketArtifactRows(launchPacketRows);
  const blockedPackets = launchPacketRows.filter((row) => !row.ready);
  const fullAutomationLaunchBlockers = buildFullAutomationLaunchBlockers(launchPacketRows);
  const fullAutomationLaunchBlockerSummary = summarizeFullAutomationLaunchBlockers(fullAutomationLaunchBlockers);
  const ownerHandoffBriefs = buildOwnerHandoffBriefs(actionPlan, commandQueue, blockedPackets);
  const hostedDatabasePacket = launchPacketRows.find((row) => row.path === 'data/hosted-database-packet.md') ?? null;
  const hostedDatabaseReady = hostedDatabasePacket?.ready === true;
  const sourceCatalogReady = launchReadiness.sourceCatalogReadiness.ok;
  const schemaReady = launchReadiness.databaseSchemaReadiness.ok;
  const backendDataReady = schemaReady && sourceCatalogReady && hostedDatabaseReady;
  const shadowModeReady = launchReadiness.mode === 'shadow' && !launchReadiness.liveFilingFeatureEnabled;
  const legalReady = !launchReadiness.blockers.some((item) => item.key === 'legal-review');
  const paidCheckoutBlockReasons = {
    plusMonthly: getBillingCheckoutBlockReason('plus_monthly'),
    proMonthly: getBillingCheckoutBlockReason('pro_monthly'),
  };
  const paidCheckoutReady = Object.values(paidCheckoutBlockReasons).every((reason) => reason === null);
  const betaNoBillingReady = billing.betaNoBilling === true;
  const paidCheckoutBlockedReasons = Object.values(paidCheckoutBlockReasons).filter((reason) => reason !== null);
  const authReady = !launchReadiness.blockers.some((item) => (
    item.key === 'hosted-auth'
    || item.key === 'session-secret'
    || item.key === 'netlify-identity-proof'
  )) && netlifyProjectSetup.identityReady;
  const deployedPreviewReady = launchReadiness.netlifyPreviewReadiness.ok && launchReadiness.previewPromotionReceiptReadiness.ok;
  const kimiShellFiles = [
    'src/app/KimiAppShell.tsx',
    'src/app/AppFooter.tsx',
    'src/app/AppNav.tsx',
    'src/app/MobileBottomNav.tsx',
    'src/app/globals.css',
  ];
  const kimiVisualEvidence = readKimiVisualPacketEvidence(root);
  const kimiVisualReady = kimiVisualEvidence.ready;
  const kimiAppShellSource = readTextIfExists('src/app/KimiAppShell.tsx', root);
  const dashboardSource = readTextIfExists('src/app/page.tsx', root);
  const footerSource = readTextIfExists('src/app/AppFooter.tsx', root);
  const simplifiedKimiShellReady = fileContainsAll('src/app/KimiAppShell.tsx', [
    'navGroups',
    "label: 'Tasks'",
    "label: 'Find'",
    "label: 'More'",
    'kimi-nav-disclosure',
    "label: 'Start Here'",
    "label: 'Profile'",
    "label: 'Review'",
    "label: 'Claims'",
    "label: 'Status'",
    "label: 'Launch'",
    '<AppFooter />',
  ], root)
    && !kimiAppShellSource.includes("{ label: 'Legal'")
    && fileContainsAll('src/app/page.tsx', [
      'Account details',
      'dashboard-detail-drawer',
      'Paid automation runs',
      'buildClientPreviewChecklist',
      'Customer access',
    ], root)
    && fileContainsAll('src/app/AppFooter.tsx', [
      'Privacy',
      'Terms',
      'Contact',
      'Help',
    ], root)
    && !dashboardSource.includes('CLIENT READINESS RUNWAY')
    && footerSource.includes('aria-label="Legal links"');
  const coreRouteFiles = [
    'src/app/page.tsx',
    'src/app/goal/page.tsx',
    'src/app/onboarding/page.tsx',
    'src/app/setup/page.tsx',
    'src/app/review/page.tsx',
    'src/app/claims/page.tsx',
    'src/app/pricing/page.tsx',
    'src/app/trust/page.tsx',
    'src/app/status/page.tsx',
    'src/app/audit/page.tsx',
    'src/app/permissions/page.tsx',
    'src/app/packets/page.tsx',
    'src/app/launch/page.tsx',
    'src/app/help/page.tsx',
  ];
  const routeExportHygiene = findRouteExportHygieneLeaks(root);
  const routeExportHygieneReady = routeExportHygiene.leaks.length === 0
    && fileContainsAll('scripts/lib/next-route-export-hygiene.cjs', [
      'routeExportAllowedNames',
      'route files may only export handlers and route config',
    ], root)
    && fileContainsAll('scripts/validate-next-route-exports.cjs', [
      'findNextRouteExportHygieneLeaks',
      '[validate-next-route-exports] ok',
    ], root);
  const proofFlowFiles = [
    'src/lib/claim-filer/settlement-self-assessment.ts',
    'src/lib/claim-filer/authorization-preview.ts',
    'src/lib/claim-filer/request-boundary.ts',
    'src/app/review/page.tsx',
    'src/app/claims/page.tsx',
  ];
  const auditFiles = [
    'src/app/api/audit/support-packet/route.ts',
    'src/app/api/audit/external-activation-workbook/route.ts',
    'src/lib/audit/support-packet.ts',
    'src/lib/launch-packet-stack.ts',
    'src/lib/launch-handoff-report.ts',
    'src/app/api/audit/launch-handoff/route.ts',
  ];
  const paidAutomationContractFiles = [
    'src/app/api/claims/file-all/route.ts',
    'src/app/api/claims/[id]/file/route.ts',
    'src/app/FileAllButton.tsx',
    'src/app/claims/[id]/LiveViewer.tsx',
    'src/lib/claim-filer/filer.ts',
    'worker/job-poller.ts',
  ];
  const paidAutomationContractReady = implementationReady(paidAutomationContractFiles, root)
    && fileContainsAll('src/app/api/claims/file-all/route.ts', [
      "automationMode: 'full_guarded'",
      'paid command is fully automated after this point',
      'worker continues',
      'Manual stops are hard blockers only',
      'jobsEnqueued: filed.jobsEnqueued',
      'jobsReused: filed.jobsReused',
    ], root)
    && fileContainsAll('src/app/api/claims/[id]/file/route.ts', [
      'ensureFileClaimJobForClaim',
      "automationMode: 'full_guarded'",
      "workerCadence: 'automatic_polling'",
      'automatic file-claim worker',
    ], root)
    && fileContainsAll('src/app/FileAllButton.tsx', [
      'fully automated guarded filing',
      'Pro paid commands are fully automated for eligible no-proof claims',
      'hard stops only',
      'claim worker queue',
    ], root)
    && fileContainsAll('src/app/claims/[id]/LiveViewer.tsx', [
      'fully automated guarded filing',
      'continues without another user step',
      'Arm full automation worker',
      'Single-claim worker job automation receipt',
    ], root)
    && fileContainsAll('src/lib/claim-filer/filer.ts', [
      "type: 'file_claim'",
      "automationMode: 'full_guarded'",
      "workerCadence: 'automatic_polling'",
      'ensureFileClaimJobForClaim',
    ], root)
    && fileContainsAll('worker/job-poller.ts', [
      "case 'file_claim'",
      'fileClaim',
    ], root);
  const clientSafeSurfaceLeaks = findClientSafeSurfaceLeaks(root);
  const customerRenderedCopyGuardReady = hasCustomerRenderedCopyGuard(root);
  const clientSafeSurfacesReady = clientSafeSurfaceLeaks.length === 0
    && customerRenderedCopyGuardReady
    && fileContainsAll('scripts/validate-ui-guardrails.cjs', [
      'clientSafePageFiles',
      'clientSafeLeakPatterns',
      'raw setup-file wording',
      'setup-artifact wording',
      'operator-proof wording',
      'launch-console wording',
      'proof-artifact-path wording',
      'must route clients to Launch/Packet Center/Contact',
    ], root);

  const nextStep = actionPlanSummary.nextStep
    ? {
      key: actionPlanSummary.nextStep.key,
      label: actionPlanSummary.nextStep.label,
      owner: actionPlanSummary.nextStep.owner,
      nextAction: actionPlanSummary.nextStep.nextAction,
      executionBoundary: actionPlanSummary.nextStep.executionBoundary,
      requiredInputs: actionPlanSummary.nextStep.requiredInputs,
      proofArtifacts: actionPlanSummary.nextStep.proofArtifacts,
      commands: actionPlanSummary.nextStep.commands,
    }
    : null;

  const items: ClientPreviewChecklistItem[] = [
    {
      key: 'kimi-visual-system',
      label: 'Kimi dark-first SaaS shell',
      owner: 'codex',
      status: statusFromBoolean(implementationReady(kimiShellFiles, root) && kimiVisualReady && simplifiedKimiShellReady),
      evidence: [
        ...kimiShellFiles,
        `simplifiedKimiShell=${simplifiedKimiShellReady ? 'ready' : 'blocked'}`,
        'dashboardPrimarySurface=next-action-kpis-recent-activity',
        'dashboardMoreDetails=collapsed-drawer',
        'dashboardCustomerAccessStatus=nested-more-drawer',
        'primarySideNav=tasks-find-more-groups',
        'tasksSideNav=home-start-here-profile-review-claims-status',
        'findSideNav=find-claims-eligibility-pricing-help-contact',
        'moreSideNav=plan-trust-history-packets-settings-launch-disclosure',
        'supportLinks=footer-and-find-sidebar',
        'footerLegalLinks=privacy-terms-contact-help',
        `kimiVisualPacket=${kimiVisualReady ? 'ready' : 'blocked'}`,
        `kimiVisualRoutes=${kimiVisualEvidence.routeCount}`,
        `kimiVisualViewports=${kimiVisualEvidence.viewportCount}`,
        `kimiVisualScreenshots=${kimiVisualEvidence.screenshotCount}`,
        `kimiVisualChecks=${kimiVisualEvidence.checkCount}`,
        `kimiVisualFailures=${kimiVisualEvidence.failureCount ?? 'unknown'}`,
        `kimiVisualDynamicSettlementDetail=${kimiVisualEvidence.dynamicSettlementDetailChecked ? 'checked' : 'missing'}`,
        `kimiVisualDynamicClaimDetail=${kimiVisualEvidence.dynamicClaimDetailChecked ? 'checked' : 'missing'}`,
        `kimiVisualTemporaryDatabase=${kimiVisualEvidence.temporaryVisualDatabase ? 'used' : 'not-recorded'}`,
        ...kimiVisualEvidence.dynamicNotes.map((note) => `kimiVisualDynamicNote=${note}`),
        'data/kimi-visual-readiness-packet.md',
      ],
      nextAction: kimiVisualReady && simplifiedKimiShellReady
        ? 'Keep the dashboard simple, keep customer tasks first, keep business setup inside Account details, and rerun visual screenshots after major layout changes.'
        : 'Restore the simplified Kimi shell, footer legal links, Account details disclosure, and dashboard drawer, then run npm run kimi:visual:packet.',
    },
    {
      key: 'core-routes',
      label: 'Client-facing routes are connected',
      owner: 'codex',
      status: statusFromBoolean(implementationReady(coreRouteFiles, root) && routeExportHygieneReady),
      evidence: [
        ...coreRouteFiles,
        `routeExportHygiene=${routeExportHygieneReady ? 'ready' : 'blocked'}`,
        `routeFiles=${routeExportHygiene.routeFiles.length}`,
        `routeExportLeaks=${routeExportHygiene.leaks.length}`,
        'routeExportAllowedNames=Next handlers plus route config only',
        'scripts/validate-next-route-exports.cjs',
        'scripts/lib/next-route-export-hygiene.cjs',
        'scripts/validate-ui-guardrails.cjs',
        ...routeExportHygiene.leaks.slice(0, 5),
      ],
      nextAction: routeExportHygieneReady
        ? 'Keep dashboard, onboarding, setup, review, claims, pricing, trust, status, audit, permissions, packet, and launch routes backed by live ClaimBot data with route exports limited to handlers/config.'
        : 'Move route helper exports into src/lib and rerun npm run validate:ui plus a production build.',
    },
    {
      key: 'client-safe-surfaces',
      label: 'Client pages hide raw operator commands and exports',
      owner: 'codex',
      status: statusFromBoolean(clientSafeSurfacesReady),
      evidence: [
        `clientSafeSurfaces=${clientSafePageFiles.length}`,
        `clientSafeLeaks=${clientSafeSurfaceLeaks.length}`,
        `customerRenderedCopyGuard=${customerRenderedCopyGuardReady ? 'ready' : 'blocked'}`,
        'operatorProofPages=Launch,Packet Center,Audit,Settings',
        'customerRouteCoverage=dashboard,goal,onboarding,setup,eligibility,review,claims,status,settlements,profile,permissions,authorizations,purchases,breaches,pricing,login,help,contact,trust,privacy,terms',
        'scripts/validate-ui-guardrails.cjs',
        'scripts/smoke-webapp.cjs',
        ...clientSafeSurfaceLeaks.slice(0, 5),
      ],
      nextAction: clientSafeSurfacesReady
        ? 'Keep raw npm commands and audit export URLs out of normal client-facing pages; use Launch, Packet Center, Audit, or Settings for operator proof.'
        : 'Remove raw npm commands, command rows, rendered command fields, and direct audit export URLs from normal client-facing pages.',
    },
    {
      key: 'backend-data-readiness',
      label: 'Backend data and hosted database readiness',
      owner: 'operator',
      status: statusFromBoolean(backendDataReady),
      evidence: [
        `databaseSchema=${schemaReady ? 'ready' : 'blocked'}`,
        `sourceCatalog=${sourceCatalogReady ? 'ready' : 'blocked'}`,
        `hostedDatabasePacket=${hostedDatabaseReady ? 'ready' : 'blocked'}`,
        `settlements=${launchReadiness.sourceCatalogReadiness.totalSettlements}`,
        ...(hostedDatabasePacket?.missingInputs.length ? hostedDatabasePacket.missingInputs.slice(0, 3) : []),
      ],
      nextAction: backendDataReady
        ? 'Keep hosted migrations, source import receipts, and support-packet schema evidence current.'
        : 'Configure hosted database values, run hosted migrations/imports, regenerate the hosted database packet, then rerun launch handoff.',
    },
    {
      key: 'feature-flags-shadow-mode',
      label: 'Feature flags and shadow-mode defaults',
      owner: 'operator',
      status: statusFromBoolean(shadowModeReady),
      evidence: [
        `claim_filer_mode=${launchReadiness.mode}`,
        `liveFilingFeatureEnabled=${launchReadiness.liveFilingFeatureEnabled}`,
      ],
      nextAction: 'Keep live filing disabled for first client preview and keep CLAIM_FILER_MODE=shadow.',
    },
    {
      key: 'auth-identity-gates',
      label: 'Hosted auth and Identity gates',
      owner: 'deployment',
      status: statusFromBoolean(authReady),
      evidence: [
        `identityReady=${netlifyProjectSetup.identityReady}`,
        'loginClientPreviewGate=account-scoped',
        'loginInviteBoundary=account-readiness-required',
        'src/app/login/page.tsx',
        'src/app/login/LoginPanel.tsx',
        'data/netlify-project-setup-receipt.json',
        '/api/profile/bootstrap',
      ],
      nextAction: 'Confirm Netlify Identity settings, record the setup receipt, and rerun hosted auth smoke.',
    },
    {
      key: 'eligibility-matcher-proof',
      label: 'Eligibility checks and matcher receipt',
      owner: 'operator',
      status: statusFromBoolean(sourceCatalogReady && matcherReceiptReady),
      evidence: [
        `matcherReceipt=${matcherReceipt.exists ? 'present' : 'missing'}`,
        `matcherErrors=${matcherReceipt.errorCount ?? 'pending'}`,
        'audit:MATCHER_RUN_COMPLETED',
      ],
      nextAction: 'Run the matcher receipt command after source import so client matches have a fresh audit receipt.',
    },
    {
      key: 'permission-proof-flow',
      label: 'Permission and proof-required review flow',
      owner: 'codex',
      status: statusFromBoolean(implementationReady(proofFlowFiles, root) && shadowModeReady),
      evidence: proofFlowFiles,
      nextAction: 'Keep proof-required claims parked for manual review and retain category permission gates.',
    },
    {
      key: 'paid-full-automation-command-contract',
      label: 'Paid commands run fully automated worker jobs',
      owner: 'codex',
      status: statusFromBoolean(paidAutomationContractReady),
      evidence: [
        ...paidAutomationContractFiles,
        `paidAutomationContract=${paidAutomationContractReady ? 'ready' : 'blocked'}`,
        `workerRuntimeProof=${fullAutomationLaunchBlockerSummary.ready ? 'verified' : 'still-launch-locked'}`,
        'automationMode=full_guarded',
        'workerCadence=automatic_polling',
        'manualStops=hard-blockers-only',
      ],
      nextAction: paidAutomationContractReady
        ? 'Keep paid commands wired to audited file_claim worker jobs; hosted worker runtime proof still gates launch and paid checkout.'
        : 'Restore paid command code paths so bulk and single-claim actions arm automatic file_claim worker jobs instead of semi-automated review prep.',
    },
    {
      key: 'audit-packets',
      label: 'Auditability and packet exports',
      owner: 'codex',
      status: statusFromBoolean(implementationReady(auditFiles, root)),
      evidence: [
        ...auditFiles,
        `/api/audit/support-packet`,
        `/api/audit/external-activation-workbook`,
        `/api/audit/launch-handoff`,
      ],
      nextAction: 'Export support and activation packets from a signed session before client-preview promotion.',
    },
    {
      key: 'pricing-billing',
      label: betaNoBillingReady ? 'Beta access and checkout-off gate' : 'Pricing and paid automation billing gates',
      owner: 'business',
      status: statusFromBoolean(betaNoBillingReady || (billing.ready && paidCheckoutReady)),
      evidence: [
        `betaNoBilling=${betaNoBillingReady}`,
        `billingReady=${billing.ready}`,
        `paidCheckoutReady=${paidCheckoutReady}`,
        `plusMonthlyCheckoutBlock=${paidCheckoutBlockReasons.plusMonthly ?? 'none'}`,
        `proMonthlyCheckoutBlock=${paidCheckoutBlockReasons.proMonthly ?? 'none'}`,
        'pricingPageClientPreviewLock=ready',
        'pricingPageFullAutomationBlockers=visible',
        `requiredConfigured=${billing.requiredConfigured}/${billing.requiredTotal}`,
        'data/billing-activation-packet.md',
      ],
      nextAction: betaNoBillingReady
        ? 'Keep checkout disabled during beta; grant beta access only through account records, and do not sell paid automation until checkout, payment confirmation, and worker proof are ready.'
        : paidCheckoutReady
          ? 'Keep processor-hosted checkout links, signed entitlement sync, legal-review acknowledgement, and billing packet evidence current.'
        : `Resolve paid checkout locks (${paidCheckoutBlockedReasons.join(', ') || 'none recorded'}), including legal review when required, then regenerate the billing packet.`,
    },
    {
      key: 'trust-compliance',
      label: 'Trust, legal, and compliance copy',
      owner: 'legal',
      status: statusFromBoolean(legalReady),
      evidence: [
        'src/app/trust/page.tsx',
        'src/app/terms/page.tsx',
        'src/app/privacy-policy/page.tsx',
        'data/legal-review-packet.md',
      ],
      nextAction: 'Complete legal review, record CLAIMBOT_LEGAL_REVIEW_ACK=reviewed, then rerun legal validation.',
    },
    {
      key: 'hosted-deployment-preview',
      label: 'Hosted deployment and preview promotion proof',
      owner: 'deployment',
      status: statusFromBoolean(deployedPreviewReady && launchPacketSummary.ready),
      evidence: [
        `netlifyPreview=${launchReadiness.netlifyPreviewReadiness.ok ? 'ready' : 'blocked'}`,
        `previewPromotionReceipt=${launchReadiness.previewPromotionReceiptReadiness.ok ? 'ready' : 'blocked'}`,
        `launchPackets=${launchPacketSummary.readyCount}/${launchPacketSummary.totalCount}`,
      ],
      nextAction: 'Deploy to Netlify, run deployed smokes, record preview promotion receipt, and rerun production check receipt.',
    },
  ];

  const summary = summarizeClientPreviewChecklist(items, {
    launchClientPreviewReady: launchReadiness.clientPreviewReady,
    matcherReceiptReady,
    launchPacketReadyCount: launchPacketSummary.readyCount,
    launchPacketTotalCount: launchPacketSummary.totalCount,
    nextStep,
  });

  return {
    format: 'claimbot.client-preview-checklist.v1',
    generatedAt,
    artifact: 'data/client-preview-checklist.md',
    accountScope: {
      accountId: userId,
      scope: 'account-scoped',
      matcherReceiptRequired: true,
      note: 'Matcher proof is evaluated for this account only. Run the matcher for each client account before relying on client-facing match evidence.',
    },
    readiness: {
      ready: true,
      checklistOnly: true,
      clientPreviewReady: summary.clientPreviewReady,
      productRequirementReadyCount: summary.readyCount,
      productRequirementTotalCount: summary.totalCount,
      blockedRequirementCount: summary.blockedCount,
      reviewRequirementCount: summary.reviewCount,
      codexProductReady: summary.codexProductReady,
      externalProductBlockerCount: summary.externalProductBlockerCount,
      boundary: 'A ready checklist means the current product requirements were evaluated; it does not clear blocked hosted database, billing, legal, Identity, matcher, preview, or deployment proof.',
    },
    summary,
    items,
    launchActionPlan: {
      summary: actionPlanSummary,
      rows: actionPlan,
      commandQueue,
      ownerHandoffBriefs,
      note: 'Launch action plan rows add owners, execution boundaries, required inputs, proof artifacts, and non-secret commands for every current client-preview workstream.',
    },
    ownerHandoffBriefs,
    launchCriticalPath: criticalPath,
    launchPacketStack: {
      summary: launchPacketSummary,
      rows: launchPacketRows,
    },
    fullAutomationLaunchBlockers: {
      summary: fullAutomationLaunchBlockerSummary,
      rows: fullAutomationLaunchBlockers,
      boundary: 'Paid full automation remains locked until this list is empty, the launch packet stack is ready, and the account-specific client-preview checklist is ready.',
    },
    localTooling: {
      netlifyCli: launchReadiness.netlifyCliReadiness,
      localVerificationPacket,
      note: 'Client-preview checklist records local Netlify CLI/auth readiness as non-secret operator evidence; it does not include Netlify tokens or account credentials.',
    },
    exports: {
      supportPacket: '/api/audit/support-packet',
      netlifyLaunchDoctor: '/api/audit/netlify-launch-doctor',
      externalActivationWorkbook: '/api/audit/external-activation-workbook',
      clientPreviewChecklist: '/api/audit/client-preview-checklist',
      launchHandoff: '/api/audit/launch-handoff',
    },
    note: 'This checklist is non-secret. It summarizes whether the current ClaimBot app state proves the Kimi-designed SaaS/PWA is ready for client preview.',
  };
}

export type ClientPreviewChecklist = Awaited<ReturnType<typeof buildClientPreviewChecklist>>;

export function markdownClientPreviewChecklist(packet: ClientPreviewChecklist) {
  return [
    '# ClaimBot Client Preview Checklist',
    '',
    `Generated: ${packet.generatedAt}`,
    '',
    'This is a non-secret completion audit for the Kimi-designed ClaimBot SaaS/PWA. It records product requirement status only and does not print database URLs, tokens, checkout links, webhook secrets, session secrets, support mailbox values, or raw user data.',
    '',
    '## Current Gate',
    '',
    `Client preview ready: ${packet.summary.clientPreviewReady ? 'yes' : 'no'}`,
    `Account scope: ClaimBot account #${packet.accountScope.accountId}`,
    `Matcher proof scope: ${packet.accountScope.scope}; ${packet.accountScope.note}`,
    `Product requirements ready: ${packet.summary.readyCount}/${packet.summary.totalCount}`,
    `Blocked requirements: ${packet.summary.blockedCount}`,
    `Review requirements: ${packet.summary.reviewCount}`,
    `Codex-owned product work ready: ${packet.summary.codexProductReady ? 'yes' : 'no'}`,
    `External product blockers: ${packet.summary.externalProductBlockerCount}`,
    `Launch packets ready: ${packet.summary.launchPacketReadyCount}/${packet.summary.launchPacketTotalCount}`,
    `Boundary: ${packet.readiness.boundary}`,
    '',
    ...(packet.summary.nextStep
      ? [
        '## Next External Proof',
        '',
        `Owner: ${packet.summary.nextStep.owner}`,
        `Step: ${packet.summary.nextStep.label}`,
        `Action: ${packet.summary.nextStep.nextAction}`,
        `Execution boundary: ${packet.summary.nextStep.executionBoundary}`,
        `Required inputs: ${packet.summary.nextStep.requiredInputs.join(', ')}`,
        `Proof artifacts: ${packet.summary.nextStep.proofArtifacts.join(', ')}`,
        'Starter commands:',
        ...packet.summary.nextStep.commands.slice(0, 6).map((command) => `- \`${command}\``),
        ...(packet.summary.nextStep.commands.length > 6 ? [`- +${packet.summary.nextStep.commands.length - 6} more commands in JSON`] : []),
        '',
      ]
      : []),
    '## Owner Readiness Split',
    '',
    ...packet.summary.ownerReadiness.map((row) => (
      `- ${row.owner}: ${row.readyCount}/${row.totalCount} ready, ${row.blockedCount} blocked, ${row.reviewCount} review${row.ready ? ' (clear)' : ''}`
    )),
    '',
    '## Launch Action Plan',
    '',
    `Action steps blocked: ${packet.launchActionPlan.summary.blockedSteps}/${packet.launchActionPlan.summary.totalSteps}`,
    ...(packet.launchActionPlan.rows.length === 0
      ? ['- No launch action steps recorded.']
      : packet.launchActionPlan.rows.flatMap((row) => [
        `${row.order}. ${row.label}: ${row.status === 'confirmed' ? 'clear' : `${row.blockerCount} blocker${row.blockerCount === 1 ? '' : 's'}`}`,
        `   Owner: ${row.owner}`,
        `   Execution boundary: ${row.executionBoundary}`,
        `   Required inputs: ${row.requiredInputs.join(', ')}`,
        `   Proof artifacts: ${row.proofArtifacts.join(', ')}`,
        '   Non-secret commands:',
        ...row.commands.slice(0, 4).map((command) => `   - \`${command}\``),
        ...(row.commands.length > 4 ? [`   - +${row.commands.length - 4} more commands in JSON`] : []),
        '',
      ])),
    `Boundary: ${packet.launchActionPlan.note}`,
    '',
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
    `Boundary: ${packet.launchActionPlan.commandQueue.note}`,
    '',
    'Local commands available now:',
    ...(packet.launchActionPlan.commandQueue.localNow.length === 0
      ? ['- None']
      : packet.launchActionPlan.commandQueue.localNow.slice(0, 12).map((item) => `- \`${item.command}\` (${item.sourceStepLabel})`)),
    ...(packet.launchActionPlan.commandQueue.localNow.length > 12 ? [`- +${packet.launchActionPlan.commandQueue.localNow.length - 12} more local commands in JSON`] : []),
    '',
    'Commands waiting on external input:',
    ...(packet.launchActionPlan.commandQueue.externalRequired.length === 0
      ? ['- None']
      : packet.launchActionPlan.commandQueue.externalRequired.slice(0, 12).map((item) => `- \`${item.command}\` (${item.sourceStepLabel})`)),
    ...(packet.launchActionPlan.commandQueue.externalRequired.length > 12 ? [`- +${packet.launchActionPlan.commandQueue.externalRequired.length - 12} more external-input commands in JSON`] : []),
    '',
    '## Product Requirements',
    '',
    ...packet.items.flatMap((item, index) => [
      `${index + 1}. ${item.label}: ${item.status}`,
      `   Owner: ${item.owner}`,
      `   Next action: ${item.nextAction}`,
      '   Evidence:',
      ...item.evidence.map((evidence) => `   - ${evidence}`),
      '',
    ]),
    '## Launch Packet Stack',
    '',
    `Packets ready: ${packet.launchPacketStack.summary.readyCount}/${packet.launchPacketStack.summary.totalCount}`,
    ...(packet.launchPacketStack.rows.length === 0
      ? ['- None']
      : packet.launchPacketStack.rows.flatMap((row) => [
        `- ${row.label}: ${row.statusLabel} (${row.path})`,
        `  Command: ${row.command}`,
        `  Status: ${row.statusDetail}`,
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
    '## Exports',
    '',
    `- Support packet: ${packet.exports.supportPacket}`,
    `- Netlify launch doctor: ${packet.exports.netlifyLaunchDoctor}`,
    `- External activation workbook: ${packet.exports.externalActivationWorkbook}`,
    `- Client preview checklist: ${packet.exports.clientPreviewChecklist}`,
    `- Launch handoff: ${packet.exports.launchHandoff}`,
    '',
    '## Notes',
    '',
    '- This checklist is not legal approval, billing activation, Netlify Identity proof, or preview promotion proof.',
    '- Regenerate it after external setup changes so the product requirement count and next step stay current.',
    '- No secret values were printed.',
    '',
  ].join('\n');
}

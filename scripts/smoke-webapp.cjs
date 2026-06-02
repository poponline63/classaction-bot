const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

if (
  process.platform === 'win32'
  && (!process.env.PLAYWRIGHT_BROWSERS_PATH || process.env.PLAYWRIGHT_BROWSERS_PATH.includes(':USERPROFILE'))
) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');
}

const { chromium } = require('playwright');
const {
  collectNextStaticHealth,
  formatNextStaticHealthFailure,
} = require('./lib/next-static-health.cjs');

const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:3100';
const strictText = process.env.SMOKE_STRICT_TEXT === '1';
const strictCacheHeaders = process.env.SMOKE_STRICT_CACHE_HEADERS === '1';
const verboseSmoke = process.env.SMOKE_PROGRESS === '1';

function isLocalhostTarget() {
  try {
    const hostname = new URL(baseUrl).hostname;
    return ['localhost', '127.0.0.1', '::1'].includes(hostname);
  } catch {
    return false;
  }
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    if (process.platform !== 'win32') throw error;
    return chromium.launch({ channel: 'msedge', headless: true });
  }
}

const pages = [
  {
    path: '/',
    h1: 'Dashboard',
    includes: [
      'YOUR CLAIM WORKSPACE',
      'Find matches. Review them. Track the claims you approve.',
      'Finish profile',
      'Check for matches',
      'Possible matches',
      'Needs review',
      'Tracking',
      'Activity',
      'DO THIS NEXT',
      'Simple rule',
      'Account details',
    ],
  },
  {
    path: '/goal',
    h1: 'Find matches and track claims.',
    mobileActiveNav: 'Plan',
    includes: [
      'OPERATING GOAL',
      'Ready for review',
      'Needs your review',
      'Being tracked',
      'Last discovery scan',
      'App basics',
      'Action Navigator',
      'Three steps: set up profile, review matches, track claims.',
      'Set up profile',
      'Review matches',
      'Track claims',
      'Next best action',
      'One clear next move, plus the status that matters.',
      'Current step',
      'NEXT ACTION',
      'SAFETY POSTURE',
      'AUTOMATION LANE',
      'More workflow details',
      'Optional status, safety rules, and automation checks.',
      'Desktop today. Mobile later.',
      'PROOF RULES',
      'Proof review required',
      'Permission required',
      'Nothing is submitted unless live filing is explicitly enabled',
      'User-control contract',
      'Automation With Guardrails You Can See.',
      'Explicit permission',
      'Continuous discovery',
      'Claim tracking',
      'Hard automation boundary',
      'Automation boundary',
      'More workflow details',
    ],
  },
  {
    path: '/onboarding',
    h1: 'Get ClaimBot ready in three simple steps',
    includes: [
      'START HERE',
      'Get ClaimBot ready in three simple steps',
      'Nothing is submitted from onboarding.',
      'Most users only need this page first.',
      'Add your facts',
      'Find possible matches',
      'Review and track',
      'Saved facts only',
      'Proof stays manual',
      'Permission required',
      'Account history',
      'More onboarding details',
    ],
  },
  {
    path: '/setup',
    h1: 'Start with facts',
    includes: [
      'Intake progress',
      'Step 1 of',
      'INTAKE OVERVIEW',
      'START',
      'CURRENT STEP',
      'SAFETY BOUNDARY',
      'Nothing is submitted from onboarding.',
      'NEXT ACTION',
      'This flow collects facts. Review remains the default.',
      'SIMPLE START',
      'Three parts: facts, permission, review.',
      'Start with facts',
      'Choose permissions',
      'Review before filing',
      'PROOF RULES',
      'Proof review required',
      'Permission required',
      '2 MINUTES. NO OBLIGATION TO FILE.',
      'Intake safeguards',
      'Next: safe review',
      'Privacy and safety',
      'BEFORE DATA ENTRY',
      'Next: start with your info.',
      'Before you enter anything',
      'How ClaimBot handles sensitive data',
      'No fabrication',
      'Proof-required manual',
      'Permission required',
      'Shadow mode first',
      'Get started',
      'Profile',
      'Review',
    ],
  },
  {
    path: '/eligibility',
    h1: 'See which claims look like a fit',
    includes: [
      'Claim fit',
      'ClaimBot compares your saved facts with available claim opportunities',
      'Review only. No claim is submitted from this page.',
      'NEW USER PATH',
      'Do these three things in order.',
      'Add facts',
      'Choose claim types',
      'Review matches',
      'Start with the cards marked Needed',
      'Ready',
      'Need review',
      'Total',
      'Basic info',
      'Claim facts',
      'Your permission',
      'Proof notes',
      'More eligibility details',
      'Saved facts, documents, permission, plan, and source rules behind the simple status cards.',
      'Permission matters',
      'Candidate review',
      'Possible matches',
      'Possible matches',
      'Search matches by status and deadline',
      'All candidates',
      'Documents needed',
      'No matcher records yet',
      'Next safe action',
    ],
  },
  {
    path: '/review',
    h1: 'Review matches',
    includes: [
      'REVIEW INTAKE ROUTER',
      'No authorized matches are waiting yet',
      'Why this is empty',
      'Shadow Mode: On',
      'Category permission: Required',
      'Category Match',
      'Refine criteria',
      'MATCH REVIEW',
      'More review details',
      'Proof, permission, forms, plan access, and account-history checks.',
      'Match refresh history',
      'More tracking details',
      'Safety checks, blocked reasons, and tracking details.',
      'Review decision guide',
      'Review browser',
      'Search match results before tracking claims',
      'All matches',
      'Ready to track',
      'Proof review',
      'Permission needed',
      'Review only what fits',
      'Proof stays manual',
      'Track after consent',
      'Automation safety bridge',
      'Automation Tier Active',
      'We do not evaluate legal eligibility',
      'DRAFT MODE',
      'GUARDED',
      'Safety Review Active',
      'ACTION NAVIGATOR',
      'Three steps: confirm facts, review matches, track claims.',
      'STEP 1 - PROFILE',
      'STEP 2 - REVIEW',
      'STEP 3 - TRACK',
      'Inspect matches',
    ],
  },
  {
    path: '/claims',
    h1: 'Claims',
    includes: [
      'NO CLAIMS TRACKED YET',
      'No claims are being tracked yet',
      'Why this is empty',
      'Shadow Mode: On',
      'Proof Review: Enforced',
      'Manual Review',
      'Review matches',
      'Review safety details',
      'HOW TO USE CLAIM TRACKING',
      'Follow approved claims from review to status.',
      'Review first',
      'Watch status',
      'Check timeline',
      'Tracking status',
      'Hold - permission needed',
      'MODE',
      'PERMISSION',
      'PROOF STEPS',
      'DAILY LIMIT',
      'More automation details',
      'Paid automation status, setup locks, safety receipts, and full-automation boundaries.',
      'Claim tracker',
      'Search tracked claims',
      'All claims',
      'No tracked claims yet',
      'More filing safety details',
      'Dispatch controls, plan checks, proof locks, daily limits, and account history.',
      'Claim tracking',
      'More tracking history details',
      'Read-only claim history, pipeline checkpoints, and support context.',
      'Before a claim moves forward',
      'Waiting',
      'Needs attention',
      'Automation stays guarded',
      'Reviewed first',
      'Proof stays manual',
      'Permission required',
    ],
  },
  {
    path: '/status',
    h1: 'Claim status',
    mobileActiveNav: 'Claims',
    includes: [
      'Status timeline',
      'See where approved claims stand',
      'Review-mode tracking active',
      'Status labels show workflow progress',
      'HOW TO USE STATUS',
      'Check the timeline first, then fix anything marked needs review.',
      'Open claims',
      'Read the timeline',
      'Resolve review items',
      'More account details',
      'Timeline browser',
      'Search claim status history',
      'All statuses',
      'Shadow Match',
      'Recorded',
      'Active',
      'Recorded results',
      'Paid',
      'Needs review',
      'Automation runs',
      'Timeline is an account record',
      'Proof remains manual',
      'Permission stays scoped',
      'Account history is the source',
      'No claim statuses yet',
      'The timeline opens after review starts tracking a claim',
    ],
  },
  {
    path: '/packets',
    h1: 'Packet Center',
    includes: [
      'Claim packet preparation',
      'ClaimBot can prepare eligible packets automatically',
      'Packets remain in shadow review',
      'Packet readiness is not filing authority',
      'Claim packets',
      'Evidence records',
      'Review records',
      'Needs review',
      'Automation status',
      'Documents stay user-controlled',
      'Exports are read-only',
      'Approval stays separate',
      'Terms check audited',
      'Shadow mode first',
      'Packet preparation runway',
      'Select, document, review, then confirm only after checks clear',
      'Documentation Checklist',
      'Review Your Claim Packet',
      'Ready for Final Approval',
      'Final approval remains separate',
      'Support packet evidence',
      'Launch path is included in the account support packet',
      'ordered launch-critical path',
      'Customer access readiness plan',
      'Blocked workstreams are exportable',
      'npm run netlify:doctor',
      'Paid checkout receipt',
      'Paid checkout is locked before payment',
      'legal-review-not-recorded',
      'User consent receipt',
      'USER_TERMS_ACKNOWLEDGED',
      'Matcher refresh receipt',
      'Packet exports can prove the matcher was refreshed',
      'MATCHER_RUN_COMPLETED',
      'Export support packet (JSON)',
      'Review launch readiness',
      'Packet browser',
      'Find a claim packet to review',
      'All packets',
      'Proof review',
      'No packets yet',
      'Packet preparation starts after review tracks a claim',
      'Handoff boundary',
      'What a packet export proves',
      'Source and match context',
      'Permission text',
      'Evidence records and digest',
    ],
  },
  {
    path: '/settlements',
    h1: 'Settlements',
    includes: [
      'CATALOG PREFLIGHT',
      'Shadow Mode Active',
      'Run Preflight Review',
      'Safety boundary',
      'Source provenance pending',
      'Load source catalog',
      'STATUS',
      'Shadow mode active',
      'TRUST BOUNDARY',
      'NEXT SAFE ACTION',
      'Settlement Coverage & Readiness',
      'Live source meter',
      'Discovery firewall',
      'Four-gate tracker',
      'Shadow queue pill',
      'Discovery browser',
      'Search source records without implying claim permission',
      'All records',
      'Discovery health',
      'Source catalog',
      'Proof stays manual',
      'Audit before dispatch',
      'Shadow default',
      'SOURCE & BOUNDARY',
      'Source records are not claim permission.',
      'Provenance',
      'Match bounds',
      'Customer scope',
      'Source sync',
      'Review match context',
    ],
  },
  {
    path: '/profile',
    h1: 'Profile',
    includes: [
      'PROFILE SNAPSHOT',
      'SAVED FACTS',
      'NEXT NEED',
      'NEXT ACTION',
      'No eligibility is fabricated',
      'More profile details',
      'Facts needed',
      '0 evidence',
      '0 permissions',
      'Shadow',
      'Add your basic info',
      'Next step',
      'Intake',
      'Permission',
      'Review',
      'Personal information',
      'Save profile',
    ],
  },
  {
    path: '/settings',
    h1: 'Settings',
    includes: [
      'SAFE LAUNCH INDICATOR',
      'Safety checks required',
      'READINESS',
      'ACCESS',
      'MODE',
      'Open required fixes',
      'Control browser',
      'Search runtime and launch controls before changing settings',
      'All controls',
      'Needs attention',
      'SETTINGS NAVIGATOR',
      'Pick the control area before changing runtime behavior.',
      'OPERATIONAL MODES',
      'SECURITY & COMPLIANCE',
      'HOSTED ENVIRONMENT',
      'CLIENT CONTROLS',
      'Launch Control Center',
      'LAUNCH & HANDOFF',
      'Blocker review',
      'Environment handoff',
      'Client invite',
      'Shadow guardrails',
      'Run Pre-Launch Verification',
      'Before going live',
      'Paid automation readiness',
      'Paid automation needs setup',
      'hosted data, business setup, billing, legal review',
      'CLIENT INVITE READINESS',
      'Invite clients when the account is ready',
      'Client Preview Checklist',
      'Launch Packet Stack',
      'Shadow Mode',
      'Proof Review',
      'Auth Policy',
      'Account History',
      'POSTURE',
      'COMPLIANCE',
      'FILING',
      'Resolve 5 blockers',
      'Netlify env',
      'Posture lock',
      'Identity & auth gates',
      'Runtime guardrails',
      'Arm launch',
      'Hosted Deployment Handoff',
      'Values are masked here and never committed to source',
      'DATABASE_URL',
      'SCRAPER_USER_AGENT',
      'CLAIMBOT_SUPPORT_EMAIL',
      'CLAIMBOT_SESSION_SECRET',
      'Secrets are injected at runtime',
      'Control room',
      'Filing posture',
      'Hosted blockers',
      'Shadow default',
      'Support contact',
      'netlify env:set CLAIMBOT_SESSION_SECRET',
    ],
  },
  {
    path: '/permissions',
    h1: 'Permissions',
    includes: [
      'Permission coverage',
      'Allowed categories',
      'Blocked categories',
      'Permission required before automation',
      'Review claim types',
      'Allow automation review',
      'Keep review only',
      'I have read and manually confirm this category attestation.',
      'Save review-only status',
      'All permission changes are recorded',
      'Verbatim attestation',
      'Final checks enforced',
      'Automation safety',
      'Permission controls before paid full automation',
      'Review mode by default',
      'No made-up facts',
      'Instant category pause',
      'Saved activity history',
      'Confirm safeguards',
      'Permission browser',
      'Search claim permissions before automation',
      'All categories',
      'Permission saved',
      'Review only',
    ],
  },
  {
    path: '/authorizations',
    h1: 'Permissions',
    includes: [
      'Permission coverage',
      'Permission required before automation',
      'I have read and manually confirm this category attestation.',
      'All permission changes are recorded',
      'Permission controls before paid full automation',
      'Search claim permissions before automation',
      'All categories',
    ],
  },
  {
    path: '/audit',
    h1: 'Account history',
    includes: [
      'Trace review',
      'Review record active',
      'Account history is ready for its first reviewed action',
      'Account History: Awaiting First Reviewed Claim',
      'History Archive',
      'Claim events',
      'Authorization events',
      'Needs attention',
      'Account history browser',
      'Search append-only events without changing the record',
      'All events',
      'All actors',
      'Account history packet',
      'Export support packet (JSON)',
      'Append-only checkpoint',
      'TRUST HANDOFF',
      'Read-only support context',
      'Export current handoff',
      'Append-only trace',
      'Authorization evidence',
      'Digest-backed claim exports',
      'Attention queue',
      'Launch evidence included',
      'masked setup evidence',
      'Plan check evidence',
      'Pro/Founding filing lane',
      'Client preview action plan',
      'Blocked workstreams are audit-visible',
      'Paid full automation setup lock',
      'Hands-off paid filing is still locked',
      'eligible no-proof claims can run hands-off',
      'Export client preview checklist',
    ],
  },
  {
    path: '/purchases',
    h1: 'Purchases',
    includes: [
      'Evidence coverage',
      'Purchase records',
      'Categories covered',
      'Document notes',
      'Evidence browser',
      'Search purchase facts without changing saved evidence',
      'All evidence',
      'How your evidence is handled',
      'You provide facts; we never fabricate.',
      'Matcher finds potential fits only.',
      'Proof steps stay manual.',
      'Shadow mode is on.',
      'Continue to evidence intake',
      'Document notes',
      'Class-period matching',
      'No fabrication',
    ],
  },
  {
    path: '/breaches',
    h1: 'Data breach exposure',
    includes: [
      'Evidence coverage',
      'Breach records',
      'Exposed emails',
      'Proof still required',
      'Exposure browser',
      'Search breach facts without changing saved exposure evidence',
      'All exposures',
      'How your evidence is handled',
      'You provide facts; we never fabricate.',
      'Matcher finds potential fits only.',
      'Proof steps stay manual.',
      'Shadow mode is on.',
      'Continue to evidence intake',
      'ClaimBot will not invent',
    ],
  },
  {
    path: '/launch',
    h1: 'Launch checklist',
    includes: [
      'Client data readiness',
      'Operator unblock console',
      'Finish these workstreams before inviting clients',
      'what to gather',
      'where the proof appears',
      'Open proof area',
      'Still locked until evidence exists',
      'Missing launch proof matrix',
      'Every blocked workstream needs a receipt',
      'Non-secret commands',
      'Required inputs:',
      'Proof artifacts:',
      'Verified in:',
      'Operator command queue',
      'Run local evidence first, then external account commands',
      'Safe local evidence commands',
      'Requires external input first',
      'Local verification receipt',
      'Local checks passed',
      'External boundary',
      'This receipt is local proof only',
      'Next launch actions',
      'Critical path to client preview',
      'shortest ordered path',
      'Operator account settings',
      'Netlify authentication',
      'Hosted database',
      'Netlify Identity proof',
      'Preview promotion receipt',
      'Proof:',
      'Owner:',
      'POSTURE',
      'COMPLIANCE',
      'FILING',
      'Resolve 5 blockers',
      'Netlify env',
      'LAUNCH VERIFICATION LEDGER',
      'Evidence for a client-safe shadow launch',
      'Environment handoff',
      'Access provisioning',
      'Operational readiness',
      'Shadow-mode evidence',
      'Billing checkout handoff',
      'Paid checkout is locked before payment',
      'Current paid checkout block reason',
      'legal-review-not-recorded',
      'Matcher refresh receipt',
      'Matcher proof before client preview',
      'MATCHER_RUN_COMPLETED',
      'Worker runtime packet',
      'Automation processing gate',
      'data/worker-runtime-packet.md',
      'npm run worker:packet',
      'Open Review matcher',
      'Signed entitlement sync',
      'Review evidence log',
      'Run pre-launch verification',
      'PRICING TO LAUNCH HANDOFF',
      'Automation Tier Active',
      'We do not evaluate legal eligibility',
      'Paid commands are designed to run hands-off',
      'DRAFT MODE',
      'GUARDED',
      'Safety Review Ready',
      'Source catalog',
      'Claim form coverage',
      'Source text encoding',
      'clean records',
      'Last scraper audit',
      'Client invite packet',
      'Ready-to-send handoff summary',
      'Hosted launch blockers',
      'OPERATOR ACTION REQUIRED',
      'Hosted Launch Blockers - Operator Action Required',
      'Open Settings & Apply Fixes',
      'ClaimBot remains in shadow mode',
      'MASKED ENV DIAGNOSTIC',
      'FOUNDER HANDOFF',
      'Production launch remains locked until the real env values exist',
      'Secret-safe env template',
      'handoff gates need attention',
      'DATABASE_URL=',
      'DATABASE_AUTH_TOKEN=',
      'CLAIMBOT_SESSION_SECRET=',
      'CLAIMBOT_BILLING_PLUS_MONTHLY_URL=',
      'CLAIMBOT_LEGAL_REVIEW_ACK=',
      'Copy template',
      'Copy command',
      'Enable Netlify Identity',
      'Project configuration > Identity',
      'invite-only registration',
      'Identity is not available in local dev',
      'npm run hosted:checklist',
      'Proof Gate: Manual',
      'Category Auth: Required',
      'Invite route',
      'First-run posture',
      'Client workflow path',
      'Support and pause path',
      'Preview hosted access',
      'Pre-invite safety gate',
      'Shadow-mode first launch',
      'Proof-required review',
      'Audit exports available',
      'Emergency pause path',
      'netlify env:set DATABASE_URL',
      'CLAIMBOT_BILLING_PRO_MONTHLY_URL',
      'CLAIMBOT_BILLING_SYNC_SECRET',
    ],
  },
  {
    path: '/pricing',
    h1: 'Free matching. Paid full automation.',
    includes: [
      'Payment availability',
      'Plan switcher',
      'Choose monthly flexibility or annual savings',
      '$29',
      '$79',
      'Paid checkout needs activation',
      'Payment activation record',
      'Paid automation activates only after checkout is confirmed',
      'Paid checkout remains locked',
      'Legal review must be recorded before checkout can be treated as live.',
      'Checkout links',
      'Stable user id',
      'Protected callback',
      'Duplicate-payment protection',
      'Needed before payment opens',
      'Plus checkout link',
      'Pro checkout link',
      'Protected billing confirmation',
      'Account reference mapping for the signed ClaimBot account',
      'Open payment status',
      'Open details',
      'stable account reference',
      'Payment confirmation IDs are tracked',
      'Pricing FAQ',
      'Common questions before paying for automation',
      'All questions',
      'FAQ is read-only',
      'Authorized filing lane',
      'Paid automation still keeps legal review',
      'Full Automation Lane',
      'Pro is hands-off where the claim is safe to automate',
      'Full guarded run',
      'PAID FULL AUTOMATION AVAILABILITY',
      'Pro waits until account checks clear',
      'account data, account access, payment, legal review, and account access checks clear',
      'Account access notes are tracked in detailed records',
      'Technical setup steps and proof',
      'PLAN BOUNDARY RECEIPT',
      'What payment changes, and what it never changes',
      'PAYMENT UNLOCKS',
      'Guarded automation',
      'PAYMENT DOES NOT UNLOCK',
      'Legal certainty',
      'PROOF-REQUIRED ITEMS',
      'Stay in review',
      'Pro automation runs on these defaults',
      'Eligibility checked, never faked',
      'You allow every category',
      'Proof-required claims stay parked',
      'Review mode plus account history',
      'No payout percentage',
      'No eligibility fabrication',
      'Founding',
      'Billing support must activate this checkout link',
      'Configure protected processor confirmation',
    ],
  },
  {
    path: '/login',
    h1: 'Sign in to ClaimBot',
    includes: [
      'After sign-in',
      'One sign-in, three things stay true.',
      'Private workspace',
      'Review mode first',
      'Proof stays manual',
      'More access details',
      'Secure workspace access',
      'your saved permission, proof checks, account checks, and an activity record',
      'before any filing job can run',
    ],
  },
  {
    path: '/help',
    h1: 'Help and support',
    includes: [
      'Review mode is on',
      'Start with your facts',
      'Review matches',
      'Manage permissions',
      'Track claims',
      'More help details',
      'Account status',
      'Account access',
      'Privacy requests',
      'Contact support',
      'Account basics',
      'Status first',
    ],
    includesWhenSupportMissing: ['Use Help and Contact while the support mailbox is being finished.'],
    excludesWhenSupportMissing: ['support@example.com'],
  },
  {
    path: '/trust',
    h1: 'Trust and safety',
    includes: [
      'Trust center',
      'Shadow mode is the active safety baseline',
      'Automation status',
      'Payment safety',
      'Account record',
      'Real facts only',
      'Proof stays manual',
      'Every action is logged',
      'Safety basics',
      'The simple version',
      'Installed app stays safe',
      'Recent account activity',
      'Support status',
      'Support can see the important status',
      'Account access plan',
      'Remaining account work is traceable',
      'PAID AUTOMATION AVAILABILITY',
      'Hands-off paid filing still needs account checks',
      'Pro can only run eligible no-proof claims hands-off',
      'Paid checkout status',
      'Paid checkout is still locked',
      'Legal review is still pending',
      'Match refresh status',
      'recent match refresh can be checked by support',
      'Export support packet',
      'Open details',
      'Operational status',
      'Current deployment controls',
      'Feature flags',
      'Client-visible capabilities',
      'Recent workspace events',
    ],
  },
  {
    path: '/contact',
    h1: 'Contact',
    includes: [
      'Account access',
      'Claim status',
      'Safety question',
      'More support details',
      'Privacy requests',
      'Billing help',
      'Account help',
    ],
    includesWhenSupportMissing: ['Use the help center while the support mailbox is being finished.'],
    excludesWhenSupportMissing: ['support@example.com'],
  },
  {
    path: '/privacy-policy',
    h1: 'Privacy Policy',
    includes: [
      'Legal boundary summary',
      'What the hosted app can and cannot do',
      'User facts stay user-controlled',
      'Automation remains guarded',
      'Shadow mode is the baseline',
      'Audit and support stay available',
      'Operational records',
      'Retention and export policy',
      'form-preparation records',
      'Deletion requests',
      'Offline and install behavior',
      'Support and privacy requests',
      'Download privacy export',
      'Record privacy request',
      'does not automatically',
    ],
  },
  {
    path: '/terms',
    h1: 'Terms of Service',
    includes: [
      'Legal boundary summary',
      'What the hosted app can and cannot do',
      'User facts stay user-controlled',
      'Automation remains guarded',
      'Shadow mode is the baseline',
      'Audit and support stay available',
      'Automation boundary',
      'Proof and permission checks',
      'Business responsibility',
      'Data retention and exports',
      'correction, export, or deletion',
    ],
  },
];

const viewports = [
  { name: 'desktop', width: 1360, height: 920 },
  { name: 'mobile', width: 390, height: 844 },
];

const requiredKimiNavLabels = ['Home', 'Start Here', 'Profile', 'Review', 'Claims', 'Status', 'Find Claims', 'Eligibility', 'Pricing', 'Help', 'Contact', 'MORE'];
const requiredKimiSupportNavLabels = ['Plan', 'Trust', 'History', 'Packets', 'Settings', 'Launch'];
const requiredClaimStatusLockupLabels = ['CLAIM STATUS', 'Review mode active', 'Account checks pending'];
const requiredBootstrapAuditLabels = ['Account safety', 'Safe review mode active', 'account check', 'Safety record saved'];
const forbiddenDemoShellText = ['Jordan Doe', 'Pro workspace'];
const customerCopyGuardedPaths = new Set([
  '/',
  '/goal',
  '/onboarding',
  '/setup',
  '/eligibility',
  '/review',
  '/claims',
  '/status',
  '/settlements',
  '/profile',
  '/permissions',
  '/authorizations',
  '/purchases',
  '/breaches',
  '/pricing',
  '/login',
  '/help',
  '/contact',
  '/trust',
  '/privacy-policy',
  '/terms',
]);
const customerLaunchTerminologyGuardedPaths = new Set([
  '/',
  '/goal',
  '/onboarding',
  '/setup',
  '/eligibility',
  '/review',
  '/status',
  '/claims',
  '/settlements',
  '/profile',
  '/permissions',
  '/authorizations',
  '/purchases',
  '/breaches',
  '/pricing',
  '/login',
  '/help',
  '/contact',
  '/trust',
  '/privacy-policy',
  '/terms',
]);
const forbiddenCustomerCopyText = [
  'operator',
  'client',
  'clients',
  'client preview',
  'client preview checklist',
  'customer preview',
  'customer invites',
  'customer access',
  'account-scoped',
  'accountScope',
  'product requirements',
  'required inputs',
  'account note',
  'next account item',
  'launch checklist',
  'launch packets',
  'packet center',
  'source administrator',
  'source administrators',
  'source-site',
  'source access',
  'source-access',
  'source-contact',
  'scraper identity',
  'scraping',
  'rate-limit',
  'npm run',
  '/api/audit',
  'audit trail',
  'hosted setup',
  'source setup needed',
  'source setup required',
  'source setup issue',
  'setup mode',
  'setup readiness',
  'setup status',
  'setup locks',
  'launch setup issue',
  'complete launch source setup',
  'setup boundary',
  'readiness files',
  'raw files',
  'raw records',
  'export files',
  'internal records',
  'internal readiness details',
  'internal detail',
  'internally clear',
  'readiness records',
  'readiness record',
  'readiness evidence',
  'full launch records',
  'technical readiness details',
  'detailed readiness records',
  'advanced workspace details',
  'advanced pricing readiness',
  'advanced readiness view',
  'owner readiness summary',
  'owner view',
  'launch reviewer',
  'backend details',
  'technical readiness status',
  'backend',
  'server-side',
  'claim_queue_blocked',
  'server checks',
  'server check',
  'backend release evidence',
  'backend tracking check',
  'blocked-at-server receipt',
  'an owner can',
  'deployment switches',
  'handled by an administrator',
  'setup files',
  'raw setup files',
  'setup artifact',
  'setup artifacts',
  'setup evidence',
  'support setup pending',
  'setup items left',
  'setup-backed',
  'active blockers',
  'blockers remain',
  'access blocked',
  'customer access: blocked',
  'no external setup blocker',
  'hands-off paid filing still blocked',
  'setup blocker',
  'setup blockers',
  'business setup still',
  'client invites',
  'sharing a preview',
  'preview clear',
  'identity setup',
  'identity facts',
  'identity and contact',
  'open identity',
  'review identity',
  'identity is ready',
  'identity is not available',
  'identity not ready',
  'netlify',
  'netlify preview url',
  'netlify dashboard',
  'auth token',
  'auth tokens',
  'billing secret',
  'billing secrets',
  'webhook secret',
  'webhook secrets',
  'signed entitlement sync',
  'signed billing sync',
  'processor-hosted',
  'entitlement',
  'entitlements',
  'launch gate',
  'launch gates',
  'client preview gate',
  'launch readiness resolver',
  'paid automation launch lock',
  'external activation boundary',
  'proof gate',
  'proof gates',
  'plan gate',
  'plan gates',
  'permission gate',
  'permission gates',
  'safety gate',
  'safety gates',
  'readiness gate',
  'readiness gates',
  'blocked gate',
  'blocked gates',
  'gate filter',
  'every gate',
  'filing gates',
  'automation remains gated',
  'paid billing gates',
  'required gates',
  'pre-invite auth gate',
  'manual approval gate',
  'gated automation',
  'bypass gates',
  'gate used for review',
  'gate between',
  'paid automation gate',
  'gates pass',
  'gates clear',
  'gates still apply',
  'plan-gated',
  'permission-gated',
  'proof-gated',
  'review-gated',
  'claim gates',
  'launch proof',
  'external proof',
  'runbook',
  'raw command',
  'operator proof',
  'operator-proof-note',
  'contact-operator-drawer',
  'profile-advanced-drawer',
  'operator-only commands',
  'launch-console',
  'proof artifact paths',
  'command surface',
  'environment variables',
  'support packets',
  'client handoff',
  'inviting clients',
  'before inviting clients',
  'inviting customers',
  'before inviting customers',
  'first client run',
  'client deployment',
  'client questions',
  'client-ready',
  'client workspace',
  'client scope',
  'client portal',
  'clients can',
  'clients inspect',
  'netlify cli',
  'smoke_base_url',
  'worker runtime',
  'file_claim',
  'artifact',
  'artifacts',
  'auditability',
  'codex can',
  'execution boundary',
  'operator-owned',
  'business-owned',
  'deployment-owned',
  'legal-owned',
  'operator gate',
  'business gate',
  'deployment gate',
  'legal gate',
  'hosted data gate',
  'business setup gate',
  'automation processing gate',
  'paid entitlement gate',
  'hosted preview gate',
  'deployment-operator action',
  'external infrastructure setup',
  'netlify dashboard action',
  'checkout-not-configured',
  'signed-sync-not-configured',
  'legal-review-not-recorded',
  'worker-runtime-not-verified',
  'operator account settings',
  'netlify identity proof',
  'netlify-identity-proof',
  'data/worker-runtime-packet.md',
  'data/billing-activation-packet.md',
  'data/preview-promotion-packet.md',
];
const forbiddenCustomerHtmlText = [
  'CLAIMBOT_',
  'DATABASE_URL',
  'SCRAPER_USER_AGENT',
  'npm run',
  '/api/audit',
  'proof artifact',
  'proofArtifacts',
  'hosted setup',
  'source setup needed',
  'source setup required',
  'source setup issue',
  'setup mode',
  'setup readiness',
  'setup status',
  'setup locks',
  'launch setup issue',
  'Complete launch source setup',
  'Setup boundary',
  'readiness files',
  'raw files',
  'raw records',
  'export files',
  'internal records',
  'internal readiness details',
  'internal detail',
  'internally clear',
  'readiness records',
  'readiness record',
  'readiness evidence',
  'full launch records',
  'technical readiness details',
  'detailed readiness records',
  'advanced workspace details',
  'advanced pricing readiness',
  'advanced readiness view',
  'owner readiness summary',
  'owner view',
  'launch reviewer',
  'backend details',
  'technical readiness status',
  'backend',
  'server-side',
  'CLAIM_QUEUE_BLOCKED',
  'server checks',
  'server check',
  'Backend release evidence',
  'Backend tracking check',
  'Blocked-at-server receipt',
  'An owner can',
  'Deployment switches',
  'handled by an administrator',
  'setup files',
  'raw setup files',
  'setup artifact',
  'setup artifacts',
  'setup evidence',
  'Support setup pending',
  'setup items left',
  'setup-backed',
  'active blockers',
  'blockers remain',
  'Access blocked',
  'Customer access: blocked',
  'No external setup blocker',
  'Hands-off paid filing still blocked',
  'setup blocker',
  'setup blockers',
  'business setup still',
  'client invites',
  'identity setup',
  'identity facts',
  'identity and contact',
  'open identity',
  'review identity',
  'identity is ready',
  'identity is not available',
  'identity not ready',
  'Netlify',
  'Netlify preview URL',
  'Netlify dashboard',
  'auth token',
  'auth tokens',
  'billing secret',
  'billing secrets',
  'webhook secret',
  'webhook secrets',
  'signed entitlement sync',
  'signed billing sync',
  'processor-hosted',
  'DATABASE_AUTH_TOKEN',
  'TURSO_AUTH_TOKEN',
  'CLAIMBOT_BILLING_SYNC_SECRET',
  'CLAIMBOT_STRIPE_WEBHOOK_SECRET',
  'claim gates',
  'operator proof',
  'operator-only commands',
  'launch-console',
  'proof artifact paths',
  'command surface',
  'environment variables',
  'support packets',
  'client handoff',
  'inviting clients',
  'before inviting clients',
  'inviting customers',
  'before inviting customers',
  'first client run',
  'client deployment',
  'client questions',
  'client-ready',
  'client workspace',
  'client scope',
  'client portal',
  'clients can',
  'clients inspect',
  'Netlify CLI',
  'SMOKE_BASE_URL',
  'Codex can',
  'executionBoundary',
  'execution boundary',
  'operator-owned',
  'business-owned',
  'deployment-owned',
  'legal-owned',
  'operator gate',
  'business gate',
  'deployment gate',
  'legal gate',
  'Hosted data gate',
  'Business setup gate',
  'Automation processing gate',
  'Paid entitlement gate',
  'Hosted preview gate',
  'deployment-operator action',
  'External infrastructure setup',
  'Netlify dashboard action',
  'checkout-not-configured',
  'signed-sync-not-configured',
  'legal-review-not-recorded',
  'worker-runtime-not-verified',
  'Operator account settings',
  'Netlify Identity proof',
  'netlify-identity-proof',
  'data/worker-runtime-packet.md',
  'data/billing-activation-packet.md',
  'data/preview-promotion-packet.md',
];
const locatorTimeout = Number(process.env.SMOKE_LOCATOR_TIMEOUT_MS || 20_000);
const forbiddenAutomationLockPayloadText = [
  '/api/audit',
  'npm run',
  'data/',
  'CLAIMBOT_',
  'DATABASE_URL',
  'DATABASE_AUTH_TOKEN',
  'TURSO_AUTH_TOKEN',
  'SCRAPER_USER_AGENT',
  'client preview',
  'account-scoped',
  'hosted client-preview checklist',
  'launch packet stack',
  'billing/legal/Identity',
  'deployed-preview evidence',
  'proof artifact',
  'packet blocked',
  'proofArtifacts',
  'proofArtifactCount',
  'launchPacketReadyCount',
  'launchPacketTotalCount',
  'the matching readiness',
  'evidenceCount',
  'operator-owned',
  'business-owned',
  'deployment-owned',
  'legal-owned',
  'operator',
  'backend-data-readiness',
  'auth-identity-gates',
  'pricing-billing',
  'trust-compliance',
  'hosted-deployment-preview',
  'Run the matcher',
];

const currentStrictExpectations = {
  '/': {
    h1: 'Find matches. Review them. Track the claims you approve.',
    includes: [
      'YOUR CLAIM WORKSPACE',
      'Find matches. Review them. Track the claims you approve.',
      'DO THIS NEXT',
      'Simple rule',
      'Account details',
    ],
  },
  '/goal': {
    h1: 'Find matches and track claims.',
    includes: [
      'ACTION NAVIGATOR',
      'Three steps: set up profile, review matches, track claims.',
      'NEXT BEST ACTION',
      'One clear next move, plus the status that matters.',
      'More workflow details',
      'Optional status, safety rules, and automation checks.',
      'Nothing is submitted unless live filing is explicitly enabled',
    ],
  },
  '/onboarding': {
    h1: 'Get ClaimBot ready in three simple steps',
    includes: [
      'START HERE',
      'Nothing is submitted from onboarding.',
      'Most users only need this page first.',
      'Add your facts',
      'Find possible matches',
      'Review and track',
      'Saved facts only',
      'Proof stays manual',
      'Permission required',
      'More onboarding details',
    ],
  },
  '/setup': {
    h1: 'Start with facts',
    includes: [
      'Start with facts',
      'Nothing is submitted from onboarding.',
      'This flow collects facts. Review remains the default.',
      'SIMPLE START',
      'Privacy and safety',
      'No fabrication',
      'Proof-required manual',
      'Permission required',
      'Shadow mode first',
    ],
  },
  '/eligibility': {
    h1: 'See which claims look like a fit',
    includes: [
      'ClaimBot compares your saved facts with available claim opportunities',
      'Review only. No claim is submitted from this page.',
      'NEW USER PATH',
      'Do these three things in order.',
      'Basic info',
      'Claim facts',
      'Your permission',
      'More eligibility details',
      'Saved facts, documents, permission, plan, and source rules behind the simple status cards.',
      'Search matches by status and deadline',
      'All candidates',
      'Documents needed',
    ],
  },
  '/review': {
    h1: 'Review matches',
    includes: [
      'Shadow review',
      'Match refresh history',
      'MATCH REVIEW',
      'More review details',
      'More tracking details',
      'Proof stays manual',
      'Search match results before tracking claims',
      'All matches',
      'Ready to track',
      'We do not evaluate legal eligibility',
      'Safety Review Active',
      'Inspect matches',
      'Three steps: confirm facts, review matches, track claims.',
    ],
  },
  '/claims': {
    h1: 'Claims',
    includes: [
      'No claims are being tracked yet',
      'HOW TO USE CLAIM TRACKING',
      'More automation details',
      'More filing safety details',
      'Search tracked claims',
      'All claims',
      'Automation stays guarded',
      'Proof stays manual',
      'Permission required',
    ],
  },
  '/status': {
    h1: 'Claim status',
    includes: [
      'See where approved claims stand',
      'Review-mode tracking active',
      'Status labels show workflow progress',
      'HOW TO USE STATUS',
      'More account details',
      'Search claim status history',
      'All statuses',
      'Shadow Match',
      'Timeline is an account record',
      'Proof remains manual',
      'Permission stays scoped',
    ],
  },
  '/packets': {
    h1: 'Packet Center',
    includes: [
      'CLAIM PACKET PREPARATION',
      'ClaimBot can prepare eligible packets automatically',
      'Packets remain in shadow review',
      'Packet readiness is not filing authority',
      'PACKET PREPARATION RUNWAY',
      'Your packet moves through four clear stages',
      'PACKET BROWSER',
      'Find a claim packet to review',
      'Review Your Claim Packet',
      'Business setup evidence, export links, packet refresh records, and setup notes stay here',
    ],
  },
  '/settlements': {
    h1: 'Settlements',
    includes: [
      'Settlement Coverage & Readiness',
      'Discovery health',
      'Shadow default',
      'SOURCE & BOUNDARY',
      'Source records are not claim permission.',
      'Discovery browser',
      'Search source records without implying claim permission',
      'All records',
      'Review match context',
    ],
  },
  '/profile': {
    h1: 'Profile',
    includes: [
      'PROFILE SNAPSHOT',
      'No eligibility is fabricated',
      'More profile details',
      'Add your basic info',
      'Personal information',
      'Save profile',
    ],
  },
  '/settings': {
    h1: 'Settings',
    includes: [
      'Launch Control Center',
      'Blocker review',
      'Environment handoff',
      'Client invite',
      'Shadow guardrails',
      'Client Preview Checklist',
      'Launch Packet Stack',
      'Search runtime and launch controls before changing settings',
      'All controls',
      'Hosted Deployment Handoff',
      'CLAIMBOT_SESSION_SECRET',
    ],
  },
  '/permissions': {
    h1: 'Permissions',
    includes: [
      'Permission coverage',
      'Permission required before automation',
      'I have read and manually confirm this category attestation.',
      'All permission changes are recorded',
      'Permission controls before paid full automation',
      'Search claim permissions before automation',
      'All categories',
    ],
  },
  '/authorizations': {
    h1: 'Permissions',
    includes: [
      'Permission coverage',
      'Permission required before automation',
      'I have read and manually confirm this category attestation.',
      'All permission changes are recorded',
      'Permission controls before paid full automation',
      'Search claim permissions before automation',
      'All categories',
    ],
  },
  '/audit': {
    h1: 'Account history',
    includes: [
      'Trace review',
      'Review record active',
      'Search append-only events without changing the record',
      'All events',
      'Export support packet (JSON)',
      'Append-only checkpoint',
      'Launch evidence included',
      'Plan check evidence',
      'Blocked workstreams are audit-visible',
    ],
  },
  '/purchases': {
    h1: 'Purchases',
    includes: [
      'Evidence coverage',
      'Search purchase facts without changing saved evidence',
      'All evidence',
      'How your evidence is handled',
      'You provide facts; we never fabricate.',
      'Matcher finds potential fits only.',
      'Proof steps stay manual.',
    ],
  },
  '/breaches': {
    h1: 'Data breach exposure',
    includes: [
      'Evidence coverage',
      'Proof still required',
      'Search breach facts without changing saved exposure evidence',
      'All exposures',
      'You provide facts; we never fabricate.',
      'Matcher finds potential fits only.',
      'ClaimBot will not invent',
    ],
  },
  '/launch': {
    h1: 'Launch checklist',
    includes: [
      'LAUNCH VERIFICATION LEDGER',
      'Finish these workstreams before inviting clients',
      'Open proof area',
      'Still locked until evidence exists',
      'EXTERNAL BLOCKER OWNERSHIP',
      'What still needs a real account, business, legal, or deploy action',
      'Hosted database',
      'Proof needed',
      'Business billing setup',
      'Legal/compliance review',
      'LAUNCH PACKET STACK',
      'Missing steps become non-secret packets before client preview',
      'RECEIPT READY',
      'audit:MATCHER_RUN_COMPLETED',
      'data/hosted-database-packet.md',
      'data/operator-setup-packet.md',
      'data/worker-runtime-packet.md',
      'Worker runtime packet',
      'Automation processing gate',
      'npm run worker:packet',
      'data/billing-activation-packet.md',
      'data/legal-review-packet.md',
      'data/local-verification-packet.md',
      'Local verification packet',
      'data/preview-promotion-packet.md',
      'Evidence for a client-safe shadow launch',
      'User Terms acknowledgement gate',
      'USER_TERMS_ACKNOWLEDGED',
      'TERMS_BOUNDARY_ACK',
      'Billing checkout handoff',
      'Signed entitlement sync',
      'SOURCE TEXT ENCODING',
      'clean record',
      'Secret-safe env template',
      'Set production environment',
      'npm run hosted:env:prepare',
      'npm run hosted:env:doctor',
      'npm run hosted:env:push',
      'Prepare the hosted database',
      'npm run hosted:db:prepare',
      'npm run hosted:db:doctor',
      'npm run with:hosted-env -- npm run source:import:dry',
      'Enable Netlify Identity',
      'Proof Gate: Manual',
      'Category Auth: Required',
    ],
  },
  '/pricing': {
    h1: 'Free matching. Paid full automation.',
    includes: [
      'Choose monthly flexibility or annual savings',
      '$29',
      '$79',
      'FULL AUTOMATION LANE',
      'Pro is hands-off where the claim is safe to automate',
      'Common questions before paying for automation',
      'FAQ is read-only',
      'What payment changes, and what it never changes',
      'No payout percentage',
      'No eligibility fabrication',
      'Payment availability',
    ],
  },
  '/login': {
    h1: 'Sign in to ClaimBot',
    includes: [
      'After sign-in',
      'One sign-in, three things stay true.',
      'Private workspace',
      'Review mode first',
      'Proof stays manual',
      'More access details',
      'Secure workspace access',
    ],
  },
  '/help': {
    h1: 'Help and support',
    includes: [
      'Review mode is on',
      'Start with your facts',
      'Review matches',
      'Manage permissions',
      'Track claims',
      'More help details',
      'Account basics',
      'Status first',
      'Proof review remains',
      'Contact support',
    ],
  },
  '/trust': {
    h1: 'Trust and safety',
    includes: [
      'Shadow mode is the active safety baseline',
      'Real facts only',
      'Proof stays manual',
      'Every action is logged',
      'The simple version',
      'Recent account activity',
      'Account safety details',
      'Account checks, payment safety, and support status.',
    ],
  },
  '/contact': {
    h1: 'Contact',
    includes: [
      'More support details',
      'Account access',
      'Claim status',
      'Account help',
      'Privacy requests',
      'Billing help',
      'Safety question',
    ],
  },
  '/privacy-policy': {
    h1: 'Privacy Policy',
    includes: [
      'Legal boundary summary',
      'Search privacy boundaries before support or data requests',
      'All policy items',
      'Data handling',
      'This browser is read-only',
      'Retention and export policy',
      'Deletion requests',
      'Download privacy export',
    ],
  },
  '/terms': {
    h1: 'Terms of Service',
    includes: [
      'Legal boundary summary',
      'Search terms boundaries before claim or filing decisions',
      'All policy items',
      'Product boundaries',
      'This browser is read-only',
      'Automation boundary',
      'Data retention and exports',
    ],
  },
};

async function discoverSettlementDetailPages(browser, failures) {
  const page = await browser.newPage({ viewport: { width: 1360, height: 920 } });
  try {
    await page.goto(new URL('/settlements?show=all', baseUrl).toString(), { waitUntil: 'networkidle', timeout: 30_000 });
    const firstSettlement = await page.locator('main a[href^="/settlements/"]').evaluate((anchor) => ({
      href: anchor.getAttribute('href'),
      text: anchor.textContent?.trim(),
    })).catch(() => null);

    if (!firstSettlement?.href || !firstSettlement.text) return [];

    return [{
      path: firstSettlement.href,
      h1: firstSettlement.text,
      includes: [
        'Readiness snapshot',
        'Self-assessment before tracking',
        'Permission preview',
        'source terms, saved facts, proof rules',
        'Source Authority',
        'SOURCE & BOUNDARY',
        'Review source context before claim checks.',
        'Provenance',
        'Match bounds',
        'Customer scope',
        'Source sync',
        'Review match context',
        'External Authority',
        'Proof-Gated',
        'Tracking Checks',
        'Settlement source browser',
        'Search settlement source context without granting queue permission',
        'All source items',
        'Tracking gates',
        'Source facts',
        'This browser is read-only',
        'Tracking gate',
        'Match verdict',
        'Permission',
        'No proof bypass',
        'Source remains authority',
      ],
      customerVisibleCopyGuard: true,
      customerSerializedCopyGuard: true,
      customerLaunchTerminologyGuard: true,
    }];
  } catch (error) {
    failures.push(`dynamic settlement detail discovery: ${error.message}`);
    return [];
  } finally {
    await page.close();
  }
}

async function discoverClaimDetailPages(browser, failures) {
  const page = await browser.newPage({ viewport: { width: 1360, height: 920 } });
  try {
    await page.goto(new URL('/claims', baseUrl).toString(), { waitUntil: 'networkidle', timeout: 30_000 });
    const firstClaim = await page.locator('main a[href^="/claims/"]').evaluate((anchor) => ({
      href: anchor.getAttribute('href'),
      text: anchor.textContent?.trim(),
    })).catch(() => null);

    if (!firstClaim?.href) return [];

    return [{
      path: firstClaim.href,
      h1: null,
      includes: [
        'Pre-Execution Seal',
        'Claim operations packet',
        'Snapshot boundary',
        'Safety defaults locked',
        'Custody chain',
        'Account history',
        'Review packet record',
        'Live safety console',
        'Automation decision record',
        'Packet browser',
        'Search claim packet evidence without starting final checks',
        'All packet items',
        'Run mode',
        'Permission lock',
        'Safety checks',
        'Protected final-check run',
        'Paid Lane',
        'Proof + Review',
        'History Active',
        'Safety checks',
        'Evidence trail',
      ],
      customerVisibleCopyGuard: true,
      customerSerializedCopyGuard: true,
      customerLaunchTerminologyGuard: true,
    }];
  } catch (error) {
    failures.push(`dynamic claim detail discovery: ${error.message}`);
    return [];
  } finally {
    await page.close();
  }
}

async function checkClaimNotFoundRecovery(browser, failures) {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    try {
      const routePath = '/claims/999999999';
      const response = await page.goto(new URL(routePath, baseUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 30_000 });
      const status = response ? response.status() : 0;
      if (status !== 404) failures.push(`${viewport.name} ${routePath}: expected HTTP 404 recovery page, got ${status}`);
      await page.locator('.kimi-shell').waitFor({ state: 'visible', timeout: locatorTimeout });
      const h1 = (await page.locator('main h1').first().textContent({ timeout: locatorTimeout }).catch(() => '')).trim();
      if (h1 !== 'Claim record not found') failures.push(`${viewport.name} ${routePath}: expected recovery h1, got "${h1}"`);
      const pageText = await page.locator('main').innerText({ timeout: locatorTimeout });
      for (const text of [
        'No claim action started',
        'Open claims',
        'Review matches',
        'Check status',
        'Permission, proof, plan, and account checks still apply',
      ]) {
        if (!pageText.includes(text)) failures.push(`${viewport.name} ${routePath}: expected recovery text "${text}"`);
      }
      const pageHtml = await page.content();
      const normalizedPageText = pageText.toLowerCase();
      for (const text of forbiddenCustomerCopyText) {
        if (normalizedPageText.includes(text)) failures.push(`${viewport.name} ${routePath}: recovery page exposes internal copy "${text}"`);
      }
      const normalizedPageHtml = pageHtml.toLowerCase();
      for (const text of forbiddenCustomerHtmlText) {
        if (normalizedPageHtml.includes(text.toLowerCase())) failures.push(`${viewport.name} ${routePath}: recovery page serializes internal copy "${text}"`);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (overflow) failures.push(`${viewport.name} ${routePath}: horizontal overflow`);
    } catch (error) {
      failures.push(`${viewport.name} /claims/999999999: ${error.message}`);
    } finally {
      await page.close();
    }
  }
}

async function checkSetupSafeLaunchScreen(browser, failures) {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    try {
      await page.goto(new URL('/setup', baseUrl).toString(), { waitUntil: 'networkidle', timeout: 30_000 });
      if (viewport.name === 'mobile') {
        await page.locator('.setup-mobile-progress summary').click({ timeout: locatorTimeout });
        await page.locator('.setup-mobile-progress .setup-step-button').last().click({ timeout: locatorTimeout });
      } else {
        await page.locator('.setup-sidebar .setup-step-button').last().click({ timeout: locatorTimeout });
      }
      const pageText = await page.locator('main').innerText({ timeout: locatorTimeout });
      for (const text of [
        'Safe review status',
        'I acknowledge the ClaimBot Terms boundary',
        'I allow shadow-mode review',
        'Terms boundary receipt',
        'no claim is submitted automatically',
        'Shadow mode active',
        'Proof-required review',
        'Category guardrails on',
        'First scan ready',
      ]) {
        if (!pageText.includes(text)) failures.push(`${viewport.name} /setup done: expected text "${text}"`);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (overflow) failures.push(`${viewport.name} /setup done: horizontal overflow`);
    } catch (error) {
      failures.push(`${viewport.name} /setup done: ${error.message}`);
    } finally {
      await page.close();
    }
  }
}

async function checkMobileNavigationOverlay(browser, failures) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(new URL('/packets', baseUrl).toString(), { waitUntil: 'networkidle', timeout: 30_000 });
    const openNavButton = page.locator('.kimi-topbar button[aria-label="Open navigation"]');
    await openNavButton.waitFor({ state: 'visible', timeout: locatorTimeout });
    await openNavButton.click({ timeout: locatorTimeout });
    await page.waitForFunction(() => document.querySelector('.kimi-sidebar')?.classList.contains('mobile-open'), null, { timeout: locatorTimeout });
    await page.locator('.kimi-sidebar.mobile-open').waitFor({ state: 'visible', timeout: locatorTimeout });

    const navText = await page.locator('.kimi-sidebar.mobile-open .kimi-nav').innerText({ timeout: locatorTimeout });
    for (const label of requiredKimiNavLabels.concat(requiredKimiSupportNavLabels)) {
      if (!navText.includes(label)) failures.push(`mobile navigation overlay: missing "${label}"`);
    }
    if (navText.includes('Legal')) failures.push('mobile navigation overlay: legal pages should live in the page footer, not the primary side nav');

    const footerReachable = await page.locator('.kimi-sidebar.mobile-open .kimi-sidebar-footer').evaluate((node) => {
      node.scrollIntoView({ block: 'nearest' });
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 0
        && rect.height > 0
        && rect.top >= 0
        && rect.bottom <= window.innerHeight + 1;
    });
    if (!footerReachable) failures.push('mobile navigation overlay: account footer is not reachable in the viewport');

    await page.locator('.kimi-sidebar.mobile-open a[href="/trust"]').click({ timeout: locatorTimeout });
    await page.waitForURL(/\/trust$/, { timeout: locatorTimeout });
    const stillOpen = await page.locator('.kimi-sidebar.mobile-open').count();
    if (stillOpen > 0) failures.push('mobile navigation overlay: did not close after route click');

    await page.goto(new URL('/', baseUrl).toString(), { waitUntil: 'networkidle', timeout: 30_000 });
    const footerText = await page.locator('.site-footer').innerText({ timeout: locatorTimeout });
    for (const label of ['Privacy', 'Terms', 'Contact', 'Help']) {
      if (!footerText.includes(label)) failures.push(`global footer: missing "${label}" footnote link`);
    }
  } catch (error) {
    failures.push(`mobile navigation overlay: ${error.message}`);
  } finally {
    await page.close();
  }
}

async function checkSetupDataEntrySafety(browser, failures) {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    try {
      await page.goto(new URL('/setup', baseUrl).toString(), { waitUntil: 'networkidle', timeout: 30_000 });
      if (viewport.name === 'mobile') {
        await page.locator('.setup-mobile-progress summary').click({ timeout: locatorTimeout });
        await page.locator('.setup-mobile-progress .setup-step-button').nth(1).click({ timeout: locatorTimeout });
      } else {
        await page.locator('.setup-sidebar .setup-step-button').nth(1).click({ timeout: locatorTimeout });
      }
      const pageText = await page.locator('main').innerText({ timeout: locatorTimeout });
      for (const text of [
        'Safety checks active',
        'Privacy and safety',
        'IDENTITY FACTS',
        'Next: save a legal name plus at least one reachable email or phone.',
        'Real facts only',
        'Audit recording',
        'Manual review pending',
        'Customer facts',
        'Proof required',
        'Permission',
      ]) {
        if (!pageText.includes(text)) failures.push(`${viewport.name} /setup profile: expected text "${text}"`);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (overflow) failures.push(`${viewport.name} /setup profile: horizontal overflow`);
    } catch (error) {
      failures.push(`${viewport.name} /setup profile: ${error.message}`);
    } finally {
      await page.close();
    }
  }
}

async function checkCacheHeaders(failures) {
  const expectations = [
    { path: '/goal', includes: 'no-store', reason: 'protected app route' },
    { path: '/api/health', includes: 'no-store', reason: 'API route' },
    { path: '/sw.js', excludes: 'no-store', reason: 'PWA service worker asset' },
    { path: '/manifest.webmanifest', excludes: 'no-store', reason: 'PWA manifest asset' },
    { path: '/pricing', excludes: 'no-store', reason: 'public pricing route' },
  ];

  for (const expectation of expectations) {
    try {
      const response = await fetch(new URL(expectation.path, baseUrl));
      const cacheControl = response.headers.get('cache-control') || '';
      const normalized = cacheControl.toLowerCase();

      if (response.status >= 400) {
        failures.push(`${expectation.path}: cache-header check received HTTP ${response.status}`);
      }
      if (expectation.includes && !normalized.includes(expectation.includes)) {
        failures.push(`${expectation.path}: expected ${expectation.reason} Cache-Control to include "${expectation.includes}", got "${cacheControl || '(missing)'}"`);
      }
      if (expectation.excludes && normalized.includes(expectation.excludes)) {
        if (!strictCacheHeaders && isLocalhostTarget() && normalized === 'no-store, must-revalidate') {
          continue;
        }
        failures.push(`${expectation.path}: expected ${expectation.reason} Cache-Control not to include "${expectation.excludes}", got "${cacheControl}"`);
      }
    } catch (error) {
      failures.push(`${expectation.path}: cache-header check failed: ${error.message}`);
    }
  }
}

async function checkOfflineShell(browser, failures) {
  let offlineHtml = '';
  try {
    const response = await fetch(new URL('/offline.html', baseUrl));
    offlineHtml = await response.text();
    if (response.status !== 200) failures.push(`/offline.html: expected HTTP 200, got ${response.status}`);
    for (const text of [
      'Installed safety shell',
      'Installed App Command Center',
      'Read-only offline shell',
      'Reconnect before reviewing any claim workspace data',
      'Zero Local Data Mode',
      'This device stores zero claim data',
      'No claim records offline',
      'No offline filing',
      'No legal decisions offline',
      'Retry Secure Connection',
    ]) {
      if (!offlineHtml.includes(text)) failures.push(`/offline.html: expected served HTML text "${text}"`);
    }
  } catch (error) {
    failures.push(`/offline.html: served HTML check failed: ${error.message}`);
  }

  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    try {
      const response = await page.goto(new URL('/offline.html', baseUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 30_000 });
      const status = response ? response.status() : 0;
      const h1 = (await page.locator('main h1').first().textContent({ timeout: locatorTimeout }).catch(() => '')).trim();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (status !== 200) failures.push(`${viewport.name} /offline.html: expected HTTP 200, got ${status}`);
      if (h1 !== 'Secure Connection Required') failures.push(`${viewport.name} /offline.html: expected h1 "Secure Connection Required", got "${h1}"`);
      if (overflow) failures.push(`${viewport.name} /offline.html: horizontal overflow`);
    } catch (error) {
      failures.push(`${viewport.name} /offline.html: ${error.message}`);
    } finally {
      await page.close();
    }
  }
}

async function checkNextStaticChunkHealth(failures) {
  const health = await collectNextStaticHealth(baseUrl, { timeoutMs: 30_000 });
  if (!health.ok) {
    failures.push(`next static chunk health: ${formatNextStaticHealthFailure(health)}`);
  }
}

function localChecklistStillLocksAutomation() {
  if (!isLocalhostTarget()) return false;
  const checklistPath = path.join(process.cwd(), 'data', 'client-preview-checklist.json');
  if (!fs.existsSync(checklistPath)) return false;

  try {
    const checklist = JSON.parse(fs.readFileSync(checklistPath, 'utf8'));
    return checklist?.summary?.clientPreviewReady === false;
  } catch {
    return false;
  }
}

async function checkAutomationLockPayload(failures) {
  if (!localChecklistStillLocksAutomation()) return;

  try {
    const response = await fetch(new URL('/api/claims/file-all', baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        queueBoundaryAck: 'full-guarded-automation:v1',
        queueTrustLock: 'acknowledged',
      }),
    });
    const bodyText = await response.text();
    if (response.status !== 423) {
      failures.push(`/api/claims/file-all lock payload: expected HTTP 423 while local checklist is not ready, got ${response.status}`);
      return;
    }

    assertCustomerSafeAutomationLockPayload('/api/claims/file-all lock payload', bodyText, failures);
  } catch (error) {
    failures.push(`/api/claims/file-all lock payload check failed: ${error.message}`);
  }
}

function assertCustomerSafeAutomationLockPayload(label, bodyText, failures) {
  const normalizedBodyText = bodyText.toLowerCase();
  for (const text of forbiddenAutomationLockPayloadText) {
    if (normalizedBodyText.includes(text.toLowerCase())) failures.push(`${label} exposes internal copy "${text}"`);
  }

  let body = null;
  try {
    body = JSON.parse(bodyText);
  } catch {
    failures.push(`${label}: expected JSON response`);
    return null;
  }

  if (body.exports) failures.push(`${label} exposes operator export links`);
  if (!body.detail?.includes('account readiness')) {
    failures.push(`${label} should explain account readiness in customer-safe language`);
  }
  if (!Array.isArray(body.blockedPackets)) failures.push(`${label} should include sanitized blocked readiness checks`);
  return body;
}

async function checkClaimAutomationLockPayload(routes, failures) {
  if (!localChecklistStillLocksAutomation()) return;

  const claimRoute = routes.find((route) => /^\/claims\/\d+$/.test(route.path));
  if (!claimRoute) return;

  const claimId = claimRoute.path.split('/').pop();
  const label = `/api/claims/${claimId}/file lock payload`;

  try {
    const response = await fetch(new URL(`/api/claims/${claimId}/file`, baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fileBoundaryAck: 'single-claim-full-guarded-automation:v1',
      }),
    });
    const bodyText = await response.text();

    if (response.status === 423) {
      assertCustomerSafeAutomationLockPayload(label, bodyText, failures);
      return;
    }

    if (response.status === 200) {
      failures.push(`${label}: expected locked automation while local checklist is not ready, got HTTP 200`);
    }
  } catch (error) {
    failures.push(`${label} check failed: ${error.message}`);
  }
}

async function main() {
  const failures = [];
  const results = [];
  await checkNextStaticChunkHealth(failures);
  const manifestResponse = await fetch(new URL('/manifest.webmanifest', baseUrl));
  const manifest = await manifestResponse.json();
  if (!manifest.description?.includes('shadow-mode safety checks')) {
    failures.push('manifest: expected shadow-mode safety description');
  }
  await checkCacheHeaders(failures);
  await checkAutomationLockPayload(failures);
  const browser = await launchBrowser();
  await checkOfflineShell(browser, failures);
  const routes = pages
    .concat(await discoverSettlementDetailPages(browser, failures))
    .concat(await discoverClaimDetailPages(browser, failures));
  await checkClaimAutomationLockPayload(routes, failures);
  await checkClaimNotFoundRecovery(browser, failures);

  for (const viewport of viewports) {
    for (const route of routes) {
      if (verboseSmoke) console.log(`[smoke-webapp] checking ${viewport.name} ${route.path}`);
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      const errors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const text = msg.text();
          if (!text.includes('Failed to load resource')) errors.push(`console error: ${text}`);
        }
      });
      page.on('pageerror', (error) => errors.push(`page error: ${error.message}`));

      const url = new URL(route.path, baseUrl).toString();
      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        const status = response ? response.status() : 0;
        const h1 = (await page.locator('main h1').first().textContent({ timeout: locatorTimeout }).catch(() => '')).trim();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        await page.locator('.kimi-shell').waitFor({ state: 'visible', timeout: locatorTimeout });
        await page.locator('.kimi-topbar').waitFor({ state: 'visible', timeout: locatorTimeout });
        await page.locator('.kimi-sidebar').waitFor({ state: 'attached', timeout: locatorTimeout });
        const kimiNavText = await page.locator('.kimi-nav').innerText({ timeout: locatorTimeout });
        const kimiShellText = await page.locator('.kimi-shell').innerText({ timeout: locatorTimeout });
        const claimStatusLockupText = await page.locator('[aria-label="Claim status"]').innerText({ timeout: locatorTimeout });
        const bootstrapAuditText = await page.locator('[aria-label="Account safety status"]').innerText({ timeout: locatorTimeout });
        const pageText = await page.locator('main').innerText({ timeout: locatorTimeout });
        const pageHtml = await page.content();
        let installTrustText = '';
        let topbarTrustText = '';
        let pwaConnectionText = '';
        if (viewport.name === 'desktop') {
          const installTrustCard = page.locator('.kimi-topbar-actions .install-trust-card');
          await installTrustCard.waitFor({ state: 'visible', timeout: locatorTimeout });
          installTrustText = await installTrustCard.innerText({ timeout: locatorTimeout });
          const pwaConnectionStatus = page.locator('.pwa-connection-status');
          await pwaConnectionStatus.waitFor({ state: 'visible', timeout: locatorTimeout });
          pwaConnectionText = await pwaConnectionStatus.innerText({ timeout: locatorTimeout });
          const topbarTrustRail = page.locator('.kimi-topbar-trust-rail');
          if (await topbarTrustRail.isVisible({ timeout: 750 }).catch(() => false)) {
            topbarTrustText = await topbarTrustRail.innerText({ timeout: locatorTimeout });
          }
        }
        const mobileMenuVisible = await page.locator('.kimi-topbar .mobile-only').evaluate((node) => {
          const style = window.getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.height > 0 && rect.width > 0;
        });
        const mobileBottomNav = page.locator('.mobile-bottom-nav');
        const mobileBottomNavVisible = await mobileBottomNav.evaluate((node) => {
          const style = window.getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.height > 0 && rect.width > 0;
        });
        const mobileBottomNavText = await mobileBottomNav.evaluate((node) => node.textContent || '');
        const mobileActiveNavText = await mobileBottomNav
          .locator('a[aria-current="page"]')
          .first()
          .innerText({ timeout: 750 })
          .catch(() => '');
        const visibleButtonHeights = await page.locator('.btn, .btn-claimbot, .btn-claimbot-primary').evaluateAll((nodes) => (
          nodes
            .map((node) => node.getBoundingClientRect())
            .filter((rect) => rect.width > 0 && rect.height > 0)
            .map((rect) => Math.round(rect.height))
        ));

        const result = { viewport: viewport.name, path: route.path, status, h1, overflow, mobileMenuVisible, mobileBottomNavVisible, mobileActiveNavText, errors };
        results.push(result);

        const strictExpectation = currentStrictExpectations[route.path];
        if (status >= 400) failures.push(`${viewport.name} ${route.path}: HTTP ${status}`);
        if (strictText && strictExpectation?.h1 && h1 !== strictExpectation.h1) {
          failures.push(`${viewport.name} ${route.path}: expected h1 "${strictExpectation.h1}", got "${h1}"`);
        }
        if (overflow) failures.push(`${viewport.name} ${route.path}: horizontal overflow`);
        for (const label of requiredKimiNavLabels) {
          if (!kimiNavText.includes(label)) failures.push(`${viewport.name} ${route.path}: Kimi nav missing "${label}"`);
        }
        for (const label of requiredClaimStatusLockupLabels) {
          if (!claimStatusLockupText.includes(label)) failures.push(`${viewport.name} ${route.path}: claim status missing "${label}"`);
        }
        for (const label of requiredBootstrapAuditLabels) {
          if (!bootstrapAuditText.includes(label)) failures.push(`${viewport.name} ${route.path}: bootstrap audit stamp missing "${label}"`);
        }
        for (const text of forbiddenDemoShellText) {
          if (kimiShellText.includes(text)) failures.push(`${viewport.name} ${route.path}: Kimi shell still shows demo text "${text}"`);
        }
        if (customerCopyGuardedPaths.has(route.path) || route.customerVisibleCopyGuard) {
          const normalizedPageText = pageText.toLowerCase();
          for (const text of forbiddenCustomerCopyText) {
            if (normalizedPageText.includes(text)) failures.push(`${viewport.name} ${route.path}: customer page exposes internal copy "${text}"`);
          }
        }
        if (customerCopyGuardedPaths.has(route.path) || route.customerSerializedCopyGuard) {
          const normalizedPageHtml = pageHtml.toLowerCase();
          for (const text of forbiddenCustomerHtmlText) {
            if (normalizedPageHtml.includes(text.toLowerCase())) failures.push(`${viewport.name} ${route.path}: customer page serializes internal copy "${text}"`);
          }
        }
        if ((customerLaunchTerminologyGuardedPaths.has(route.path) || route.customerLaunchTerminologyGuard) && /\bLaunch\b/.test(pageText)) {
          failures.push(`${viewport.name} ${route.path}: customer page exposes launch terminology in visible support copy`);
        }
        if (viewport.name === 'desktop' && !claimStatusLockupText.includes('Review stays on.')) {
          failures.push(`${viewport.name} ${route.path}: claim status missing filing boundary`);
        }
        if (viewport.name === 'desktop') {
          if (!installTrustText.includes('App ready') && !installTrustText.includes('Install app') && !installTrustText.includes('Installed app')) {
            failures.push(`${viewport.name} ${route.path}: PWA install/status affordance is missing`);
          }
          if (!installTrustText.includes('Offline shell stores no claim data') && !installTrustText.includes('claim data on the hosted app') && !pwaConnectionText.includes('No claim data cached')) {
            failures.push(`${viewport.name} ${route.path}: PWA install/status copy is missing hosted-data boundary`);
          }
          if (!pwaConnectionText.includes('Hosted online') && !pwaConnectionText.includes('Offline safety hold')) {
            failures.push(`${viewport.name} ${route.path}: PWA hosted connection status is missing`);
          }
          if (!pwaConnectionText.includes('No claim data cached') && !pwaConnectionText.includes('Reconnect before claim review')) {
            failures.push(`${viewport.name} ${route.path}: PWA hosted connection status missing no-local-claim-data boundary`);
          }
          if (topbarTrustText) {
            const normalizedTopbarTrustText = topbarTrustText.toLowerCase();
            for (const label of ['permission required', 'proof manual', 'account history']) {
              if (!normalizedTopbarTrustText.includes(label)) failures.push(`${viewport.name} ${route.path}: Kimi topbar trust rail missing "${label}"`);
            }
          }
        }
        if (route.path === '/launch') {
          for (const text of [
            'SOURCE TEXT ENCODING',
            'clean record',
            'Netlify project setup receipt',
            'Record the confirmed Netlify project and Identity dashboard settings',
            'npm run netlify:record-setup',
            'Production promotion receipt',
            'Production receipt is missing or stale',
            'Receipt file',
            'data/preview-promotion-receipt.json',
            'npm run production:check-receipt',
          ]) {
            if (!pageText.includes(text)) failures.push(`${viewport.name} ${route.path}: expected launch evidence "${text}"`);
          }
        }
        if (viewport.name === 'mobile') {
          if (!mobileMenuVisible) failures.push(`${viewport.name} ${route.path}: Kimi mobile menu button is not visible`);
          if (!mobileBottomNavVisible) failures.push(`${viewport.name} ${route.path}: mobile PWA bottom nav is not visible`);
          for (const label of ['Guarded filing', 'Permission required', 'Proof stops', 'Home', 'Find', 'Review', 'Claims', 'Plan', 'Start']) {
            if (!mobileBottomNavText.includes(label)) failures.push(`${viewport.name} ${route.path}: mobile PWA bottom nav missing "${label}"`);
          }
          if (route.mobileActiveNav && !mobileActiveNavText.includes(route.mobileActiveNav)) {
            failures.push(`${viewport.name} ${route.path}: expected active mobile nav "${route.mobileActiveNav}", got "${mobileActiveNavText || 'none'}"`);
          }
        } else if (mobileMenuVisible) {
          failures.push(`${viewport.name} ${route.path}: Kimi mobile menu button should be hidden on desktop`);
        } else if (mobileBottomNavVisible) {
          failures.push(`${viewport.name} ${route.path}: mobile PWA bottom nav should be hidden on desktop`);
        }
        for (const height of visibleButtonHeights) {
          if (height < 44) failures.push(`${viewport.name} ${route.path}: visible .btn is ${height}px tall; expected at least 44px`);
        }
        if (strictText && !process.env.CLAIMBOT_SUPPORT_EMAIL) {
          for (const text of route.includesWhenSupportMissing ?? []) {
            if (!pageText.includes(text)) failures.push(`${viewport.name} ${route.path}: expected text "${text}"`);
          }
          for (const text of route.excludesWhenSupportMissing ?? []) {
            if (pageText.includes(text)) failures.push(`${viewport.name} ${route.path}: must not show fallback "${text}"`);
          }
        }
        if (strictText) {
          const expectedTexts = strictExpectation?.includes ?? (route.path.includes('/settlements/') || route.path.includes('/claims/') ? route.includes ?? [] : []);
          for (const text of expectedTexts) {
            if (!pageText.includes(text)) failures.push(`${viewport.name} ${route.path}: expected text "${text}"`);
          }
        }
        for (const error of errors) failures.push(`${viewport.name} ${route.path}: ${error}`);
      } catch (error) {
        failures.push(`${viewport.name} ${route.path}: ${error.message}`);
      } finally {
        await page.close();
      }
    }
  }

  await checkMobileNavigationOverlay(browser, failures);

  await browser.close();

  console.log(JSON.stringify(results, null, 2));
  if (failures.length > 0) {
    console.error('[smoke-webapp] failed');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(`[smoke-webapp] ok: ${results.length} route checks passed against ${baseUrl}`);
}

main().catch((error) => {
  console.error('[smoke-webapp] failed');
  console.error(error);
  process.exit(1);
});

const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${relativePath} is missing.`);
    return '';
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

function assertIncludes(relativePath, label, patterns) {
  const text = read(relativePath);
  for (const pattern of patterns) {
    if (typeof pattern === 'string') {
      if (!text.includes(pattern)) {
        failures.push(`${relativePath} must include ${label}: "${pattern}".`);
      }
    } else if (!pattern.test(text)) {
      failures.push(`${relativePath} must include ${label}: ${pattern}.`);
    }
  }
}

assertIncludes('LEGAL.md', 'architecture legal posture', [
  'The tool never fabricates eligibility.',
  'It is not legal advice.',
  'It does not determine legal class membership.',
  'Never-file proof-required',
  'Shadow mode default',
  'Attorney review of the attestation flow and Terms of Service.',
]);

assertIncludes('src/app/terms/page.tsx', 'public terms boundary', [
  'ClaimBot does not provide legal advice',
  'guarantee eligibility, claim approval, payout amount',
  'not a claims administrator, law firm, or settlement authority',
  'External settlement sites and administrators control legal terms, deadlines, proof rules',
  'proof-required',
  'Revoking permission blocks future claim tracking',
  'Live filing requires an explicit reviewed',
  'User acknowledgement receipt',
  'Setup completion requires a user Terms boundary acknowledgement',
  'request correction, export, or deletion',
]);

assertIncludes('src/app/privacy-policy/page.tsx', 'privacy and retention boundary', [
  'Retention and export policy',
  'written retention window',
  'Deletion requests should remove or anonymize profile facts',
  'Export requests should include profile facts',
  'not submitted automatically',
  'Claim data, profile facts,',
  'not cached for offline use',
  'monitored support mailbox',
]);

assertIncludes('src/app/pricing/page.tsx', 'paid full automation boundary', [
  'Settlement administrators still control rules',
  'does not sell legal certainty',
  'proof requirements',
  'No payout percentage',
  'ClaimBot should charge for guarded software automation',
  'Paid automation still keeps legal review',
]);

assertIncludes('src/app/permissions/page.tsx', 'permission control boundary', [
  'All permission changes are recorded',
  'no claim is submitted',
  'without verified proof and manual review',
  'Permission never lets ClaimBot invent purchases',
  'controlled, pausable, and auditable',
]);

assertIncludes('src/app/setup/SetupWizard.tsx', 'setup consent boundary', [
  'does not provide legal advice or guarantee claim outcomes',
  'Proof-required matches stay in manual review',
  'no claim is submitted automatically',
  'active category permission',
  'ClaimBot may run discovery or scoped review',
  'I acknowledge the ClaimBot Terms boundary',
  'termsBoundaryAck',
]);

assertIncludes('src/app/api/setup/complete/route.ts', 'setup terms acknowledgement gate', [
  'TERMS_BOUNDARY_ACK',
  'terms boundary acknowledgement required',
  'USER_TERMS_ACKNOWLEDGED',
  'not legal advice',
]);

assertIncludes('src/app/review/page.tsx', 'review tracking boundary', [
  'Ready-match manifest',
  'Proof-required matches stay in review',
  'Shadow Mode active',
  'Permission preview before tracking',
  'Nothing should move forward',
]);

assertIncludes('src/app/help/page.tsx', 'support boundary', [
  'settlement administrators control legal outcomes',
  'will not fabricate eligibility',
  'bypass a proof requirement',
  'active category permission',
  'audit review, privacy requests',
]);

assertIncludes('src/app/contact/page.tsx', 'support and privacy request route', [
  'Privacy request route',
  'profile data corrections',
  'deletion/export requests',
  'Settlement administrators and site operators',
  'Safety and privacy',
]);

assertIncludes('src/app/api/setup/auto-authorize/route.ts', 'automatic authorization prohibition', [
  'automatic category authorization is disabled',
  'the user can manually confirm the category attestation',
]);

assertIncludes('README.md', 'hosted legal launch gate', [
  'Hosted launch also requires a legal/compliance review acknowledgment.',
  'CLAIMBOT_LEGAL_REVIEW_ACK=reviewed',
  'Before shipping a preview or production deploy',
  'ClaimBot does not handle',
  'paid automation can queue',
]);

assertIncludes('scripts/export-legal-review-packet.ts', 'non-secret legal review packet', [
  'claimbot.legal-review-packet.v1',
  'This packet is not approval',
  'CLAIMBOT_LEGAL_REVIEW_ACK',
  'Terms and product boundary',
  'Privacy, retention, and export requests',
  'Proof-required review flow',
  'Authorization and attestation gates',
  'Shadow-mode filing posture',
  'Pricing, billing, and paid full automation',
  'No secret values were printed.',
]);

assertIncludes('package.json', 'legal packet command', [
  '"legal:packet"',
  'scripts/export-legal-review-packet.ts',
]);

if (failures.length > 0) {
  console.error('[validate-legal-readiness] failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[validate-legal-readiness] ok');

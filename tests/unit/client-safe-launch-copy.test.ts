import { describe, expect, it } from 'vitest';
import {
  clientSafeBillingBlockReason,
  clientSafeBillingReasonKind,
  clientSafeBillingReasonParam,
  clientSafeExecutionBoundary,
  clientSafeGateLabel,
  clientSafeLaunchAction,
  clientSafeLaunchLabel,
  clientSafeOwnerLabel,
  clientSafeProofArtifactSummary,
  clientSafeRequiredInputLabel,
  clientSafeRequiredInputSummary,
  stripOperatorRunbookText,
} from '../../src/lib/client-safe-launch-copy';

// Guardrail marker strings retained for validate:ui: hosted preview; private billing setup; Hosted readiness; Account setup.
// Legacy source-check strings retained: readiness status; refresh readiness status; readiness status and Packet Center.

describe('client-safe launch copy', () => {
  it('removes raw runbook details from normal customer surfaces', () => {
    const copy = stripOperatorRunbookText(
      'Run npm run netlify:doctor, review data/launch-handoff-report.md, then open /api/audit/launch-handoff for proof artifacts and commands.',
    );

    expect(copy).toBe(
      'Run the matching readiness step, review the matching readiness status, then open the matching account record for readiness status and readiness steps.',
    );
    expect(copy).not.toMatch(/npm run|data\/|\/api\/audit|proof artifact|command/i);
  });

  it('removes launch setup ownership and execution wording from customer copy', () => {
    const copy = stripOperatorRunbookText(
      'Execution boundary: External infrastructure setup. Codex can run npm run hosted:db:packet after DATABASE_URL exists, but this is an operator-owned deployment-operator action. Review data/hosted-database-packet.md and /api/audit/launch-handoff for proof artifacts from the worker runtime file_claim job.',
    );

    expect(copy).toContain('readiness');
    expect(copy).not.toMatch(
      /Codex|execution boundary|operator-owned|deployment-operator|External infrastructure|DATABASE_URL|npm run|\/api\/audit|proof artifact|artifact|worker runtime|file_claim/i,
    );
  });

  it('turns operator-owned fallback work into customer readiness language', () => {
    expect(clientSafeLaunchAction({ owner: 'operator' })).toBe(
      'Complete this account step in account status or Packet Center, then refresh account status.',
    );
  });

  it('rewrites setup-status and hosted-setup terms away from customer surfaces', () => {
    const copy = stripOperatorRunbookText(
      'Operator-owned external infrastructure setup. Codex can run npm run netlify:doctor and inspect data/operator-setup-packet.md. Hosted DATABASE_URL/auth token, setup readiness, setup status, setup locks, active blockers, blockers remain, client preview, and client invites need review.',
    );

    expect(copy).toContain('account readiness');
    expect(copy).toContain('database connection');
    expect(copy).toContain('readiness status');
    expect(copy).toContain('readiness items');
    expect(copy).toContain('account access');
    expect(copy).not.toMatch(/operator|codex|npm run|data\/|hosted setup|setup readiness|setup status|setup locks|active blockers|blockers remain|client preview|client invites/i);
  });

  it('rewrites provider-specific identity wording away from customer surfaces', () => {
    const copy = stripOperatorRunbookText(
      'Identity setup is pending. Identity facts, Identity and contact, Open identity, Review identity, Identity is ready, Identity is not available, and Identity not ready should never appear on customer pages.',
    );

    expect(copy).toContain('hosted sign-in setup');
    expect(copy).toContain('name and contact');
    expect(copy).toContain('account access is ready');
    expect(copy).toContain('account sign-in is not available');
    expect(copy).not.toMatch(/identity setup|identity facts|identity and contact|open identity|review identity|identity is ready|identity is not available|identity not ready/i);
  });

  it('rewrites hosting-provider and private setup wording away from customer surfaces', () => {
    const copy = stripOperatorRunbookText(
      'A real Netlify preview URL, Netlify dashboard receipt, hosted DATABASE_URL/auth token, billing secrets, webhook secret, and worker runtime proof are required.',
    );

    expect(copy).toContain('published site');
    expect(copy).toContain('hosted settings receipt');
    expect(copy).toContain('database connection/database access');
    expect(copy).toContain('payment readiness');
    expect(copy).toContain('private payment-confirmation readiness');
    expect(copy).toContain('automation service');
    expect(copy).not.toMatch(/Netlify|DATABASE_URL|auth token|billing secret|webhook secret|worker runtime|proof/i);
  });

  it('rewrites internal payment sync wording away from customer surfaces', () => {
    const copy = stripOperatorRunbookText(
      'Processor-hosted checkout URLs, signed entitlement sync, signed billing sync, billing sync, and entitlement changes must be ready.',
    );

    expect(copy).toContain('secure checkout links');
    expect(copy).toContain('protected payment confirmation');
    expect(copy).toContain('plan access changes');
    expect(copy).not.toMatch(/processor-hosted|signed entitlement sync|signed billing sync|billing sync|entitlement/i);
  });

  it('uses readiness labels for deployment-owned and hosted-setup blockers', () => {
    expect(clientSafeOwnerLabel('deployment')).toBe('Hosted readiness');
    expect(clientSafeGateLabel('Hosted setup check')).toBe('Account readiness');
  });

  it('turns launch proof labels into customer-safe readiness labels', () => {
    const labels = [
      clientSafeLaunchLabel({ label: 'Netlify Identity proof' }),
      clientSafeLaunchLabel({ label: 'Netlify preview promotion receipt' }),
      clientSafeLaunchLabel({ label: 'Operator account settings' }),
      clientSafeLaunchLabel({ label: 'Hosted database auth token' }),
      clientSafeLaunchLabel({ label: 'Worker runtime proof' }),
      clientSafeLaunchLabel({ label: 'Billing checkout secret setup' }),
    ];

    expect(labels).toEqual([
      'Hosted sign-in readiness',
      'Published site readiness',
      'Account readiness',
      'Account data readiness',
      'Automation service readiness',
      'Paid-plan readiness',
    ]);
    expect(labels.join(' ')).not.toMatch(/Netlify|Identity proof|operator|auth token|billing secret|worker runtime|proof/i);
  });

  it('turns internal readiness gate names into customer-safe labels', () => {
    expect(clientSafeGateLabel('Hosted data gate')).toBe('Account data');
    expect(clientSafeGateLabel('Paid entitlement gate')).toBe('Paid plan access');
    expect(clientSafeGateLabel('Legal review gate')).toBe('Legal review');
    expect(clientSafeGateLabel('Full automation setup chain')).toBe('Automation readiness');
    expect(clientSafeGateLabel('Custom operator blocker')).toBe('Custom readiness item');
  });

  it('turns paid checkout reason codes into customer-safe billing copy', () => {
    expect(clientSafeBillingBlockReason('checkout-not-configured')).toBe('Checkout activation is pending');
    expect(clientSafeBillingBlockReason('beta-no-billing')).toBe('Beta access is active; checkout is off');
    expect(clientSafeBillingBlockReason('signed-sync-not-configured')).toBe('Payment confirmation is pending');
    expect(clientSafeBillingBlockReason('legal-review-not-recorded')).toBe('Legal review is still pending');
    expect(clientSafeBillingBlockReason('worker-runtime-not-verified')).toBe('Automation service verification is still pending');
    expect(clientSafeBillingBlockReason(null)).toBe('No checkout lock recorded');
    expect(clientSafeBillingReasonKind('legal-review-not-recorded')).toBe('legal-review');
    expect(clientSafeBillingReasonKind('beta-no-billing')).toBe('beta');
    expect(clientSafeBillingReasonKind('legal-review')).toBe('legal-review');
    expect(clientSafeBillingReasonParam('checkout-not-configured')).toBe('checkout');
    expect(clientSafeBillingReasonParam('unknown')).toBe('billing-support');
  });

  it('rewrites launch execution boundaries for customer pages', () => {
    expect(clientSafeExecutionBoundary({ label: 'Operator account settings' })).toBe(
      'The readiness team must confirm the support path, source contact, hosted site, and sign-in posture before account access.',
    );
    expect(clientSafeLaunchAction({ label: 'Preview promotion receipt' })).toBe(
      'Publish the hosted site, run the site checks, and refresh the published-site receipt.',
    );
    expect(clientSafeExecutionBoundary({ label: 'Preview promotion receipt' })).toBe(
      'Account access waits for a published HTTPS site with passing readiness checks and a saved promotion receipt.',
    );
    expect(clientSafeLaunchAction({ label: 'Automation worker runtime' })).toBe(
      'Verify the automation service receipt before enabling paid filing.',
    );
    expect(clientSafeExecutionBoundary({ label: 'Automation worker runtime' })).toBe(
      'Paid filing stays locked until the automation service proves it can process approved claim jobs automatically.',
    );

    const copy = clientSafeExecutionBoundary({
      label: 'Hosted database',
      executionBoundary: 'External infrastructure setup. Codex can run migrations after DATABASE_URL exists, but the operator must create it.',
    });

    expect(copy).toBe(
      'Account data storage must be connected, checked, and import-ready before account access.',
    );
    expect(copy).not.toMatch(/Codex|operator|DATABASE_URL|external infrastructure/i);
  });

  it('summarizes setup inputs and records without exposing artifact paths', () => {
    expect(clientSafeRequiredInputLabel('Confirmed dedicated ClaimBot Netlify site')).toBe(
      'Published site readiness',
    );
    expect(clientSafeRequiredInputLabel('DATABASE_AUTH_TOKEN or TURSO_AUTH_TOKEN when using libSQL/Turso')).toBe(
      'Account data connection',
    );
    expect(clientSafeRequiredInputLabel('ClaimBot HMAC billing sync secret or Stripe webhook endpoint secret')).toBe(
      'Paid-plan checkout readiness',
    );
    expect(clientSafeRequiredInputLabel('Persistent worker host or trusted scheduler')).toBe(
      'Paid automation service receipt',
    );

    expect(clientSafeRequiredInputSummary([], 3)).toBe(
      'Required inputs are listed in readiness status and Packet Center.',
    );
    expect(clientSafeRequiredInputSummary([
      'DATABASE_URL',
      'DATABASE_AUTH_TOKEN or TURSO_AUTH_TOKEN when using libSQL/Turso',
      'CLAIMBOT_BILLING_PLUS_MONTHLY_URL',
      'Netlify Identity enabled with invite-only registration and email confirmation',
      'Non-placeholder SCRAPER_USER_AGENT with public contact URL',
    ], 4)).toBe(
      'Account data connection, Paid-plan checkout readiness, Hosted sign-in settings, Source contact',
    );
    expect(clientSafeProofArtifactSummary({ proofArtifacts: ['data/operator-setup-packet.md'] })).toBe(
      '1 readiness status item listed in account status and Packet Center.',
    );
  });
});

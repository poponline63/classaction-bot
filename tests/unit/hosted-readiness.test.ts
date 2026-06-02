import { describe, expect, it } from 'vitest';
import { evaluateHostedReadiness } from '../../src/lib/hosted-readiness';

const billingReady = {
  billingPlusMonthlyUrl: 'https://checkout.example.com/plus',
  billingProMonthlyUrl: 'https://checkout.example.com/pro',
  billingSyncSecret: 'a-long-random-billing-sync-secret-for-tests',
  legalReviewAck: 'reviewed',
  workerRuntime: 'persistent-worker',
  workerRuntimeReceipt: 'verified',
};

describe('evaluateHostedReadiness', () => {
  it('fails hosted deployments without a persistent database', () => {
    const report = evaluateHostedReadiness({
      isHosted: true,
      databaseUrl: 'file:./data/classaction.db',
      claimFilerMode: 'shadow',
      claimFilerMaxPerDay: '20',
      scraperUserAgent: 'ClaimBot/0.1 (+https://example.com)',
      supportEmail: 'support@example.com',
      cspEnforced: true,
      ...billingReady,
    });

    expect(report.ok).toBe(false);
    expect(report.failures).toContain('Hosted deployment must not use file: local storage.');
    expect(report.items.find((item) => item.key === 'database')?.action).toContain('hosted database');
  });

  it('fails libsql without an auth token', () => {
    const report = evaluateHostedReadiness({
      isHosted: true,
      databaseUrl: 'libsql://example.turso.io',
      claimFilerMode: 'shadow',
      claimFilerMaxPerDay: '20',
      scraperUserAgent: 'ClaimBot/0.1 (+https://example.com)',
      supportEmail: 'support@example.com',
      cspEnforced: true,
      ...billingReady,
    });

    expect(report.ok).toBe(false);
    expect(report.failures).toContain('libsql:// requires DATABASE_AUTH_TOKEN or TURSO_AUTH_TOKEN.');
    expect(report.items.find((item) => item.key === 'database-auth')?.action).toContain('DATABASE_AUTH_TOKEN');
  });

  it('fails live mode without reviewed acknowledgement', () => {
    const report = evaluateHostedReadiness({
      isHosted: true,
      databaseUrl: 'libsql://example.turso.io',
      hasDatabaseAuthToken: true,
      claimFilerMode: 'live',
      claimFilerMaxPerDay: '20',
      scraperUserAgent: 'ClaimBot/0.1 (+https://example.com)',
      supportEmail: 'support@example.com',
      cspEnforced: true,
      ...billingReady,
    });

    expect(report.ok).toBe(false);
    expect(report.failures).toContain('Live filing requires CLAIM_FILER_LIVE_ACK=reviewed.');
  });

  it('fails live mode when the live filing feature is disabled', () => {
    const report = evaluateHostedReadiness({
      isHosted: true,
      databaseUrl: 'libsql://example.turso.io',
      hasDatabaseAuthToken: true,
      claimFilerMode: 'live',
      claimFilerLiveAck: 'reviewed',
      claimFilerMaxPerDay: '20',
      scraperUserAgent: 'ClaimBot/0.1 (+https://example.com)',
      supportEmail: 'support@example.com',
      liveFilingFeatureEnabled: false,
      cspEnforced: true,
      ...billingReady,
    });

    expect(report.ok).toBe(false);
    expect(report.failures).toContain('Live filing is disabled by CLAIMBOT_FEATURE_LIVE_FILING.');
  });

  it('fails hosted client launch when settlement discovery is disabled', () => {
    const report = evaluateHostedReadiness({
      isHosted: true,
      databaseUrl: 'libsql://example.turso.io',
      hasDatabaseAuthToken: true,
      claimFilerMode: 'shadow',
      claimFilerMaxPerDay: '20',
      scraperUserAgent: 'ClaimBot/0.1 (+https://example.com)',
      supportEmail: 'support@example.com',
      sessionSecret: 'a-long-random-session-secret-for-tests',
      settlementSearchFeatureEnabled: false,
      cspEnforced: true,
      ...billingReady,
    });

    expect(report.ok).toBe(false);
    expect(report.failures).toContain(
      'CLAIMBOT_FEATURE_SETTLEMENT_SEARCH must stay enabled for client launch because claim matching depends on settlement discovery.',
    );
    expect(report.items.find((item) => item.key === 'settlement-search-feature')).toMatchObject({
      status: 'fail',
      label: 'Settlement discovery feature',
    });
  });

  it('passes a safe hosted shadow configuration', () => {
    const report = evaluateHostedReadiness({
      isHosted: true,
      databaseUrl: 'libsql://example.turso.io',
      hasDatabaseAuthToken: true,
      claimFilerMode: 'shadow',
      claimFilerMaxPerDay: '20',
      scraperUserAgent: 'ClaimBot/0.1 (+https://example.com)',
      supportEmail: 'support@example.com',
      sessionSecret: 'a-long-random-session-secret-for-tests',
      cspEnforced: true,
      ...billingReady,
    });

    expect(report.ok).toBe(true);
    expect(report.failures).toEqual([]);
    expect(report.items.find((item) => item.key === 'settlement-search-feature')).toMatchObject({
      status: 'pass',
      label: 'Settlement discovery feature',
    });
    expect(report.items.find((item) => item.key === 'database-schema')).toMatchObject({
      status: 'pass',
      label: 'Database schema',
    });
    expect(report.items.find((item) => item.key === 'automation-worker-runtime')).toMatchObject({
      status: 'pass',
      label: 'Automation worker runtime',
    });
  });

  it('accepts a hosted support URL instead of a support email for beta support', () => {
    const report = evaluateHostedReadiness({
      isHosted: true,
      databaseUrl: 'libsql://example.turso.io',
      hasDatabaseAuthToken: true,
      claimFilerMode: 'shadow',
      claimFilerMaxPerDay: '20',
      scraperUserAgent: 'ClaimBot/0.1 (+https://example.com)',
      supportUrl: 'https://discord.gg/claimbot-beta',
      sessionSecret: 'a-long-random-session-secret-for-tests',
      cspEnforced: true,
      paidBillingRequired: false,
      billingPlusMonthlyUrl: '',
      billingProMonthlyUrl: '',
      billingSyncSecret: '',
      legalReviewAck: 'reviewed',
      workerRuntime: 'scheduled-worker',
      workerRuntimeReceipt: 'verified',
    });

    expect(report.ok).toBe(true);
    expect(report.items.find((item) => item.key === 'support-contact')).toMatchObject({
      status: 'pass',
      detail: 'Client support URL is configured.',
    });
  });

  it('fails hosted deployments without a verified automation worker runtime', () => {
    const report = evaluateHostedReadiness({
      isHosted: true,
      databaseUrl: 'libsql://example.turso.io',
      hasDatabaseAuthToken: true,
      claimFilerMode: 'shadow',
      claimFilerMaxPerDay: '20',
      scraperUserAgent: 'ClaimBot/0.1 (+https://example.com)',
      supportEmail: 'support@example.com',
      sessionSecret: 'a-long-random-session-secret-for-tests',
      cspEnforced: true,
      billingPlusMonthlyUrl: 'https://checkout.example.com/plus',
      billingProMonthlyUrl: 'https://checkout.example.com/pro',
      billingSyncSecret: 'a-long-random-billing-sync-secret-for-tests',
      legalReviewAck: 'reviewed',
    });

    expect(report.ok).toBe(false);
    expect(report.failures).toContain(
      'Paid full automation requires a production worker runtime that processes file_claim jobs after web requests create them.',
    );
    expect(report.items.find((item) => item.key === 'automation-worker-runtime')).toMatchObject({
      status: 'fail',
      label: 'Automation worker runtime',
    });
  });

  it('accepts a verified scheduled worker runtime for hosted paid automation', () => {
    const report = evaluateHostedReadiness({
      isHosted: true,
      databaseUrl: 'libsql://example.turso.io',
      hasDatabaseAuthToken: true,
      claimFilerMode: 'shadow',
      claimFilerMaxPerDay: '20',
      scraperUserAgent: 'ClaimBot/0.1 (+https://example.com)',
      supportEmail: 'support@example.com',
      sessionSecret: 'a-long-random-session-secret-for-tests',
      cspEnforced: true,
      billingPlusMonthlyUrl: 'https://checkout.example.com/plus',
      billingProMonthlyUrl: 'https://checkout.example.com/pro',
      billingSyncSecret: 'a-long-random-billing-sync-secret-for-tests',
      legalReviewAck: 'reviewed',
      workerRuntime: 'scheduled-worker',
      workerRuntimeReceipt: 'verified',
    });

    expect(report.ok).toBe(true);
    expect(report.items.find((item) => item.key === 'automation-worker-runtime')).toMatchObject({
      status: 'pass',
      detail: 'Paid full automation worker runtime is verified as scheduled-worker.',
    });
  });

  it('fails hosted deployments when required database migrations are missing', () => {
    const report = evaluateHostedReadiness({
      isHosted: true,
      databaseUrl: 'libsql://example.turso.io',
      hasDatabaseAuthToken: true,
      claimFilerMode: 'shadow',
      claimFilerMaxPerDay: '20',
      scraperUserAgent: 'ClaimBot/0.1 (+https://example.com)',
      supportEmail: 'support@example.com',
      sessionSecret: 'a-long-random-session-secret-for-tests',
      cspEnforced: true,
      databaseSchemaReady: false,
      databaseSchemaFailures: ['Hosted identity subject', 'Billing event idempotency ledger'],
      ...billingReady,
    });

    expect(report.ok).toBe(false);
    expect(report.items.find((item) => item.key === 'database-schema')).toMatchObject({
      status: 'fail',
      label: 'Database schema',
    });
    expect(report.failures.join(' ')).toContain('Hosted identity subject');
    expect(report.items.find((item) => item.key === 'database-schema')?.action).toContain('npm run db:migrate');
  });

  it('fails hosted deployments with authentication disabled', () => {
    const report = evaluateHostedReadiness({
      isHosted: true,
      authDisabled: true,
      databaseUrl: 'libsql://example.turso.io',
      hasDatabaseAuthToken: true,
      claimFilerMode: 'shadow',
      claimFilerMaxPerDay: '20',
      scraperUserAgent: 'ClaimBot/0.1 (+https://example.com)',
      supportEmail: 'support@example.com',
      sessionSecret: 'a-long-random-session-secret-for-tests',
      cspEnforced: true,
      ...billingReady,
    });

    expect(report.ok).toBe(false);
    expect(report.failures).toContain(
      'Hosted authentication is disabled. Remove CLAIMBOT_DISABLE_AUTH=true before client deployment.',
    );
  });

  it('fails hosted deployments without a session signing secret', () => {
    const report = evaluateHostedReadiness({
      isHosted: true,
      databaseUrl: 'libsql://example.turso.io',
      hasDatabaseAuthToken: true,
      claimFilerMode: 'shadow',
      claimFilerMaxPerDay: '20',
      scraperUserAgent: 'ClaimBot/0.1 (+https://example.com)',
      supportEmail: 'support@example.com',
      cspEnforced: true,
      ...billingReady,
    });

    expect(report.ok).toBe(false);
    expect(report.failures).toContain(
      'CLAIMBOT_SESSION_SECRET must be at least 32 characters for hosted authentication.',
    );
  });

  it('fails hosted deployments without scraper contact and support email', () => {
    const report = evaluateHostedReadiness({
      isHosted: true,
      databaseUrl: 'libsql://example.turso.io',
      hasDatabaseAuthToken: true,
      claimFilerMode: 'shadow',
      claimFilerMaxPerDay: '20',
      sessionSecret: 'a-long-random-session-secret-for-tests',
      cspEnforced: true,
      ...billingReady,
    });

    expect(report.ok).toBe(false);
    expect(report.failures).toContain(
      'SCRAPER_USER_AGENT must include a contact URL for hosted scraping.',
    );
    expect(report.failures).toContain(
      'CLAIMBOT_SUPPORT_EMAIL or CLAIMBOT_SUPPORT_URL is required for hosted client support.',
    );
  });

  it('fails hosted deployments when CSP is not enforced', () => {
    const report = evaluateHostedReadiness({
      isHosted: true,
      databaseUrl: 'libsql://example.turso.io',
      hasDatabaseAuthToken: true,
      claimFilerMode: 'shadow',
      claimFilerMaxPerDay: '20',
      scraperUserAgent: 'ClaimBot/0.1 (+https://example.com)',
      supportEmail: 'support@example.com',
      sessionSecret: 'a-long-random-session-secret-for-tests',
      cspEnforced: false,
      ...billingReady,
    });

    expect(report.ok).toBe(false);
    expect(report.failures).toContain(
      'Hosted deployment must enforce Content-Security-Policy headers.',
    );
    expect(report.items.find((item) => item.key === 'security-headers')?.action).toContain(
      'CLAIMBOT_ENFORCE_CSP=true',
    );
  });

  it('warns that local development omits CSP for dev tooling', () => {
    const report = evaluateHostedReadiness({
      isHosted: false,
      databaseUrl: 'file:./data/classaction.db',
      claimFilerMode: 'shadow',
      claimFilerMaxPerDay: '20',
      scraperUserAgent: 'ClaimBot/0.1 (+https://example.com)',
    });

    expect(report.ok).toBe(true);
    expect(report.warnings).toContain('Local development omits CSP so Next.js dev tooling can run.');
  });

  it('fails hosted deployments without paid checkout and signed billing sync gates', () => {
    const report = evaluateHostedReadiness({
      isHosted: true,
      databaseUrl: 'libsql://example.turso.io',
      hasDatabaseAuthToken: true,
      claimFilerMode: 'shadow',
      claimFilerMaxPerDay: '20',
      scraperUserAgent: 'ClaimBot/0.1 (+https://example.com)',
      supportEmail: 'support@example.com',
      sessionSecret: 'a-long-random-session-secret-for-tests',
      cspEnforced: true,
    });

    expect(report.ok).toBe(false);
    expect(report.items.find((item) => item.key === 'paid-billing')).toMatchObject({
      status: 'fail',
      label: 'Paid billing gates',
    });
    expect(report.failures.join(' ')).toContain('CLAIMBOT_BILLING_SYNC_SECRET_OR_STRIPE_WEBHOOK_SECRET');
  });

  it('fails hosted deployments when copied setup template placeholders are still present', () => {
    const report = evaluateHostedReadiness({
      isHosted: true,
      databaseUrl: 'libsql://YOUR_DATABASE.turso.io',
      databaseAuthToken: 'YOUR_DATABASE_TOKEN',
      hasDatabaseAuthToken: true,
      claimFilerMode: 'shadow',
      claimFilerMaxPerDay: '20',
      scraperUserAgent: 'ClaimBot/0.1 (+https://yourdomain.com/contact)',
      supportEmail: 'support@yourdomain.com',
      sessionSecret: 'PASTE_GENERATED_SESSION_SECRET',
      cspEnforced: true,
      billingPlusMonthlyUrl: 'https://YOUR_PROCESSOR_CHECKOUT_LINK',
      billingProMonthlyUrl: 'https://YOUR_PROCESSOR_CHECKOUT_LINK',
      billingSyncSecret: 'PASTE_GENERATED_BILLING_SYNC_SECRET',
      legalReviewAck: 'reviewed',
    });

    expect(report.ok).toBe(false);
    expect(report.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'database', status: 'fail' }),
      expect.objectContaining({ key: 'database-auth', status: 'fail' }),
      expect.objectContaining({ key: 'scraper-contact', status: 'fail' }),
      expect.objectContaining({ key: 'support-contact', status: 'fail' }),
      expect.objectContaining({ key: 'session-secret', status: 'fail' }),
      expect.objectContaining({ key: 'paid-billing', status: 'fail' }),
    ]));
    expect(report.failures.join(' ')).toContain('placeholder');
  });

  it('fails hosted deployments when literal placeholder words are used as env values', () => {
    const report = evaluateHostedReadiness({
      isHosted: true,
      databaseUrl: 'placeholder',
      databaseAuthToken: 'example',
      hasDatabaseAuthToken: true,
      claimFilerMode: 'shadow',
      claimFilerMaxPerDay: '20',
      scraperUserAgent: 'placeholder',
      supportEmail: 'example',
      sessionSecret: 'placeholder',
      cspEnforced: true,
      billingPlusMonthlyUrl: 'placeholder',
      billingProMonthlyUrl: 'example',
      billingSyncSecret: 'placeholder',
      legalReviewAck: 'reviewed',
    });

    expect(report.ok).toBe(false);
    expect(report.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'database', status: 'fail' }),
      expect.objectContaining({ key: 'scraper-contact', status: 'fail' }),
      expect.objectContaining({ key: 'support-contact', status: 'fail' }),
      expect.objectContaining({ key: 'session-secret', status: 'fail' }),
      expect.objectContaining({ key: 'paid-billing', status: 'fail' }),
    ]));
    expect(report.failures.join(' ')).toContain('placeholder');
  });

  it('passes paid billing when Stripe webhook signing is configured instead of ClaimBot HMAC', () => {
    const report = evaluateHostedReadiness({
      isHosted: true,
      databaseUrl: 'libsql://example.turso.io',
      hasDatabaseAuthToken: true,
      claimFilerMode: 'shadow',
      claimFilerMaxPerDay: '20',
      scraperUserAgent: 'ClaimBot/0.1 (+https://example.com)',
      supportEmail: 'support@example.com',
      sessionSecret: 'a-long-random-session-secret-for-tests',
      cspEnforced: true,
      billingPlusMonthlyUrl: 'https://checkout.example.com/plus',
      billingProMonthlyUrl: 'https://checkout.example.com/pro',
      billingStripeWebhookSecret: 'whsec_test_secret_at_least_32_characters',
      legalReviewAck: 'reviewed',
      workerRuntime: 'persistent-worker',
      workerRuntimeReceipt: 'verified',
    });

    expect(report.ok).toBe(true);
    expect(report.items.find((item) => item.key === 'paid-billing')).toMatchObject({
      status: 'pass',
      label: 'Paid billing gates',
    });
  });

  it('fails hosted deployments until legal and compliance review is acknowledged', () => {
    const report = evaluateHostedReadiness({
      isHosted: true,
      databaseUrl: 'libsql://example.turso.io',
      hasDatabaseAuthToken: true,
      claimFilerMode: 'shadow',
      claimFilerMaxPerDay: '20',
      scraperUserAgent: 'ClaimBot/0.1 (+https://example.com)',
      supportEmail: 'support@example.com',
      sessionSecret: 'a-long-random-session-secret-for-tests',
      cspEnforced: true,
      billingPlusMonthlyUrl: 'https://checkout.example.com/plus',
      billingProMonthlyUrl: 'https://checkout.example.com/pro',
      billingSyncSecret: 'a-long-random-billing-sync-secret-for-tests',
    });

    expect(report.ok).toBe(false);
    expect(report.failures).toContain(
      'Hosted launch requires legal/compliance review acknowledgment before inviting clients.',
    );
    expect(report.items.find((item) => item.key === 'legal-review')).toMatchObject({
      status: 'fail',
      label: 'Legal/compliance review',
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  effectiveFilingModeForBootstrap,
  getBootstrapAuditStamp,
  getBootstrapCriticalEnvAudit,
} from '../../src/lib/bootstrap-audit-stamp';

describe('getBootstrapAuditStamp', () => {
  it('reports safe-mode enforcement and missing critical env keys without values', () => {
    const stamp = getBootstrapAuditStamp({
      env: {},
      filingMode: 'shadow',
    });

    expect(stamp.shadowModeState).toBe('enforced');
    expect(stamp.authGateState).toBe('active');
    expect(stamp.missingEnvKeys).toEqual([
      'DATABASE_URL',
      'SCRAPER_USER_AGENT',
      'CLAIMBOT_SUPPORT_EMAIL',
      'CLAIMBOT_SESSION_SECRET',
      'CLAIMBOT_BILLING_PLUS_MONTHLY_URL',
      'CLAIMBOT_BILLING_PRO_MONTHLY_URL',
      'CLAIMBOT_BILLING_SYNC_SECRET',
      'CLAIMBOT_STRIPE_WEBHOOK_SECRET',
      'CLAIMBOT_LEGAL_REVIEW_ACK',
    ]);
    expect(stamp.summary).toContain('CLAIMBOT_BILLING_SYNC_SECRET');
    expect(stamp.summary).toContain('CLAIMBOT_LEGAL_REVIEW_ACK');
    expect(stamp.summary).not.toContain('sk-');
    expect(stamp.digest).toMatch(/^[a-f0-9]{16}$/);
  });

  it('keeps shadow mode enforced if live filing is not feature-enabled', () => {
    const stamp = getBootstrapAuditStamp({
      env: {
        DATABASE_URL: 'libsql://example.turso.io',
        SCRAPER_USER_AGENT: 'ClaimBot/0.1 (+https://example.com/contact)',
        CLAIMBOT_SUPPORT_EMAIL: 'support@example.com',
        CLAIMBOT_SESSION_SECRET: 'a-long-random-session-secret-for-tests',
        CLAIMBOT_BILLING_PLUS_MONTHLY_URL: 'https://checkout.example.com/plus',
        CLAIMBOT_BILLING_PRO_MONTHLY_URL: 'https://checkout.example.com/pro',
        CLAIMBOT_BILLING_SYNC_SECRET: 'a-long-random-billing-sync-secret-for-tests',
        CLAIMBOT_LEGAL_REVIEW_ACK: 'reviewed',
      },
      filingMode: 'live',
    });

    expect(stamp.shadowModeState).toBe('enforced');
    expect(stamp.missingEnvKeys).toEqual([]);
  });

  it('treats unsafe billing links, short billing secrets, and unreviewed legal ack as missing', () => {
    const stamp = getBootstrapAuditStamp({
      env: {
        DATABASE_URL: 'libsql://example.turso.io',
        SCRAPER_USER_AGENT: 'ClaimBot/0.1 (+https://example.com/contact)',
        CLAIMBOT_SUPPORT_EMAIL: 'support@example.com',
        CLAIMBOT_SESSION_SECRET: 'a-long-random-session-secret-for-tests',
        CLAIMBOT_BILLING_PLUS_MONTHLY_URL: 'http://checkout.example.com/plus',
        CLAIMBOT_BILLING_PRO_MONTHLY_URL: 'https://checkout.example.com/pro',
        CLAIMBOT_BILLING_SYNC_SECRET: 'short',
        CLAIMBOT_LEGAL_REVIEW_ACK: 'pending',
      },
      filingMode: 'shadow',
    });

    expect(stamp.missingEnvKeys).toEqual([
      'CLAIMBOT_BILLING_PLUS_MONTHLY_URL',
      'CLAIMBOT_BILLING_SYNC_SECRET',
      'CLAIMBOT_STRIPE_WEBHOOK_SECRET',
      'CLAIMBOT_LEGAL_REVIEW_ACK',
    ]);
  });

  it('treats copied hosted template placeholders as missing launch configuration', () => {
    const env = {
      DATABASE_URL: 'libsql://YOUR_DATABASE.turso.io',
      SCRAPER_USER_AGENT: 'ClaimBot/0.1 (+https://yourdomain.com/contact)',
      CLAIMBOT_SUPPORT_EMAIL: 'support@yourdomain.com',
      CLAIMBOT_SESSION_SECRET: 'PASTE_GENERATED_SESSION_SECRET',
      CLAIMBOT_BILLING_PLUS_MONTHLY_URL: 'https://YOUR_PROCESSOR_CHECKOUT_LINK',
      CLAIMBOT_BILLING_PRO_MONTHLY_URL: 'https://YOUR_PROCESSOR_CHECKOUT_LINK',
      CLAIMBOT_BILLING_SYNC_SECRET: 'PASTE_GENERATED_BILLING_SYNC_SECRET',
      CLAIMBOT_LEGAL_REVIEW_ACK: 'reviewed',
    };
    const stamp = getBootstrapAuditStamp({ env });

    expect(stamp.missingEnvKeys).toEqual([
      'DATABASE_URL',
      'SCRAPER_USER_AGENT',
      'CLAIMBOT_SUPPORT_EMAIL',
      'CLAIMBOT_SESSION_SECRET',
      'CLAIMBOT_BILLING_PLUS_MONTHLY_URL',
      'CLAIMBOT_BILLING_PRO_MONTHLY_URL',
      'CLAIMBOT_BILLING_SYNC_SECRET',
      'CLAIMBOT_STRIPE_WEBHOOK_SECRET',
    ]);
    expect(getBootstrapCriticalEnvAudit(env)).toContainEqual({
      key: 'CLAIMBOT_BILLING_PRO_MONTHLY_URL',
      status: 'missing',
    });
  });

  it('treats literal placeholder words as missing launch configuration', () => {
    const env = {
      DATABASE_URL: 'placeholder',
      SCRAPER_USER_AGENT: 'example',
      CLAIMBOT_SUPPORT_EMAIL: 'placeholder',
      CLAIMBOT_SESSION_SECRET: 'placeholder',
      CLAIMBOT_BILLING_PLUS_MONTHLY_URL: 'placeholder',
      CLAIMBOT_BILLING_PRO_MONTHLY_URL: 'example',
      CLAIMBOT_BILLING_SYNC_SECRET: 'placeholder',
      CLAIMBOT_LEGAL_REVIEW_ACK: 'reviewed',
    };
    const audit = getBootstrapCriticalEnvAudit(env);

    expect(audit).toEqual(expect.arrayContaining([
      { key: 'DATABASE_URL', status: 'missing' },
      { key: 'SCRAPER_USER_AGENT', status: 'missing' },
      { key: 'CLAIMBOT_SUPPORT_EMAIL', status: 'missing' },
      { key: 'CLAIMBOT_SESSION_SECRET', status: 'missing' },
      { key: 'CLAIMBOT_BILLING_PLUS_MONTHLY_URL', status: 'missing' },
      { key: 'CLAIMBOT_BILLING_PRO_MONTHLY_URL', status: 'missing' },
      { key: 'CLAIMBOT_BILLING_SYNC_SECRET', status: 'missing' },
    ]));
  });

  it('accepts a Stripe webhook endpoint secret as the billing verifier', () => {
    const stamp = getBootstrapAuditStamp({
      env: {
        DATABASE_URL: 'libsql://example.turso.io',
        SCRAPER_USER_AGENT: 'ClaimBot/0.1 (+https://example.com/contact)',
        CLAIMBOT_SUPPORT_EMAIL: 'support@example.com',
        CLAIMBOT_SESSION_SECRET: 'a-long-random-session-secret-for-tests',
        CLAIMBOT_BILLING_PLUS_MONTHLY_URL: 'https://checkout.example.com/plus',
        CLAIMBOT_BILLING_PRO_MONTHLY_URL: 'https://checkout.example.com/pro',
        CLAIMBOT_STRIPE_WEBHOOK_SECRET: 'whsec_test_secret_at_least_32_characters',
        CLAIMBOT_LEGAL_REVIEW_ACK: 'reviewed',
      },
      filingMode: 'shadow',
    });

    expect(stamp.missingEnvKeys).toEqual([]);
    expect(stamp.summary).toContain('missing_env_keys=none');
  });

  it('records reviewed live bootstrap only when env and live feature gate are present', () => {
    const stamp = getBootstrapAuditStamp({
      env: {
        DATABASE_URL: 'libsql://example.turso.io',
        SCRAPER_USER_AGENT: 'ClaimBot/0.1 (+https://example.com/contact)',
        CLAIMBOT_SUPPORT_EMAIL: 'support@example.com',
        CLAIMBOT_SESSION_SECRET: 'a-long-random-session-secret-for-tests',
        CLAIMBOT_BILLING_PLUS_MONTHLY_URL: 'https://checkout.example.com/plus',
        CLAIMBOT_BILLING_PRO_MONTHLY_URL: 'https://checkout.example.com/pro',
        CLAIMBOT_BILLING_SYNC_SECRET: 'a-long-random-billing-sync-secret-for-tests',
        CLAIMBOT_LEGAL_REVIEW_ACK: 'reviewed',
        CLAIMBOT_FEATURE_LIVE_FILING: 'true',
      },
      filingMode: 'live',
    });

    expect(stamp.shadowModeState).toBe('reviewed_live');
    expect(stamp.authGateState).toBe('active');
    expect(stamp.summary).toContain('missing_env_keys=none');
  });

  it('forces effective filing mode back to shadow while bootstrap is enforced', () => {
    expect(effectiveFilingModeForBootstrap({
      env: {
        DATABASE_URL: 'libsql://example.turso.io',
        SCRAPER_USER_AGENT: 'ClaimBot/0.1 (+https://example.com/contact)',
        CLAIMBOT_SUPPORT_EMAIL: 'support@example.com',
        CLAIMBOT_SESSION_SECRET: 'a-long-random-session-secret-for-tests',
        CLAIMBOT_BILLING_PLUS_MONTHLY_URL: 'https://checkout.example.com/plus',
        CLAIMBOT_BILLING_PRO_MONTHLY_URL: 'https://checkout.example.com/pro',
        CLAIMBOT_BILLING_SYNC_SECRET: 'a-long-random-billing-sync-secret-for-tests',
        CLAIMBOT_LEGAL_REVIEW_ACK: 'reviewed',
      },
      filingMode: 'live',
    })).toBe('shadow');

    expect(effectiveFilingModeForBootstrap({
      env: {
        DATABASE_URL: 'libsql://example.turso.io',
        SCRAPER_USER_AGENT: 'ClaimBot/0.1 (+https://example.com/contact)',
        CLAIMBOT_SUPPORT_EMAIL: 'support@example.com',
        CLAIMBOT_SESSION_SECRET: 'a-long-random-session-secret-for-tests',
        CLAIMBOT_BILLING_PLUS_MONTHLY_URL: 'https://checkout.example.com/plus',
        CLAIMBOT_BILLING_PRO_MONTHLY_URL: 'https://checkout.example.com/pro',
        CLAIMBOT_BILLING_SYNC_SECRET: 'a-long-random-billing-sync-secret-for-tests',
        CLAIMBOT_LEGAL_REVIEW_ACK: 'reviewed',
        CLAIMBOT_FEATURE_LIVE_FILING: 'true',
      },
      filingMode: 'live',
    })).toBe('live');
  });

  it('shows disabled auth gates when hosted auth is explicitly disabled', () => {
    const stamp = getBootstrapAuditStamp({
      env: {
        CLAIMBOT_DISABLE_AUTH: 'true',
      },
    });

    expect(stamp.authGateState).toBe('disabled');
  });
});

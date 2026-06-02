import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateNetlifyPreviewReadiness } from '../../src/lib/netlify-preview-readiness';

function writeReadyNetlifyFiles(root: string) {
  fs.writeFileSync(path.join(root, 'netlify.toml'), [
    '[build]',
    '  command = "npm run build:hosted"',
    '  publish = ".next"',
    '',
    '[[headers]]',
    '  for = "/*"',
    '  [headers.values]',
    '    Content-Security-Policy = "default-src \'self\'"',
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    scripts: {
      'build:hosted': 'npm run build',
      'netlify:doctor:strict': 'node scripts/netlify-launch-doctor.cjs --strict',
      'preview:gate': 'node scripts/preview-promotion-gate.cjs',
      'validate:netlify:strict': 'node scripts/validate-netlify-preflight.cjs --strict',
    },
  }));
}

describe('evaluateNetlifyPreviewReadiness', () => {
  it('fails strict preview promotion when the site, preview URL, and smoke secrets are missing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claimbot-netlify-missing-'));
    const readiness = evaluateNetlifyPreviewReadiness({
      root,
      strict: true,
      env: {},
    });

    expect(readiness.ok).toBe(false);
    expect(readiness.failureCount).toBe(7);
    expect(readiness.evidenceScope).toBe('operator-preflight');
    expect(readiness.siteLinkSource).toBe('missing');
    expect(readiness.items.map((item) => item.key)).toEqual([
      'netlify-build-config',
      'promotion-scripts',
      'netlify-site-link',
      'smoke-base-url',
      'preview-site-alignment',
      'session-smoke-secret',
      'billing-smoke-secret',
    ]);
    expect(readiness.items.every((item) => item.status === 'fail')).toBe(true);
    expect(readiness.items.every((item) => item.serverObservable)).toBe(true);
  });

  it('passes with local site state, deployed HTTPS smoke URL, and smoke verifiers', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claimbot-netlify-ready-'));
    writeReadyNetlifyFiles(root);
    fs.mkdirSync(path.join(root, '.netlify'));
    fs.writeFileSync(path.join(root, '.netlify', 'state.json'), '{"siteId":"site_123","siteName":"claimbot-preview"}');

    const readiness = evaluateNetlifyPreviewReadiness({
      root,
      strict: true,
      env: {
        SMOKE_BASE_URL: 'https://claimbot-preview.netlify.app',
        CLAIMBOT_SESSION_SECRET: 'session-secret-for-smoke',
        CLAIMBOT_BILLING_SYNC_SECRET: 'billing-secret-for-smoke',
      },
    });

    expect(readiness.ok).toBe(true);
    expect(readiness.buildConfigReady).toBe(true);
    expect(readiness.promotionScriptsReady).toBe(true);
    expect(readiness.siteLinked).toBe(true);
    expect(readiness.siteLinkSource).toBe('local-state');
    expect(readiness.smokeBaseUrlHttps).toBe(true);
    expect(readiness.netlifySiteSlug).toBe('claimbot-preview');
    expect(readiness.smokeBaseUrlMatchesSite).toBe(true);
    expect(readiness.items.every((item) => item.status === 'pass')).toBe(true);
  });

  it('treats localhost smoke URLs as not ready for strict deployed-preview checks', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claimbot-netlify-localhost-'));
    writeReadyNetlifyFiles(root);
    const readiness = evaluateNetlifyPreviewReadiness({
      root,
      strict: true,
      env: {
        NETLIFY_SITE_ID: 'site_123',
        NETLIFY_SITE_SLUG: 'claimbot-preview',
        SMOKE_BASE_URL: 'http://localhost:3100',
        CLAIMBOT_SESSION_SECRET: 'session-secret-for-smoke',
        CLAIMBOT_STRIPE_WEBHOOK_SECRET: 'stripe-secret-for-smoke',
      },
    });

    expect(readiness.ok).toBe(false);
    expect(readiness.failureCount).toBe(2);
    expect(readiness.siteLinkSource).toBe('env');
    expect(readiness.items.find((item) => item.key === 'smoke-base-url')?.status).toBe('fail');
  });

  it('rejects copied preview placeholder values in strict promotion checks', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claimbot-netlify-placeholders-'));
    writeReadyNetlifyFiles(root);
    const readiness = evaluateNetlifyPreviewReadiness({
      root,
      strict: true,
      env: {
        NETLIFY_SITE_ID: 'PASTE_CLAIMBOT_SITE_ID',
        SMOKE_BASE_URL: 'https://your-preview.netlify.app',
        CLAIMBOT_SESSION_SECRET: 'PASTE_THE_DEPLOYED_SESSION_SECRET',
        CLAIMBOT_BILLING_SYNC_SECRET: 'PASTE_THE_DEPLOYED_BILLING_SYNC_SECRET',
      },
    });

    expect(readiness.ok).toBe(false);
    expect(readiness.failureCount).toBe(5);
    expect(readiness.siteLinked).toBe(false);
    expect(readiness.siteLinkSource).toBe('missing');
    expect(readiness.smokeBaseUrlConfigured).toBe(false);
    expect(readiness.smokeBaseUrlHttps).toBe(false);
    expect(readiness.sessionSmokeSecretConfigured).toBe(false);
    expect(readiness.billingSmokeSecretConfigured).toBe(false);
  });

  it('rejects invalid local Netlify state unless a real CI site id is supplied', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claimbot-netlify-invalid-state-'));
    writeReadyNetlifyFiles(root);
    fs.mkdirSync(path.join(root, '.netlify'));
    fs.writeFileSync(path.join(root, '.netlify', 'state.json'), '{"siteId":"PASTE_CLAIMBOT_SITE_ID"}');

    const readiness = evaluateNetlifyPreviewReadiness({
      root,
      strict: true,
      env: {
        SMOKE_BASE_URL: 'https://claimbot-preview.netlify.app',
        CLAIMBOT_SESSION_SECRET: 'session-secret-for-smoke',
        CLAIMBOT_BILLING_SYNC_SECRET: 'billing-secret-for-smoke',
      },
    });

    expect(readiness.ok).toBe(false);
    expect(readiness.siteLinked).toBe(false);
    expect(readiness.siteLinkStateValid).toBe(false);
    expect(readiness.siteLinkStateError).toContain('siteId');

    const ciReady = evaluateNetlifyPreviewReadiness({
      root,
      strict: true,
      env: {
        NETLIFY_SITE_ID: 'site_123',
        NETLIFY_SITE_SLUG: 'claimbot-preview',
        SMOKE_BASE_URL: 'https://claimbot-preview.netlify.app',
        CLAIMBOT_SESSION_SECRET: 'session-secret-for-smoke',
        CLAIMBOT_BILLING_SYNC_SECRET: 'billing-secret-for-smoke',
      },
    });

    expect(ciReady.ok).toBe(true);
    expect(ciReady.siteLinked).toBe(true);
    expect(ciReady.siteLinkSource).toBe('env');
    expect(ciReady.siteLinkStateValid).toBe(false);
  });

  it('rejects preview URLs that do not belong to the confirmed Netlify site slug', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claimbot-netlify-wrong-site-'));
    writeReadyNetlifyFiles(root);

    const readiness = evaluateNetlifyPreviewReadiness({
      root,
      strict: true,
      env: {
        NETLIFY_SITE_ID: 'site_123',
        NETLIFY_SITE_SLUG: 'claimbot-client',
        SMOKE_BASE_URL: 'https://deploy-preview-12--unrelated-site.netlify.app',
        CLAIMBOT_SESSION_SECRET: 'session-secret-for-smoke',
        CLAIMBOT_BILLING_SYNC_SECRET: 'billing-secret-for-smoke',
      },
    });

    expect(readiness.ok).toBe(false);
    expect(readiness.netlifySiteSlug).toBe('claimbot-client');
    expect(readiness.smokeBaseUrlMatchesSite).toBe(false);
    expect(readiness.items.find((item) => item.key === 'preview-site-alignment')).toMatchObject({
      status: 'fail',
    });
  });

  it('marks operator-local smoke inputs as not server-observable in support-packet evidence', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claimbot-netlify-support-'));
    writeReadyNetlifyFiles(root);
    const readiness = evaluateNetlifyPreviewReadiness({
      root,
      evidenceScope: 'support-packet',
      strict: false,
      env: {
        SITE_ID: 'site_123',
      },
    });

    expect(readiness.evidenceScope).toBe('support-packet');
    expect(readiness.failureCount).toBe(0);
    expect(readiness.warningCount).toBe(3);
    expect(readiness.items.find((item) => item.key === 'netlify-site-link')).toMatchObject({
      status: 'pass',
      serverObservable: true,
    });
    for (const key of ['smoke-base-url', 'session-smoke-secret', 'billing-smoke-secret']) {
      expect(readiness.items.find((item) => item.key === key)).toMatchObject({
        status: 'warn',
        serverObservable: false,
      });
    }
  });

  it('keeps support-packet smoke inputs advisory even when similarly named server env values exist', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claimbot-netlify-support-configured-'));
    writeReadyNetlifyFiles(root);
    fs.mkdirSync(path.join(root, '.netlify'));
    fs.writeFileSync(path.join(root, '.netlify', 'state.json'), '{"siteId":"site_123"}');

    const readiness = evaluateNetlifyPreviewReadiness({
      root,
      evidenceScope: 'support-packet',
      strict: false,
      env: {
        SMOKE_BASE_URL: 'https://claimbot-preview.netlify.app',
        CLAIMBOT_SESSION_SECRET: 'server-session-secret',
        CLAIMBOT_BILLING_SYNC_SECRET: 'server-billing-secret',
      },
    });

    expect(readiness.failureCount).toBe(0);
    expect(readiness.warningCount).toBe(3);
    expect(readiness.ok).toBe(false);
    expect(readiness.items.find((item) => item.key === 'netlify-site-link')).toMatchObject({
      status: 'pass',
      serverObservable: true,
    });
    for (const key of ['smoke-base-url', 'session-smoke-secret', 'billing-smoke-secret']) {
      expect(readiness.items.find((item) => item.key === key)).toMatchObject({
        status: 'warn',
        serverObservable: false,
      });
    }
  });
});

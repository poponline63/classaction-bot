import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const scriptPath = path.resolve(process.cwd(), 'scripts', 'preview-promotion-gate.cjs');

function cleanEnv(overrides: Record<string, string>) {
  const env = { ...process.env };
  for (const key of [
    'DATABASE_URL',
    'DATABASE_AUTH_TOKEN',
    'TURSO_AUTH_TOKEN',
    'SCRAPER_USER_AGENT',
    'CLAIMBOT_SUPPORT_EMAIL',
    'CLAIMBOT_SESSION_SECRET',
    'CLAIMBOT_BILLING_PLUS_MONTHLY_URL',
    'CLAIMBOT_BILLING_PRO_MONTHLY_URL',
    'CLAIMBOT_BILLING_SYNC_SECRET',
    'CLAIMBOT_STRIPE_WEBHOOK_SECRET',
    'CLAIMBOT_LEGAL_REVIEW_ACK',
    'SMOKE_BASE_URL',
    'NETLIFY_SITE_ID',
    'NETLIFY_SITE_SLUG',
    'NETLIFY_SITE_DASHBOARD_URL',
    'SITE_ID',
  ]) {
    delete env[key];
  }
  return { ...env, ...overrides };
}

function runCheck(overrides: Record<string, string>) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'claimbot-preview-check-'));
  return spawnSync(process.execPath, [scriptPath, '--check-env-only'], {
    cwd,
    env: cleanEnv(overrides),
    encoding: 'utf8',
  });
}

function runCheckInCwd(cwd: string, overrides: Record<string, string> = {}) {
  return spawnSync(process.execPath, [scriptPath, '--check-env-only'], {
    cwd,
    env: cleanEnv(overrides),
    encoding: 'utf8',
  });
}

describe('preview promotion gate env precheck', () => {
  it('rejects copied hosted setup placeholders before running the long gate', () => {
    const result = runCheck({
      DATABASE_URL: 'libsql://YOUR_DATABASE.turso.io',
      SCRAPER_USER_AGENT: 'ClaimBot/0.1 (+https://yourdomain.com/contact)',
      CLAIMBOT_SUPPORT_EMAIL: 'support@yourdomain.com',
      CLAIMBOT_SESSION_SECRET: 'PASTE_THE_DEPLOYED_SESSION_SECRET',
      CLAIMBOT_BILLING_PLUS_MONTHLY_URL: 'https://YOUR_PROCESSOR_CHECKOUT_LINK',
      CLAIMBOT_BILLING_PRO_MONTHLY_URL: 'https://YOUR_PROCESSOR_CHECKOUT_LINK',
      CLAIMBOT_BILLING_SYNC_SECRET: 'PASTE_THE_DEPLOYED_BILLING_SYNC_SECRET',
      CLAIMBOT_LEGAL_REVIEW_ACK: 'reviewed',
      SMOKE_BASE_URL: 'https://your-preview.netlify.app',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Replace copied setup placeholders before preview promotion');
    expect(result.stdout).not.toContain('mode=deployed-preview');
  });

  it('accepts real-looking deployed preview inputs without running the heavy command sequence', () => {
    const result = runCheck({
      NETLIFY_SITE_ID: 'claimbot-site-123',
      NETLIFY_SITE_SLUG: 'claimbot',
      DATABASE_URL: 'libsql://claimbot-prod.turso.io',
      SCRAPER_USER_AGENT: 'ClaimBot/0.1 (+https://claimbot.app/contact)',
      CLAIMBOT_SUPPORT_EMAIL: 'support@claimbot.app',
      CLAIMBOT_SESSION_SECRET: 'session_secret_1234567890_abcdefghijklmnopqrstuvwxyz',
      CLAIMBOT_BILLING_PLUS_MONTHLY_URL: 'https://checkout.claimbot.app/plus-monthly',
      CLAIMBOT_BILLING_PRO_MONTHLY_URL: 'https://checkout.claimbot.app/pro-monthly',
      CLAIMBOT_BILLING_SYNC_SECRET: 'billing_secret_1234567890_abcdefghijklmnopqrstuvwxyz',
      CLAIMBOT_LEGAL_REVIEW_ACK: 'reviewed',
      SMOKE_BASE_URL: 'https://deploy-preview-12--claimbot.netlify.app',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('deployed-preview environment inputs ok');
    expect(result.stdout).not.toContain('npm run typecheck');
  });

  it('requires a confirmed Netlify site target for the fast preview input check', () => {
    const result = runCheck({
      NETLIFY_SITE_ID: 'YOUR_CLAIMBOT_SITE_ID',
      NETLIFY_SITE_SLUG: 'claimbot',
      DATABASE_URL: 'libsql://claimbot-prod.turso.io',
      SCRAPER_USER_AGENT: 'ClaimBot/0.1 (+https://claimbot.app/contact)',
      CLAIMBOT_SUPPORT_EMAIL: 'support@claimbot.app',
      CLAIMBOT_SESSION_SECRET: 'session_secret_1234567890_abcdefghijklmnopqrstuvwxyz',
      CLAIMBOT_BILLING_PLUS_MONTHLY_URL: 'https://checkout.claimbot.app/plus-monthly',
      CLAIMBOT_BILLING_PRO_MONTHLY_URL: 'https://checkout.claimbot.app/pro-monthly',
      CLAIMBOT_BILLING_SYNC_SECRET: 'billing_secret_1234567890_abcdefghijklmnopqrstuvwxyz',
      CLAIMBOT_LEGAL_REVIEW_ACK: 'reviewed',
      SMOKE_BASE_URL: 'https://deploy-preview-claimbot.netlify.app',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('A confirmed ClaimBot Netlify site target is required');
  });

  it('requires the preview URL to match the confirmed Netlify site slug', () => {
    const result = runCheck({
      NETLIFY_SITE_ID: 'claimbot-site-123',
      NETLIFY_SITE_SLUG: 'claimbot',
      DATABASE_URL: 'libsql://claimbot-prod.turso.io',
      SCRAPER_USER_AGENT: 'ClaimBot/0.1 (+https://claimbot.app/contact)',
      CLAIMBOT_SUPPORT_EMAIL: 'support@claimbot.app',
      CLAIMBOT_SESSION_SECRET: 'session_secret_1234567890_abcdefghijklmnopqrstuvwxyz',
      CLAIMBOT_BILLING_PLUS_MONTHLY_URL: 'https://checkout.claimbot.app/plus-monthly',
      CLAIMBOT_BILLING_PRO_MONTHLY_URL: 'https://checkout.claimbot.app/pro-monthly',
      CLAIMBOT_BILLING_SYNC_SECRET: 'billing_secret_1234567890_abcdefghijklmnopqrstuvwxyz',
      CLAIMBOT_LEGAL_REVIEW_ACK: 'reviewed',
      SMOKE_BASE_URL: 'https://deploy-preview-12--wrong-site.netlify.app',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('SMOKE_BASE_URL must belong to the confirmed Netlify site slug "claimbot"');
  });

  it('loads ignored hosted and launch env files for the fast preview input check without printing values', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claimbot-preview-env-'));
    fs.mkdirSync(path.join(root, '.netlify'), { recursive: true });
    fs.writeFileSync(path.join(root, '.netlify', 'state.json'), JSON.stringify({
      siteId: 'claimbot-site-123',
      siteName: 'claimbot',
    }));
    fs.writeFileSync(path.join(root, '.env.launch.local'), [
      'CLAIMBOT_SESSION_SECRET=session_secret_1234567890_abcdefghijklmnopqrstuvwxyz',
      'CLAIMBOT_BILLING_SYNC_SECRET=billing_secret_1234567890_abcdefghijklmnopqrstuvwxyz',
      '',
    ].join('\n'));
    fs.writeFileSync(path.join(root, '.env.hosted.local'), [
      'DATABASE_URL=libsql://claimbot-prod.turso.io',
      'SCRAPER_USER_AGENT=ClaimBot/0.1 (+https://claimbot.app/contact)',
      'CLAIMBOT_SUPPORT_EMAIL=support@claimbot.app',
      'CLAIMBOT_BILLING_PLUS_MONTHLY_URL=https://checkout.claimbot.app/plus-monthly',
      'CLAIMBOT_BILLING_PRO_MONTHLY_URL=https://checkout.claimbot.app/pro-monthly',
      'CLAIMBOT_LEGAL_REVIEW_ACK=reviewed',
      'SMOKE_BASE_URL=https://deploy-preview-12--claimbot.netlify.app',
      '',
    ].join('\n'));

    const result = runCheckInCwd(root);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('loaded');
    expect(result.stdout).toContain('deployed-preview environment inputs ok');
    expect(result.stdout).not.toContain('session_secret_1234567890');
    expect(result.stdout).not.toContain('billing_secret_1234567890');
    expect(result.stdout).not.toContain('claimbot-prod.turso.io');
    expect(result.stderr).toBe('');
  });
});

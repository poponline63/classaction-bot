import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const scriptPath = path.resolve(process.cwd(), 'scripts', 'validate-preview-promotion-receipt.cjs');

function tempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claimbot-receipt-'));
}

function writeReceipt(cwd: string, overrides: Record<string, unknown> = {}) {
  const dataDir = path.join(cwd, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const receipt = {
    format: 'claimbot.preview-promotion-receipt.v1',
    createdAt: new Date().toISOString(),
    mode: 'deployed-preview',
    smokeBaseUrl: 'https://deploy-preview-12--claimbot.netlify.app',
    netlifySiteSlug: 'claimbot',
    siteSlugSource: 'NETLIFY_SITE_SLUG',
    siteTargetSource: 'NETLIFY_SITE_ID',
    netlifySiteIdPresent: true,
    commands: [
      'typecheck',
      'validate:secrets',
      'netlify:doctor:strict',
      'validate:netlify:strict',
      'validate:routes',
      'validate:ui',
      'validate:legal',
      'validate:pwa',
      'validate:hosted',
      'db:migrate',
      'validate:schema',
      'validate:source',
      'enrich:source',
      'source:export',
      'validate:source:strict',
      'source:import:dry',
      'build:hosted',
      'smoke:web',
      'smoke:auth',
      'smoke:features',
    ],
    sourceCatalogDigest: '26b72bcd3df4e3f8c776bc60a636a87644c55fe74db3c75fb15283729ef4d2d4',
    note: 'test receipt',
    ...overrides,
  };
  fs.writeFileSync(path.join(dataDir, 'preview-promotion-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
}

function runReceiptCheck(cwd: string, env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd,
    env: {
      ...process.env,
      CLAIMBOT_PREVIEW_RECEIPT_MAX_AGE_HOURS: '24',
      ...env,
    },
    encoding: 'utf8',
  });
}

describe('preview promotion receipt validator', () => {
  it('accepts a fresh deployed-preview receipt that matches the current target env', () => {
    const cwd = tempWorkspace();
    writeReceipt(cwd);

    const result = runReceiptCheck(cwd, {
      SMOKE_BASE_URL: 'https://deploy-preview-12--claimbot.netlify.app',
      NETLIFY_SITE_SLUG: 'claimbot',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[preview-promotion-receipt] ok');
    expect(result.stdout).toContain('Netlify site slug: claimbot');
  });

  it('fails when the deployed-preview receipt is missing', () => {
    const cwd = tempWorkspace();

    const result = runReceiptCheck(cwd);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Missing data');
    expect(result.stderr).toContain('Run npm run preview:gate');
  });

  it('rejects a receipt that belongs to a different Netlify site slug', () => {
    const cwd = tempWorkspace();
    writeReceipt(cwd);

    const result = runReceiptCheck(cwd, {
      NETLIFY_SITE_SLUG: 'wrong-site',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Current NETLIFY_SITE_SLUG does not match');
  });

  it('rejects an old receipt before production promotion', () => {
    const cwd = tempWorkspace();
    writeReceipt(cwd, {
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    });

    const result = runReceiptCheck(cwd);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('rerun npm run preview:gate');
  });
});

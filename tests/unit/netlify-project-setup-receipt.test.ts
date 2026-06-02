import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  NETLIFY_PROJECT_SETUP_RECEIPT_FORMAT,
  evaluateNetlifyProjectSetupReceipt,
  expectedSafeNetlifyEnvKeys,
} from '../../src/lib/netlify-project-setup-receipt';

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claimbot-netlify-receipt-'));
}

function writeReceipt(root: string, value: unknown) {
  const dir = path.join(root, 'data');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'netlify-project-setup-receipt.json'), `${JSON.stringify(value, null, 2)}\n`);
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('evaluateNetlifyProjectSetupReceipt', () => {
  it('marks a complete non-secret setup receipt ready', () => {
    const root = makeTempRoot();
    roots.push(root);
    writeReceipt(root, {
      format: NETLIFY_PROJECT_SETUP_RECEIPT_FORMAT,
      generatedAt: '2026-05-26T18:01:45.000Z',
      siteId: '40fd46c0-14d2-41b2-8538-b918109b7dcb',
      siteName: 'claimbot-app',
      dashboardUrl: 'https://app.netlify.com/projects/claimbot-app',
      configuredSafeEnvKeys: [...expectedSafeNetlifyEnvKeys],
      identity: {
        enabled: true,
        registration: 'invite-only',
        emailConfirmation: true,
        verifiedAt: '2026-05-26T18:01:45.000Z',
        evidence: 'Netlify dashboard Identity settings confirmed by operator.',
      },
    });

    const result = evaluateNetlifyProjectSetupReceipt(root);

    expect(result.ok).toBe(true);
    expect(result.receipt?.siteName).toBe('claimbot-app');
    expect(result.missingSafeEnvKeys).toEqual([]);
    expect(result.identityReady).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it('warns when the receipt has not been recorded', () => {
    const root = makeTempRoot();
    roots.push(root);

    const result = evaluateNetlifyProjectSetupReceipt(root);

    expect(result.ok).toBe(false);
    expect(result.receipt).toBeNull();
    expect(result.identityReady).toBe(false);
    expect(result.warnings).toContain('No non-secret Netlify project setup receipt has been recorded yet.');
  });

  it('does not accept malformed receipt evidence', () => {
    const root = makeTempRoot();
    roots.push(root);
    writeReceipt(root, {
      format: 'wrong-format',
      configuredSafeEnvKeys: [],
    });

    const result = evaluateNetlifyProjectSetupReceipt(root);

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('Netlify project setup receipt exists but is not a valid v1 receipt.');
  });

  it('warns when Identity dashboard proof has not been recorded', () => {
    const root = makeTempRoot();
    roots.push(root);
    writeReceipt(root, {
      format: NETLIFY_PROJECT_SETUP_RECEIPT_FORMAT,
      generatedAt: '2026-05-26T18:01:45.000Z',
      siteId: '40fd46c0-14d2-41b2-8538-b918109b7dcb',
      siteName: 'claimbot-app',
      dashboardUrl: 'https://app.netlify.com/projects/claimbot-app',
      configuredSafeEnvKeys: [...expectedSafeNetlifyEnvKeys],
    });

    const result = evaluateNetlifyProjectSetupReceipt(root);

    expect(result.ok).toBe(false);
    expect(result.identityReady).toBe(false);
    expect(result.identityWarnings).toEqual([
      'Netlify project setup receipt does not record Identity as enabled; confirm Project configuration > Identity before inviting clients.',
    ]);
  });

  it('warns when Identity registration is not invite-only', () => {
    const root = makeTempRoot();
    roots.push(root);
    writeReceipt(root, {
      format: NETLIFY_PROJECT_SETUP_RECEIPT_FORMAT,
      generatedAt: '2026-05-26T18:01:45.000Z',
      siteId: '40fd46c0-14d2-41b2-8538-b918109b7dcb',
      siteName: 'claimbot-app',
      dashboardUrl: 'https://app.netlify.com/projects/claimbot-app',
      configuredSafeEnvKeys: [...expectedSafeNetlifyEnvKeys],
      identity: {
        enabled: true,
        registration: 'open',
        emailConfirmation: false,
      },
    });

    const result = evaluateNetlifyProjectSetupReceipt(root);

    expect(result.ok).toBe(false);
    expect(result.identityWarnings.join(' ')).toContain('invite-only registration');
    expect(result.identityWarnings.join(' ')).toContain('email confirmation');
  });
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluatePreviewPromotionReceipt } from '../../src/lib/preview-promotion-receipt';

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claimbot-receipt-readiness-'));
}

function writeReceipt(root: string, overrides: Record<string, unknown> = {}) {
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'preview-promotion-receipt.json'), JSON.stringify({
    format: 'claimbot.preview-promotion-receipt.v1',
    createdAt: '2026-05-26T10:00:00.000Z',
    mode: 'deployed-preview',
    smokeBaseUrl: 'https://deploy-preview-12--claimbot.netlify.app',
    netlifySiteSlug: 'claimbot',
    netlifySiteIdPresent: true,
    commands: [
      'typecheck',
      'validate:secrets',
      'netlify:doctor:strict',
      'validate:netlify:strict',
      'validate:hosted',
      'build:hosted',
      'smoke:web',
      'smoke:auth',
      'smoke:features',
    ],
    sourceCatalogDigest: 'a'.repeat(64),
    ...overrides,
  }, null, 2));
}

describe('evaluatePreviewPromotionReceipt', () => {
  it('fails when the operator receipt is missing', () => {
    const root = tempRoot();
    const readiness = evaluatePreviewPromotionReceipt({ root });

    expect(readiness.ok).toBe(false);
    expect(readiness.exists).toBe(false);
    expect(readiness.failureCount).toBe(5);
    expect(readiness.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'preview-promotion-receipt', status: 'fail', serverObservable: false }),
      expect.objectContaining({ key: 'receipt-freshness', status: 'fail', serverObservable: false }),
      expect.objectContaining({ key: 'receipt-preview-target', status: 'fail', serverObservable: false }),
      expect.objectContaining({ key: 'receipt-command-coverage', status: 'fail', serverObservable: false }),
      expect.objectContaining({ key: 'receipt-current-target-match', status: 'fail', serverObservable: false }),
    ]));
  });

  it('passes for a fresh deployed-preview receipt matching the current target', () => {
    const root = tempRoot();
    writeReceipt(root);

    const readiness = evaluatePreviewPromotionReceipt({
      root,
      now: new Date('2026-05-26T12:00:00.000Z'),
      env: {
        SMOKE_BASE_URL: 'https://deploy-preview-12--claimbot.netlify.app',
        NETLIFY_SITE_SLUG: 'claimbot',
      },
    });

    expect(readiness.ok).toBe(true);
    expect(readiness.exists).toBe(true);
    expect(readiness.fresh).toBe(true);
    expect(readiness.netlifySiteSlug).toBe('claimbot');
    expect(readiness.sourceCatalogDigest).toBe('a'.repeat(64));
    expect(readiness.items.every((item) => item.status === 'pass')).toBe(true);
  });

  it('fails stale receipts and current target mismatches', () => {
    const root = tempRoot();
    writeReceipt(root);

    const readiness = evaluatePreviewPromotionReceipt({
      root,
      now: new Date('2026-05-28T12:00:00.000Z'),
      env: {
        SMOKE_BASE_URL: 'https://deploy-preview-12--other-site.netlify.app',
        NETLIFY_SITE_SLUG: 'other-site',
      },
    });

    expect(readiness.ok).toBe(false);
    expect(readiness.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'receipt-freshness', status: 'fail' }),
      expect.objectContaining({ key: 'receipt-current-target-match', status: 'fail' }),
    ]));
  });
});

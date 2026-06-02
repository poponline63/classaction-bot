import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  readSourceCatalogBundle,
  sourceCatalogContentDigest,
  sourceCatalogDigestPath,
} from '../../src/lib/source-catalog-transfer';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'claimbot-source-catalog-transfer-'));

afterAll(() => {
  try {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe('source catalog transfer', () => {
  function writeBundle(fileName: string, overrides: Record<string, unknown> = {}) {
    const bundlePath = path.join(TMP_DIR, fileName);
    fs.writeFileSync(bundlePath, JSON.stringify({
      format: 'claimbot.source-catalog.v1',
      exportedAt: '2026-05-26T00:00:00.000Z',
      recordCount: 1,
      records: [{
        canonicalKey: 'abc123',
        source: 'classaction_org',
        sourceUrl: 'https://www.classaction.org/settlements#trader-joes',
        caseName: 'Trader Joe\u00e2\u20ac\u2122s - Receipts Class Action Settlement',
        defendant: 'Trader Joe\u00e2\u20ac\u2122s',
        defendantAliases: ['Trader Joe\u00e2\u20ac\u2122s Stores'],
        category: 'CONSUMER_PRODUCT_PURCHASE',
        classDefinition: 'If you purchased Trader Joe\u00e2\u20ac\u2122s items, you may be included.',
        classPeriodStart: null,
        classPeriodEnd: null,
        deadline: null,
        proofRequired: false,
        payoutEstimate: '$5 \u00e2\u20ac\u201c $10',
        payoutStructure: null,
        claimFormUrl: 'https://example.com',
        administrator: 'unknown',
        captchaType: 'unknown',
        formSchemaJson: null,
        status: 'DISCOVERED',
        rawJson: {
          caseName: 'Trader Joe\u00e2\u20ac\u2122s - Receipts Class Action Settlement',
        },
        discoveredAt: null,
        updatedAt: null,
      }],
      ...overrides,
    }), 'utf8');
    return bundlePath;
  }

  it('cleans mojibake in imported bundle display fields and raw snapshots', () => {
    const bundlePath = writeBundle('bundle.json');

    const bundle = readSourceCatalogBundle(bundlePath);
    expect(bundle.records[0]).toMatchObject({
      caseName: 'Trader Joe\u2019s - Receipts Class Action Settlement',
      defendant: 'Trader Joe\u2019s',
      defendantAliases: ['Trader Joe\u2019s Stores'],
      classDefinition: 'If you purchased Trader Joe\u2019s items, you may be included.',
      payoutEstimate: '$5 \u2013 $10',
      rawJson: {
        caseName: 'Trader Joe\u2019s - Receipts Class Action Settlement',
      },
    });
  });

  it('accepts a bundle when the digest sidecar matches the file contents', () => {
    const bundlePath = writeBundle('bundle-with-digest.json');
    const content = fs.readFileSync(bundlePath, 'utf8');
    fs.writeFileSync(sourceCatalogDigestPath(bundlePath), `${sourceCatalogContentDigest(content)}  bundle-with-digest.json\n`, 'utf8');

    const bundle = readSourceCatalogBundle(bundlePath);

    expect(bundle.recordCount).toBe(1);
    expect(bundle.records[0]?.canonicalKey).toBe('abc123');
    expect(bundle.sha256Digest).toBe(sourceCatalogContentDigest(content));
  });

  it('rejects a bundle when the digest sidecar no longer matches', () => {
    const bundlePath = writeBundle('tampered-bundle.json');
    const content = fs.readFileSync(bundlePath, 'utf8');
    fs.writeFileSync(sourceCatalogDigestPath(bundlePath), `${sourceCatalogContentDigest(content)}  tampered-bundle.json\n`, 'utf8');
    fs.appendFileSync(bundlePath, '\n', 'utf8');

    expect(() => readSourceCatalogBundle(bundlePath)).toThrow(/digest mismatch/i);
  });
});

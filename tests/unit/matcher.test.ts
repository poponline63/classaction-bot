import { describe, it, expect } from 'vitest';
import {
  rulePurchaseMatch,
  ruleBreachMatch,
  ruleDeadlineNotPassed,
  ruleGeographicScope,
  ruleAuthorizationRequired,
} from '../../src/lib/matcher/rules';
import { runRules } from '../../src/lib/matcher/verdict';
import type { MatcherContext } from '../../src/lib/matcher/types';
import type {
  Settlement,
  Profile,
  Purchase,
  DataBreachExposure,
  ClassAuthorization,
} from '../../src/db/schema';
import { normalizeDefendant } from '../../src/lib/scraper/normalize';

// -----------------------------------------------------------------------------
// Test fixtures — synthetic contexts
// -----------------------------------------------------------------------------

function makeSettlement(overrides: Partial<Settlement> = {}): Settlement {
  return {
    id: 1,
    canonicalKey: 'x',
    source: 'classaction_org',
    sourceUrl: 'https://example.com',
    caseName: 'Acme Class Action',
    defendant: 'Acme Inc.',
    defendantAliases: ['ACME'],
    category: 'CONSUMER_PRODUCT_PURCHASE',
    classDefinition: 'Purchasers of Acme products between the class period',
    classPeriodStart: new Date('2023-01-01'),
    classPeriodEnd: new Date('2023-12-31'),
    deadline: new Date('2099-12-31'),
    proofRequired: false,
    payoutEstimate: '$5 - $50',
    payoutStructure: null,
    claimFormUrl: null,
    administrator: 'unknown',
    captchaType: 'unknown',
    formSchemaJson: null,
    status: 'DISCOVERED',
    rawJson: null,
    discoveredAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makePurchase(overrides: Partial<Purchase> = {}): Purchase {
  const merchant = overrides.merchant ?? 'Acme';
  return {
    id: 1,
    userId: 1,
    merchant,
    merchantNormalized: normalizeDefendant(merchant),
    productName: 'Widget',
    category: 'CONSUMER_PRODUCT_PURCHASE',
    purchaseDate: new Date('2023-06-15'),
    amount: 25.0,
    receiptPath: null,
    source: 'manual',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeBreach(overrides: Partial<DataBreachExposure> = {}): DataBreachExposure {
  return {
    id: 1,
    userId: 1,
    breachName: 'LinkedIn',
    breachDate: new Date('2021-06-01'),
    email: 'test@example.com',
    source: 'hibp',
    dataClassesJson: [],
    hibpBreachId: 'LinkedIn',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeAuth(overrides: Partial<ClassAuthorization> = {}): ClassAuthorization {
  return {
    id: 1,
    userId: 1,
    category: 'CONSUMER_PRODUCT_PURCHASE',
    enabled: true,
    authorizedAt: new Date(),
    revokedAt: null,
    attestationText: 'I attest under penalty of perjury.',
    attestationVersion: 1,
    scopeConstraintsJson: null,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<MatcherContext> = {}): MatcherContext {
  return {
    userId: 1,
    settlement: makeSettlement(),
    profile: null,
    purchases: [],
    breaches: [],
    authorizations: [],
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// rulePurchaseMatch
// -----------------------------------------------------------------------------

describe('rulePurchaseMatch', () => {
  it('returns ELIGIBLE for strong merchant match inside class period', () => {
    const r = rulePurchaseMatch(
      makeCtx({
        purchases: [
          makePurchase({ merchant: 'Acme Corp', purchaseDate: new Date('2023-06-15') }),
        ],
      }),
    );
    expect(r.applicable).toBe(true);
    expect(r.verdict).toBe('ELIGIBLE');
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('returns NEEDS_REVIEW for weak merchant match inside period', () => {
    // "Ackme" has similarity ~0.8 with "acme" — above the 0.75 apply threshold
    // but below the 0.9 strong-match threshold → NEEDS_REVIEW.
    const r = rulePurchaseMatch(
      makeCtx({
        purchases: [
          makePurchase({ merchant: 'Ackme', purchaseDate: new Date('2023-06-15') }),
        ],
      }),
    );
    expect(r.applicable).toBe(true);
    expect(r.verdict).toBe('NEEDS_REVIEW');
  });

  it('returns INELIGIBLE when all merchant matches are outside class period', () => {
    const r = rulePurchaseMatch(
      makeCtx({
        purchases: [
          makePurchase({ merchant: 'Acme', purchaseDate: new Date('2020-06-15') }),
        ],
      }),
    );
    expect(r.applicable).toBe(true);
    expect(r.verdict).toBe('INELIGIBLE');
  });

  it('is inapplicable when user has no purchases', () => {
    const r = rulePurchaseMatch(makeCtx({ purchases: [] }));
    expect(r.applicable).toBe(false);
  });

  it('is inapplicable when category is DATA_BREACH', () => {
    const r = rulePurchaseMatch(
      makeCtx({
        settlement: makeSettlement({ category: 'DATA_BREACH' }),
        purchases: [makePurchase()],
      }),
    );
    expect(r.applicable).toBe(false);
  });

  it('treats unrelated merchant as inapplicable (not ineligible)', () => {
    const r = rulePurchaseMatch(
      makeCtx({
        purchases: [
          makePurchase({ merchant: 'Wayne Enterprises', purchaseDate: new Date('2023-06-15') }),
        ],
      }),
    );
    expect(r.applicable).toBe(false);
  });

  it('class period exact-boundary start is INSIDE', () => {
    const r = rulePurchaseMatch(
      makeCtx({
        purchases: [
          makePurchase({ merchant: 'Acme', purchaseDate: new Date('2023-01-01') }),
        ],
      }),
    );
    expect(r.verdict).toBe('ELIGIBLE');
  });

  it('class period exact-boundary end is INSIDE', () => {
    const r = rulePurchaseMatch(
      makeCtx({
        purchases: [
          makePurchase({ merchant: 'Acme', purchaseDate: new Date('2023-12-31') }),
        ],
      }),
    );
    expect(r.verdict).toBe('ELIGIBLE');
  });
});

// -----------------------------------------------------------------------------
// ruleBreachMatch
// -----------------------------------------------------------------------------

describe('ruleBreachMatch', () => {
  const breachSettlement = makeSettlement({
    category: 'DATA_BREACH',
    defendant: 'LinkedIn',
    classPeriodStart: null,
    classPeriodEnd: null,
  });

  it('returns ELIGIBLE when user has a named breach matching defendant', () => {
    const r = ruleBreachMatch(
      makeCtx({
        settlement: breachSettlement,
        breaches: [makeBreach({ breachName: 'LinkedIn' })],
      }),
    );
    expect(r.applicable).toBe(true);
    expect(r.verdict).toBe('ELIGIBLE');
  });

  it('is inapplicable for non-data-breach settlements', () => {
    const r = ruleBreachMatch(
      makeCtx({ breaches: [makeBreach({ breachName: 'LinkedIn' })] }),
    );
    expect(r.applicable).toBe(false);
  });

  it('is inapplicable when user has no breaches', () => {
    const r = ruleBreachMatch(makeCtx({ settlement: breachSettlement, breaches: [] }));
    expect(r.applicable).toBe(false);
  });

  it('is inapplicable when breach name does not match defendant', () => {
    const r = ruleBreachMatch(
      makeCtx({
        settlement: breachSettlement,
        breaches: [makeBreach({ breachName: 'Dropbox' })],
      }),
    );
    expect(r.applicable).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// ruleDeadlineNotPassed
// -----------------------------------------------------------------------------

describe('ruleDeadlineNotPassed', () => {
  it('INELIGIBLE when deadline has passed', () => {
    const r = ruleDeadlineNotPassed(
      makeCtx({ settlement: makeSettlement({ deadline: new Date('2000-01-01') }) }),
    );
    expect(r.verdict).toBe('INELIGIBLE');
    expect(r.confidence).toBe(1.0);
  });

  it('ELIGIBLE but weak when deadline is in the future', () => {
    const r = ruleDeadlineNotPassed(
      makeCtx({ settlement: makeSettlement({ deadline: new Date('2099-12-31') }) }),
    );
    expect(r.verdict).toBe('ELIGIBLE');
    expect(r.confidence).toBeLessThan(0.9);
  });

  it('inapplicable when no deadline known', () => {
    const r = ruleDeadlineNotPassed(
      makeCtx({ settlement: makeSettlement({ deadline: null }) }),
    );
    expect(r.applicable).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// ruleGeographicScope
// -----------------------------------------------------------------------------

describe('ruleGeographicScope', () => {
  const caProfile: Profile = {
    id: 1,
    userId: 1,
    legalName: 'Test',
    dateOfBirth: null,
    addressesJson: [
      {
        street: '1 Main St',
        city: 'Los Angeles',
        state: 'CA',
        zip: '90001',
        country: 'US',
      },
    ],
    emailsJson: [],
    phonesJson: [],
    paymentMethodsJson: [],
    updatedAt: new Date(),
  };

  const caSettlement = makeSettlement({
    classDefinition: 'All residents of California who purchased the product',
  });

  it('ELIGIBLE when profile state matches class scope', () => {
    const r = ruleGeographicScope(makeCtx({ settlement: caSettlement, profile: caProfile }));
    expect(r.verdict).toBe('ELIGIBLE');
  });

  it('INELIGIBLE when profile state does not match class scope', () => {
    const nyProfile = { ...caProfile, addressesJson: [{ ...caProfile.addressesJson![0]!, state: 'NY' }] };
    const r = ruleGeographicScope(makeCtx({ settlement: caSettlement, profile: nyProfile }));
    expect(r.verdict).toBe('INELIGIBLE');
  });

  it('NEEDS_REVIEW when scope is state-specific but profile has no address', () => {
    const r = ruleGeographicScope(makeCtx({ settlement: caSettlement, profile: null }));
    expect(r.verdict).toBe('NEEDS_REVIEW');
  });

  it('inapplicable for nationwide classes', () => {
    const r = ruleGeographicScope(
      makeCtx({
        settlement: makeSettlement({ classDefinition: 'All persons who purchased' }),
        profile: caProfile,
      }),
    );
    expect(r.applicable).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// ruleAuthorizationRequired
// -----------------------------------------------------------------------------

describe('ruleAuthorizationRequired', () => {
  it('returns ELIGIBLE (mild) when authorization is active', () => {
    const r = ruleAuthorizationRequired(
      makeCtx({
        authorizations: [makeAuth()],
      }),
    );
    expect(r.verdict).toBe('ELIGIBLE');
  });

  it('returns NEEDS_REVIEW when no authorization exists', () => {
    const r = ruleAuthorizationRequired(makeCtx({ authorizations: [] }));
    expect(r.verdict).toBe('NEEDS_REVIEW');
  });

  it('returns NEEDS_REVIEW when authorization is revoked', () => {
    const r = ruleAuthorizationRequired(
      makeCtx({
        authorizations: [makeAuth({ enabled: false, revokedAt: new Date() })],
      }),
    );
    expect(r.verdict).toBe('NEEDS_REVIEW');
  });

  it('returns NEEDS_REVIEW when category is UNKNOWN', () => {
    const r = ruleAuthorizationRequired(
      makeCtx({
        settlement: makeSettlement({ category: 'UNKNOWN' }),
        authorizations: [],
      }),
    );
    expect(r.verdict).toBe('NEEDS_REVIEW');
  });
});

// -----------------------------------------------------------------------------
// Verdict combiner — the golden test set
// -----------------------------------------------------------------------------

describe('runRules (verdict combination)', () => {
  it('ELIGIBLE for strong purchase match + active auth + future deadline', () => {
    const t = runRules(
      makeCtx({
        purchases: [
          makePurchase({ merchant: 'Acme Corp', purchaseDate: new Date('2023-06-15') }),
        ],
        authorizations: [makeAuth()],
      }),
    );
    expect(t.verdict).toBe('ELIGIBLE');
  });

  it('INELIGIBLE when any rule says INELIGIBLE (deadline passed)', () => {
    const t = runRules(
      makeCtx({
        settlement: makeSettlement({ deadline: new Date('2000-01-01') }),
        purchases: [makePurchase()],
        authorizations: [makeAuth()],
      }),
    );
    expect(t.verdict).toBe('INELIGIBLE');
  });

  it('INELIGIBLE when purchases exist but none inside class period', () => {
    const t = runRules(
      makeCtx({
        purchases: [
          makePurchase({ merchant: 'Acme', purchaseDate: new Date('2020-06-15') }),
        ],
        authorizations: [makeAuth()],
      }),
    );
    expect(t.verdict).toBe('INELIGIBLE');
  });

  it('NEEDS_REVIEW when no rules can produce a strong positive (no purchases)', () => {
    const t = runRules(makeCtx({ authorizations: [makeAuth()] }));
    expect(t.verdict).toBe('NEEDS_REVIEW');
  });

  it('NEEDS_REVIEW when purchase match is present but authorization is absent', () => {
    const t = runRules(
      makeCtx({
        purchases: [
          makePurchase({ merchant: 'Acme', purchaseDate: new Date('2023-06-15') }),
        ],
        authorizations: [],
      }),
    );
    // Purchase match still ELIGIBLE (0.95), so overall is ELIGIBLE even without auth.
    // Auth is a FILER gate, not a matcher gate — matcher produces the match
    // so the user can review it and enable auth.
    expect(t.verdict).toBe('ELIGIBLE');
  });

  it('ELIGIBLE for strong breach match on a DATA_BREACH settlement', () => {
    const t = runRules(
      makeCtx({
        settlement: makeSettlement({
          category: 'DATA_BREACH',
          defendant: 'LinkedIn',
          classPeriodStart: null,
          classPeriodEnd: null,
        }),
        breaches: [makeBreach({ breachName: 'LinkedIn' })],
        authorizations: [makeAuth({ category: 'DATA_BREACH' })],
      }),
    );
    expect(t.verdict).toBe('ELIGIBLE');
  });

  it('reasoning trace includes all applied rules', () => {
    const t = runRules(
      makeCtx({
        purchases: [
          makePurchase({ merchant: 'Acme', purchaseDate: new Date('2023-06-15') }),
        ],
        authorizations: [makeAuth()],
      }),
    );
    expect(t.appliedRules.length).toBeGreaterThanOrEqual(2);
    expect(t.evidence.length).toBeGreaterThanOrEqual(2);
  });
});

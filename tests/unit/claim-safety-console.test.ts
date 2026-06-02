import { describe, expect, it } from 'vitest';
import { buildClaimSafetyConsole } from '../../src/lib/claim-filer/claim-safety-console';

describe('buildClaimSafetyConsole', () => {
  it('summarizes a safe shadow claim with aligned gates', () => {
    const items = buildClaimSafetyConsole({
      filingMode: 'shadow',
      automationEntitlementActive: true,
      subscriptionPlan: 'pro',
      subscriptionStatus: 'active',
      authorizationActive: true,
      authorizedAt: new Date('2026-05-01T12:00:00Z'),
      proofRequired: false,
      claimFormUrl: 'https://example.com/claim',
      matcherVerdict: 'ELIGIBLE',
      matcherConfidence: 0.91,
      capturedArtifacts: 2,
      totalArtifacts: 4,
      auditEventCount: 3,
    });

    expect(items.map((item) => item.label)).toEqual([
      'Run mode',
      'Plan gate',
      'Permission lock',
      'Gate status',
      'Evidence seal',
    ]);
    expect(items.find((item) => item.key === 'run-mode')).toMatchObject({
      value: 'Shadow',
      tone: 'pass',
    });
    expect(items.find((item) => item.key === 'plan-gate')).toMatchObject({
      value: 'Unlocked',
      tone: 'pass',
    });
    expect(items.find((item) => item.key === 'gate-status')).toMatchObject({
      value: 'Ready',
      tone: 'pass',
    });
    expect(items.find((item) => item.key === 'evidence-seal')?.detail).toContain('SHA-256 digest');
  });

  it('warns when live mode or claim gates need review', () => {
    const items = buildClaimSafetyConsole({
      filingMode: 'live',
      automationEntitlementActive: false,
      subscriptionPlan: 'plus',
      subscriptionStatus: 'active',
      authorizationActive: false,
      proofRequired: true,
      claimFormUrl: null,
      matcherVerdict: 'NEEDS_REVIEW',
      matcherConfidence: 0.42,
      capturedArtifacts: 0,
      totalArtifacts: 4,
      auditEventCount: 1,
    });

    expect(items.find((item) => item.key === 'run-mode')).toMatchObject({
      value: 'Live',
      tone: 'warn',
    });
    expect(items.find((item) => item.key === 'operator-lock')).toMatchObject({
      value: 'Blocked',
      tone: 'fail',
    });
    expect(items.find((item) => item.key === 'plan-gate')).toMatchObject({
      value: 'Locked',
      tone: 'warn',
    });
    expect(items.find((item) => item.key === 'gate-status')).toMatchObject({
      value: 'Review',
      tone: 'warn',
    });
  });
});

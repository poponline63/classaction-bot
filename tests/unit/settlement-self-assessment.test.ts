import { describe, expect, it } from 'vitest';
import { buildSettlementSelfAssessment } from '../../src/lib/claim-filer/settlement-self-assessment';

describe('buildSettlementSelfAssessment', () => {
  it('flags eligible no-proof claims with form and authorization as mostly ready', () => {
    const items = buildSettlementSelfAssessment({
      classDefinition: 'All persons who bought Example product during the class period.',
      classPeriodStart: new Date('2024-01-01T00:00:00.000Z'),
      classPeriodEnd: new Date('2024-12-31T00:00:00.000Z'),
      deadline: new Date('2099-01-01T00:00:00.000Z'),
      proofRequired: false,
      claimFormUrl: 'https://example.com/claim',
      matchVerdict: 'ELIGIBLE',
      matchConfidence: 0.94,
      authorizationActive: true,
      automationEntitlementActive: true,
    });

    expect(items.find((item) => item.key === 'saved-facts')?.status).toBe('pass');
    expect(items.find((item) => item.key === 'proof')?.status).toBe('pass');
    expect(items.find((item) => item.key === 'deadline-form')?.status).toBe('pass');
    expect(items.find((item) => item.key === 'automation-plan')?.status).toBe('pass');
    expect(items.find((item) => item.key === 'authorization')?.status).toBe('pass');
  });

  it('hard-fails expired or formless settlements and warns on proof, plan, or missing authorization', () => {
    const items = buildSettlementSelfAssessment({
      classDefinition: 'All persons who bought Example product during the class period.',
      deadline: new Date('2000-01-01T00:00:00.000Z'),
      proofRequired: true,
      matchVerdict: 'NEEDS_REVIEW',
      authorizationActive: false,
      automationEntitlementActive: false,
    });

    expect(items.find((item) => item.key === 'saved-facts')?.status).toBe('warn');
    expect(items.find((item) => item.key === 'proof')?.status).toBe('warn');
    expect(items.find((item) => item.key === 'deadline-form')?.status).toBe('fail');
    expect(items.find((item) => item.key === 'automation-plan')?.status).toBe('warn');
    expect(items.find((item) => item.key === 'authorization')?.status).toBe('warn');
  });
});

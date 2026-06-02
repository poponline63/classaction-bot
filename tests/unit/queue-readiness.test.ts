import { describe, expect, it } from 'vitest';
import { evaluateQueueReadiness } from '../../src/lib/claim-filer/queue-readiness';

describe('evaluateQueueReadiness', () => {
  it('allows eligible authorized matches with a claim form and no proof requirement', () => {
    const result = evaluateQueueReadiness({
      verdict: 'ELIGIBLE',
      proofRequired: false,
      claimFormUrl: 'https://example.com/claim',
      hasActiveAuthorization: true,
      hasAutomationEntitlement: true,
    });

    expect(result.canQueue).toBe(true);
    expect(result.status).toBe('ready');
  });

  it('blocks existing claims from being queued again', () => {
    const result = evaluateQueueReadiness({
      verdict: 'ELIGIBLE',
      proofRequired: false,
      claimFormUrl: 'https://example.com/claim',
      hasActiveAuthorization: true,
      hasAutomationEntitlement: true,
      existingClaimId: 12,
    });

    expect(result.canQueue).toBe(false);
    expect(result.status).toBe('queued');
  });

  it('keeps proof-required matches in review', () => {
    const result = evaluateQueueReadiness({
      verdict: 'ELIGIBLE',
      proofRequired: true,
      claimFormUrl: 'https://example.com/claim',
      hasActiveAuthorization: true,
      hasAutomationEntitlement: true,
    });

    expect(result.canQueue).toBe(false);
    expect(result.label).toBe('Proof required');
  });

  it('blocks matches without active authorization', () => {
    const result = evaluateQueueReadiness({
      verdict: 'ELIGIBLE',
      proofRequired: false,
      claimFormUrl: 'https://example.com/claim',
      hasActiveAuthorization: false,
      hasAutomationEntitlement: true,
    });

    expect(result.canQueue).toBe(false);
    expect(result.label).toBe('Permission needed');
  });

  it('blocks matches without a claim form URL', () => {
    const result = evaluateQueueReadiness({
      verdict: 'ELIGIBLE',
      proofRequired: false,
      hasActiveAuthorization: true,
      hasAutomationEntitlement: true,
    });

    expect(result.canQueue).toBe(false);
    expect(result.label).toBe('No claim form');
  });

  it('blocks automatic queueing when the user is not on a paid automation plan', () => {
    const result = evaluateQueueReadiness({
      verdict: 'ELIGIBLE',
      proofRequired: false,
      claimFormUrl: 'https://example.com/claim',
      hasActiveAuthorization: true,
      hasAutomationEntitlement: false,
    });

    expect(result.canQueue).toBe(false);
    expect(result.label).toBe('Automation plan needed');
    expect(result.status).toBe('blocked');
  });
});

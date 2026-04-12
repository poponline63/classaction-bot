// Combine the output of all rules into a single verdict + reasoning trace.
//
// Policy:
//   1. Any INELIGIBLE wins. No positive rule can override a hard negative.
//   2. For ELIGIBLE: require at least one rule with confidence >= 0.9
//      AND no INELIGIBLE rules.
//   3. Otherwise: NEEDS_REVIEW.
//
// Rationale: false ELIGIBLE is the worst outcome (files a claim we can't
// back up). False NEEDS_REVIEW is fine — the review queue handles it.

import { ALL_RULES } from './rules';
import type { MatcherContext, ReasoningTrace, RuleEvidence } from './types';
import type { Verdict } from '@db/schema';

export function runRules(ctx: MatcherContext): ReasoningTrace {
  const evidence: RuleEvidence[] = [];
  const appliedRules: string[] = [];

  for (const rule of ALL_RULES) {
    const r = rule(ctx);
    if (!r.applicable) continue;
    appliedRules.push(r.ruleName);
    evidence.push({
      ruleName: r.ruleName,
      verdict: r.verdict ?? 'NEEDS_REVIEW',
      confidence: r.confidence ?? 0,
      reason: r.reason ?? '',
      fields: r.fields,
    });
  }

  // Any INELIGIBLE wins
  const ineligible = evidence.find((e) => e.verdict === 'INELIGIBLE');
  if (ineligible) {
    return {
      verdict: 'INELIGIBLE',
      confidence: ineligible.confidence,
      evidence,
      appliedRules,
      requiredCategory: ctx.settlement.category === 'UNKNOWN' ? null : ctx.settlement.category,
    };
  }

  // Need at least one strong positive
  const strongPositive = evidence.find(
    (e) => e.verdict === 'ELIGIBLE' && e.confidence >= 0.9,
  );

  let verdict: Verdict;
  let confidence: number;
  if (strongPositive) {
    verdict = 'ELIGIBLE';
    // Confidence = max positive rule confidence
    confidence = Math.max(
      ...evidence.filter((e) => e.verdict === 'ELIGIBLE').map((e) => e.confidence),
    );
  } else if (evidence.length === 0) {
    // No rules even fired — we have no basis to say yes or no.
    verdict = 'NEEDS_REVIEW';
    confidence = 0;
  } else {
    verdict = 'NEEDS_REVIEW';
    confidence = Math.max(...evidence.map((e) => e.confidence));
  }

  return {
    verdict,
    confidence,
    evidence,
    appliedRules,
    requiredCategory: ctx.settlement.category === 'UNKNOWN' ? null : ctx.settlement.category,
  };
}

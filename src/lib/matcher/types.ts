// Types shared by the matcher rules engine and the verdict combiner.
//
// Rules are PURE functions. They take a MatcherContext and return a RuleResult.
// No DB access, no side effects — that keeps them trivially unit-testable.

import type {
  Settlement,
  Profile,
  Purchase,
  DataBreachExposure,
  ClassAuthorization,
  Verdict,
  SettlementCategory,
} from '@db/schema';

export interface MatcherContext {
  userId: number;
  settlement: Settlement;
  profile: Profile | null;
  purchases: Purchase[];
  breaches: DataBreachExposure[];
  authorizations: ClassAuthorization[];
}

export interface RuleEvidence {
  ruleName: string;
  verdict: Verdict;
  confidence: number;          // 0..1
  reason: string;              // human-readable
  fields?: Record<string, unknown>; // what the rule matched on
}

export interface RuleResult {
  ruleName: string;
  // If a rule doesn't apply at all (e.g. a breach rule against a TCPA case),
  // it returns `applicable: false` and is ignored by the verdict combiner.
  applicable: boolean;
  verdict?: Verdict;
  confidence?: number;
  reason?: string;
  fields?: Record<string, unknown>;
}

export type Rule = (ctx: MatcherContext) => RuleResult;

// The full output written to matches.reasoningJson.
export interface ReasoningTrace {
  verdict: Verdict;
  confidence: number;
  evidence: RuleEvidence[];
  appliedRules: string[];
  requiredCategory: SettlementCategory | null;
}

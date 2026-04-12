// Eligibility rules. Each rule is a pure function; they are combined into a
// single verdict by src/lib/matcher/verdict.ts.
//
// Design principles:
//   1. A rule NEVER returns ELIGIBLE by itself unless it has strong positive
//      evidence. Weak signals return NEEDS_REVIEW.
//   2. Any INELIGIBLE verdict wins — see verdict.ts.
//   3. Rules must be PURE. No DB calls. No network. No time.now() tricks that
//      aren't testable — pass dates in via the context.
//   4. Every rule records exactly what it matched on so the /review page can
//      show a human-readable trace.

import { normalizeDefendant, similarity } from '@lib/scraper/normalize';
import type { MatcherContext, Rule, RuleResult } from './types';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function inDateRange(
  when: Date | null | undefined,
  start: Date | null | undefined,
  end: Date | null | undefined,
): boolean {
  if (!when) return false;
  const t = when.getTime();
  if (start && t < start.getTime()) return false;
  if (end && t > end.getTime()) return false;
  return true;
}

function ms(d: Date | null | undefined): number | null {
  return d ? d.getTime() : null;
}

// Alias set for a defendant: normalized name + normalized aliases.
// Also splits comma/slash-separated defendants into individual names,
// so "Hyundai, Kia" generates aliases for both "hyundai" and "kia".
function defendantAliasSet(settlementDefendant: string, aliases: string[]): Set<string> {
  const out = new Set<string>();
  const n = normalizeDefendant(settlementDefendant);
  if (n) out.add(n);

  // Split on comma, slash, " and ", " & " to handle multi-brand defendants
  const parts = settlementDefendant.split(/[,/]|\band\b|&/i);
  for (const part of parts) {
    const np = normalizeDefendant(part.trim());
    if (np && np.length >= 2) out.add(np);
  }

  for (const a of aliases ?? []) {
    const na = normalizeDefendant(a);
    if (na) out.add(na);
  }
  return out;
}

// Return the best merchant-match strength between an alias and a normalized
// purchase merchant. We combine exact similarity with a substring containment
// bonus — class-action case titles often embed a product name ("RevitaLash
// Serum") while the user enters just the brand ("RevitaLash"), so pure edit
// distance under-reports the real match quality.
function merchantMatchStrength(alias: string, merchant: string): number {
  if (!alias || !merchant) return 0;
  const sim = similarity(alias, merchant);
  // Containment bonus: if either side fully contains the other as a word,
  // treat that as a near-perfect match. Require at least 3 chars to avoid
  // matching "a" inside "Walmart".
  if (alias.length >= 3 && merchant.length >= 3) {
    if (alias.includes(merchant) || merchant.includes(alias)) {
      return Math.max(sim, 0.92);
    }
    // Word-boundary containment: one is a substring bounded by whitespace
    // in the other. E.g., "revitalash" in "revitalash serum".
    const aWords = alias.split(/\s+/);
    const mWords = merchant.split(/\s+/);
    if (aWords.some((w) => w.length >= 3 && mWords.includes(w))) {
      return Math.max(sim, 0.9);
    }
  }
  return sim;
}

// -----------------------------------------------------------------------------
// Rule: purchase match within class period
// -----------------------------------------------------------------------------
// For CONSUMER_PRODUCT_PURCHASE, SUBSCRIPTION_SERVICE, DECEPTIVE_ADVERTISING,
// and AUTO_DEFECT: find any user purchase whose merchant matches the
// defendant AND whose purchase date falls inside the class period.
//
// Strong match (similarity >= 0.9, inside period) → ELIGIBLE at 0.95
// Weak match (similarity 0.75..0.9, inside period) → NEEDS_REVIEW at 0.6
// No period info but merchant matches strongly → NEEDS_REVIEW at 0.55
// Period exists + purchases exist but NONE inside → INELIGIBLE at 0.9

export const rulePurchaseMatch: Rule = (ctx: MatcherContext): RuleResult => {
  const name = 'rulePurchaseMatch';
  const s = ctx.settlement;

  const applicableCats = new Set([
    'CONSUMER_PRODUCT_PURCHASE',
    'SUBSCRIPTION_SERVICE',
    'DECEPTIVE_ADVERTISING',
    'AUTO_DEFECT',
  ]);
  if (!applicableCats.has(s.category)) {
    return { ruleName: name, applicable: false };
  }
  if (ctx.purchases.length === 0) {
    return { ruleName: name, applicable: false };
  }

  const aliasSet = defendantAliasSet(s.defendant, s.defendantAliases ?? []);
  if (aliasSet.size === 0) {
    return { ruleName: name, applicable: false };
  }

  // Find all purchases whose merchant similarity hits at least one alias.
  // Record the best (strength, inPeriod) tuple.
  let best: {
    sim: number;
    inPeriod: boolean;
    purchaseId: number;
    matchedAlias: string;
  } | null = null;

  for (const p of ctx.purchases) {
    const pMerchant = p.merchantNormalized || normalizeDefendant(p.merchant);
    if (!pMerchant) continue;

    let localBest = 0;
    let localAlias = '';
    for (const alias of aliasSet) {
      const sim = merchantMatchStrength(alias, pMerchant);
      if (sim > localBest) {
        localBest = sim;
        localAlias = alias;
      }
    }
    if (localBest < 0.75) continue;

    const inPeriod = inDateRange(p.purchaseDate, s.classPeriodStart, s.classPeriodEnd);
    const cand = { sim: localBest, inPeriod, purchaseId: p.id, matchedAlias: localAlias };

    if (
      !best ||
      cand.sim > best.sim ||
      (cand.sim === best.sim && cand.inPeriod && !best.inPeriod)
    ) {
      best = cand;
    }
  }

  if (!best) {
    // Purchases exist but none even resemble the defendant.
    // That's "doesn't apply", not "ineligible" — user might shop elsewhere.
    return { ruleName: name, applicable: false };
  }

  // We have at least a weak merchant match. Now decide based on period.
  const hasPeriod = !!(s.classPeriodStart || s.classPeriodEnd);
  const fields = {
    purchaseId: best.purchaseId,
    matchedAlias: best.matchedAlias,
    similarity: Number(best.sim.toFixed(3)),
    inClassPeriod: best.inPeriod,
    classPeriodStart: ms(s.classPeriodStart),
    classPeriodEnd: ms(s.classPeriodEnd),
  };

  if (hasPeriod && !best.inPeriod) {
    // Was the class period defined AND we have at least one purchase of that
    // merchant AND none fell inside? Then we know this user purchased the
    // product outside the window — INELIGIBLE.
    const anyInPeriod = ctx.purchases.some((p) => {
      const pm = p.merchantNormalized || '';
      const hit = [...aliasSet].some((a) => merchantMatchStrength(a, pm) >= 0.75);
      return hit && inDateRange(p.purchaseDate, s.classPeriodStart, s.classPeriodEnd);
    });
    if (!anyInPeriod) {
      return {
        ruleName: name,
        applicable: true,
        verdict: 'INELIGIBLE',
        confidence: 0.9,
        reason: 'All matching purchases fall outside the class period',
        fields,
      };
    }
  }

  if (best.sim >= 0.9 && best.inPeriod) {
    return {
      ruleName: name,
      applicable: true,
      verdict: 'ELIGIBLE',
      confidence: 0.95,
      reason: 'Strong merchant match AND purchase inside class period',
      fields,
    };
  }

  if (best.sim >= 0.9 && !hasPeriod) {
    return {
      ruleName: name,
      applicable: true,
      verdict: 'NEEDS_REVIEW',
      confidence: 0.55,
      reason: 'Strong merchant match but no class period on record',
      fields,
    };
  }

  if (best.sim >= 0.75 && best.inPeriod) {
    return {
      ruleName: name,
      applicable: true,
      verdict: 'NEEDS_REVIEW',
      confidence: 0.6,
      reason: 'Weak merchant match inside class period',
      fields,
    };
  }

  return {
    ruleName: name,
    applicable: true,
    verdict: 'NEEDS_REVIEW',
    confidence: 0.4,
    reason: 'Ambiguous merchant/period signal',
    fields,
  };
};

// -----------------------------------------------------------------------------
// Rule: breach match
// -----------------------------------------------------------------------------
// For DATA_BREACH settlements: does the settlement name / defendant appear as
// (or share an alias with) a breach the user was exposed in?

export const ruleBreachMatch: Rule = (ctx: MatcherContext): RuleResult => {
  const name = 'ruleBreachMatch';
  const s = ctx.settlement;

  if (s.category !== 'DATA_BREACH') {
    return { ruleName: name, applicable: false };
  }
  if (ctx.breaches.length === 0) {
    return { ruleName: name, applicable: false };
  }

  const aliasSet = defendantAliasSet(s.defendant, s.defendantAliases ?? []);
  if (aliasSet.size === 0) {
    return { ruleName: name, applicable: false };
  }

  let best: { sim: number; breachId: number; breachName: string; email: string } | null = null;
  for (const b of ctx.breaches) {
    const normalized = normalizeDefendant(b.breachName);
    if (!normalized) continue;
    let localBest = 0;
    for (const alias of aliasSet) {
      const sim = similarity(alias, normalized);
      if (sim > localBest) localBest = sim;
    }
    if (localBest < 0.75) continue;
    const cand = { sim: localBest, breachId: b.id, breachName: b.breachName, email: b.email };
    if (!best || cand.sim > best.sim) best = cand;
  }

  if (!best) return { ruleName: name, applicable: false };

  const fields = {
    breachId: best.breachId,
    breachName: best.breachName,
    exposedEmail: best.email,
    similarity: Number(best.sim.toFixed(3)),
  };

  if (best.sim >= 0.9) {
    return {
      ruleName: name,
      applicable: true,
      verdict: 'ELIGIBLE',
      confidence: 0.95,
      reason: 'User email exposed in named breach matching this defendant',
      fields,
    };
  }

  return {
    ruleName: name,
    applicable: true,
    verdict: 'NEEDS_REVIEW',
    confidence: 0.6,
    reason: 'Weak breach name match — verify manually',
    fields,
  };
};

// -----------------------------------------------------------------------------
// Rule: deadline not passed
// -----------------------------------------------------------------------------
// Not eligibility per se, but a hard gate: if the deadline has passed, the
// claim is INELIGIBLE by time. The gate applies only when a deadline is known.

export const ruleDeadlineNotPassed: Rule = (ctx: MatcherContext): RuleResult => {
  const name = 'ruleDeadlineNotPassed';
  const s = ctx.settlement;

  if (!s.deadline) return { ruleName: name, applicable: false };
  const now = new Date();
  if (s.deadline.getTime() < now.getTime()) {
    return {
      ruleName: name,
      applicable: true,
      verdict: 'INELIGIBLE',
      confidence: 1.0,
      reason: `Claim deadline (${s.deadline.toISOString().slice(0, 10)}) has passed`,
      fields: { deadline: ms(s.deadline) },
    };
  }
  return {
    ruleName: name,
    applicable: true,
    verdict: 'ELIGIBLE',
    confidence: 0.5, // mild positive — needs another rule to win
    reason: 'Deadline not yet passed',
    fields: { deadline: ms(s.deadline) },
  };
};

// -----------------------------------------------------------------------------
// Rule: geographic scope
// -----------------------------------------------------------------------------
// Some settlements define a state-specific class ("residents of California
// who purchased..."). Check the profile's addresses for a state match.
// For MVP we just look for US state abbreviations or names in the class
// definition text and intersect with the profile's known states.

const US_STATES: Record<string, string> = {
  AL: 'alabama', AK: 'alaska', AZ: 'arizona', AR: 'arkansas', CA: 'california',
  CO: 'colorado', CT: 'connecticut', DE: 'delaware', FL: 'florida', GA: 'georgia',
  HI: 'hawaii', ID: 'idaho', IL: 'illinois', IN: 'indiana', IA: 'iowa',
  KS: 'kansas', KY: 'kentucky', LA: 'louisiana', ME: 'maine', MD: 'maryland',
  MA: 'massachusetts', MI: 'michigan', MN: 'minnesota', MS: 'mississippi', MO: 'missouri',
  MT: 'montana', NE: 'nebraska', NV: 'nevada', NH: 'new hampshire', NJ: 'new jersey',
  NM: 'new mexico', NY: 'new york', NC: 'north carolina', ND: 'north dakota', OH: 'ohio',
  OK: 'oklahoma', OR: 'oregon', PA: 'pennsylvania', RI: 'rhode island', SC: 'south carolina',
  SD: 'south dakota', TN: 'tennessee', TX: 'texas', UT: 'utah', VT: 'vermont',
  VA: 'virginia', WA: 'washington', WV: 'west virginia', WI: 'wisconsin', WY: 'wyoming',
};

export const ruleGeographicScope: Rule = (ctx: MatcherContext): RuleResult => {
  const name = 'ruleGeographicScope';
  const s = ctx.settlement;
  const text = (s.classDefinition ?? '').toLowerCase();

  // Detect named states in the class definition
  const requiredStates: string[] = [];
  for (const [abbr, full] of Object.entries(US_STATES)) {
    const pattern = new RegExp(
      `\\b(residents of|persons in|consumers in)\\s+${full}\\b`,
      'i',
    );
    if (pattern.test(text)) requiredStates.push(abbr);
  }

  if (requiredStates.length === 0) {
    return { ruleName: name, applicable: false };
  }

  const profileAddresses = ctx.profile?.addressesJson ?? [];
  const profileStates = new Set(
    profileAddresses.map((a) => (a.state ?? '').toUpperCase()).filter((s) => s),
  );

  if (profileStates.size === 0) {
    return {
      ruleName: name,
      applicable: true,
      verdict: 'NEEDS_REVIEW',
      confidence: 0.5,
      reason: 'Settlement is state-limited but no profile addresses on record',
      fields: { requiredStates },
    };
  }

  const overlap = requiredStates.filter((r) => profileStates.has(r));
  if (overlap.length > 0) {
    return {
      ruleName: name,
      applicable: true,
      verdict: 'ELIGIBLE',
      confidence: 0.9,
      reason: `Profile address state (${overlap.join(',')}) in required class`,
      fields: { requiredStates, profileStates: [...profileStates], overlap },
    };
  }

  return {
    ruleName: name,
    applicable: true,
    verdict: 'INELIGIBLE',
    confidence: 0.9,
    reason: `Profile states (${[...profileStates].join(',')}) not in required class (${requiredStates.join(',')})`,
    fields: { requiredStates, profileStates: [...profileStates] },
  };
};

// -----------------------------------------------------------------------------
// Rule: category authorization gate
// -----------------------------------------------------------------------------
// This isn't strictly a rule about class membership — it's a gate that the
// FILER uses. Listed here so it appears in the reasoning trace when a user
// hasn't authorized a category yet. Matches are still produced for
// un-authorized categories so the user can review them and enable the
// authorization if they want.

export const ruleAuthorizationRequired: Rule = (ctx: MatcherContext): RuleResult => {
  const name = 'ruleAuthorizationRequired';
  const s = ctx.settlement;
  if (s.category === 'UNKNOWN') {
    return {
      ruleName: name,
      applicable: true,
      verdict: 'NEEDS_REVIEW',
      confidence: 0.5,
      reason: 'Settlement category is UNKNOWN — cannot be auto-filed',
      fields: {},
    };
  }
  const auth = ctx.authorizations.find(
    (a) => a.category === s.category && a.enabled && !a.revokedAt,
  );
  if (!auth) {
    return {
      ruleName: name,
      applicable: true,
      verdict: 'NEEDS_REVIEW',
      confidence: 0.5,
      reason: `No active authorization for category ${s.category} (enable on /authorizations)`,
      fields: { category: s.category },
    };
  }
  return {
    ruleName: name,
    applicable: true,
    verdict: 'ELIGIBLE',
    confidence: 0.5,
    reason: `Authorization active for ${s.category}`,
    fields: { category: s.category, authorizationId: auth.id },
  };
};

// -----------------------------------------------------------------------------
// All rules, in a stable order
// -----------------------------------------------------------------------------

export const ALL_RULES: Rule[] = [
  ruleDeadlineNotPassed,
  rulePurchaseMatch,
  ruleBreachMatch,
  ruleGeographicScope,
  ruleAuthorizationRequired,
];

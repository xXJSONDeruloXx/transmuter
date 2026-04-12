import { describe, expect, it } from 'vitest';
import { getProfile } from '~/profiles/get-profile.js';

import { builtInRules } from './built-in/index.js';
import { getRuleWeights } from './get-rule-weights.js';
import { RuleRegistry } from './registry.js';

/** Helper: build a RuleRegistry the same way MutationSearch does and return its effective weights. */
function registryWeights(opts: {
  profileId?: string;
  compilerCommand?: string;
  userRuleWeights?: Record<string, number>;
  userDisabledRules?: string[];
}): Record<string, number> {
  const registry = new RuleRegistry();
  registry.registerAll(builtInRules);

  const { profile } = getProfile({ profileId: opts.profileId, compilerCommand: opts.compilerCommand });
  registry.applyProfile(profile);

  if (opts.userRuleWeights) {
    registry.setWeights(opts.userRuleWeights);
  }
  if (opts.userDisabledRules) {
    for (const id of opts.userDisabledRules) {
      registry.disable(id);
    }
  }

  return registry.getAllWeights();
}

describe('getRuleWeights', () => {
  // ---------------------------------------------------------------------------
  // Basic resolution
  // ---------------------------------------------------------------------------

  it('returns all built-in rules', () => {
    const rules = getRuleWeights();
    expect(rules.length).toBe(builtInRules.length);
  });

  it('uses rule defaults when no profile or overrides', () => {
    const rules = getRuleWeights();
    const tempForExpr = rules.find((r) => r.ruleId === 'temp-for-expr')!;
    expect(tempForExpr.effectiveWeight).toBe(100);
    expect(tempForExpr.defaultWeight).toBe(100);
    expect(tempForExpr.profileWeight).toBe(100);
    expect(tempForExpr.userWeight).toBeUndefined();
    expect(tempForExpr.profileDisabled).toBe(false);
    expect(tempForExpr.userDisabled).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Profile overrides
  // ---------------------------------------------------------------------------

  it('applies profile weight overrides', () => {
    const rules = getRuleWeights({ profileId: 'agbcc' });
    const asmBarrier = rules.find((r) => r.ruleId === 'asm-barrier')!;
    expect(asmBarrier.defaultWeight).toBe(15);
    expect(asmBarrier.profileWeight).toBe(25);
    expect(asmBarrier.effectiveWeight).toBe(25);
  });

  it('marks profile-disabled rules with effectiveWeight 0', () => {
    const rules = getRuleWeights({ profileId: 'agbcc' });
    const sameline = rules.find((r) => r.ruleId === 'sameline')!;
    expect(sameline.profileDisabled).toBe(true);
    expect(sameline.profileWeight).toBe(0);
    expect(sameline.effectiveWeight).toBe(0);
  });

  it('ido disables asm rules', () => {
    const rules = getRuleWeights({ profileId: 'ido' });
    const asmBarrier = rules.find((r) => r.ruleId === 'asm-barrier')!;
    expect(asmBarrier.profileDisabled).toBe(true);
    expect(asmBarrier.effectiveWeight).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // User overrides
  // ---------------------------------------------------------------------------

  it('user weight override takes precedence over profile weight', () => {
    const rules = getRuleWeights({
      profileId: 'agbcc',
      userRuleWeights: { 'asm-barrier': 50 },
    });
    const asmBarrier = rules.find((r) => r.ruleId === 'asm-barrier')!;
    expect(asmBarrier.profileWeight).toBe(25);
    expect(asmBarrier.userWeight).toBe(50);
    expect(asmBarrier.effectiveWeight).toBe(50);
  });

  it('user can set weight to 0 (effectively disabling)', () => {
    const rules = getRuleWeights({
      profileId: 'agbcc',
      userRuleWeights: { 'pad-var-decl': 0 },
    });
    const padVarDecl = rules.find((r) => r.ruleId === 'pad-var-decl')!;
    expect(padVarDecl.userWeight).toBe(0);
    expect(padVarDecl.effectiveWeight).toBe(0);
  });

  it('user disabledRules sets effectiveWeight to 0', () => {
    const rules = getRuleWeights({
      userDisabledRules: ['temp-for-expr'],
    });
    const tempForExpr = rules.find((r) => r.ruleId === 'temp-for-expr')!;
    expect(tempForExpr.userDisabled).toBe(true);
    expect(tempForExpr.effectiveWeight).toBe(0);
    expect(tempForExpr.profileWeight).toBe(100); // profile weight is unaffected
  });

  // ---------------------------------------------------------------------------
  // Precedence edge cases
  // ---------------------------------------------------------------------------

  it('disabled always wins: user weight on profile-disabled rule still yields 0', () => {
    const rules = getRuleWeights({
      profileId: 'agbcc',
      userRuleWeights: { sameline: 10 },
    });
    const sameline = rules.find((r) => r.ruleId === 'sameline')!;
    expect(sameline.profileDisabled).toBe(true);
    expect(sameline.userWeight).toBe(10);
    expect(sameline.effectiveWeight).toBe(0);
  });

  it('user disabledRules wins over user weight override', () => {
    const rules = getRuleWeights({
      userRuleWeights: { 'temp-for-expr': 200 },
      userDisabledRules: ['temp-for-expr'],
    });
    const tempForExpr = rules.find((r) => r.ruleId === 'temp-for-expr')!;
    expect(tempForExpr.userWeight).toBe(200);
    expect(tempForExpr.userDisabled).toBe(true);
    expect(tempForExpr.effectiveWeight).toBe(0);
  });

  it('user weight with same value as profile weight is still recorded', () => {
    const rules = getRuleWeights({
      profileId: 'agbcc',
      userRuleWeights: { 'asm-barrier': 25 },
    });
    const asmBarrier = rules.find((r) => r.ruleId === 'asm-barrier')!;
    expect(asmBarrier.userWeight).toBe(25);
    expect(asmBarrier.effectiveWeight).toBe(25);
  });

  // ---------------------------------------------------------------------------
  // Consistency with RuleRegistry
  // ---------------------------------------------------------------------------

  it('matches RuleRegistry effective weights (base profile, no overrides)', () => {
    const resolved = getRuleWeights();
    const expected = registryWeights({});
    for (const rule of resolved) {
      expect(rule.effectiveWeight, `${rule.ruleId} mismatch`).toBe(expected[rule.ruleId]);
    }
  });

  it('matches RuleRegistry effective weights (agbcc profile)', () => {
    const resolved = getRuleWeights({ profileId: 'agbcc' });
    const expected = registryWeights({ profileId: 'agbcc' });
    for (const rule of resolved) {
      expect(rule.effectiveWeight, `${rule.ruleId} mismatch`).toBe(expected[rule.ruleId]);
    }
  });

  it('matches RuleRegistry effective weights (ido profile + user overrides)', () => {
    const opts = {
      profileId: 'ido' as const,
      userRuleWeights: { 'temp-for-expr': 50, 'cast-expr': 0, 'asm-barrier': 10 },
      userDisabledRules: ['commutative-swap'],
    };
    const resolved = getRuleWeights(opts);
    const expected = registryWeights(opts);
    for (const rule of resolved) {
      expect(rule.effectiveWeight, `${rule.ruleId} mismatch`).toBe(expected[rule.ruleId]);
    }
  });

  it('matches RuleRegistry effective weights (compiler detection + overrides)', () => {
    const opts = {
      compilerCommand: 'old_agbcc -O2',
      userRuleWeights: { 'pad-var-decl': 0, sameline: 10 },
      userDisabledRules: ['empty-stmt'],
    };
    const resolved = getRuleWeights(opts);
    const expected = registryWeights(opts);
    for (const rule of resolved) {
      expect(rule.effectiveWeight, `${rule.ruleId} mismatch`).toBe(expected[rule.ruleId]);
    }
  });

  // ---------------------------------------------------------------------------
  // Trace fields
  // ---------------------------------------------------------------------------

  it('includes correct description and languages', () => {
    const rules = getRuleWeights();
    const reorderStmts = rules.find((r) => r.ruleId === 'reorder-stmts')!;
    expect(reorderStmts.description).toBeTruthy();
    expect(reorderStmts.languages).toContain('c');
  });

  it('userWeight is undefined when no user override exists', () => {
    const rules = getRuleWeights({ profileId: 'agbcc' });
    for (const rule of rules) {
      expect(rule.userWeight).toBeUndefined();
    }
  });
});

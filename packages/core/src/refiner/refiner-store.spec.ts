import { describe, expect, it } from 'vitest';
import type { RuleStatsEntry } from '~/types.js';

import { RefinementStore, mergeRuleStats } from './refiner-store.js';

describe('RefinementStore', () => {
  function createStore() {
    const store = new RefinementStore({ sessionId: 'test', label: 'test' });
    store.setOriginalSource('void foo() {}');
    store.setViolations([
      {
        id: 'v-1',
        lines: { start: 5, end: 5 },
        description: 'test violation',
        originalText: 'asm("" : "=r"(x) : "0"(x));',
        status: 'pending' as const,
      },
      {
        id: 'v-2',
        lines: { start: 10, end: 10 },
        description: 'another violation',
        originalText: 'register u32 x asm("r4");',
        status: 'pending' as const,
      },
    ]);
    return store;
  }

  describe('liveProgress tracking', () => {
    it('initializes liveProgress on violation-fix-started', () => {
      const store = createStore();
      store.push({ type: 'violation-fix-started', violationId: 'v-1' });

      const violations = store.toJSON().violations;
      expect(violations[0]!.liveProgress).toEqual({ iteration: 0, score: -1 });
      expect(violations[0]!.status).toBe('exploring');
    });

    it('updates liveProgress on violation-fix-progress', () => {
      const store = createStore();
      store.push({ type: 'violation-fix-started', violationId: 'v-1' });
      store.push({ type: 'violation-fix-progress', violationId: 'v-1', iteration: 100, score: 4 });

      const violations = store.toJSON().violations;
      expect(violations[0]!.liveProgress).toEqual({ iteration: 100, score: 4 });
    });

    it('never regresses liveProgress.score to a worse value', () => {
      const store = createStore();
      store.push({ type: 'violation-fix-started', violationId: 'v-1' });

      // Score improves from base to 4
      store.push({ type: 'violation-fix-progress', violationId: 'v-1', iteration: 100, score: 4 });
      // Score improves to 3
      store.push({ type: 'violation-fix-progress', violationId: 'v-1', iteration: 200, score: 3 });
      // A stale stats event reports score 5 (the base score) — must NOT regress
      store.push({ type: 'violation-fix-progress', violationId: 'v-1', iteration: 300, score: 5 });

      const violations = store.toJSON().violations;
      // Score should stay at 3 (the best seen), iteration should advance
      expect(violations[0]!.liveProgress!.score).toBe(3);
      expect(violations[0]!.liveProgress!.iteration).toBe(300);
    });

    it('allows score to improve after a stale event', () => {
      const store = createStore();
      store.push({ type: 'violation-fix-started', violationId: 'v-1' });
      store.push({ type: 'violation-fix-progress', violationId: 'v-1', iteration: 100, score: 4 });
      // Stale event
      store.push({ type: 'violation-fix-progress', violationId: 'v-1', iteration: 200, score: 5 });
      // Real improvement
      store.push({ type: 'violation-fix-progress', violationId: 'v-1', iteration: 300, score: 2 });

      const violations = store.toJSON().violations;
      expect(violations[0]!.liveProgress!.score).toBe(2);
      expect(violations[0]!.liveProgress!.iteration).toBe(300);
    });
  });

  describe('trivially-fixed violations', () => {
    it('sets fixedSource and fixDiff immediately on trivially-fixed event', () => {
      const store = createStore();
      const fixedSource = 'void foo() { int fixed = 1; }';
      store.push({
        type: 'violation-trivially-fixed',
        violationId: 'v-1',
        fixedSource,
      });

      const violations = store.toJSON().violations;
      expect(violations[0]!.status).toBe('trivially-fixed');
      expect(violations[0]!.fixedSource).toBe(fixedSource);
      expect(violations[0]!.fixDiff).toBeDefined();
      expect(violations[0]!.fixDiff).toContain('fixed = 1');
    });
  });

  describe('violation-fixed via injection', () => {
    it('transitions violation to fixed when violation-fixed event is pushed', () => {
      const store = createStore();
      store.push({ type: 'violation-fix-started', violationId: 'v-1' });
      store.push({ type: 'violation-fix-progress', violationId: 'v-1', iteration: 100, score: 3 });
      store.push({ type: 'violation-fixed', violationId: 'v-1', iterations: 100, elapsed: 5000 });

      const violations = store.toJSON().violations;
      expect(violations[0]!.status).toBe('fixed');
      expect(violations[0]!.liveProgress).toBeUndefined();
    });

    it('only transitions the targeted violation, not others', () => {
      const store = createStore();
      store.push({ type: 'violation-fix-started', violationId: 'v-1' });
      store.push({ type: 'violation-fix-started', violationId: 'v-2' });
      store.push({ type: 'violation-fixed', violationId: 'v-1', iterations: 100, elapsed: 5000 });

      const violations = store.toJSON().violations;
      expect(violations[0]!.status).toBe('fixed');
      expect(violations[1]!.status).toBe('exploring');
    });
  });

  describe('getPendingMerges', () => {
    it('returns empty when no violations have been fixed', () => {
      const store = createStore();
      expect(store.getPendingMerges()).toEqual([]);
    });

    it('ignores violations that are still exploring', () => {
      const store = createStore();
      store.push({ type: 'violation-fix-started', violationId: 'v-1' });
      store.push({ type: 'violation-fix-progress', violationId: 'v-1', iteration: 50, score: 3 });
      expect(store.getPendingMerges()).toEqual([]);
    });

    it('ignores transmuter-exhausted and removal-failed (no fix to merge)', () => {
      const store = createStore();
      store.push({
        type: 'violation-transmuter-exhausted',
        violationId: 'v-1',
        bestScore: 4,
        iterations: 1000,
      });
      store.push({ type: 'violation-removal-failed', violationId: 'v-2', reason: 'unable to remove' });
      expect(store.getPendingMerges()).toEqual([]);
    });

    it('lists trivially-fixed violations with their fixedSource', () => {
      const store = createStore();
      store.push({
        type: 'violation-trivially-fixed',
        violationId: 'v-1',
        fixedSource: 'void foo() { /* trivially fixed */ }',
      });

      const pending = store.getPendingMerges();
      expect(pending).toHaveLength(1);
      expect(pending[0]).toEqual({
        violationId: 'v-1',
        status: 'trivially-fixed',
        fixedSource: 'void foo() { /* trivially fixed */ }',
      });
    });

    it("includes 'fixed' violations even when fixedSource has not been attached yet", () => {
      // Reproduces the brief Phase 1 window between the violation-fixed event
      // and the post-Phase-1 updateViolationFix call.
      const store = createStore();
      store.push({ type: 'violation-fix-started', violationId: 'v-1' });
      store.push({ type: 'violation-fixed', violationId: 'v-1', iterations: 100, elapsed: 5000 });

      const pending = store.getPendingMerges();
      expect(pending).toHaveLength(1);
      expect(pending[0]!.violationId).toBe('v-1');
      expect(pending[0]!.status).toBe('fixed');
      expect(pending[0]!.fixedSource).toBeUndefined();
    });

    it('drains entries as merge-step events arrive (regardless of action)', () => {
      const store = createStore();
      // Two trivially-fixed → both pending.
      store.push({ type: 'violation-trivially-fixed', violationId: 'v-1', fixedSource: 'a' });
      store.push({ type: 'violation-trivially-fixed', violationId: 'v-2', fixedSource: 'b' });
      expect(store.getPendingMerges()).toHaveLength(2);

      // Phase 2 applies v-1 trivially → v-1 leaves the pending set, v-2 stays.
      store.push({ type: 'merge-step', step: 1, violationId: 'v-1', action: 'applied-trivially' });
      const after1 = store.getPendingMerges();
      expect(after1).toHaveLength(1);
      expect(after1[0]!.violationId).toBe('v-2');

      // Even a 'failed' merge-step removes the violation from pending — once
      // Phase 2 has decided about it, it's no longer pending.
      store.push({ type: 'merge-step', step: 2, violationId: 'v-2', action: 'failed' });
      expect(store.getPendingMerges()).toEqual([]);
    });
  });

  describe('getMergeLog', () => {
    it('returns an empty array before any merge-step events', () => {
      const store = createStore();
      expect(store.getMergeLog()).toEqual([]);
    });

    it('returns merge log entries in event order', () => {
      const store = createStore();
      store.push({ type: 'merge-step', step: 1, violationId: 'v-1', action: 'applied-trivially' });
      store.push({ type: 'merge-step', step: 2, violationId: 'v-2', action: 'failed' });

      const log = store.getMergeLog();
      expect(log).toHaveLength(2);
      expect(log[0]).toEqual(expect.objectContaining({ step: 1, violationId: 'v-1', action: 'applied-trivially' }));
      expect(log[1]).toEqual(expect.objectContaining({ step: 2, violationId: 'v-2', action: 'failed' }));
    });

    it('returns a defensive copy — mutating the result does not change the store', () => {
      const store = createStore();
      store.push({ type: 'merge-step', step: 1, violationId: 'v-1', action: 'applied-trivially' });
      const log = store.getMergeLog();
      log[0]!.action = 'failed';
      expect(store.getMergeLog()[0]!.action).toBe('applied-trivially');
    });
  });
});

// ---------------------------------------------------------------------------
// mergeRuleStats — pure helper used by both RefinementStore and Refiner.
// ---------------------------------------------------------------------------

function makeStat(overrides: Partial<RuleStatsEntry> & { ruleId: string }): RuleStatsEntry {
  return {
    description: '',
    applied: 0,
    forked: 0,
    successRate: 0,
    avgDelta: 0,
    bestDelta: 0,
    errors: 0,
    focusApplied: 0,
    focusForked: 0,
    deltaByType: { insert: 0, delete: 0, replace: 0, opMismatch: 0, argMismatch: 0 },
    ...overrides,
  };
}

describe('mergeRuleStats', () => {
  it('returns an empty array for no inputs', () => {
    expect(mergeRuleStats([])).toEqual([]);
  });

  it('returns an empty array when every input array is empty', () => {
    expect(mergeRuleStats([[], [], []])).toEqual([]);
  });

  it('passes a single source through unchanged (modulo defensive deltaByType copy)', () => {
    const input = [
      makeStat({
        ruleId: 'reorder-stmts',
        description: 'Reorder statements',
        applied: 10,
        forked: 4,
        successRate: 0.4,
        avgDelta: 2.5,
        bestDelta: 5,
        errors: 1,
        focusApplied: 3,
        focusForked: 2,
        deltaByType: { insert: 1, delete: 2, replace: 0, opMismatch: 0, argMismatch: 0 },
      }),
    ];
    const merged = mergeRuleStats([input]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual({
      ruleId: 'reorder-stmts',
      description: 'Reorder statements',
      applied: 10,
      forked: 4,
      successRate: 0.4,
      avgDelta: 2.5,
      bestDelta: 5,
      errors: 1,
      focusApplied: 3,
      focusForked: 2,
      deltaByType: { insert: 1, delete: 2, replace: 0, opMismatch: 0, argMismatch: 0 },
    });
  });

  it('sums applied/forked/errors/focus and recomputes successRate + avgDelta', () => {
    const a = [
      makeStat({
        ruleId: 'r',
        applied: 10,
        forked: 4,
        successRate: 0.4,
        avgDelta: 3, // totalDelta = 12
        bestDelta: 5,
        errors: 1,
        focusApplied: 2,
        focusForked: 1,
      }),
    ];
    const b = [
      makeStat({
        ruleId: 'r',
        applied: 30,
        forked: 6,
        successRate: 0.2,
        avgDelta: 2, // totalDelta = 12
        bestDelta: 9,
        errors: 4,
        focusApplied: 0,
        focusForked: 0,
      }),
    ];

    const merged = mergeRuleStats([a, b]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      ruleId: 'r',
      applied: 40, // 10 + 30
      forked: 10, // 4 + 6
      successRate: 0.25, // 10 / 40 — recomputed, NOT (0.4 + 0.2) / 2
      avgDelta: 2.4, // (12 + 12) / 10 — recomputed from totals
      bestDelta: 9, // max(5, 9)
      errors: 5,
      focusApplied: 2,
      focusForked: 1,
    });
  });

  it('sums deltaByType field-by-field', () => {
    const a = [
      makeStat({
        ruleId: 'r',
        applied: 1,
        forked: 1,
        avgDelta: 0,
        deltaByType: { insert: 1, delete: 2, replace: 3, opMismatch: 4, argMismatch: 5 },
      }),
    ];
    const b = [
      makeStat({
        ruleId: 'r',
        applied: 1,
        forked: 1,
        avgDelta: 0,
        deltaByType: { insert: 10, delete: 20, replace: 30, opMismatch: 40, argMismatch: 50 },
      }),
    ];
    const merged = mergeRuleStats([a, b]);
    expect(merged[0]!.deltaByType).toEqual({
      insert: 11,
      delete: 22,
      replace: 33,
      opMismatch: 44,
      argMismatch: 55,
    });
  });

  it('sorts the result by forked descending', () => {
    const merged = mergeRuleStats([
      [
        makeStat({ ruleId: 'a', applied: 100, forked: 1 }),
        makeStat({ ruleId: 'b', applied: 100, forked: 50 }),
        makeStat({ ruleId: 'c', applied: 100, forked: 10 }),
      ],
    ]);
    expect(merged.map((r) => r.ruleId)).toEqual(['b', 'c', 'a']);
  });

  it('keeps unique-rule entries from each source independent', () => {
    const a = [makeStat({ ruleId: 'only-in-a', applied: 5, forked: 2 })];
    const b = [makeStat({ ruleId: 'only-in-b', applied: 7, forked: 4 })];
    const merged = mergeRuleStats([a, b]);
    expect(merged).toHaveLength(2);
    // Sorted by forked desc → only-in-b first.
    expect(merged[0]!.ruleId).toBe('only-in-b');
    expect(merged[1]!.ruleId).toBe('only-in-a');
  });

  it('prefers the first non-empty description it sees', () => {
    const a = [makeStat({ ruleId: 'r', applied: 1, forked: 1, description: '' })];
    const b = [makeStat({ ruleId: 'r', applied: 1, forked: 1, description: 'Real description' })];
    const merged = mergeRuleStats([a, b]);
    expect(merged[0]!.description).toBe('Real description');
  });
});

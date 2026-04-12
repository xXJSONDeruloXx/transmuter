import { describe, expect, it } from 'vitest';
import type { AutoCompactPolicy, MutationTarget } from '~/types.js';

import { pickAutoCompactTargets } from './auto-compact.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTarget(id: string, overrides: Partial<MutationTarget> = {}): MutationTarget {
  return {
    id,
    candidateId: `c-${id}`,
    weight: 1,
    enabled: true,
    attempts: 0,
    attemptsWithoutFork: 0,
    createdAt: 0,
    lastImprovedAtIteration: null,
    ...overrides,
  };
}

function makePolicy(overrides: Partial<Required<AutoCompactPolicy>> = {}): Required<AutoCompactPolicy> {
  return {
    staleAfterAttempts: 500,
    minStaleThreshold: 20,
    keepMinTargets: 3,
    candidateThreshold: 200,
    ...overrides,
  };
}

/**
 * Build a pool of targets + a matching `getScore` resolver.
 * Tests pass `{ id, score, attemptsWithoutFork? }` tuples; the helper produces
 * a live `MutationTarget[]` and a score lookup so we don't need the real Pool.
 */
function makePool(defs: { id: string; score: number; attemptsWithoutFork?: number }[]): {
  active: MutationTarget[];
  getScore: (target: MutationTarget) => number;
} {
  const active = defs.map((d) => makeTarget(d.id, { attemptsWithoutFork: d.attemptsWithoutFork ?? 0 }));
  const scores = new Map(defs.map((d) => [d.id, d.score]));
  return { active, getScore: (t) => scores.get(t.id) ?? Infinity };
}

describe('pickAutoCompactTargets', () => {
  // ---------------------------------------------------------------------------
  // Short-circuits
  // ---------------------------------------------------------------------------

  describe('short-circuits', () => {
    it("returns 'none' when candidateCount is below candidateThreshold", () => {
      const { active, getScore } = makePool(
        Array.from({ length: 10 }, (_, i) => ({ id: `t-${i}`, score: i, attemptsWithoutFork: 10_000 })),
      );
      const policy = makePolicy({ candidateThreshold: 200 });

      const result = pickAutoCompactTargets(active, getScore, policy, 2, 199);

      expect(result.toDisable).toEqual([]);
      expect(result.strategy).toBe('none');
    });

    it("returns 'none' when active.length equals keepMinTargets (boundary)", () => {
      // 3 targets, all stale enough to be pruned, but keepMinTargets = 3 protects them.
      const { active, getScore } = makePool([
        { id: 't-0', score: 0, attemptsWithoutFork: 10_000 },
        { id: 't-1', score: 1, attemptsWithoutFork: 10_000 },
        { id: 't-2', score: 2, attemptsWithoutFork: 10_000 },
      ]);
      const policy = makePolicy({ keepMinTargets: 3, candidateThreshold: 0 });

      const result = pickAutoCompactTargets(active, getScore, policy, 2, 500);

      expect(result.toDisable).toEqual([]);
      expect(result.strategy).toBe('none');
    });
  });

  // ---------------------------------------------------------------------------
  // Population strategy
  // ---------------------------------------------------------------------------

  describe('population strategy', () => {
    it('triggers when active.length > keepN * 3 and disables worst-scoring targets', () => {
      // concurrency = 2 → keepN = max(3, 10) = 10
      // population trigger: active.length > 30
      // 31 targets scored 0..30 (shuffled to prove sorting works) → keep best 10, disable worst 21.
      const scored = Array.from({ length: 31 }, (_, i) => ({ id: `t-${i}`, score: i }));
      // Shuffle deterministically (odd indices first) so the input isn't accidentally pre-sorted.
      const shuffled = [...scored.filter((_, i) => i % 2 === 1), ...scored.filter((_, i) => i % 2 === 0)];
      const { active, getScore } = makePool(shuffled);

      const result = pickAutoCompactTargets(active, getScore, makePolicy(), 2, 500);

      expect(result.strategy).toBe('population');
      expect(result.toDisable).toHaveLength(21);

      // The 10 kept must be exactly the 10 best scores (0..9).
      const disabled = new Set(result.toDisable);
      const kept = active.filter((t) => !disabled.has(t.id)).map((t) => t.id);
      const bestIds = new Set(['t-0', 't-1', 't-2', 't-3', 't-4', 't-5', 't-6', 't-7', 't-8', 't-9']);
      expect(new Set(kept)).toEqual(bestIds);
    });

    it('does NOT trigger at the boundary active.length === keepN * 3 (falls through to staleness)', () => {
      // concurrency = 2 → keepN = 10, keepN * 3 = 30. 30 > 30 is false.
      // All 30 targets are fresh (attemptsWithoutFork = 0), so staleness disables nothing.
      const defs = Array.from({ length: 30 }, (_, i) => ({ id: `t-${i}`, score: i }));
      const { active, getScore } = makePool(defs);

      const result = pickAutoCompactTargets(active, getScore, makePolicy(), 2, 500);

      expect(result.strategy).toBe('staleness');
      expect(result.toDisable).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Staleness strategy
  // ---------------------------------------------------------------------------

  describe('staleness strategy', () => {
    it('protects the top keepMinTargets regardless of how stale they are', () => {
      // concurrency = 1, keepN = max(3, 5) = 5, keepN*3 = 15. 10 < 15 → staleness.
      // All 10 targets are extremely stale.
      // dilution = sqrt(10/1) ≈ 3.162, staleAfterAttempts=500 → effective ≈ 158 (floor 20 doesn't apply).
      // atWoF = 1000 easily exceeds 158 — so every non-protected target should be disabled.
      const defs = Array.from({ length: 10 }, (_, i) => ({
        id: `t-${i}`,
        score: i,
        attemptsWithoutFork: 1000,
      }));
      const { active, getScore } = makePool(defs);

      const result = pickAutoCompactTargets(active, getScore, makePolicy({ keepMinTargets: 3 }), 1, 500);

      expect(result.strategy).toBe('staleness');
      // The top-3 by score (t-0, t-1, t-2) must be kept even though they're stale.
      const disabled = new Set(result.toDisable);
      expect(disabled.has('t-0')).toBe(false);
      expect(disabled.has('t-1')).toBe(false);
      expect(disabled.has('t-2')).toBe(false);
      // The remaining 7 are pruned.
      expect(result.toDisable).toHaveLength(7);
      for (let i = 3; i < 10; i++) {
        expect(disabled.has(`t-${i}`)).toBe(true);
      }
    });

    it('only disables targets with attemptsWithoutFork >= effective threshold', () => {
      // concurrency = 1, active = 10 → dilution = sqrt(10) ≈ 3.162
      // staleAfterAttempts = 500 → base effective = round(500 / 3.162) ≈ 158
      // Floor minStaleThreshold = 20, so effective stays at 158.
      // 10 targets: top 3 protected by keepMinTargets. Of the remaining 7:
      //   - 4 have atWoF = 200 (above 158 → stale)
      //   - 3 have atWoF = 100 (below 158 → NOT stale)
      const defs = [
        { id: 't-0', score: 0, attemptsWithoutFork: 999 }, // protected
        { id: 't-1', score: 1, attemptsWithoutFork: 999 }, // protected
        { id: 't-2', score: 2, attemptsWithoutFork: 999 }, // protected
        { id: 't-3', score: 3, attemptsWithoutFork: 200 }, // stale
        { id: 't-4', score: 4, attemptsWithoutFork: 200 }, // stale
        { id: 't-5', score: 5, attemptsWithoutFork: 100 }, // fresh
        { id: 't-6', score: 6, attemptsWithoutFork: 200 }, // stale
        { id: 't-7', score: 7, attemptsWithoutFork: 100 }, // fresh
        { id: 't-8', score: 8, attemptsWithoutFork: 200 }, // stale
        { id: 't-9', score: 9, attemptsWithoutFork: 100 }, // fresh
      ];
      const { active, getScore } = makePool(defs);

      const result = pickAutoCompactTargets(active, getScore, makePolicy({ keepMinTargets: 3 }), 1, 500);

      expect(result.strategy).toBe('staleness');
      expect(new Set(result.toDisable)).toEqual(new Set(['t-3', 't-4', 't-6', 't-8']));
    });

    it('larger pool produces a lower effective threshold (dilution formula)', () => {
      // Identical target shape, different pool sizes → different effective thresholds.
      // concurrency = 4, staleAfterAttempts = 400, minStaleThreshold = 10, keepMinTargets = 1.
      //
      // Small pool (active = 4): dilution = sqrt(4/4) = 1 → effective = max(10, 400) = 400.
      // Large pool (active = 16): dilution = sqrt(16/4) = 2 → effective = max(10, 200) = 200.
      // Neither pool triggers population: keepN = max(1, 20) = 20, keepN*3 = 60, both < 60.
      //
      // Non-protected targets all have attemptsWithoutFork = 300.
      //   small pool: 300 < 400 → none stale → empty
      //   large pool: 300 >= 200 → all non-protected stale → 15 disabled
      const policy = makePolicy({
        staleAfterAttempts: 400,
        minStaleThreshold: 10,
        keepMinTargets: 1,
      });

      const smallPool = makePool(
        Array.from({ length: 4 }, (_, i) => ({ id: `s-${i}`, score: i, attemptsWithoutFork: 300 })),
      );
      const smallResult = pickAutoCompactTargets(smallPool.active, smallPool.getScore, policy, 4, 500);
      expect(smallResult.strategy).toBe('staleness');
      expect(smallResult.toDisable).toEqual([]);

      const largePool = makePool(
        Array.from({ length: 16 }, (_, i) => ({ id: `l-${i}`, score: i, attemptsWithoutFork: 300 })),
      );
      const largeResult = pickAutoCompactTargets(largePool.active, largePool.getScore, policy, 4, 500);
      expect(largeResult.strategy).toBe('staleness');
      expect(largeResult.toDisable).toHaveLength(15); // all but the protected best-scorer
      expect(largeResult.toDisable).not.toContain('l-0');
    });

    it('minStaleThreshold floors the effective threshold when the formula would go lower', () => {
      // concurrency = 10, active = 100, keepN = max(1, 50) = 50, keepN*3 = 150 → no population trigger.
      // dilution = sqrt(100/10) ≈ 3.162 → staleAfterAttempts 100 / 3.162 ≈ 32.
      //
      // All non-protected targets have attemptsWithoutFork = 40.
      //   minStaleThreshold = 5:  effective = max(5, 32) = 32 → 40 >= 32 → all 99 non-protected disabled.
      //   minStaleThreshold = 50: effective = max(50, 32) = 50 → 40 < 50  → floor kicks in, 0 disabled.
      const basePolicy = {
        staleAfterAttempts: 100,
        keepMinTargets: 1,
        candidateThreshold: 0,
      };
      const defs = Array.from({ length: 100 }, (_, i) => ({
        id: `t-${i}`,
        score: i,
        attemptsWithoutFork: 40,
      }));
      const { active, getScore } = makePool(defs);

      const withoutFloor = pickAutoCompactTargets(
        active,
        getScore,
        makePolicy({ ...basePolicy, minStaleThreshold: 5 }),
        10,
        500,
      );
      expect(withoutFloor.strategy).toBe('staleness');
      expect(withoutFloor.toDisable).toHaveLength(99);
      expect(withoutFloor.toDisable).not.toContain('t-0');

      const withFloor = pickAutoCompactTargets(
        active,
        getScore,
        makePolicy({ ...basePolicy, minStaleThreshold: 50 }),
        10,
        500,
      );
      expect(withFloor.strategy).toBe('staleness');
      expect(withFloor.toDisable).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Self-stabilization: the docstring claims pruning shrinks the pool → raises
  // the thresholds → stops further pruning. Simulate applying the first call's
  // decision and verify the next call is a no-op.
  // ---------------------------------------------------------------------------

  describe('self-stabilization', () => {
    it('applying the population decision leaves a pool that needs no further pruning', () => {
      // 40 targets, scores 0..39, no staleness. concurrency = 2.
      // keepN = max(3, 10) = 10, keepN*3 = 30 → 40 > 30 → population fires.
      // After pruning, 10 targets remain (the best 10). 10 <= 30, so population does not fire again,
      // and none of the 10 are stale (attemptsWithoutFork = 0), so staleness disables nothing.
      const defs = Array.from({ length: 40 }, (_, i) => ({ id: `t-${i}`, score: i }));
      const { active, getScore } = makePool(defs);
      const policy = makePolicy();

      const first = pickAutoCompactTargets(active, getScore, policy, 2, 500);
      expect(first.strategy).toBe('population');
      expect(first.toDisable).toHaveLength(30);

      // Simulate the pool-facing side effect: remove the disabled targets.
      const disabled = new Set(first.toDisable);
      const remaining = active.filter((t) => !disabled.has(t.id));
      expect(remaining).toHaveLength(10);

      const second = pickAutoCompactTargets(remaining, getScore, policy, 2, 500);
      // Still inside the staleness branch (remaining > keepMinTargets), but no target is stale.
      expect(second.strategy).toBe('staleness');
      expect(second.toDisable).toEqual([]);
    });
  });
});

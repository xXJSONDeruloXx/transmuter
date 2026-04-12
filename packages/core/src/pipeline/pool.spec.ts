import { describe, expect, it } from 'vitest';
import { Rng } from '~/rng.js';
import type { DiffBreakdown } from '~/types.js';

import { Pool } from './pool.js';

const bd: DiffBreakdown = { total: 0, insert: 0, delete: 0, replace: 0, opMismatch: 0, argMismatch: 0 };
const emptyAssembly = { assembly: '', assemblyDiff: '', breakdown: bd };

/**
 * Per-pool iteration counter for `forkFrom`. Each Pool instance gets its own
 * monotonically increasing iter starting at 1, garbage-collected with the pool.
 * This avoids the shared-state pollution of a describe-scoped `let iter = 1`.
 */
const poolIter = new WeakMap<Pool, number>();

/**
 * Convenience helper to apply a fork-producing report to a pool.
 *
 * - The default `ruleId` is unique per call (`r-${iter}`) to avoid silent
 *   fork-dedup collisions when two forks share the same delta and location.
 * - Tests that need a specific ruleId (e.g. to force a dedup collision) can
 *   pass it explicitly.
 */
function forkFrom(pool: Pool, targetId: string, score: number, ruleId?: string) {
  const iter = (poolIter.get(pool) ?? 0) + 1;
  poolIter.set(pool, iter);
  return pool.report(
    {
      mutationTargetId: targetId,
      source: `code-score-${score}-iter-${iter}`,
      score,
      breakdown: { ...bd, total: score },
      ruleId: ruleId ?? `r-${iter}`,
      location: { line: score, column: 1 },
      assembly: '',
      assemblyDiff: '',
    },
    iter,
  );
}

describe('Pool', () => {
  function createPool(seed = 42, lateralForkBudget = 0) {
    return new Pool(new Rng(seed), lateralForkBudget);
  }

  // ---------------------------------------------------------------------------
  // Smoke tests for create/getter methods
  // ---------------------------------------------------------------------------

  it('initializes with a candidate and target', () => {
    const pool = createPool();
    const { candidate, target } = pool.init('int main() {}', 100, emptyAssembly);
    expect(candidate.score).toBe(100);
    expect(candidate.origin).toBe('genesis');
    expect(pool.getAllCandidates()).toHaveLength(1);
    expect(pool.getBest().id).toBe(candidate.id);
    expect(pool.getAllTargets()).toHaveLength(1);
    expect(target.candidateId).toBe(candidate.id);
  });

  it('init() propagates assembly, assemblyDiff, and breakdown to the genesis candidate', () => {
    const pool = createPool();
    const breakdown: DiffBreakdown = { total: 100, insert: 5, delete: 3, replace: 2, opMismatch: 1, argMismatch: 4 };
    const { candidate } = pool.init('void f() {}', 100, {
      assembly: 'mov r0, #0',
      assemblyDiff: 'diff text',
      breakdown,
    });
    expect(candidate.assembly).toBe('mov r0, #0');
    expect(candidate.assemblyDiff).toBe('diff text');
    expect(candidate.breakdown).toEqual(breakdown);
  });

  it('inject() creates a new candidate and target', () => {
    const pool = createPool();
    pool.init('code1', 100, emptyAssembly);
    const { candidate } = pool.inject('code2', 50, { ...emptyAssembly, label: 'external' });
    expect(pool.getAllCandidates()).toHaveLength(2);
    expect(pool.getBest().id).toBe(candidate.id);
  });

  it('inject() propagates assembly, breakdown, label, and origin to the candidate', () => {
    const pool = createPool();
    pool.init('genesis', 100, emptyAssembly);
    const breakdown: DiffBreakdown = { total: 50, insert: 1, delete: 2, replace: 3, opMismatch: 4, argMismatch: 5 };
    const { candidate } = pool.inject('injected', 50, {
      assembly: 'inject asm',
      assemblyDiff: 'inject diff',
      breakdown,
      label: 'my hypothesis',
    });
    expect(candidate.assembly).toBe('inject asm');
    expect(candidate.assemblyDiff).toBe('inject diff');
    expect(candidate.breakdown).toEqual(breakdown);
    expect(candidate.origin).toBe('external');
    expect(candidate.externalLabel).toBe('my hypothesis');
    expect(candidate.parentId).toBeUndefined();
  });

  it('getBest() returns lowest score candidate', () => {
    const pool = createPool();
    pool.init('code1', 100, emptyAssembly);
    pool.inject('code2', 50, { ...emptyAssembly, label: 'external' });
    pool.inject('code3', 75, { ...emptyAssembly, label: 'external' });
    expect(pool.getBest().score).toBe(50);
  });

  it('getStats() returns correct summary', () => {
    const pool = createPool();
    pool.init('code', 100, emptyAssembly);
    pool.inject('code2', 50, { ...emptyAssembly, label: 'external' });
    const stats = pool.getStats();
    expect(stats.targetCount).toBe(2);
    expect(stats.bestScore).toBe(50);
  });

  it('two fresh Pool instances produce independent ID sequences', () => {
    const a = createPool();
    const b = createPool();
    const initA = a.init('a', 100, emptyAssembly);
    const initB = b.init('b', 100, emptyAssembly);
    expect(initA.candidate.id).toBe(initB.candidate.id);
    expect(initA.target.id).toBe(initB.target.id);
  });

  // ---------------------------------------------------------------------------
  // select()
  // ---------------------------------------------------------------------------

  describe('select()', () => {
    it('returns the only target when pool has one', () => {
      const pool = createPool();
      const { target } = pool.init('code', 50, emptyAssembly);
      const selected = pool.select();
      expect(selected.id).toBe(target.id);
    });

    it('respects target weights when there are multiple active targets', () => {
      const pool = createPool(42);
      const { target: t1 } = pool.init('a', 100, emptyAssembly);
      const { target: t2 } = pool.inject('b', 50, emptyAssembly);

      // Heavy bias toward t2: expect ~99% of selections to land on t2.
      pool.setWeight(t1.id, 1);
      pool.setWeight(t2.id, 99);

      const counts = new Map<string, number>([
        [t1.id, 0],
        [t2.id, 0],
      ]);
      for (let i = 0; i < 1000; i++) {
        const sel = pool.select();
        counts.set(sel.id, counts.get(sel.id)! + 1);
      }
      expect(counts.get(t2.id)!).toBeGreaterThan(900);
      expect(counts.get(t1.id)!).toBeLessThan(100);
    });
  });

  // ---------------------------------------------------------------------------
  // report()
  // ---------------------------------------------------------------------------

  describe('report()', () => {
    it('forks on improvement', () => {
      const pool = createPool();
      const { target } = pool.init('code', 100, emptyAssembly);
      const { forked } = forkFrom(pool, target.id, 80);
      expect(forked).toBeDefined();
      expect(pool.getBest().score).toBe(80);
    });

    it('does not fork when score is worse', () => {
      const pool = createPool();
      const { target } = pool.init('code', 100, emptyAssembly);
      const { forked } = forkFrom(pool, target.id, 120);
      expect(forked).toBeUndefined();
      expect(pool.getBest().score).toBe(100);
      expect(pool.getBest().source).toBe('code');
    });

    it('dedups forks with the same delta, ruleId, and location', () => {
      const pool = createPool();
      const { target } = pool.init('code', 100, emptyAssembly);

      // First fork: 100 → 80, ruleId='dup', line=5
      const r1 = pool.report(
        {
          mutationTargetId: target.id,
          source: 'first',
          score: 80,
          breakdown: { ...bd, total: 80 },
          ruleId: 'dup',
          location: { line: 5, column: 3 },
          assembly: '',
          assemblyDiff: '',
        },
        1,
      );
      expect(r1.forked).toBeDefined();

      // Same delta (20), ruleId, and location → dedup rejects this even
      // though the source code is different.
      const r2 = pool.report(
        {
          mutationTargetId: target.id,
          source: 'second',
          score: 80,
          breakdown: { ...bd, total: 80 },
          ruleId: 'dup',
          location: { line: 5, column: 3 },
          assembly: '',
          assemblyDiff: '',
        },
        2,
      );
      expect(r2.forked).toBeUndefined();
      expect(pool.getAllCandidates()).toHaveLength(2); // genesis + first fork
    });

    it('returns an empty result for an unknown mutationTargetId', () => {
      const pool = createPool();
      pool.init('code', 100, emptyAssembly);
      const result = pool.report(
        {
          mutationTargetId: 'does-not-exist',
          source: 'whatever',
          score: 50,
          breakdown: { ...bd, total: 50 },
          ruleId: 'r',
          location: { line: 1, column: 1 },
          assembly: '',
          assemblyDiff: '',
        },
        1,
      );
      expect(result.forked).toBeUndefined();
      expect(pool.getAllCandidates()).toHaveLength(1); // pool is unchanged
    });
  });

  // ---------------------------------------------------------------------------
  // Target management: disable, enable, setWeight
  // ---------------------------------------------------------------------------

  describe('disable()', () => {
    it('disables an enabled target so it disappears from getActiveTargets()', () => {
      const pool = createPool();
      const { target } = pool.init('code', 100, emptyAssembly);
      expect(pool.getActiveTargets()).toHaveLength(1);

      const result = pool.disable(target.id);
      expect(result).toBe(true);
      expect(pool.getTarget(target.id)!.enabled).toBe(false);
      expect(pool.getActiveTargets()).toHaveLength(0);
    });

    it('returns false for an unknown target id', () => {
      const pool = createPool();
      pool.init('code', 100, emptyAssembly);
      expect(pool.disable('does-not-exist')).toBe(false);
    });

    it('is a no-op when the target is already disabled', () => {
      const pool = createPool();
      const { target } = pool.init('code', 100, emptyAssembly);
      pool.disable(target.id);

      const result = pool.disable(target.id);
      expect(result).toBe(true);
      expect(pool.getTarget(target.id)!.enabled).toBe(false);
    });
  });

  describe('enable()', () => {
    it('re-enables a disabled target so it appears in getActiveTargets()', () => {
      const pool = createPool();
      const { target } = pool.init('code', 100, emptyAssembly);

      pool.disable(target.id);
      expect(pool.getActiveTargets()).toHaveLength(0);

      const result = pool.enable(target.id);
      expect(result).toBe(true);
      expect(pool.getTarget(target.id)!.enabled).toBe(true);
      expect(pool.getActiveTargets()).toHaveLength(1);
    });

    it('returns false for an unknown target id', () => {
      const pool = createPool();
      pool.init('code', 100, emptyAssembly);
      expect(pool.enable('does-not-exist')).toBe(false);
    });

    it('is a no-op when the target is already enabled', () => {
      const pool = createPool();
      const { target } = pool.init('code', 100, emptyAssembly);
      expect(target.enabled).toBe(true);

      const result = pool.enable(target.id);
      expect(result).toBe(true);
      expect(pool.getTarget(target.id)!.enabled).toBe(true);
    });
  });

  describe('setWeight()', () => {
    it('updates the weight of an existing target', () => {
      const pool = createPool();
      const { target } = pool.init('code', 100, emptyAssembly);
      expect(target.weight).toBe(1);

      const result = pool.setWeight(target.id, 5);
      expect(result).toBe(true);
      expect(pool.getTarget(target.id)!.weight).toBe(5);
    });

    it('allows a weight of 0 (target stays enabled but unselectable)', () => {
      const pool = createPool();
      const { target } = pool.init('code', 100, emptyAssembly);

      pool.setWeight(target.id, 0);
      expect(pool.getTarget(target.id)!.weight).toBe(0);
      expect(pool.getTarget(target.id)!.enabled).toBe(true);
    });

    it('clamps negative weights to 0', () => {
      const pool = createPool();
      const { target } = pool.init('code', 100, emptyAssembly);

      const result = pool.setWeight(target.id, -42);
      expect(result).toBe(true);
      expect(pool.getTarget(target.id)!.weight).toBe(0);
    });

    it('returns false for an unknown target id', () => {
      const pool = createPool();
      pool.init('code', 100, emptyAssembly);
      expect(pool.setWeight('does-not-exist', 10)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Lateral forks
  // ---------------------------------------------------------------------------

  describe('lateral forks', () => {
    function lateralReport(targetId: string, source: string, ruleId: string) {
      return {
        mutationTargetId: targetId,
        source,
        score: 100, // same as head
        breakdown: { ...bd, total: 100 },
        ruleId,
        location: { line: 1, column: 1 },
        assembly: '',
        assemblyDiff: '',
      };
    }

    it('rejects lateral forks when the budget is 0 (default)', () => {
      const pool = createPool(); // default budget = 0
      const { target } = pool.init('code', 100, emptyAssembly);
      const { forked } = pool.report(lateralReport(target.id, 'lat', 'r-a'), 1);
      expect(forked).toBeUndefined();
      expect(pool.getAllCandidates()).toHaveLength(1);
    });

    it('allows lateral forks up to the budget and rejects beyond it', () => {
      const pool = createPool(42, 2);
      const { target } = pool.init('code', 100, emptyAssembly);

      // Two lateral forks within budget, each with a unique ruleId so dedup
      // doesn't accidentally swallow them.
      const r1 = pool.report(lateralReport(target.id, 'lat-1', 'r-a'), 1);
      expect(r1.forked).toBeDefined();

      const r2 = pool.report(lateralReport(target.id, 'lat-2', 'r-b'), 2);
      expect(r2.forked).toBeDefined();

      // Budget is exhausted: third lateral fork is rejected.
      const r3 = pool.report(lateralReport(target.id, 'lat-3', 'r-c'), 3);
      expect(r3.forked).toBeUndefined();

      expect(pool.getAllCandidates()).toHaveLength(3); // genesis + 2 lateral forks
    });

    it('does not consume lateral budget when a fork is rejected by dedup', () => {
      const pool = createPool(42, 2);
      const { target } = pool.init('code', 100, emptyAssembly);

      // First lateral fork: succeeds, consumes 1 of 2 budget slots.
      const r1 = pool.report(lateralReport(target.id, 'lat-1', 'r-shared'), 1);
      expect(r1.forked).toBeDefined();

      // Second report uses the SAME ruleId/location → dedup rejects it.
      // The budget slot must NOT be consumed by this rejected fork.
      const r2 = pool.report(lateralReport(target.id, 'lat-2', 'r-shared'), 2);
      expect(r2.forked).toBeUndefined();

      // Two more unique lateral forks should still fit: one consumes the
      // remaining budget slot, the next is correctly rejected by budget.
      const r3 = pool.report(lateralReport(target.id, 'lat-3', 'r-other'), 3);
      expect(r3.forked).toBeDefined();

      const r4 = pool.report(lateralReport(target.id, 'lat-4', 'r-third'), 4);
      expect(r4.forked).toBeUndefined();

      expect(pool.getAllCandidates()).toHaveLength(3); // genesis + 2 lateral forks
    });
  });

  // ---------------------------------------------------------------------------
  // summarize()
  // ---------------------------------------------------------------------------

  describe('summarize()', () => {
    it('removes dead branches including the branch root (depth-0 compaction)', () => {
      const pool = createPool();
      // genesis(100) → fork to 80 (active)
      const { candidate: genesis, target: t0 } = pool.init('genesis', 100, emptyAssembly);
      const { forked: fork1 } = forkFrom(pool, t0.id, 80);
      expect(fork1).toBeDefined();

      // genesis → fork to 60 → fork to 40 (deep dead branch)
      const { forked: fork2 } = forkFrom(pool, t0.id, 60);
      expect(fork2).toBeDefined();
      const { forked: fork3 } = forkFrom(pool, fork2!.mutationTarget.id, 40);
      expect(fork3).toBeDefined();

      // Disable the dead branch targets
      pool.disable(fork2!.mutationTarget.id);
      pool.disable(fork3!.mutationTarget.id);

      expect(pool.getAllCandidates()).toHaveLength(4);

      const result = pool.summarize();

      // Both the branch root (60) and its child (40) become a single supernode
      // attached to the reachable parent (genesis).
      expect(result.removed).toBe(2);
      expect(result.superNodes).toHaveLength(1);
      expect(result.superNodes[0]!.parentId).toBe(genesis.id);
      expect(result.superNodes[0]!.summarizedCount).toBe(2);
      expect(result.superNodes[0]!.bestScore).toBe(40);

      expect(pool.getAllCandidates()).toHaveLength(2);
      expect(pool.getCandidate(fork2!.candidate.id)).toBeUndefined();
      expect(pool.getCandidate(fork3!.candidate.id)).toBeUndefined();
    });

    it('summarizes entire dead injection trees (multi-root forest)', () => {
      const pool = createPool();
      const { target: t0 } = pool.init('genesis', 100, emptyAssembly);
      const { forked: _fork1 } = forkFrom(pool, t0.id, 80);

      // Inject two external candidates (new roots, no parent)
      const { target: extT1 } = pool.inject('ext1', 50, emptyAssembly);
      const { target: extT2 } = pool.inject('ext2', 70, emptyAssembly);

      // Fork from ext1 to make it have a child
      const { forked: extFork } = forkFrom(pool, extT1.id, 30);
      expect(extFork).toBeDefined();

      // Disable both injection trees entirely
      pool.disable(extT2.id);
      pool.disable(extT1.id);
      pool.disable(extFork!.mutationTarget.id);

      expect(pool.getAllCandidates()).toHaveLength(5);

      const result = pool.summarize();

      // ext2 → 1 supernode with parentId=undefined, summarizedCount=1
      // ext1 + ext1-fork → 1 supernode with parentId=undefined, summarizedCount=2
      expect(result.superNodes).toHaveLength(2);

      const rootSuperNodes = result.superNodes.filter((s) => s.parentId === undefined);
      expect(rootSuperNodes).toHaveLength(2);

      const ext1Super = rootSuperNodes.find((s) => s.summarizedCount === 2);
      const ext2Super = rootSuperNodes.find((s) => s.summarizedCount === 1);
      expect(ext1Super!.bestScore).toBe(30);
      expect(ext2Super!.bestScore).toBe(70);

      expect(result.removed).toBe(3);
      expect(pool.getAllCandidates()).toHaveLength(2); // genesis + fork1
    });

    it('summarizes the entire tree when every target is disabled', () => {
      const pool = createPool();
      const { candidate: genesis, target: t0 } = pool.init('genesis', 100, emptyAssembly);
      const { forked: f1 } = forkFrom(pool, t0.id, 80);
      const { forked: f2 } = forkFrom(pool, f1!.mutationTarget.id, 60);

      pool.disable(t0.id);
      pool.disable(f1!.mutationTarget.id);
      pool.disable(f2!.mutationTarget.id);

      const result = pool.summarize();

      // Genesis has no parent, so the whole tree becomes a single deadRoot
      // subtree summarized into one supernode with parentId=undefined.
      expect(result.removed).toBe(3);
      expect(result.superNodes).toHaveLength(1);
      expect(result.superNodes[0]!.parentId).toBeUndefined();
      expect(result.superNodes[0]!.summarizedCount).toBe(3);
      expect(result.superNodes[0]!.bestScore).toBe(60);
      expect(pool.getAllCandidates()).toHaveLength(0);
      expect(pool.getCandidate(genesis.id)).toBeUndefined();
    });

    it('removes targets when their candidates are summarized', () => {
      const pool = createPool();
      const { target: t0 } = pool.init('genesis', 100, emptyAssembly);
      const { forked: fork1 } = forkFrom(pool, t0.id, 80);
      const { forked: fork2 } = forkFrom(pool, fork1!.mutationTarget.id, 60);

      pool.disable(fork1!.mutationTarget.id);
      pool.disable(fork2!.mutationTarget.id);

      const result = pool.summarize();

      expect(result.removed).toBe(2);
      expect(result.removedTargetIds).toHaveLength(2);
      expect(pool.getTarget(fork1!.mutationTarget.id)).toBeUndefined();
      expect(pool.getTarget(fork2!.mutationTarget.id)).toBeUndefined();
      expect(pool.hasTarget(fork1!.mutationTarget.id)).toBe(false);
      expect(pool.hasTarget(fork2!.mutationTarget.id)).toBe(false);
    });

    it('accumulates supernodes across multiple summarize() calls', () => {
      const pool = createPool();
      const { target: t0 } = pool.init('genesis', 100, emptyAssembly);
      const { forked: fork1 } = forkFrom(pool, t0.id, 80);
      const { forked: fork2 } = forkFrom(pool, fork1!.mutationTarget.id, 60);

      pool.disable(fork1!.mutationTarget.id);
      pool.disable(fork2!.mutationTarget.id);

      pool.summarize();
      expect(pool.getSuperNodes()).toHaveLength(1);

      // Create and prune another branch
      const { forked: fork3 } = forkFrom(pool, t0.id, 70);
      const { forked: fork4 } = forkFrom(pool, fork3!.mutationTarget.id, 50);
      pool.disable(fork3!.mutationTarget.id);
      pool.disable(fork4!.mutationTarget.id);

      pool.summarize();
      expect(pool.getSuperNodes()).toHaveLength(2);
    });

    it('frees single-leaf dead branches (depth-0 compaction)', () => {
      const pool = createPool();
      const { candidate: genesis, target: t0 } = pool.init('genesis', 100, emptyAssembly);

      // genesis → fork1(80, active), genesis → fork2(90, disabled leaf)
      const { forked: _fork1 } = forkFrom(pool, t0.id, 80);
      const { forked: fork2 } = forkFrom(pool, t0.id, 90);
      pool.disable(fork2!.mutationTarget.id);

      expect(pool.getAllCandidates()).toHaveLength(3);

      const result = pool.summarize();

      // fork2 is a leaf dead branch root — previously skipped, now freed.
      expect(result.removed).toBe(1);
      expect(result.superNodes).toHaveLength(1);
      expect(result.superNodes[0]!.parentId).toBe(genesis.id);
      expect(result.superNodes[0]!.summarizedCount).toBe(1);
      expect(result.superNodes[0]!.bestScore).toBe(90);

      expect(pool.getAllCandidates()).toHaveLength(2); // genesis + fork1
      expect(pool.getCandidate(fork2!.candidate.id)).toBeUndefined();
    });

    it('is a no-op when there are no dead branches', () => {
      const pool = createPool();
      const { target, candidate: genesis } = pool.init('genesis', 100, emptyAssembly);

      const result = pool.summarize();

      // Result fields are all empty
      expect(result.removed).toBe(0);
      expect(result.superNodes).toHaveLength(0);
      expect(result.removedTargetIds).toEqual([]);

      // Pool state is unchanged
      expect(pool.getAllCandidates()).toHaveLength(1);
      expect(pool.getCandidate(genesis.id)).toBeDefined();
      expect(pool.getSuperNodes()).toHaveLength(0);
      expect(pool.getTarget(target.id)!.enabled).toBe(true);
    });

    it('handles a mix of active-lineage dead branches and dead injection trees', () => {
      const pool = createPool();
      const { candidate: genesis, target: t0 } = pool.init('genesis', 100, emptyAssembly);

      // Active lineage: genesis → 80
      const { forked: _activeFork } = forkFrom(pool, t0.id, 80);

      // Dead branch off genesis: genesis → 90 → 70
      const { forked: deadBranch } = forkFrom(pool, t0.id, 90);
      const { forked: deadChild } = forkFrom(pool, deadBranch!.mutationTarget.id, 70);
      pool.disable(deadBranch!.mutationTarget.id);
      pool.disable(deadChild!.mutationTarget.id);

      // Dead injection tree (no parent)
      const { target: injTarget } = pool.inject('injected', 50, emptyAssembly);
      pool.disable(injTarget.id);

      const result = pool.summarize();

      // Dead branch off genesis: depth-0 compaction → 1 supernode w/ parentId=genesis
      // Dead injection tree: 1 supernode w/ parentId=undefined
      expect(result.superNodes).toHaveLength(2);

      const branchSuper = result.superNodes.find((s) => s.parentId === genesis.id);
      const rootSuper = result.superNodes.find((s) => s.parentId === undefined);

      expect(branchSuper!.summarizedCount).toBe(2);
      expect(branchSuper!.bestScore).toBe(70);

      expect(rootSuper!.summarizedCount).toBe(1);
      expect(rootSuper!.bestScore).toBe(50);

      expect(pool.getAllCandidates()).toHaveLength(2); // genesis + 80
    });
  });

  // ---------------------------------------------------------------------------
  // attemptsWithoutFork tracking
  // ---------------------------------------------------------------------------

  describe('attemptsWithoutFork tracking', () => {
    it('initializes attemptsWithoutFork to 0', () => {
      const pool = createPool();
      const { target } = pool.init('code', 100, emptyAssembly);
      expect(target.attemptsWithoutFork).toBe(0);
    });

    it('increments attemptsWithoutFork on report without fork', () => {
      const pool = createPool();
      const { target } = pool.init('code', 100, emptyAssembly);
      forkFrom(pool, target.id, 120); // worse score → no fork
      expect(target.attemptsWithoutFork).toBe(1);
      expect(target.attempts).toBe(1);
    });

    it('increments attemptsWithoutFork on recordFailure', () => {
      const pool = createPool();
      const { target } = pool.init('code', 100, emptyAssembly);
      pool.recordFailure(target.id);
      pool.recordFailure(target.id);
      expect(target.attemptsWithoutFork).toBe(2);
      expect(target.attempts).toBe(2);
    });

    it('resets attemptsWithoutFork to 0 on fork', () => {
      const pool = createPool();
      const { target } = pool.init('code', 100, emptyAssembly);

      pool.recordFailure(target.id);
      pool.recordFailure(target.id);
      pool.recordFailure(target.id);
      expect(target.attemptsWithoutFork).toBe(3);

      const { forked } = forkFrom(pool, target.id, 80);
      expect(forked).toBeDefined();
      expect(target.attemptsWithoutFork).toBe(0);
      expect(target.attempts).toBe(4);
    });

    it('new fork target starts with attemptsWithoutFork 0', () => {
      const pool = createPool();
      const { target } = pool.init('code', 100, emptyAssembly);
      const { forked } = forkFrom(pool, target.id, 80);
      expect(forked!.mutationTarget.attemptsWithoutFork).toBe(0);
    });

    it('injected target starts with attemptsWithoutFork 0', () => {
      const pool = createPool();
      pool.init('code', 100, emptyAssembly);
      const { target } = pool.inject('ext', 50, emptyAssembly);
      expect(target.attemptsWithoutFork).toBe(0);
    });

    it('recordFailure is a no-op for an unknown target id', () => {
      const pool = createPool();
      const { target } = pool.init('code', 100, emptyAssembly);
      expect(() => pool.recordFailure('does-not-exist')).not.toThrow();
      expect(target.attempts).toBe(0);
      expect(target.attemptsWithoutFork).toBe(0);
    });
  });
});

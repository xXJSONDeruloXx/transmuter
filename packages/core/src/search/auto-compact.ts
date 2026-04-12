/**
 * Pure target-selection logic for auto-compaction.
 *
 * `MutationSearch#maybeAutoCompact` calls this to decide which mutation targets
 * to disable based on the current pool state and policy. Extracted so the
 * non-trivial strategy-selection and adaptive-threshold logic can be unit
 * tested without needing to spin up the full search pipeline.
 *
 * Two pruning strategies, applied in priority order:
 *
 * 1. **Population-based** — when the active target count exceeds a computed
 *    maximum (`keepN * 3`), keep only the best `keepN` targets by score and
 *    disable everything else. This creates entire dead subtrees that
 *    `Pool.summarize()` can free, and works even when fork rates are too high
 *    for individual staleness tracking (e.g. refine sessions).
 *
 * 2. **Staleness-based** — for smaller pools, disable individual targets whose
 *    `attemptsWithoutFork` exceeds an adaptive threshold:
 *
 *      effective = max(
 *        minStaleThreshold,
 *        round(staleAfterAttempts / sqrt(activeTargets / concurrency))
 *      )
 *
 * Both strategies are self-stabilizing: pruning shrinks the pool → raises the
 * population/staleness thresholds → stops further pruning.
 */
import type { AutoCompactPolicy, MutationTarget } from '~/types.js';

export type AutoCompactStrategy = 'population' | 'staleness' | 'none';

export interface PickAutoCompactTargetsResult {
  /** Target IDs to disable. Empty when no pruning should happen. */
  readonly toDisable: readonly string[];
  /**
   * Which strategy the decision came from:
   * - `'none'`      — short-circuited before either strategy was chosen.
   * - `'population'`— pool was too big; best `keepN` kept, rest disabled.
   * - `'staleness'` — smaller pool; individually stale targets disabled.
   */
  readonly strategy: AutoCompactStrategy;
}

/**
 * Decide which mutation targets auto-compact should disable.
 *
 * @param active        Currently active mutation targets (already filtered by the caller).
 * @param getScore      Resolves a target's head-candidate score. Return `Infinity` if unknown.
 * @param policy        Fully-resolved auto-compact policy (no optional fields).
 * @param concurrency   Effective slot concurrency (used by the dilution formula).
 * @param candidateCount Current total candidate count in the graph.
 */
export function pickAutoCompactTargets(
  active: readonly MutationTarget[],
  getScore: (target: MutationTarget) => number,
  policy: Required<AutoCompactPolicy>,
  concurrency: number,
  candidateCount: number,
): PickAutoCompactTargetsResult {
  // Short-circuit: graph hasn't reached the size worth evaluating yet.
  if (candidateCount < policy.candidateThreshold) {
    return { toDisable: [], strategy: 'none' };
  }

  // Short-circuit: never shrink the pool below the floor of protected targets.
  if (active.length <= policy.keepMinTargets) {
    return { toDisable: [], strategy: 'none' };
  }

  // Sort by candidate score, best (lowest) first. Unknown score falls to the end.
  const sorted = active.map((target) => ({ target, score: getScore(target) })).sort((a, b) => a.score - b.score);

  // How many targets the population strategy retains.
  const keepN = Math.max(policy.keepMinTargets, concurrency * 5);

  // Strategy 1: Population-based — pool is far larger than what concurrency
  // can productively work on; aggressively shrink it to the best keepN.
  if (active.length > keepN * 3) {
    return {
      toDisable: sorted.slice(keepN).map((s) => s.target.id),
      strategy: 'population',
    };
  }

  // Strategy 2: Staleness-based — evaluate each non-protected target against
  // an adaptive threshold that scales down as the pool grows.
  const dilution = Math.sqrt(active.length / concurrency);
  const effectiveThreshold = Math.max(policy.minStaleThreshold, Math.round(policy.staleAfterAttempts / dilution));

  const toDisable: string[] = [];
  for (let i = policy.keepMinTargets; i < sorted.length; i++) {
    if (sorted[i]!.target.attemptsWithoutFork >= effectiveThreshold) {
      toDisable.push(sorted[i]!.target.id);
    }
  }

  return { toDisable, strategy: 'staleness' };
}

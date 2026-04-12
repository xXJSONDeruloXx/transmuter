/**
 * Test utilities for mutation rule specs.
 */
import type { Language } from '~/language.js';
import { parse } from '~/parser.js';
import { Rng } from '~/rng.js';

import type { MutationContext } from './rule.js';

/**
 * Deterministic RNG that always selects the first option.
 *
 * - `pick(arr)` always returns `arr[0]`
 * - `chance(p)` always returns `true` (for any `p > 0`)
 * - `int(min, max)` always returns `min`
 *
 * Eliminates seed-brute-force loops in rule tests — every rule
 * becomes deterministic regardless of how many candidates exist.
 */
export class DeterministicRng extends Rng {
  constructor() {
    super(0);
  }

  override int(min: number, _max: number): number {
    return min;
  }

  override float(): number {
    return 0;
  }
}

/** Build a MutationContext with deterministic RNG for rule testing. */
export function makeRuleCtx(
  source: string,
  opts?: { functionName?: string; language?: Language; rng?: Rng },
): MutationContext {
  const language = opts?.language ?? 'c';
  return {
    source,
    root: parse(language, source),
    rng: opts?.rng ?? new DeterministicRng(),
    functionName: opts?.functionName ?? 'foo',
    language,
  };
}

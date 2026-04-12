/**
 * Seeded pseudo-random number generator.
 *
 * Uses xoshiro256** — fast, high-quality, seedable, and reproducible.
 * Given the same seed, produces the same sequence on every platform.
 */

/**
 * SplitMix64 — used solely to initialize xoshiro256** state from a single
 * 64-bit seed. We work with pairs of 32-bit numbers since JS lacks u64.
 */
function splitmix64(seedLo: number, seedHi: number): { lo: number; hi: number } {
  // Add 0x9E3779B97F4A7C15 (golden ratio * 2^64)
  seedLo = (seedLo + 0x7f4a7c15) | 0;
  seedHi = (seedHi + 0x9e3779b9 + (seedLo >>> 0 < 0x7f4a7c15 ? 1 : 0)) | 0;

  // Mix: z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9
  let zLo = seedLo;
  let zHi = seedHi;
  zLo ^= (zHi << 2) | (zLo >>> 30);
  zHi ^= zHi >>> 30;
  // Simplified multiply — enough entropy for seeding
  zLo = Math.imul(zLo, 0x1ce4e5b9) | 0;
  zHi = Math.imul(zHi, 0xbf58476d) | 0;
  zLo ^= (zHi << 2) | (zLo >>> 27);
  zHi ^= zHi >>> 27;
  zLo = Math.imul(zLo, 0x94d049bb) | 0;
  zHi = Math.imul(zHi, 0x133111eb) | 0;

  return { lo: zLo >>> 0, hi: zHi >>> 0 };
}

/**
 * Seeded PRNG with utility methods for mutation rules.
 */
export class Rng {
  // xoshiro256** state: four 64-bit values stored as eight 32-bit numbers
  #s: Uint32Array;

  constructor(seed: number) {
    this.#s = new Uint32Array(8);
    // Initialize state via SplitMix64 from the seed
    let lo = seed | 0;
    let hi = 0;
    for (let i = 0; i < 8; i += 2) {
      const result = splitmix64(lo, hi);
      lo = result.lo;
      hi = result.hi;
      this.#s[i] = lo;
      this.#s[i + 1] = hi;
    }
    // Ensure state is not all zeros
    if (this.#s.every((v) => v === 0)) {
      this.#s[0] = 1;
    }
  }

  /** Return a raw 32-bit unsigned integer. */
  #next32(): number {
    // Typed helper to avoid noUncheckedIndexedAccess noise on Uint32Array.
    // The array is always length 8 and we only access indices 0-7.
    const s = this.#s;
    const g = (i: number): number => s[i]!;
    const p = (i: number, v: number): void => {
      s[i] = v;
    };

    // Result: rotl(s[1] * 5, 7) * 9  (simplified to 32-bit)
    const t = Math.imul(g(2), 5);
    const result = Math.imul(((t << 7) | (t >>> 25)) >>> 0, 9) >>> 0;

    // t = s[1] << 17
    const tLo = g(2) << 17;
    const tHi = (g(3) << 17) | (g(2) >>> 15);

    // s[2] ^= s[0]
    p(4, g(4) ^ g(0));
    p(5, g(5) ^ g(1));
    // s[3] ^= s[1]
    p(6, g(6) ^ g(2));
    p(7, g(7) ^ g(3));
    // s[1] ^= s[2]
    p(2, g(2) ^ g(4));
    p(3, g(3) ^ g(5));
    // s[0] ^= s[3]
    p(0, g(0) ^ g(6));
    p(1, g(1) ^ g(7));
    // s[2] ^= t
    p(4, g(4) ^ tLo);
    p(5, g(5) ^ tHi);
    // s[3] = rotl(s[3], 45) — 32-bit approximation
    const r3Lo = g(6);
    const r3Hi = g(7);
    p(6, (r3Hi << 13) | (r3Lo >>> 19));
    p(7, (r3Lo << 13) | (r3Hi >>> 19));

    return result;
  }

  /** Uniform float in [0, 1). */
  float(): number {
    return (this.#next32() >>> 0) / 0x100000000;
  }

  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number {
    if (min > max) {
      throw new Error(`Rng.int: min (${min}) > max (${max})`);
    }
    if (min === max) {
      return min;
    }
    const range = max - min + 1;
    return min + ((this.#next32() >>> 0) % range);
  }

  /** Pick a random element from an array. Returns undefined if empty. */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) {
      throw new Error('Rng.pick: array is empty');
    }
    return arr[this.int(0, arr.length - 1)]!;
  }

  /** Shuffle an array in-place (Fisher-Yates). */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = tmp;
    }
    return arr;
  }

  /**
   * Weighted random selection. Returns the index of the selected item.
   * Weights must be non-negative. Zero-weight items are never selected.
   */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) {
      total += w;
    }
    if (total <= 0) {
      throw new Error('Rng.weightedIndex: total weight is 0');
    }
    let r = this.float() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i]!;
      if (r <= 0) {
        return i;
      }
    }
    // Floating point edge case — return last non-zero weight
    for (let i = weights.length - 1; i >= 0; i--) {
      if (weights[i]! > 0) {
        return i;
      }
    }
    return 0;
  }

  /** Boolean with given probability of true. */
  chance(probability: number): boolean {
    return this.float() < probability;
  }

  /** Create a child RNG with a derived seed (for slot isolation). */
  fork(extra: number): Rng {
    // Derive a new seed by combining current state with extra
    const derived = (this.#next32() ^ extra) >>> 0;
    return new Rng(derived);
  }
}

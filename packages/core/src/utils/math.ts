/**
 * Generic integer math helpers.
 */

/** Check if a number is a power of 2. */
export function isPowerOf2(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/** Compute integer log2 for a power of 2. */
export function log2(n: number): number {
  let result = 0;
  let v = n;
  while (v > 1) {
    v >>= 1;
    result++;
  }
  return result;
}

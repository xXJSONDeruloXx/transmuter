import { describe, expect, it } from 'vitest';

import { isPowerOf2, log2 } from './math.js';

describe('isPowerOf2', () => {
  it('returns true for powers of two', () => {
    expect(isPowerOf2(1)).toBe(true);
    expect(isPowerOf2(2)).toBe(true);
    expect(isPowerOf2(4)).toBe(true);
    expect(isPowerOf2(8)).toBe(true);
    expect(isPowerOf2(1024)).toBe(true);
    expect(isPowerOf2(1 << 30)).toBe(true);
  });

  it('returns false for non-powers of two', () => {
    expect(isPowerOf2(3)).toBe(false);
    expect(isPowerOf2(5)).toBe(false);
    expect(isPowerOf2(6)).toBe(false);
    expect(isPowerOf2(1023)).toBe(false);
  });

  it('returns false for zero and negatives', () => {
    expect(isPowerOf2(0)).toBe(false);
    expect(isPowerOf2(-1)).toBe(false);
    expect(isPowerOf2(-4)).toBe(false);
  });
});

describe('log2', () => {
  it('returns 0 for 1', () => {
    expect(log2(1)).toBe(0);
  });

  it('returns the exponent for powers of two', () => {
    expect(log2(2)).toBe(1);
    expect(log2(4)).toBe(2);
    expect(log2(8)).toBe(3);
    expect(log2(16)).toBe(4);
    expect(log2(1024)).toBe(10);
    expect(log2(1 << 30)).toBe(30);
  });
});

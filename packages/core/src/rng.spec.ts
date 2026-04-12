import { describe, expect, it } from 'vitest';

import { Rng } from './rng.js';

describe('Rng', () => {
  it('produces deterministic output for the same seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 20 }, () => a.float());
    const seqB = Array.from({ length: 20 }, () => b.float());
    expect(seqA).toEqual(seqB);
  });

  it('produces different output for different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const seqA = Array.from({ length: 10 }, () => a.float());
    const seqB = Array.from({ length: 10 }, () => b.float());
    expect(seqA).not.toEqual(seqB);
  });

  it('float() returns values in [0, 1)', () => {
    const rng = new Rng(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng.float();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() returns values in [min, max]', () => {
    const rng = new Rng(456);
    const counts = new Map<number, number>();
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    // All values 3-7 should appear at least once in 1000 trials
    for (let v = 3; v <= 7; v++) {
      expect(counts.get(v)).toBeGreaterThan(0);
    }
  });

  it('pick() selects from array', () => {
    const rng = new Rng(789);
    const arr = ['a', 'b', 'c'];
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      seen.add(rng.pick(arr));
    }
    expect(seen.size).toBe(3);
  });

  it('pick() throws on empty array', () => {
    const rng = new Rng(0);
    expect(() => rng.pick([])).toThrow('empty');
  });

  it('weightedIndex() respects weights', () => {
    const rng = new Rng(111);
    const counts = [0, 0, 0];
    const weights = [1, 10, 1];
    for (let i = 0; i < 1000; i++) {
      counts[rng.weightedIndex(weights)]!++;
    }
    // Index 1 (weight 10) should be picked much more often than 0 or 2
    expect(counts[1]).toBeGreaterThan(counts[0]! * 2);
    expect(counts[1]).toBeGreaterThan(counts[2]! * 2);
  });

  it('fork() produces a different stream', () => {
    const rng = new Rng(42);
    const child = rng.fork(1);
    const parentSeq = Array.from({ length: 10 }, () => rng.float());
    const childSeq = Array.from({ length: 10 }, () => child.float());
    expect(parentSeq).not.toEqual(childSeq);
  });

  it('shuffle() produces a permutation', () => {
    const rng = new Rng(999);
    const arr = [1, 2, 3, 4, 5];
    const copy = [...arr];
    rng.shuffle(copy);
    expect(copy.sort()).toEqual(arr);
  });
});

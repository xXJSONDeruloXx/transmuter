import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { compoundReturn } from './compound-return.js';

describe('compound-return', () => {
  it('folds return with binary expression into compound assignment', () => {
    const result = compoundReturn.apply(makeRuleCtx(`int foo(int x) { return x / 256; }`));
    expect(result).not.toBeNull();
    expect(result!.source).toContain('return x /= 256;');
  });

  it('folds return through a cast expression', () => {
    const result = compoundReturn.apply(makeRuleCtx(`short foo(int x) { return (short)(x >> 8); }`));
    expect(result).not.toBeNull();
    expect(result!.source).toContain('return x >>= 8;');
  });

  it('expands compound assignment return to plain form', () => {
    const result = compoundReturn.apply(makeRuleCtx(`int foo(int x) { return x /= 256; }`));
    expect(result).not.toBeNull();
    expect(result!.source).toContain('return (x / 256);');
  });

  it('returns null when return has no suitable expression', () => {
    const result = compoundReturn.apply(makeRuleCtx(`int foo(int x) { return 42; }`));
    expect(result).toBeNull();
  });
});

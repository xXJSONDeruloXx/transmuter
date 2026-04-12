import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { shiftDivSwap } from './shift-div-swap.js';

describe('shift-div-swap', () => {
  it('converts right shift to division', () => {
    const result = shiftDivSwap.apply(makeRuleCtx(`int foo(int x) { return x >> 8; }`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe('int foo(int x) { return x / 256; }');
  });

  it('converts division by power of 2 to right shift', () => {
    const result = shiftDivSwap.apply(makeRuleCtx(`int foo(int x) { return x / 256; }`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe('int foo(int x) { return x >> 8; }');
  });

  it('converts compound right shift to compound division', () => {
    const result = shiftDivSwap.apply(makeRuleCtx(`int foo(int x) { x >>= 4; return x; }`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe('int foo(int x) { x /= 16; return x; }');
  });

  it('converts compound division to compound right shift', () => {
    const result = shiftDivSwap.apply(makeRuleCtx(`int foo(int x) { x /= 16; return x; }`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe('int foo(int x) { x >>= 4; return x; }');
  });

  it('ignores division by non-power-of-2', () => {
    const result = shiftDivSwap.apply(makeRuleCtx(`int foo(int x) { return x / 7; }`));
    expect(result).toBeNull();
  });
});

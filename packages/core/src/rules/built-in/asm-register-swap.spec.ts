import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { asmRegisterSwap } from './asm-register-swap.js';

describe('asm-register-swap', () => {
  it('swaps register constraint from r to l', () => {
    const result = asmRegisterSwap.apply(makeRuleCtx(`void foo() { int x; asm("" : "+r"(x)); }`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe('void foo() { int x; asm("" : "+l"(x)); }');
  });

  it('returns null for code without asm blocks', () => {
    const result = asmRegisterSwap.apply(makeRuleCtx(`void foo() { int x = 1; }`));
    expect(result).toBeNull();
  });
});

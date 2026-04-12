import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { commutativeSwap } from './commutative-swap.js';

describe('commutative-swap', () => {
  it('swaps operands of a commutative binary operation', () => {
    const result = commutativeSwap.apply(makeRuleCtx(`void foo() {\n  int x = a + b;\n}`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe('void foo() {\n  int x = b + a;\n}');
  });
});

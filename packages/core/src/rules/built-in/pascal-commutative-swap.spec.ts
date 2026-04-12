import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { pascalCommutativeSwap } from './pascal-commutative-swap.js';

describe('pascal-commutative-swap', () => {
  it('swaps operands of a commutative binary operation', () => {
    const result = pascalCommutativeSwap.apply(
      makeRuleCtx(`function foo: integer;\nbegin\n  foo := a + b;\nend;`, { language: 'pascal' }),
    );
    expect(result).not.toBeNull();
    expect(result!.source).toBe('function foo: integer;\nbegin\n  foo := b + a;\nend;');
  });
});

import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { inequalitySwap } from './inequality-swap.js';

describe('inequality-swap', () => {
  it('swaps operands and flips comparison operator', () => {
    const result = inequalitySwap.apply(makeRuleCtx(`void foo() {\n  if (a < b) return;\n}`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe(`void foo() {\n  if (b > a) return;\n}`);
  });
});

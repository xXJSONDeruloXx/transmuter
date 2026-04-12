import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { addSubSwap } from './add-sub-swap.js';

describe('add-sub-swap', () => {
  it('converts subtraction to addition of negation', () => {
    const result = addSubSwap.apply(makeRuleCtx(`void foo() {\n  int x = a - b;\n}`));
    expect(result).not.toBeNull();
    expect(result!.source).toContain('a + (-b)');
  });
});

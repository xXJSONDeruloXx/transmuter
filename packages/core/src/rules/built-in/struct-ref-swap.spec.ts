import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { structRefSwap } from './struct-ref-swap.js';

describe('struct-ref-swap', () => {
  it('converts arrow access to dereference-dot form', () => {
    const result = structRefSwap.apply(makeRuleCtx(`void foo() {\n  int x = a->b;\n}`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe(`void foo() {\n  int x = (*a).b;\n}`);
  });
});

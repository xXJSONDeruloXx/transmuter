import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { expandExpr } from './expand-expr.js';

describe('expand-expr', () => {
  it('replaces a variable reference with its assigned value', () => {
    const result = expandExpr.apply(makeRuleCtx(`void foo() { int x, y; x = 5; y = x + 1; }`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe('void foo() { int x, y; x = 5; y = 5 + 1; }');
  });
});

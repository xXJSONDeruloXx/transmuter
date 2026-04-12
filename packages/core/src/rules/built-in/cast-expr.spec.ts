import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { castExpr } from './cast-expr.js';

describe('cast-expr', () => {
  it('adds a type cast to an expression', () => {
    const result = castExpr.apply(makeRuleCtx(`void foo() {\n  int x = a + b;\n}`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe('void foo() {\n  int (int)x = a + b;\n}');
  });
});

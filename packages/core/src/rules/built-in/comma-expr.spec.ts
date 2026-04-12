import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { commaExpr } from './comma-expr.js';

describe('comma-expr', () => {
  it('wraps an expression with a comma operator', () => {
    const result = commaExpr.apply(makeRuleCtx(`void foo() { int a = 1; int b = a; }`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe('void foo() { int a = 1; int b = (0, a); }');
  });
});

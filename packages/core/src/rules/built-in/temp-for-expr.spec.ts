import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { tempForExpr } from './temp-for-expr.js';

describe('temp-for-expr', () => {
  it('extracts a sub-expression into a temporary variable', () => {
    const result = tempForExpr.apply(makeRuleCtx(`void foo() {\n  int a = 1 + 2;\n}`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe('void foo() {\n  int _t0 = 1 + 2;\n  int a = _t0;\n}');
  });
});

import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { reorderStmts } from './reorder-stmts.js';

describe('reorder-stmts', () => {
  it('swaps two adjacent statements', () => {
    const source = `void foo() {\n  int a = 1;\n  int b = 2;\n  a = b;\n}`;
    const result = reorderStmts.apply(makeRuleCtx(source));
    expect(result).not.toBeNull();
    expect(result!.source).toBe(`void foo() {\n  int b = 2;\n  int a = 1;\n  a = b;\n}`);
  });

  it('returns null for single-statement function', () => {
    const result = reorderStmts.apply(makeRuleCtx(`void foo() {\n  return;\n}`));
    expect(result).toBeNull();
  });
});

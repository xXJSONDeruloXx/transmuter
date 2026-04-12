import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { deleteStmt } from './delete-stmt.js';

describe('delete-stmt', () => {
  it('deletes an expression statement', () => {
    const source = `void foo() {\n  int x = 1;\n  x = x + 1;\n  return;\n}`;
    const result = deleteStmt.apply(makeRuleCtx(source));
    expect(result).not.toBeNull();
    expect(result!.source).toBe(`void foo() {\n  int x = 1;\n  return;\n}`);
  });

  it('deletes an if statement', () => {
    const source = `void foo() {\n  int x = 1;\n  if (x < 0) x += 1;\n  return;\n}`;
    const result = deleteStmt.apply(makeRuleCtx(source));
    expect(result).not.toBeNull();
    expect(result!.source).toBe(`void foo() {\n  int x = 1;\n  return;\n}`);
  });

  it('does not delete declarations or return statements', () => {
    const result = deleteStmt.apply(makeRuleCtx(`void foo() { int x = 1; return; }`));
    expect(result).toBeNull();
  });
});

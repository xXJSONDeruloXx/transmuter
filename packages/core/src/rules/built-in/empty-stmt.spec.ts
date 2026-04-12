import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { emptyStmt } from './empty-stmt.js';

describe('empty-stmt', () => {
  it('inserts an empty statement', () => {
    const result = emptyStmt.apply(makeRuleCtx(`void foo() {\n  int a = 1;\n}`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe('void foo() {\n  int a = 1;\n  ;\n}');
  });
});

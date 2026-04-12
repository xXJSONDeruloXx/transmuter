import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { reorderDecls } from './reorder-decls.js';

describe('reorder-decls', () => {
  it('swaps two adjacent declarations', () => {
    const result = reorderDecls.apply(makeRuleCtx(`void foo() {\n  int a = 1;\n  int b = 2;\n  a = b;\n}`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe('void foo() {\n  int b = 2;\n  int a = 1;\n  a = b;\n}');
  });
});

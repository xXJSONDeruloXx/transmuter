import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { extraParens } from './extra-parens.js';

describe('extra-parens', () => {
  it('adds extra parentheses around an expression', () => {
    const result = extraParens.apply(makeRuleCtx(`void foo() {\n  int x = a + b;\n}`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe(`void foo() {\n  int x = (a + b);\n}`);
  });
});

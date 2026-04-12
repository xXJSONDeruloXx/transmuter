import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { padVarDecl } from './pad-var-decl.js';

describe('pad-var-decl', () => {
  it('inserts a pad variable declaration', () => {
    const result = padVarDecl.apply(makeRuleCtx(`void foo() {\n  int a = 1;\n}`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe(`void foo() {\n  int a = 1;\n  int _pad0;\n}`);
  });
});

import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { splitAssignment } from './split-assignment.js';

describe('split-assignment', () => {
  it('splits a field-access chain into two assignments', () => {
    const result = splitAssignment.apply(makeRuleCtx(`void foo() {\n  int x;\n  x = a.b.c;\n}`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe(`void foo() {\n  int x;\n    int _t0 = a.b;\n  x = _t0.c;\n}`);
  });
});

import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { selfAssignment } from './self-assignment.js';

describe('self-assignment', () => {
  it('inserts a self-assignment statement', () => {
    const result = selfAssignment.apply(makeRuleCtx(`void foo() {\n  int a = 1;\n  int b = 2;\n}`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe(`void foo() {\n  int a = 1;\n  a = a;\n  int b = 2;\n}`);
  });
});

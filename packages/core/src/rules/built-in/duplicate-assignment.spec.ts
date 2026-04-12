import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { duplicateAssignment } from './duplicate-assignment.js';

describe('duplicate-assignment', () => {
  it('duplicates an assignment statement', () => {
    const result = duplicateAssignment.apply(makeRuleCtx(`void foo() {\n  int x;\n  x = 1;\n}`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe('void foo() {\n  int x;\n  x = 1;\n  x = 1;\n}');
  });
});

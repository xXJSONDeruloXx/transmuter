import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { branchCompareShape } from './branch-compare-shape.js';

describe('branch-compare-shape', () => {
  it('rewrites if inequality into a negated swapped equality', () => {
    const result = branchCompareShape.apply(makeRuleCtx('void foo() {\n  if (a != b) goto end;\nend:;\n}'));
    expect(result).not.toBeNull();
    expect(result!.source).toBe('void foo() {\n  if (!(b == a)) goto end;\nend:;\n}');
  });

  it('does not rewrite equality outside an if condition', () => {
    const result = branchCompareShape.apply(makeRuleCtx('void foo() {\n  int x = a != b;\n}'));
    expect(result).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { chainAssignment } from './chain-assignment.js';

describe('chain-assignment', () => {
  it('combines adjacent assignments with identical RHS into a chain', () => {
    const result = chainAssignment.apply(makeRuleCtx(`void foo() { int a, b, x; a = x; b = x; }`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe(`void foo() { int a, b, x; a = b = x; }`);
  });
});

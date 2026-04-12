import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { longChainAssignment } from './long-chain-assignment.js';

describe('long-chain-assignment', () => {
  it('chains consecutive assignments with the same RHS', () => {
    const result = longChainAssignment.apply(makeRuleCtx(`void foo() { int a, b, c, x; a = x; b = x; c = x; }`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe('void foo() { int a, b, c, x; a = b = c = x; }');
  });
});

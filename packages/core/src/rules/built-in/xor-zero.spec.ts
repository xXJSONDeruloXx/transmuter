import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { xorZero } from './xor-zero.js';

describe('xor-zero', () => {
  it('adds ^ 0 to an expression', () => {
    const result = xorZero.apply(makeRuleCtx(`void foo() { int a = 1; int b = a; }`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe('void foo() { int a = 1; int b = (a ^ 0); }');
  });
});

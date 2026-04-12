import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { multZero } from './mult-zero.js';

describe('mult-zero', () => {
  it('adds an identity operation to an expression', () => {
    const result = multZero.apply(makeRuleCtx(`void foo() { int a = 1; int b = a; }`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe('void foo() { int a = 1; int b = (a * 1); }');
  });
});

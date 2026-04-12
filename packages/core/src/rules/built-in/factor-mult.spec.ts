import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { factorMult } from './factor-mult.js';

describe('factor-mult', () => {
  it('expands a multiplication expression', () => {
    const result = factorMult.apply(makeRuleCtx(`void foo() { int x = a * 5; }`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe('void foo() { int x = (a * 4 + a); }');
  });
});

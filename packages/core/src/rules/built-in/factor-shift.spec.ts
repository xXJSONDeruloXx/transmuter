import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { factorShift } from './factor-shift.js';

describe('factor-shift', () => {
  it('converts a shift to multiplication', () => {
    const result = factorShift.apply(makeRuleCtx(`void foo() {\n  int x = a << 2;\n}`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe(`void foo() {\n  int x = (a * 4);\n}`);
  });
});

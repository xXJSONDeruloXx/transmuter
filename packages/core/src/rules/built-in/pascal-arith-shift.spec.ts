import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { pascalArithShift } from './pascal-arith-shift.js';

describe('pascal-arith-shift', () => {
  it('converts multiplication by power-of-2 to shl', () => {
    const result = pascalArithShift.apply(
      makeRuleCtx(`function foo(x: integer): integer;\nbegin\n  foo := x * 4;\nend;`, {
        language: 'pascal',
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.source).toBe('function foo(x: integer): integer;\nbegin\n  foo := shl(x, 2);\nend;');
  });
});

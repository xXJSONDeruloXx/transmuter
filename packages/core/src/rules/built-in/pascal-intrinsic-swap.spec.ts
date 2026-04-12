import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { pascalIntrinsicSwap } from './pascal-intrinsic-swap.js';

describe('pascal-intrinsic-swap', () => {
  it('swaps ord to integer', () => {
    const result = pascalIntrinsicSwap.apply(
      makeRuleCtx(`function foo(x: char): integer;\nbegin\n  foo := ord(x);\nend;`, {
        language: 'pascal',
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.source).toBe('function foo(x: char): integer;\nbegin\n  foo := integer(x);\nend;');
  });
});

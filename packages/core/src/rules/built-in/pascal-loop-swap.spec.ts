import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { pascalLoopSwap } from './pascal-loop-swap.js';

describe('pascal-loop-swap', () => {
  it('converts while-true to repeat-until-false', () => {
    const result = pascalLoopSwap.apply(
      makeRuleCtx(`procedure foo;\nbegin\n  while true do\n  begin\n    x := 1;\n  end;\nend;`, { language: 'pascal' }),
    );
    expect(result).not.toBeNull();
    expect(result!.source).toBe('procedure foo;\nbegin\n  repeat\n    x := 1\n  until false\nend;');
  });
});

import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { pascalBoolNegate } from './pascal-bool-negate.js';

describe('pascal-bool-negate', () => {
  it('adds double negation to a boolean expression', () => {
    const result = pascalBoolNegate.apply(
      makeRuleCtx(`procedure foo(x: integer);\nbegin\n  if x > 0 then\n    x := 1;\nend;`, { language: 'pascal' }),
    );
    expect(result).not.toBeNull();
    expect(result!.source).toBe('procedure foo(x: integer);\nbegin\n  if not (not (x > 0)) then\n    x := 1;\nend;');
  });
});

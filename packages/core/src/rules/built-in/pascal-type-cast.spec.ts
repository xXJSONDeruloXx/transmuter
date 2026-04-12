import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { pascalTypeCast } from './pascal-type-cast.js';

describe('pascal-type-cast', () => {
  it('adds a function-style type cast', () => {
    const result = pascalTypeCast.apply(
      makeRuleCtx(`function foo(x: integer): integer;\nbegin\n  foo := x + 1;\nend;`, {
        language: 'pascal',
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.source).toBe('function foo(integer(x): integer): integer;\nbegin\n  foo := x + 1;\nend;');
  });
});

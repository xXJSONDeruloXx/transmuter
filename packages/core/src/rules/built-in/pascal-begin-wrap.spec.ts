import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { pascalBeginWrap } from './pascal-begin-wrap.js';

describe('pascal-begin-wrap', () => {
  it('wraps a single statement in begin/end', () => {
    const result = pascalBeginWrap.apply(
      makeRuleCtx(`procedure foo(x: integer);\nbegin\n  if x > 0 then\n    x := 1;\nend;`, { language: 'pascal' }),
    );
    expect(result).not.toBeNull();
    expect(result!.source).toBe(
      'procedure foo(x: integer);\nbegin\n  if x > 0 then\n    begin\n      x := 1\n    end;\nend;',
    );
  });
});

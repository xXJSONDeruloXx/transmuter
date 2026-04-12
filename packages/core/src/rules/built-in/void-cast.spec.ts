import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { voidCast } from './void-cast.js';

describe('void-cast', () => {
  it('wraps a function call with (void)', () => {
    const result = voidCast.apply(makeRuleCtx(`void foo() {\n  bar();\n}`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe('void foo() {\n  (void)bar();\n}');
  });
});

import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { randomizeType } from './randomize-type.js';

describe('randomize-type', () => {
  it('replaces the type of a variable declaration', () => {
    const result = randomizeType.apply(makeRuleCtx(`void foo() { int x = 1; }`));
    expect(result).not.toBeNull();
    // The type should have changed from `int` to something else
    expect(result!.source).not.toContain('int x');
    // The variable name and value should remain
    expect(result!.source).toContain('x = 1;');
  });
});

import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { removeCast } from './remove-cast.js';

describe('remove-cast', () => {
  it('removes a type cast expression', () => {
    const result = removeCast.apply(makeRuleCtx(`void foo() {\n  int x = (int)y;\n}`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe(`void foo() {\n  int x = y;\n}`);
  });
});

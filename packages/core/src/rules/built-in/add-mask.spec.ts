import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { addMask } from './add-mask.js';

describe('add-mask', () => {
  it('adds a bitwise AND mask to an expression', () => {
    const result = addMask.apply(makeRuleCtx(`void foo() {\n  int x = a;\n}`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe('void foo() {\n  int x = (a & 0xFF);\n}');
  });
});

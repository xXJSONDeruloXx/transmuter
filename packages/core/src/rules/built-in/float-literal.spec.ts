import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { floatLiteral } from './float-literal.js';

describe('float-literal', () => {
  it('modifies a float literal', () => {
    const result = floatLiteral.apply(makeRuleCtx(`void foo() { float x = 1.0; }`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe('void foo() { float x = 1.0f; }');
  });
});

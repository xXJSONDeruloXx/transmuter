import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { pascalExtraParens } from './pascal-extra-parens.js';

describe('pascal-extra-parens', () => {
  it('adds extra parentheses around a binary expression', () => {
    const result = pascalExtraParens.apply(
      makeRuleCtx(`function foo: integer;\nbegin\n  foo := a + b;\nend;`, { language: 'pascal' }),
    );
    expect(result).not.toBeNull();
    expect(result!.source).toBe('function foo: integer;\nbegin\n  foo := (a + b);\nend;');
  });
});

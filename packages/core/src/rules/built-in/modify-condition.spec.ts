import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { modifyCondition } from './modify-condition.js';

describe('modify-condition', () => {
  it('modifies a conditional expression', () => {
    const result = modifyCondition.apply(makeRuleCtx(`void foo() { int a = 1; if (a) return; }`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe('void foo() { int a = 1; if (!!a) return; }');
  });
});

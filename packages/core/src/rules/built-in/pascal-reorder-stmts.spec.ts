import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { pascalReorderStmts } from './pascal-reorder-stmts.js';

describe('pascal-reorder-stmts', () => {
  it('swaps two adjacent statements', () => {
    const result = pascalReorderStmts.apply(
      makeRuleCtx(`procedure foo;\nbegin\n  a := 1;\n  b := 2;\nend;`, { language: 'pascal' }),
    );
    expect(result).not.toBeNull();
    expect(result!.source).toBe('procedure foo;\nbegin\n  b := 2;\n  a := 1;\nend;');
  });
});

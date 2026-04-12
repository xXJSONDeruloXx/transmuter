import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { pascalReorderVars } from './pascal-reorder-vars.js';

describe('pascal-reorder-vars', () => {
  it('swaps two adjacent var declarations', () => {
    const result = pascalReorderVars.apply(
      makeRuleCtx(`procedure foo;\nvar\n  a: integer;\n  b: integer;\nbegin\n  a := 1;\nend;`, { language: 'pascal' }),
    );
    expect(result).not.toBeNull();
    expect(result!.source).toBe('procedure foo;\nvar\n  b: integer;\n  a: integer;\nbegin\n  a := 1;\nend;');
  });
});

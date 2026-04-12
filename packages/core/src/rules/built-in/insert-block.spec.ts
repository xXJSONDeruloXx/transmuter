import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { insertBlock } from './insert-block.js';

describe('insert-block', () => {
  it('wraps a statement in a block construct', () => {
    const result = insertBlock.apply(makeRuleCtx(`void foo() {\n  int a = 1;\n}`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe('void foo() {\n  do {\n      int a = 1;\n  } while(0);\n}');
  });
});

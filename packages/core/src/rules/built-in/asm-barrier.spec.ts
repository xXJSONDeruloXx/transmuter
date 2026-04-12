import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { asmBarrier } from './asm-barrier.js';

describe('asm-barrier', () => {
  it('inserts an asm barrier after a variable assignment', () => {
    const source = `void foo() {\n  int x;\n  x = 1;\n}`;
    const result = asmBarrier.apply(makeRuleCtx(source));
    expect(result).not.toBeNull();
    expect(result!.source).toBe('void foo() {\n  int x;\n  x = 1;\n  asm("" : "+r"(x));\n}');
  });
});

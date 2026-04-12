import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { sameline } from './sameline.js';

describe('sameline', () => {
  it('combines two adjacent statements onto the same line', () => {
    const result = sameline.apply(makeRuleCtx(`void foo() {\n  int a = 1;\n  int b = 2;\n}`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe('void foo() {\n  int a = 1; int b = 2;\n}');
  });
});

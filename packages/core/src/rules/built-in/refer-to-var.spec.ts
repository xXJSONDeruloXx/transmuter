import { describe, expect, it } from 'vitest';

import { makeRuleCtx } from '../test-utils.js';
import { referToVar } from './refer-to-var.js';

describe('refer-to-var', () => {
  it('inserts a pointer declaration and dereference', () => {
    const result = referToVar.apply(makeRuleCtx(`void foo() { int x = 5; int y = x + 1; }`));
    expect(result).not.toBeNull();
    expect(result!.source).toBe('void foo() { int x = 5;\nint *_ptr0 = &x; int y = (*_ptr0) + 1; }');
  });
});

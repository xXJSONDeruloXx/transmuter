import { describe, expect, it } from 'vitest';

import { noAsmPin } from './no-asm-pin.js';

describe('no-asm-pin', () => {
  describe('asm barrier statement', () => {
    const source = `void foo() {
  int x;
  x = 1;
  asm("" : "+r"(x));
}`;

    it('detects the asm barrier as a violation', () => {
      const violations = noAsmPin.detect(source, 'foo');
      expect(violations).toHaveLength(1);
      expect(violations[0]).toEqual({
        id: 'asm-barrier:L4',
        lines: { start: 4, end: 4 },
        description: 'Inline asm barrier: asm("" : "+r"(x));',
        text: 'asm("" : "+r"(x));',
      });
    });

    it('removes the asm barrier line entirely', () => {
      const [violation] = noAsmPin.detect(source, 'foo');
      expect(violation).toBeDefined();
      const result = noAsmPin.remove(source, violation!);
      expect(result).toBe(`void foo() {
  int x;
  x = 1;
}`);
    });
  });

  describe('no violations', () => {
    it('returns an empty list when the function has no asm', () => {
      const source = `void foo() {
  int x = 1;
  x = x + 1;
}`;
      const violations = noAsmPin.detect(source, 'foo');
      expect(violations).toHaveLength(0);
    });
  });
});

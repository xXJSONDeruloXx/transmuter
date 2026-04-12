import { describe, expect, it } from 'vitest';

import { noGoto } from './no-goto.js';

describe('no-goto', () => {
  describe('single goto', () => {
    const source = `void foo() {
  int x = 0;
  if (x == 0) {
    goto end;
  }
  x = 1;
end:
  x = 2;
}`;

    it('detects the goto statement as a violation', () => {
      const violations = noGoto.detect(source, 'foo');
      expect(violations).toHaveLength(1);
      expect(violations[0]).toEqual({
        id: 'goto:L4',
        lines: { start: 4, end: 4 },
        description: 'goto statement: goto end;',
        text: 'goto end;',
      });
    });

    it('replaces the goto with an empty statement preserving indentation', () => {
      const [violation] = noGoto.detect(source, 'foo');
      expect(violation).toBeDefined();
      const result = noGoto.remove(source, violation!);
      expect(result).toBe(`void foo() {
  int x = 0;
  if (x == 0) {
    ;
  }
  x = 1;
end:
  x = 2;
}`);
    });
  });

  describe('multiple gotos', () => {
    const source = `void foo() {
  if (a) goto one;
  if (b) goto two;
  return;
one:
  return;
two:
  return;
}`;

    it('detects each goto separately', () => {
      const violations = noGoto.detect(source, 'foo');
      expect(violations).toHaveLength(2);
      expect(violations.map((v) => v.id)).toEqual(['goto:L2', 'goto:L3']);
      expect(violations.map((v) => v.text)).toEqual(['goto one;', 'goto two;']);
    });
  });

  describe('containsViolation', () => {
    it('returns true when the goto text is still present', () => {
      const source = `void foo() { goto end; end: return; }`;
      const [violation] = noGoto.detect(source, 'foo');
      expect(violation).toBeDefined();
      expect(noGoto.containsViolation!(source, violation!)).toBe(true);
    });

    it('returns false after the goto has been removed', () => {
      const source = `void foo() {
  goto end;
end:
  return;
}`;
      const [violation] = noGoto.detect(source, 'foo');
      expect(violation).toBeDefined();
      const removed = noGoto.remove(source, violation!)!;
      expect(noGoto.containsViolation!(removed, violation!)).toBe(false);
    });
  });

  describe('no violations', () => {
    it('returns an empty list when there are no gotos', () => {
      const source = `void foo() {
  int x = 1;
}`;
      const violations = noGoto.detect(source, 'foo');
      expect(violations).toHaveLength(0);
    });
  });
});

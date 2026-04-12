import { describe, expect, it } from 'vitest';

import { noRedundantCastPascal } from './no-redundant-cast-pascal.js';

describe('no-redundant-cast-pascal', () => {
  describe('cast of a numeric literal', () => {
    const source = `function foo(x: integer): integer;
begin
  foo := integer(0);
end;`;

    it('detects the redundant integer() cast', () => {
      const violations = noRedundantCastPascal.detect(source, 'foo');
      expect(violations).toHaveLength(1);
      expect(violations[0]).toEqual({
        id: 'redundant-cast:L3:integer',
        lines: { start: 3, end: 3 },
        description: 'Redundant integer() cast at line 3',
        text: 'integer(0)',
      });
    });

    it('replaces the cast with the inner literal', () => {
      const [violation] = noRedundantCastPascal.detect(source, 'foo');
      expect(violation).toBeDefined();
      const result = noRedundantCastPascal.remove(source, violation!);
      expect(result).toBe(`function foo(x: integer): integer;
begin
  foo := 0;
end;`);
    });
  });

  describe('cast of an identifier', () => {
    const source = `function foo(x: integer): integer;
begin
  foo := byte(x);
end;`;

    it('detects the redundant byte() cast', () => {
      const violations = noRedundantCastPascal.detect(source, 'foo');
      expect(violations).toHaveLength(1);
      expect(violations[0]!.id).toBe('redundant-cast:L3:byte');
      expect(violations[0]!.text).toBe('byte(x)');
    });

    it('replaces the cast with the inner identifier', () => {
      const [violation] = noRedundantCastPascal.detect(source, 'foo');
      expect(violation).toBeDefined();
      const result = noRedundantCastPascal.remove(source, violation!);
      expect(result).toBe(`function foo(x: integer): integer;
begin
  foo := x;
end;`);
    });
  });

  describe('case-insensitive cast name matching', () => {
    const source = `function foo(x: integer): integer;
begin
  foo := Integer(x);
end;`;

    it('detects casts regardless of identifier casing', () => {
      const violations = noRedundantCastPascal.detect(source, 'foo');
      expect(violations).toHaveLength(1);
      expect(violations[0]!.id).toBe('redundant-cast:L3:integer');
    });
  });

  describe('non-cast function calls', () => {
    it('ignores calls to functions that are not in the cast list', () => {
      const source = `function foo(x: integer): integer;
begin
  foo := bar(x);
end;`;
      const violations = noRedundantCastPascal.detect(source, 'foo');
      expect(violations).toHaveLength(0);
    });

    it('ignores cast-named calls with non-trivial arguments', () => {
      const source = `function foo(x: integer): integer;
begin
  foo := integer(x + 1);
end;`;
      const violations = noRedundantCastPascal.detect(source, 'foo');
      expect(violations).toHaveLength(0);
    });
  });

  describe('no violations', () => {
    it('returns an empty list when there are no casts', () => {
      const source = `function foo(x: integer): integer;
begin
  foo := x + 1;
end;`;
      const violations = noRedundantCastPascal.detect(source, 'foo');
      expect(violations).toHaveLength(0);
    });

    it('returns an empty list when the target function is not present', () => {
      const source = `function bar(x: integer): integer;
begin
  bar := integer(0);
end;`;
      const violations = noRedundantCastPascal.detect(source, 'foo');
      expect(violations).toHaveLength(0);
    });
  });
});

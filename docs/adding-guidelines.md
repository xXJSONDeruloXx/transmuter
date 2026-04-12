# Adding Guidelines

Guide for adding new guidelines to Transmuter's refinement system.

## Overview

A guideline detects a specific code smell ("violation") in source code and defines how to remove it. The `transmuter refine` command uses guidelines to improve code quality of already-matching code while preserving the assembly match.

The refinement process:
1. Detect all violations of a guideline in the source
2. For each violation, remove it and run a sub-MutationSearch to re-match the target
3. Merge successful fixes into a single source

## File Location

```
packages/core/src/guidelines/built-in/<guideline-id>.ts
```

## Implement the Guideline Interface

```typescript
import { parse } from '~/parser.js';
import { findTargetFunction } from '~/rules/helpers.js';
import type { Guideline, Violation } from '../guideline.js';

export const noSomeSmell: Guideline = {
  id: 'no-some-smell',
  description: 'Remove some code smell from source code.',
  languages: ['c', 'cpp'],
  disabledRules: ['rule-that-would-reintroduce-smell'],

  detect(source: string, functionName: string): Violation[] {
    const root = parse('c', source);  // or use the appropriate language
    const fn = findTargetFunction(root, functionName);
    if (!fn) {
      return [];
    }

    const violations: Violation[] = [];
    const nodes = fn.findAll({ rule: { kind: 'some_node_kind' } });

    for (const node of nodes) {
      const startLine = node.range().start.line + 1;
      const endLine = node.range().end.line + 1;
      violations.push({
        id: `some-smell:L${startLine}`,
        lines: { start: startLine, end: endLine },
        description: `Some smell at line ${startLine}`,
        text: node.text(),
      });
    }

    return violations;
  },

  remove(source: string, violation: Violation): string | null {
    // Produce source with the violation removed.
    // Must compile (though it may not match the target).
    // Return null if no clean removal is possible.
    const root = parse('c', source);
    // ... find and remove the offending node ...
    return modifiedSource;
  },

  // Optional: fast AST-based check
  containsViolation(source: string, violation: Violation): boolean {
    // Return true if the source still contains this specific violation.
    // Used as a candidate filter during matching to prevent re-introduction.
    // If not provided, falls back to detect().
    return false;
  },
};
```

### Key Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique kebab-case identifier (shown in `transmuter refine --guideline`) |
| `description` | `string` | One-sentence description (shown when listing guidelines) |
| `languages` | `readonly Language[]` | Which languages this guideline supports |
| `disabledRules` | `string[]` | Rule IDs to disable during fix attempts, preventing re-introduction |
| `detect` | `(source, functionName) => Violation[]` | Find all violations in the source |
| `remove` | `(source, violation) => string \| null` | Remove a single violation |
| `containsViolation?` | `(source, violation) => boolean` | Fast check if a violation still exists |

### Violation Structure

```typescript
interface Violation {
  id: string;                           // Stable ID, e.g., "asm-pin:L42"
  lines: { start: number; end: number }; // 1-indexed line range
  description: string;                   // Human-readable
  text: string;                         // The violating source text
}
```

The `id` must be stable across re-parsing (typically derived from location + pattern). The refiner uses it to track violations across phases.

## How Detection Works

The `detect()` method parses the source with ast-grep and searches for AST patterns within the target function. Each match becomes a `Violation` with a unique ID, line range, and description.

Tips:
- Scope detection to the target function using `findTargetFunction()`
- Use 1-indexed line numbers (AST ranges are 0-indexed, so add 1)
- Make violation IDs stable: use `pattern:L{line}` format

## How Removal Works

The `remove()` method takes a source and a specific violation, and produces a modified source with that violation neutralized. The result must compile but does not need to match the target assembly -- the sub-MutationSearch handles re-matching.

Removal strategies:
- **Delete**: Remove the offending code entirely (e.g., `no-asm-pin` deletes asm barrier statements)
- **Replace**: Substitute with a semantically different but compilable alternative (e.g., `no-c-style-cast` replaces `(int)x` with `static_cast<int>(x)`)
- **Strip**: Remove part of a construct (e.g., `no-asm-pin` strips `register` and `asm("r1")` from declarations)

Return `null` if no clean removal is possible for the given violation.

## How the Refiner Uses the Guideline

1. **Detect phase**: Calls `detect()` to find all violations
2. **Phase 1 (explore)**: For each violation:
   - Calls `remove()` to get source without the violation
   - Compiles and scores the removed source
   - If score > 0, runs a sub-MutationSearch to permute back to a match
   - Disables rules listed in `disabledRules` to prevent re-introduction
   - If `containsViolation` is provided, uses it as a candidate filter
3. **Phase 2 (merge)**: Applies successful fixes one at a time, re-detecting after each

## The containsViolation Method

The optional `containsViolation()` method is used as a candidate filter during matching. When the sub-MutationSearch generates a candidate, the refiner checks if the violation was re-introduced. If so, the candidate is rejected.

This is more robust than string matching because it handles code reformatting (whitespace changes, statement reordering). See `no-asm-pin` for an example that uses full AST parsing.

If not provided, the refiner falls back to calling `detect()` and checking if the violation ID still appears.

## Register the Guideline

In `packages/core/src/guidelines/built-in/index.ts`:

```typescript
import { noSomeSmell } from './no-some-smell.js';

export const builtInGuidelines: Guideline[] = [
  noAsmPin,
  noGoto,
  noCStyleCast,
  noRedundantCastPascal,
  noSomeSmell,
];

export { noAsmPin, noGoto, noCStyleCast, noRedundantCastPascal, noSomeSmell };
```

Also add to the re-export in `packages/core/src/index.ts`:

```typescript
export { noAsmPin, noGoto, noCStyleCast, noRedundantCastPascal, noSomeSmell } from './guidelines/built-in/index.js';
```

## Add a Test

Test both `detect()` and `remove()`:

```typescript
import { describe, expect, it } from 'vitest';
import { noSomeSmell } from './no-some-smell.js';

describe('no-some-smell', () => {
  it('should detect violations', () => {
    const source = `void my_func() { /* violating code */ }`;
    const violations = noSomeSmell.detect(source, 'my_func');
    expect(violations).toHaveLength(1);
    expect(violations[0]!.id).toMatch(/^some-smell:L/);
  });

  it('should remove a violation', () => {
    const source = `void my_func() { /* violating code */ }`;
    const violations = noSomeSmell.detect(source, 'my_func');
    const result = noSomeSmell.remove(source, violations[0]!);
    expect(result).not.toBeNull();
    // Verify the violation is gone
    const remaining = noSomeSmell.detect(result!, 'my_func');
    expect(remaining).toHaveLength(0);
  });

  it('should return empty for wrong function name', () => {
    const source = `void other() { /* violating code */ }`;
    expect(noSomeSmell.detect(source, 'my_func')).toHaveLength(0);
  });
});
```

## Built-In Guidelines Reference

| Guideline | Languages | Disables | What It Detects |
|-----------|-----------|----------|-----------------|
| `no-asm-pin` | C | `asm-barrier`, `asm-register-swap` | Asm barriers (`asm("" : "+r"(var))`) and register pins (`register int x asm("r1")`) |
| `no-goto` | C, C++ | (none) | `goto` statements |
| `no-c-style-cast` | C++ | `cast-expr` | C-style casts (`(int)x`), replaces with `static_cast<int>(x)` |
| `no-redundant-cast-pascal` | Pascal | `pascal-type-cast` | Redundant function-style casts (`integer(0)`), removes cast wrapper |

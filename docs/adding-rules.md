# Adding Mutation Rules

Guide for adding new mutation rules to Transmuter.

## Overview

A mutation rule is a plugin that applies one type of source code transformation. Rules use ast-grep for AST analysis and return mutated source strings. The mutation engine selects rules via weighted random and only runs rules whose `languages` field matches the session language.

## File Location

```
packages/core/src/rules/built-in/<rule-name>.ts
```

Use kebab-case for the file name. Language-specific rules use the language as a prefix (e.g., `pascal-reorder-stmts.ts`).

## Implement the Rule Interface

```typescript
import type { MutationApplyResult } from '~/types.js';
import { findTargetFunction, replaceRange } from '../helpers.js';
import type { MutationContext, Rule } from '../rule.js';

export const myRule: Rule = {
  id: 'my-rule',
  description: 'One-sentence description of what the rule does.',
  languages: ['c', 'cpp'],  // which languages this rule supports
  defaultWeight: 15,         // higher = more likely to be selected

  apply(ctx: MutationContext): MutationApplyResult | null {
    const { source, root, rng, functionName, language } = ctx;

    // 1. Find the target function
    const fn = findTargetFunction(root, functionName, language);
    if (!fn) {
      return null;
    }

    // 2. Find candidate AST nodes to mutate
    const candidates = fn.findAll({ rule: { kind: 'some_node_kind' } });
    if (candidates.length === 0) {
      return null;
    }

    // 3. Pick a random candidate
    const node = rng.pick(candidates);

    // 4. Apply the mutation
    const range = node.range();
    const replacement = `mutated(${node.text()})`;
    const newSource = replaceRange(source, range.start.index, range.end.index, replacement);

    // 5. Return the mutated source and location
    return {
      source: newSource,
      location: { line: range.start.line + 1, column: range.start.column + 1 },
    };
  },
};
```

### Key Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique kebab-case identifier |
| `description` | `string` | One-sentence description (shown in `transmuter rules`) |
| `languages` | `readonly Language[]` | Which languages the rule supports (e.g., `['c', 'cpp']` or `['pascal']`) |
| `defaultWeight` | `number` | Selection probability weight. Higher = more likely. 0 = disabled by default |
| `apply` | `(ctx) => result \| null` | The mutation logic. Return `null` if the rule can't apply |

### MutationContext

| Property | Type | Description |
|----------|------|-------------|
| `source` | `string` | The current source code |
| `root` | `SgRoot` | Pre-parsed AST root (read-only) |
| `rng` | `Rng` | Seeded PRNG for deterministic choices |
| `functionName` | `string` | Target function name |
| `language` | `Language` | Source language for this session |
| `nodeFilter?` | `NodeFilter` | Optional filter that biases toward focus regions |

## Available Helpers

Import from `../helpers.js`:

| Helper | Description |
|--------|-------------|
| `findTargetFunction(root, name, language?)` | Find the function definition node. Handles C, C++ (qualified names), and Pascal |
| `getStatements(block)` | Get statement children of a `compound_statement` (C/C++) |
| `getDeclarations(fnBody)` | Get declaration nodes at the top of a function body (C/C++) |
| `replaceRange(source, start, end, replacement)` | Replace a character range in the source string |
| `swapRanges(source, aStart, aEnd, bStart, bEnd)` | Swap two non-overlapping ranges |
| `isInsideAsm(node)` | Check if a node is inside a `gnu_asm_expression` |
| `getIndentation(source, node)` | Get the whitespace indentation of a node |
| `escapeRegex(str)` | Escape special regex characters |

For Pascal, import from `../pascal-helpers.js`:

| Helper | Description |
|--------|-------------|
| `findPascalFunctionBody(root, name)` | Find the `compound_statement` (begin/end) of a Pascal function |
| `getPascalStatements(block)` | Get statements from a Pascal block, filtering out `begin`/`end`/`;` tokens |
| `getPascalVarDeclarations(fnNode)` | Find `var_declaration` nodes in the `var_section` |

## Register the Rule

In `packages/core/src/rules/built-in/index.ts`:

```typescript
import { myRule } from './my-rule.js';

export const builtInRules: Rule[] = [
  // ... existing rules ...
  myRule,
];

export { /* ... existing exports ... */ myRule };
```

Update the total count in the comment (e.g., `/** All 50 built-in mutation rules. */`).

## Add a Test

Create `packages/core/src/rules/built-in/my-rule.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { Rng } from '~/rng.js';
import { parse } from '~/parser.js';
import { myRule } from './my-rule.js';

describe('my-rule', () => {
  it('should apply the mutation', () => {
    const source = `void my_func() { int x = 1; }`;
    const root = parse('c', source);
    const rng = new Rng(42);

    const result = myRule.apply({
      source,
      root,
      rng,
      functionName: 'my_func',
      language: 'c',
    });

    expect(result).not.toBeNull();
    expect(result!.source).not.toBe(source);
    expect(result!.location.line).toBeGreaterThan(0);
  });

  it('should return null when no candidates found', () => {
    const source = `void other_func() {}`;
    const root = parse('c', source);
    const rng = new Rng(42);

    const result = myRule.apply({
      source,
      root,
      rng,
      functionName: 'my_func',
      language: 'c',
    });

    expect(result).toBeNull();
  });
});
```

## Tips

- **Return null generously.** If there are no valid candidates, the engine will try another rule. Returning null is expected, not an error.
- **Guard against asm regions.** If your rule manipulates arbitrary expressions, call `isInsideAsm(node)` to skip nodes inside inline assembly.
- **Use `rng` for all randomness.** Never use `Math.random()` -- the seeded PRNG enables reproducible runs.
- **Scope to the target function.** Always start by finding the target function and working within it. Don't mutate code outside the function.
- **Handle edge cases.** Check for empty arrays, missing AST fields, and overlapping ranges.
- **Location is 1-indexed.** AST node ranges from ast-grep are 0-indexed; add 1 to line and column for the return value.
- **Test with multiple seeds.** Different seeds exercise different code paths in rules that make random choices.

## Example: A Complete C/C++ Rule

See `packages/core/src/rules/built-in/reorder-stmts.ts` for a straightforward example that swaps adjacent statements.

## Example: A Complete Pascal Rule

See `packages/core/src/rules/built-in/pascal-reorder-stmts.ts` for the Pascal equivalent, which uses `getPascalStatements()` instead of `getStatements()` because Pascal `begin`/`end` blocks have different child node kinds than C `{}` blocks.

## Example: A C++-Only Rule

See `packages/core/src/rules/built-in/explicit-this.ts` for a rule that adds/removes `this->` on member access, only applicable to C++ code.

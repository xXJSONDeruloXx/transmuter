# Guideline plugins

A guideline is a plugin for `transmuter refine`. It detects a specific code smell in source that **already matches the target assembly** and describes how to rewrite the code to remove the smell while preserving the match.

Rules are "try random changes and see if they help." Guidelines are "I know exactly what's wrong — find a way to restructure the code so it still compiles to the same assembly, but without this pattern."

Existing long-form how-to: `docs/adding-guidelines.md` in the repo root. This file is the quick reference.

## The interface

```ts
interface Guideline {
  readonly id: string;                      // kebab-case (e.g., 'no-asm-pin')
  readonly description: string;             // shown in `transmuter refine --guideline`
  readonly languages: readonly Language[];
  readonly disabledRules: string[];          // rules the sub-search must never use

  detect(source: string, functionName: string): Violation[];
  remove(source: string, violation: Violation): string | null;
  containsViolation?(source: string, violation: Violation): boolean;
}

interface Violation {
  id: string;                               // stable across re-parses (e.g., "asm-pin:L42")
  lines: { start: number; end: number };    // 1-indexed
  description: string;
  text: string;                              // the violating source text
}
```

## How it fits into the refiner

For each detected violation, the `Refiner` (`packages/core/src/refiner/refiner.ts`):

1. Calls `guideline.remove(source, violation)` to produce a "violation-stripped" source.
2. Compiles and scores that source. **If it already scores 0, the violation is "trivially fixed"** — no search needed. The `fixedSource` and `fixDiff` are emitted immediately via `violation-trivially-fixed`.
3. Otherwise, spins up a sub-`MutationSearch` with:
   - `disabledRules` from the guideline added to the registry,
   - a `candidateFilter` that uses `containsViolation` to reject any mutation that re-introduces the violation, and
   - `maxUnproductiveIterations: 100_000` — if the filter rejects every mutation for that many iterations, the sub-session stops with `reason: 'exhausted'`.
4. If the sub-session finds a score-0 candidate, emits `violation-fixed`. Otherwise `violation-transmuter-exhausted`.

Phase 2 then replays each fix onto a merged source and re-checks. See `refine-mode.md`.

## `containsViolation` — why the override exists

The default implementation of `containsViolation` falls back to `detect()`. For `no-asm-pin` that's incorrect: the filter runs **per mutation** and must only reject the *specific* violation being fixed, not any asm construct anywhere. If two asm pins exist and we're fixing the one at L42, a sub-search shouldn't refuse to delete the pin at L58 (which would be the other violation's concern).

`no-asm-pin` therefore ships a custom `containsViolation` that uses AST parsing to check specifically for the pattern being fixed. Guidelines that detect a single-instance pattern can safely omit `containsViolation` and rely on the detect-based fallback.

## Canonical reference examples

- **`no-asm-pin` (C)** — `packages/core/src/guidelines/built-in/no-asm-pin.ts`. The most complex guideline. Detects two distinct patterns (barrier statements vs register pins), has a custom `containsViolation`, disables `asm-barrier` and `asm-register-swap` rules in sub-searches.
- **`no-goto` (C, C++)** — `packages/core/src/guidelines/built-in/no-goto.ts`. Minimal example: detect `goto_statement`, strip it, use string-based `containsViolation`.
- **`no-c-style-cast` (C++)** — `packages/core/src/guidelines/built-in/no-c-style-cast.ts`. Replaces `(Type)expr` with `static_cast<Type>(expr)`.
- **`no-redundant-cast-pascal` (Pascal)** — `packages/core/src/guidelines/built-in/no-redundant-cast-pascal.ts`. Removes function-style type casts in Pascal.

There are exactly **4 built-in guidelines** as of writing. The registry is in `packages/core/src/guidelines/built-in/index.ts`.

## Adding a new guideline (checklist)

1. Create `packages/core/src/guidelines/built-in/<guideline-id>.ts`.
2. Implement the `Guideline` interface. Import `parseC` from `~/parser.js` (or `parse('cpp', source)` etc.) and `findTargetFunction` from `~/rules/helpers.js`.
3. Decide the violation `id` format. It must be stable across re-parses — typically `<pattern>:L<line>` or `<pattern>:<hash-of-text>`. The refiner tracks violations by this ID across phases.
4. Write `detect()` to return every instance in the target function. Each violation gets its own sub-search.
5. Write `remove()` to produce valid (compilable) source with the violation stripped. It **doesn't have to match the target** — the sub-search will do that. It just has to compile. Return `null` if no clean removal is possible.
6. If multiple violations of the same pattern can coexist, add a custom `containsViolation(source, violation)` that checks only for *that one* (see `no-asm-pin`).
7. Populate `disabledRules` with every mutation rule ID that could re-introduce the smell. For `no-asm-pin`, that's `['asm-barrier', 'asm-register-swap']`. Without this the sub-search will waste iterations re-adding the thing you're trying to remove.
8. Add a co-located `<guideline-id>.spec.ts`. Test `detect` on a source with and without the pattern; test `remove` on a minimal fixture; if you implemented `containsViolation`, test it against the output of `remove` (should be `false`) and the input (should be `true`).
9. Register in `packages/core/src/guidelines/built-in/index.ts` — add to `builtInGuidelines`, add the named re-export.
10. The public API in `packages/core/src/index.ts` already re-exports all built-ins. Add your guideline's named export there too.

## Language filtering

`GuidelineRegistry.list(language)` filters by the `languages` field. `transmuter refine` only shows guidelines matching the source language, so:

- A C-only guideline like `no-asm-pin` won't appear for `.cpp` files.
- A guideline that's valid for both C and C++ should declare `languages: ['c', 'cpp']`.

## Pitfalls

- **Unstable violation IDs.** If `detect()` returns different IDs on re-parse for the same violation, merge logic breaks. Derive the ID from content + line, not from a counter or `Date.now()`.
- **`remove()` produces non-compilable code.** The refiner will fail the sanity check before a sub-search starts. Test `remove()` output by actually compiling it.
- **Forgetting `disabledRules`.** If a rule in the sub-search can re-introduce the pattern, the filter will reject every candidate and the sub-session will exhaust. Disable the offending rules up front.
- **`containsViolation` too broad.** If it returns `true` for *any* instance of the pattern (not just the specific one), removing one of two adjacent violations will be blocked by the filter seeing the other. Scope it correctly — ideally to the line range on the violation.

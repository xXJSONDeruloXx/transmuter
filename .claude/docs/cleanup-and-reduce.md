# Cleanup and Reduce

Two post-match / pre-match transformations that don't fit into the main `match`/`refine` flow.

## Cleanup

Removes code smells introduced by the permuter while guaranteeing the assembly stays identical. Activated by `--cleanup` on `transmuter match` or `transmuter refine`, and runs automatically after a perfect match (score 0) is found.

Core: `packages/core/src/cleanup/cleanup.ts`, `canonicalizer.ts`, `smell.ts`.

### Why

The mutation engine often matches assembly via non-obvious detours — temp variables with `_tNNN` names, `do { ... } while(0)` wrappers, redundant casts. These patterns score 0 against the target but produce ugly source. Cleanup rewrites them back to readable code while preserving the assembly.

### Two-phase pipeline

```
Phase 1: Canonicalization (C/C++ only, fast, deterministic)
  → do-while(0) unwrap
  → dead variable elimination
  → single-use variable inlining
  → redundant cast removal
  → whitespace normalization

Phase 2: Smell-budget permutation (all languages, slower, creative)
  → MutationSearch with scoreTransform hook replacing assembly score with smell score
  → Boosted simplifying rules (delete-stmt: 50, remove-cast: 40, expand-expr: 40, shift-div-swap: 30, compound-return: 30)
  → lateralForkBudget: 5 so we can cross smell plateaus
  → Additive rules disabled
```

**Phase 1** (`canonicalizer.ts`) runs five deterministic AST passes in a loop until fixpoint. Each candidate transformation is compiled and scored — only kept if the assembly remains identical (score 0).

| Pass | What it does |
|---|---|
| `do-while-zero-unwrap` | Replace `do { body } while(0);` with just `body` |
| `dead-variable-elimination` | Remove variables assigned but never read |
| `single-use-inline` | Inline `type x = expr; ... use(x)` → `... use(expr)` |
| `redundant-cast-removal` | Remove `(type)expr` casts (kept only if assembly-safe) |
| `normalize-whitespace` | Collapse consecutive blank lines |

**Phase 1 is C/C++ only.** The passes use C tree-sitter node kinds (`compound_statement`, `do_statement`, `declaration`, `init_declarator`, `cast_expression`). Pascal is silently skipped — Phase 2 still runs.

**Phase 2** (`cleanup.ts`) delegates to `MutationSearch` with a `scoreTransform` hook:

```ts
scoreTransform(source, result: AssemblyScoreResult): number {
  if (result.score !== 0) {
    return 999999 + result.score;  // penalty: never fork on assembly-breaking mutations
  }
  return countSmells(source, language).total;  // optimize smell score
}
```

This keeps the concurrency, adaptive selection, and lateral forks of the main search, but makes the objective "lowest smell" instead of "lowest assembly diff." Only runs when Phase 1 leaves remaining smells.

### Smell scoring

`packages/core/src/cleanup/smell.ts`. AST-based, deterministic. Weighted sum:

| Metric | Weight | Detection |
|---|---|---|
| Temp variables | 10 | Declarations matching `_tNNN` pattern |
| `do-while(0)` | 10 | `do { ... } while(0)` wrappers |
| Single-use variables | 5 | Variables assigned once, read once |
| Type casts | 3 | `(type)expr` cast expressions |
| Statement count | 1 | Total statements across all blocks (complexity proxy) |

```
total = tempVars*10 + doWhile0*10 + singleUse*5 + casts*3 + stmtCount*1
```

### Limitations

- **Phase 1 is C/C++ only.** Pascal falls through to Phase 2.
- **Temp variable smell only catches `_tNNN`.** That's the permuter's own naming pattern. Decompiler-generated temps (m2c's `temp_f0`, Ghidra's `local_30`, Hex-Rays' `v1`) aren't counted as smells. This is intentional — Transmuter's cleanup is targeted at its own artifacts, not at improving arbitrary decomp output.
- **Smell score is a proxy, not a semantic measure.** It catches the common patterns but doesn't understand variable naming, control-flow structure, or comment quality.

### Library usage

```ts
import { Cleanup } from '@transmuter/core';

const cleanup = new Cleanup({
  source: matchingSource,           // must score 0 already
  functionName: 'FixedMul8',
  targetObjectPath: './target.o',
  compilerCommand: 'agbcc -O2 -mthumb {{inputPath}} -o {{outputPath}}',
  cwd: '/path/to/project',
  maxIterations: 50_000,            // Phase 2 budget
  timeoutMs: 60_000,                // Phase 2 timeout
  onEvent(event) {
    if (event.type === 'completed') {
      console.log(`Smell: ${event.result.smellBefore.total} → ${event.result.smellAfter.total}`);
    }
  },
});

const result = await cleanup.run();
console.log(result.source);  // cleaned-up code, still compiles to identical assembly
```

### Events

```ts
type CleanupEvent =
  | { type: 'phase1-started' }
  | { type: 'phase1-progress'; pass: string; applied: number }
  | { type: 'phase1-completed'; result; smellBefore; smellAfter }
  | { type: 'phase2-started'; smellScore: number }
  | { type: 'phase2-progress'; iteration: number; bestSmell: number }
  | { type: 'phase2-completed'; result: SmellPermutationResult }
  | { type: 'completed'; result: CleanupResult };
```

## Reduce

`Reducer` is a hierarchical delta debugger that minimizes a source file while keeping assembly output identical. There is no standalone `transmuter reduce` CLI command — instead, **`transmuter match` runs the reducer by default** as a pre-step before permutation. Pass `--no-reduce` (or `tools.transmuter.noReduce: true` in `decomp.yaml`) to skip it.

Core: `packages/core/src/reducer/reducer.ts`. Exported from `@transmuter/core`. Called from `packages/cli/src/commands/match.tsx` around line 381.

### Pipeline

1. Establish baseline — compile + score the input. Throws if it doesn't compile or the target function isn't found.
2. **Phase 1**: remove non-target functions one at a time, keep each removal if the score is unchanged.
3. **Phase 2**: remove `#include` directives the same way.
4. **Phase 3**: remove global declarations.
5. **Phase 4**: remove `#define` macros.
6. **Phase 5**: stub the remaining non-target functions (replace bodies with empty blocks).

Each phase is a sequence of trial removals; the reducer retries the compile after each candidate removal and reverts anything that breaks the score.

### Library usage

```ts
import { Reducer } from '@transmuter/core';

const reducer = new Reducer({
  source,
  functionName: 'TargetFn',
  targetObjectPath: './target.o',
  compilerCommand: 'agbcc -O2 -mthumb {{inputPath}} -o {{outputPath}}',
  cwd: '/path/to/project',
});

const result = await reducer.reduce();
console.log(result.source);  // minimized source
console.log(result.removals);  // [{ phase: 'Functions', count: 12 }, ...]
```

### Limitations

- **C-only.** The reducer uses `parseC` and C-specific AST node kinds throughout. Pascal/C++ sources will not work — the match command will reduce a C++ file but the result is unreliable; pass `--no-reduce` for non-C sources.
- **No standalone `transmuter reduce` subcommand.** The reducer only runs as the pre-step of `transmuter match`. If you need it outside that flow, import `Reducer` from `@transmuter/core` and call it directly.
- **One function at a time.** The reducer is scoped to a single target function. Multi-function reduction would need an outer loop.

## Pitfalls

- **Cleanup runs automatically with `--cleanup`**. If you pass `--no-cleanup` (default on older versions of docs, now the default is ON) it's skipped.
- **Cleanup Phase 2 is a full `MutationSearch`** — it spawns subprocesses, tracks candidates, and emits its own events. Don't assume it's deterministic even though Phase 1 is.
- **Reducer runs as part of `transmuter match`,** not as its own command. Pass `--no-reduce` to skip it.
- **Cleanup + Pascal** skips Phase 1 silently. If you expect `do-while(0)` unwrap on Pascal (which doesn't exist as a construct anyway), check that Phase 2 fired.

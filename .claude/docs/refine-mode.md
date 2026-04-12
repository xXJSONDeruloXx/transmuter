# Refine mode

`transmuter refine` improves the quality of **already-matching** source code by removing code smells (guideline violations) while preserving the assembly match.

Core: `packages/core/src/refiner/refiner.ts` + `refiner-store.ts`. CLI: `packages/cli/src/commands/refine.tsx`.

## Input contract

The source must already compile and score 0 against the target. Refine starts with a sanity check:

1. Compile the input source.
2. `scorer.score(objPath)` against `targetObjectPath`.
3. If score ≠ 0, emit `sanity-check-failed` and throw. Refinement never operates on non-matching code.

Pass an already-matching `.c` / `.cpp` / `.pas` file. If you want to fix both the match *and* the smells in one pass, run `transmuter match --cleanup` instead.

## Guideline selection

```bash
transmuter refine path/to/source.c                          # lists available guidelines and exits
transmuter refine path/to/source.c --guideline no-asm-pin   # runs with the named guideline
```

`GuidelineRegistry.list(language)` filters by source language, so only guidelines matching the file's language are shown.

## Two-phase algorithm

### Phase 1 — Parallel exploration

For each violation returned by `guideline.detect()`:

1. Emit `violation-fix-started`.
2. Call `guideline.remove(source, violation)` to produce a "violation-stripped" candidate source.
3. Compile it. If it scores 0 already, emit `violation-trivially-fixed` with `fixedSource` and `fixDiff`. No search needed — record and move on.
4. Otherwise spin up a sub-`MutationSearch` with:
   - `disabledRules: guideline.disabledRules` added to the registry so the permuter can't re-introduce the pattern.
   - A `candidateFilter` that calls `guideline.containsViolation(source, violation)` (or falls back to `detect`) and rejects any mutation containing the violation.
   - `maxUnproductiveIterations: 100_000`. If the filter rejects every candidate for 100K iterations with no compilation reaching the scorer, the sub-session stops with `reason: 'exhausted'` and the violation transitions to `'transmuter-exhausted'`. This prevents indefinite spinning when random mutations can't produce the required shape.
   - `lateralForkBudget: 10` — neutral rewrites are often required to reach a clean fix (see `candidate-graph.md`).
5. On fork to score 0, emit `violation-fixed`.

**Concurrency is split across violations.** `slotsPerViolation = max(1, floor(concurrency / violationCount))`. With `--concurrency 4` and 2 violations, each gets 2 slots. With 8 violations it drops to 1 slot each.

Every sub-session is tracked in `Refiner.#activeSubSessions` keyed by `violationId`. The HTTP API's common control endpoints broadcast operations to all active sub-sessions during Phase 1.

### Phase 2 — Sequential merge

Only runs when there is more than one violation AND `--skip-merge` wasn't passed.

1. Sort fixes by difficulty — trivial fixes first, then by iterations required.
2. Apply the easiest fix to a working copy of the source.
3. Re-compile and re-score. If it still scores 0, keep the fix. If it doesn't, discard and try the next.
4. Re-run `guideline.detect()` on the updated source. **Prior fixes may have incidentally resolved remaining violations** — these are counted as `resolvedByPrior` and don't need their own merge step.
5. Emit `merge-step` events for each action: `applied-trivially`, `applied`, `failed`, `skipped-already-resolved`.

The final `RefinementResult` reports:
- `trivialFixes` — violations whose `remove()` output already scored 0.
- `permutedFixes` — violations fixed by a sub-search.
- `resolvedByPrior` — violations that disappeared after another fix was applied.
- `notFixable` — violations whose sub-search exhausted or whose `remove()` returned null / produced uncompilable code.

Single-violation runs skip Phase 2 and use the Phase 1 result directly. `--skip-merge` also skips Phase 2 and uses the best single fix from Phase 1.

## Injection-based fixes

When an LLM agent hits `POST /inject` during a refine run, `Refiner.injectCode()` checks whether the injection *fixes* the violation:

1. The injected candidate must score 0.
2. `guideline.detect()` on the injected source must no longer list the specific violation being fixed.

If both hold, emit `violation-fixed`, mark the violation fixed in the store, and stop the sub-session. This is **per-violation detection**, not `containsViolation`. The distinction matters: `containsViolation` for `no-asm-pin` checks for *any* asm construct anywhere in the function (too broad for fix attribution). `detect()` returns structured violations, and we can match by id.

## Guideline authoring constraints

See `guideline-plugins.md` for the full interface. Refine-specific requirements:

- **`remove()` must produce compilable source.** The Phase 1 compile runs unconditionally; if it fails, the violation goes straight to `removal-failed`.
- **`containsViolation()` must be scoped to the specific violation**, not the pattern in general. Otherwise Phase 1 sub-searches for adjacent violations will reject each other.
- **`disabledRules` must cover every rule that can re-introduce the smell.** For `no-asm-pin`: `['asm-barrier', 'asm-register-swap']`.

## LLM guidance via `--constraints`

```bash
transmuter refine source.c --guideline no-asm-pin --constraints constraints.json
```

`constraints.json`:

```json
{
  "focusConstraints": [
    { "type": "focus-region", "id": "hot-loop", "lines": { "start": 42, "end": 60 } }
  ],
  "violationHypotheses": {
    "asm-pin:L42": {
      "source": "<rewritten C code that the LLM thinks will fix the violation at L42>"
    }
  }
}
```

- `focusConstraints` are passed through to **every** violation's sub-`MutationSearch`.
- `violationHypotheses[violationId].source` is compiled and injected as an external candidate branch for that violation's sub-session before it starts exploring. If the hypothesis already scores 0 and removes the violation, the violation is marked fixed immediately.

Each violation's sub-session report is nested inside the `RefinementReport` so an LLM can read the full candidate graph, rule stats, focus results, and assembly diff when deciding what to try next.

## Events

```ts
type RefinerEvent =
  | { type: 'sanity-check-passed'; score: number }
  | { type: 'sanity-check-failed'; score: number; error: string }
  | { type: 'violations-detected'; count: number; violations: { id; description }[] }
  | { type: 'violation-fix-started'; violationId }
  | { type: 'violation-fix-progress'; violationId; iteration; score }
  | { type: 'violation-fixed'; violationId; iterations; elapsed }
  | { type: 'violation-trivially-fixed'; violationId; fixedSource }
  | { type: 'violation-removal-failed'; violationId; reason }
  | { type: 'violation-transmuter-exhausted'; violationId; bestScore; iterations }
  | { type: 'merge-started' }
  | { type: 'merge-step'; step; violationId; action: 'applied' | 'applied-trivially' | 'failed' | 'skipped-already-resolved'; diff? }
  | { type: 'completed'; result: RefinementResult };
```

`RefinementStore` consumes all of these. Stats for Phase 1 `liveProgress` are monotone: a stale progress event with a worse score updates `iteration` but leaves `score` at the best-seen value. See `report-store.md`.

## Pitfalls

- **Exhausted ≠ impossible.** A transmuter-exhausted violation often just needs `--max-iterations` bumped, a richer `lateralForkBudget`, or an LLM hypothesis. Don't conclude a violation can't be fixed from a single run.
- **Overly aggressive `containsViolation` deadlocks Phase 1.** If the filter rejects too broadly, the sub-session exhausts without finding a candidate. The most common cause is using string matching on a pattern that also appears in the fix. Scope to AST nodes tagged with the violation's line range.
- **Single-violation runs skip Phase 2.** `--skip-merge` is the same path. If you expected a merge log and don't see one, it's probably one of these.
- **Phase 1 concurrency splits hard.** With 8 violations and concurrency 4, each violation gets one slot. For deep fixes, prefer running `transmuter refine --concurrency 16` or more so each sub-session still has multiple slots.
- **Inject during Phase 2** goes to whichever sub-session is currently active. During the brief windows between merge steps there is no active sub-session and inject calls return null. Poll `GET /active-sub-sessions` first.
- **Refine overrides `GET /report`** to return a `RefinementReport`, not a `SessionReport`. If you're consuming the API generically, branch on `report.type`.

## Key files

- `packages/core/src/refiner/refiner.ts` — `Refiner` class
- `packages/core/src/refiner/refiner-store.ts` — `RefinementStore` + `mergeRuleStats` helper
- `packages/core/src/refiner/refiner-store.spec.ts` — tests including monotone progress, pending merge drain, rule stat merging
- `packages/cli/src/commands/refine.tsx` — CLI, dashboard, `--constraints` loader
- `packages/cli/src/api/server.ts` — refine-specific HTTP endpoints

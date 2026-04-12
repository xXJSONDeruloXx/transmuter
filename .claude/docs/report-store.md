# Report store

Two classes capture pipeline events into queryable, serializable reports: `SessionStore` (match / cleanup / one refine sub-session) and `RefinementStore` (the whole refine session, wrapping many sub-sessions).

- `SessionStore` — `packages/core/src/session/store.ts`
- `SessionStore` collapsed-graph helper — `packages/core/src/session/collapsed-graph.ts`
- `RefinementStore` — `packages/core/src/refiner/refiner-store.ts`

Both stores are **event-driven**: you wire them to the `onEvent` callback of a `MutationSearch` / `Refiner`, and they materialize state as events arrive.

## Wiring pattern

```ts
const store = new SessionStore({ metadata: { sessionId: 'my-session', label: 'FooBar' } });
store.setOriginalSource(baseSource);
store.setConfig({ functionName, targetObjectPath, compilerCommand, language: 'c', /* ... */ });

const search = new MutationSearch({
  source: baseSource,
  functionName,
  targetObjectPath,
  compilerCommand,
  cwd,
  onEvent: (event) => store.push(event),   // <-- the bridge
});

const result = await search.start();
const report = store.toJSON();              // SessionReport
```

The store never initiates work — it only observes. You can attach it at any point, though you'll miss events emitted before wiring.

## `SessionStore` — what it tracks

From `MutationSearchEvent`:

| Event | State updated |
|---|---|
| `started` | `baseScore`, `bestScore`, `ruleDescriptions` |
| `scored` | `totalCompiled++`, rule stats (`applied`), target `attempts++` |
| `forked` | `forkCount++`, new `CandidateNode` stored, `bestScore` updated, rule stats (`forked`, `avgDelta`, `deltaByType`) |
| `compilation-error` | `totalErrors++`, rule stats (`errors`), target `attempts++` |
| `mutation-target-created` | New `MutationTarget` stored. For genesis/external origin, also stores the root `CandidateNode` |
| `mutation-target-disabled` / `enabled` / `weight-changed` | Target mutated in place |
| `stats` | Timeline point appended, running counters refreshed |
| `completed` | `completionReason`, `metadata.completedAt` set |
| `perfect-match` | `bestScore = 0` |
| `focus-*` | Focus tracker state |
| `hypothesis-scored` | Hypothesis constraint tracker |
| `auto-compacted` | Runs `store.summarize()` to free dead subtrees |
| `graph-summarized` / `error` | **Intentionally ignored** — no state derived |

## `SessionStore` query API

```ts
store.getSummary(): SessionSummary;             // high-level counters + perfectMatch flag
store.getCandidate(id): CandidateNode | undefined;
store.getAllCandidates(): CandidateNode[];
store.getBestCandidate(): CandidateNode | undefined;
store.getLineage(candidateId): CandidateNode[]; // [self, parent, ..., root]
store.getChildren(candidateId): CandidateNode[];
store.getGraph(): { candidates, mutationTargets, superNodes? };
store.getRuleStats(): RuleStatsEntry[];         // sorted by forked desc
store.getScoreTimeline(): TimelinePoint[];
store.getFocusResults(): FocusResult[];
store.summarize(): void;                         // compact dead subtrees into supernodes
store.toJSON(): SessionReport;                   // full serialized report
```

`RuleStatsEntry` fields:
- `applied`, `forked`, `errors` — raw counters
- `successRate = forked / applied`
- `avgDelta = totalDelta / forked` (only forks contribute)
- `bestDelta = max delta observed`
- `deltaByType` — per-`DiffType` breakdown of how much each diff category shrank across forks
- `focusApplied` / `focusForked` — present in the public type but **never populated** by the store (no event path increments them)

## `SessionReport` schema (version 1)

```ts
interface SessionReport {
  version: 1;
  type: 'match';
  metadata: SessionMetadata;       // sessionId, label, tags, createdAt, completedAt, partial
  config: SessionConfig;           // functionName, targetObjectPath, language, profile, seed, ...
  summary: SessionSummary;         // baseScore, bestScore, forkCount, totalCompiled, ...
  graph: {
    candidates: CandidateNode[];   // every node has assembly + assemblyDiff + breakdown already
    mutationTargets: MutationTargetInfo[];
    superNodes?: SuperNode[];      // present only if summarize() was called
  };
  ruleStats: RuleStatsEntry[];
  scoreTimeline: TimelinePoint[];
  focusResults: FocusResult[];
  cleanup?: CleanupReportData;     // if --cleanup ran
}
```

Key property: **every `CandidateNode` already carries its assembly and assembly diff**, baked in at fork time during the single `scoreWithAssembly()` pass. The webapp renders assembly tabs directly from the report — no server-side compilation at view time.

## `RefinementStore` — what it tracks

The refine report wraps one top-level store and many sub-session reports. Its events are `RefinerEvent`, emitted by `Refiner`:

- `sanity-check-failed` — source didn't compile or didn't match before any fix attempt.
- `violation-fix-started` / `violation-fix-progress` / `violation-fixed` / `violation-trivially-fixed` / `violation-removal-failed` / `violation-transmuter-exhausted` — per-violation lifecycle.
- `merge-step` — Phase 2 sequential merge actions.
- `completed` — final refinement result.

The store tracks:

- **`liveProgress`** per violation: `{ iteration, score }` during Phase 1. Monotone improvement — a stale progress event with a worse score never regresses the stored `score` (but `iteration` advances so the UI shows activity).
- **Pending merges** — violations that have been fixed (or trivially fixed) but not yet merged. Drained by `merge-step` events (regardless of the step's `action`).
- **Merge log** — ordered list of `MergeLogEntry`. Defensive copy on read.
- **Aggregated rule stats** via `mergeRuleStats([completed, ...activeSubSessionStats])` — recomputes `successRate` and `avgDelta` from totals, never averages the rates.

```ts
store.toJSON(): RefinementReport;        // includes nested subSession reports per violation
store.getPendingMerges(): PendingMerge[];
store.getMergeLog(): MergeLogEntry[];
store.getRuleStats(): RuleStatsEntry[];
```

The `mergeRuleStats` helper is exported and has dedicated tests — see `refiner-store.spec.ts`.

## Graph summarization in the store

`SessionStore.summarize()` mirrors `Pool.summarize()`. It runs when:

1. An `auto-compacted` event arrives (triggered by `MutationSearch#maybeAutoCompact`), or
2. Called manually by a consumer.

Algorithm (same as Pool):
- Reachability: walk down from every enabled target and mark all ancestors reachable.
- Branch roots: candidates whose parent is reachable but they themselves aren't → collapse the subtree into one `supernode-<rootId>`.
- Dead root trees: roots with `parentId: undefined` and no reachable descendant → collapse into `supernode-root-<rootId>`.
- Delete the collapsed candidates and their targets.

See `candidate-graph.md` for the full explanation of supernodes.

## Adding a new query

1. Add a method to `SessionStore` that reads from the private state (`#candidates`, `#targets`, `#ruleStats`, etc.).
2. If it's exposed over HTTP, add a handler in `packages/cli/src/api/server.ts` inside `registerSearchRoutes` and a description in `COMMON_READ_ENDPOINTS` (see `http-api.md`).
3. Add a test in `session/store.spec.ts`.

## Adding a new event

1. Add the variant to `MutationSearchEvent` in `packages/core/src/types.ts`.
2. Emit from `MutationSearch` (or wherever it originates).
3. Handle in `SessionStore.push()`'s switch. If intentionally ignored, add a comment saying so — otherwise code review will ask why.
4. If it's a refine-only event, add it to `RefinerEvent` and handle in `RefinementStore` instead.
5. Update `http-api.md` if any downstream consumer needs to know.

## Pitfalls

- **Don't call `push()` concurrently** from multiple async paths. The store isn't thread-safe. The event bus is a single serial callback, so wiring it once from `onEvent` is fine.
- **`toJSON()` returns a snapshot at call time.** A partial report (while the session is still running) will have `metadata.partial` inferred from the absence of `completedAt`. The CLI writes a final report on `completed`.
- **`focusApplied` and `focusForked` in `RuleStatsEntry` are always 0.** They're historical dead fields kept for backward compat; don't rely on them.
- **The store doesn't deduplicate candidates.** If the same event arrives twice (bad wiring), you'll get duplicate nodes. The pool's own dedup prevents this upstream.

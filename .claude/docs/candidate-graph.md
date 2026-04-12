# Candidate graph

The candidate graph is the central data structure of `MutationSearch`. It's a forest of `CandidateNode` trees rooted at the genesis source and any externally-injected sources. Every improvement forks a new branch.

Core file: `packages/core/src/pipeline/pool.ts`. Specs: `pool.spec.ts` (same directory).

## The model

- **`CandidateNode`** — immutable snapshot. Fields: `id`, `source`, `score`, `iteration`, `timestamp`, `mutationTargetId`, `parentId?`, `origin`, `ruleId?`, `location?`, `externalLabel?`, `assembly`, `assemblyDiff`, `breakdown`. Never reach in and mutate one — forks create new nodes.
- **`MutationTarget`** — the scheduling object. Points to a candidate by `candidateId`. Has `weight`, `enabled`, `attempts`, `attemptsWithoutFork`, `createdAt`, `lastImprovedAtIteration`. One target always points to one candidate and never moves.
- **`origin`** — one of:
  - `'genesis'` — the root candidate, created from the initial source.
  - `'organic'` — created by an internal fork-on-improvement.
  - `'external'` — injected via `pool.inject()` / `POST /inject`. Has an `externalLabel`.

## Fork semantics

When a slot applies a mutation to target T (pointing at candidate C) and the result scores better than C:

1. The pool checks the **fork dedup key**: `"${scoreDelta}:${ruleId}:${line}:${column}"`. If it's already in T's dedup set, skip — we've already forked for this improvement from this location. Otherwise add the key.
2. Create a new `CandidateNode` with `parentId = C.id`, `origin = 'organic'`.
3. Create a new `MutationTarget` pointing to that candidate, `weight = 1`, `enabled = true`, empty dedup set.
4. **Leave T unchanged.** It keeps exploring from C, so one parent can fork multiple times (each with a different improvement).
5. Emit `mutation-target-created` and `forked` events.

Consequence: the genesis is always being mutated, every fork opens a new exploration frontier, and the graph grows both wide (parent finds multiple improvements) and deep (children find their own).

## Lateral forks

Set `lateralForkBudget > 0` in `MutationSearchOptions` to enable **same-score forks** — plateaus where a mutation doesn't improve but is a stepping stone. Each target gets its own budget counter; once exhausted, lateral moves on that target stop forking.

Use cases:
- `transmuter refine` sets `lateralForkBudget: 10` by default — removing a guideline violation often requires several neutral rewrites before re-reaching score 0.
- `transmuter match` leaves it at 0 — strict improvements only.

## Fork dedup tuple

```
(scoreDelta, ruleId, line, column)
```

This is per-target, stored in `#forkDedup: Map<targetId, Set<string>>`. Two distinct improvements with the *same* delta, rule, and location are considered duplicates. Examples:

| Operation | Fork? |
|---|---|
| Δ=3, rule X at L5:C1 (first) | yes |
| Δ=3, rule X at L5:C1 (repeat) | no |
| Δ=2, rule X at L5:C1 | yes (different delta) |
| Δ=3, rule X at L6:C1 | yes (different line) |
| Δ=3, rule Y at L5:C1 | yes (different rule) |

Why it matters: without dedup, the same target would fork many times on identical improvements (the engine picks the same rule repeatedly by Thompson Sampling). That'd bloat the graph and the session store.

## Lineage

- `pool.getLineage(candidateId)` — walks `parentId` up to a genesis/external root. Returns `[candidate, parent, ..., root]`.
- `pool.getChildren(candidateId)` — direct children (forks).
- `pool.getBest()` — the lowest-scoring candidate in the whole graph.

The `SessionStore` exposes mirroring queries: `getLineage`, `getChildren`, `getBestCandidate`, `getAllCandidates`, `getGraph`. HTTP endpoints wrap these (see `http-api.md`).

## Scheduling (weighted select)

`pool.select()` picks an enabled target via weighted-random, proportional to `weight`. Default weight is 1 so it's uniform by default. `setBranchWeight(targetId, weight)` adjusts at runtime (e.g., from `POST /branches/:id/weight` or the LLM agent biasing toward a promising branch).

Disabled targets are skipped entirely. They remain in the graph for queries but don't consume scheduling.

## Auto-compact — freeing dead branches

Every `statsInterval` iterations (default 100), `MutationSearch#maybeAutoCompact` evaluates the pool. Two strategies, checked in order:

1. **Population-based (priority)** — when `activeTargets > keepN * 3` with `keepN = max(keepMinTargets, concurrency * 5)` (default keepN=20 at concurrency 4), sort targets by score and disable everything past the best N. Works in high-fork-rate sessions (like refine) where individual staleness tracking would never trigger.
2. **Staleness-based** — for smaller pools, disable targets whose `attemptsWithoutFork >= effectiveThreshold` where `effectiveThreshold = max(minStaleThreshold, staleAfterAttempts / sqrt(activeTargets / concurrency))`. With defaults (`staleAfterAttempts: 500`, `minStaleThreshold: 20`), a pool of 500 targets at concurrency 4 uses ~45.

Both are **self-stabilizing**: disabling shrinks the pool, which raises the threshold, which halts further pruning.

Only fires when `candidateCount >= candidateThreshold` (default 200). Pass `autoCompact: false` to `MutationSearchOptions` to disable entirely. Pass `autoCompact: { staleAfterAttempts, minStaleThreshold, keepMinTargets, candidateThreshold }` to tune.

After disabling targets, `pool.summarize()` runs automatically to free memory — see below.

## Graph summarization and `SuperNode`

When auto-compact (or a manual `POST /branches/prune`) disables targets, entire subtrees become unreachable — no active target exists anywhere in the subtree's lineage. `pool.summarize()` walks the forest, finds these dead subtrees, and replaces each one with a `SuperNode`:

```ts
interface SuperNode {
  id: string;                 // "supernode-{branchRootCandidateId}" or "supernode-root-{rootId}"
  parentId?: string;          // undefined for dead root trees (dead injections)
  summarizedCount: number;    // how many candidates were collapsed
  bestScore: number;
  worstScore: number;
  rules: string[];            // distinct ruleIds across the subtree
  bestSource: string;         // source of the best-scoring candidate in the subtree
}
```

This frees the underlying `CandidateNode`, `MutationTarget`, `forkDedup`, `lateralForkCounts`, and adaptive Thompson Sampling state for the summarized candidates. The supernode itself is a compact ~200-byte summary.

**Depth-0 compaction:** the branch root is included in the supernode (so its memory is freed). The supernode's `parentId` points to the branch root's reachable parent, not the branch root itself.

**Multi-root forests:** if someone injected an external candidate and then disabled that whole branch, the dead tree's root has `parentId: undefined`. `summarize()` handles this by emitting a `supernode-root-*` supernode with no parent.

Both the `Pool` and `SessionStore` hold their own summary state. The `Pool` frees search-side memory; the `SessionStore` mirrors it so the `SessionReport` contains `graph.superNodes` for the webapp.

### Querying supernodes

- `pool.getSuperNodes()` — accumulated from past `summarize()` calls.
- `SessionStore.getGraph().superNodes` — same data, exposed in reports.
- `GET /graph` includes supernodes.

The webapp's `CandidateGraph` component renders supernodes as distinct nodes in the React Flow graph, sized by `summarizedCount`.

## External injection

`pool.inject(source, score, { assembly, assemblyDiff, breakdown, label })` creates a new root — `origin: 'external'`, no `parentId`, `externalLabel` set. It shows up in the graph as a separate tree. Used by:

- `POST /inject` (HTTP API) for LLM agents and hypothesis testing.
- `FocusConstraint { type: 'hypothesis', source }` — the hypothesis is injected as a candidate before the search starts.

Injected candidates participate in normal scheduling and forking. Their subtrees can be pruned and summarized like organic ones.

## Gotchas

- **Do not mutate a `CandidateNode`**, ever. The `mutationTargetId` field is assigned exactly once (after creation, before returning from `report()`). Everything else is `readonly`.
- **`select()` throws if no targets are enabled.** A slot that hits this during normal operation indicates a bug — usually prune logic disabled everything. The orchestrator handles it by shutting down.
- **Lateral fork budget is per-target, not per-tree.** A fresh fork inherits `lateralForkCount = 0` — the budget resets on every fork. Intentional: you want each exploration frontier to get its own plateau-crossing allowance.
- **Summarization is destructive.** Once summarized, the individual `CandidateNode`s are gone. If you're debugging a specific lineage and need it preserved, disable auto-compact for that run.
- **`pool.#superNodes` and `SessionStore.#superNodes` are independent.** They both run `summarize()` in response to events but own separate arrays. Don't assume they're the same object.

## Key files

- `packages/core/src/pipeline/pool.ts` — all the logic above
- `packages/core/src/pipeline/pool.spec.ts` — exhaustive tests for fork dedup, lineage, summarization edge cases
- `packages/core/src/search/auto-compact.ts` — `pickAutoCompactTargets` helper (pure function, easy to test)
- `packages/core/src/search/auto-compact.spec.ts` — policy tests
- `packages/core/src/session/store.ts` — `SessionStore.summarize()` mirror implementation

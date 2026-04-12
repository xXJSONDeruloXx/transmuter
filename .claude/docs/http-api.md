# HTTP control server

When `transmuter match` or `transmuter refine` is started with `--api`, a Hono HTTP server binds to `127.0.0.1` alongside the Ink dashboard. External processes (LLM agents, shell scripts, `transmuter ctl`) can query state and issue control commands.

Server: `packages/cli/src/api/server.ts`. It's a single file (~1280 lines) that defines:

- `registerSearchRoutes(app, deps)` — common routes shared across all modes.
- `createMatchApp(search, store)` — match-only wiring, called from `commands/match.tsx`.
- `createRefineApp(refiner, refinementStore)` — refine-only wiring, layers refine endpoints on top of common. Called from `commands/refine.tsx`.
- `createCleanupApp(cleanup)` — cleanup-only wiring. **Exported but not wired to any CLI command** — available for library consumers that drive `Cleanup` directly. `transmuter match --cleanup` and `transmuter refine --cleanup` expose cleanup state through their own match/refine servers instead.
- `createControlServer(options)` — binds the app to a port, writes the discovery file, returns `{ port, discoveryPath, close }`.

## Discovery

On startup the server writes `transmuter-control.json` into the source file's directory:

```json
{
  "pid": 12345,
  "port": 48201,
  "sessionId": "session-1712345678",
  "startedAt": "2026-04-02T10:30:00Z"
}
```

- Port is random by default; `--api-port <n>` pins it.
- The file is deleted on clean exit.
- Stale file detection: check if `pid` is still alive (`process.kill(pid, 0)`).
- `transmuter ctl` reads this file automatically. Pass `--control-file <path>` to override.

## `GET /` — self-describing catalog

The root endpoint returns `{ name, mode, description, endpoints: [{ method, path, description }] }`. The `mode` field is `'match'`, `'refine'`, or `'cleanup'`. `endpoints` is the full list of paths available in that mode (common + mode-specific). LLM agents use this to discover the API without any documentation.

## Common endpoints (all modes)

### Read

| Method | Path | Returns |
|---|---|---|
| `GET` | `/session` | Current snapshot: `running`, `paused`, `functionName`, `iteration`, `elapsed`, `baseScore`, `bestScore`, `scoreDelta`, `perfectMatch`, `bestSource`, `forkCount`, `totalCompiled`, `totalErrors`, `totalDeduped`, `targetCount`, `activeTargetCount`, `targets`, `ruleWeights`, `completionReason`, `avgForkInterval` |
| `GET` | `/candidates` | All `CandidateNode`s. Query params: `?maxScore=N`, `?minScore=N`, `?origin=genesis\|organic\|external`, `?limit=N`. Always sorted by score ascending. |
| `GET` | `/candidates/best` | Lowest-scoring candidate, or `null` |
| `GET` | `/candidates/:id` | A specific candidate. 404 if missing. |
| `GET` | `/candidates/:id/lineage` | `[self, parent, ..., root]`. 404 if id missing. |
| `GET` | `/candidates/:id/children` | Direct forks of a candidate. |
| `GET` | `/candidates/:id/delta` | Compares this candidate's assembly diff against its parent's. Returns `{ scoreBefore, scoreAfter, scoreDelta, ruleId, resolved, introduced, changed }`. 400 if genesis, 422 if compile fails. |
| `GET` | `/candidates/:id/assembly` | Compiles the candidate's source on-demand and returns full assembly diff. Subprocess spawn — use sparingly. 422 if compile fails. |
| `GET` | `/graph` | `{ candidates, mutationTargets, superNodes? }` |
| `GET` | `/rules` | Rule catalog with current state: `[{ ruleId, description, weight, enabled }]`. Weight reflects effective priority (user > profile > default). |
| `GET` | `/rules/history` | Session-wide cumulative rule stats: `[{ ruleId, applied, forked, successRate, avgDelta, bestDelta, errors, deltaByType }]`. Sorted by forked desc. |
| `GET` | `/rules/history/:branch_id` | Per-branch adaptive (sliding-window) stats: `[{ ruleId, trials, successRate }]`. 404 if branch missing. |
| `GET` | `/timeline` | Score timeline: `[{ iteration, elapsed, bestScore, targetCount, candidateCount }]`. |
| `GET` | `/report` | Full `SessionReport` JSON (same format as the saved file). |
| `GET` | `/diff-summary` | Best candidate's diff with rule suggestions. Returns `{ score, breakdown, structuredDifferences, differenceCount, matchingCount, suggestedRules: [{ diffType, remaining, bestRules: [{ ruleId, deltaForType }] }] }`. 404 if no candidates, 422 if compile fails. |
| `GET` | `/focus` | Current focus + avoid regions. |
| `GET` | `/mutation-depth` | `{ depth: number }` |

### Write / control

| Method | Path | Body | Effect |
|---|---|---|---|
| `POST` | `/pause` | — | Pause all slots. Session stays alive. |
| `POST` | `/resume` | — | Resume a paused session. |
| `POST` | `/stop` | — | Abort in-flight compiles; session cannot restart. |
| `POST` | `/inject` | `{ source, label?, dryRun? }` | Compile + score + (if not dryRun) create an external candidate. Always returns score/diffs; with `dryRun` has no side effects. In refine mode, also returns detected `violations[]`. 422 if compile fails. |
| `POST` | `/branches/prune` | `{ maxScore }` or `{ keepBestN }` | Disable branches in bulk, then auto-compact. Returns `{ disabled, remaining, compacted: { removed, superNodes, candidatesAfter } }`. |
| `POST` | `/branches/:id/weight` | `{ weight: number }` | Adjust scheduling weight (≥ 0). |
| `POST` | `/branches/:id/disable` | — | Remove from scheduling. |
| `POST` | `/branches/:id/enable` | — | Re-enable a disabled branch. |
| `POST` | `/batch` | `{ operations: [...] }` | Execute multiple control ops atomically. Supported actions: `pause`, `resume`, `stop`, `inject`, `set-branch-weight`, `disable-branch`, `enable-branch`, `update-rule-weights`, `enable-rule`, `disable-rule`, `prune`. |
| `POST` | `/rules/weights` | `{ ruleId: weight, ... }` | Override rule weights. Weight 0 effectively disables. |
| `POST` | `/rules/:id/enable` | — | Enable a disabled rule. |
| `POST` | `/rules/:id/disable` | — | Disable a rule. |
| `PUT` | `/focus` | `{ focusRegions?, avoidRegions? }` | Replace constraints. Omitted arrays clear. Takes effect on next mutation. |
| `PUT` | `/mutation-depth` | `{ depth: number }` | Positive integer; chain depth of each iteration's mutations. |

## Refine mode extras

On top of the common routes, `transmuter refine --api` exposes:

| Method | Path | Returns |
|---|---|---|
| `GET` | `/report` | **Overridden** — returns `RefinementReport`, not a `SessionReport`. |
| `GET` | `/rules/history` | **Overridden** — aggregates stats across completed sub-sessions + live ones via `mergeRuleStats`. Useful during Phase 1 when the refinement store is still empty. |
| `GET` | `/violations` | All violations with status, exploration stats, assembly diff. |
| `GET` | `/violations/:id` | One violation with `fixedSource`, `fixDiff`, `exploration`. 404 if missing. |
| `GET` | `/violations/:id/sub-session` | Full sub-`SessionReport`. Prefers live active sub-session; falls back to the completed report in the store. |
| `GET` | `/active-sub-sessions` | `[{ violationId, state }]`. Empty between phases. |
| `GET` | `/merge` | `{ completed: MergeLogEntry[], pending: PendingMerge[] }`. |
| `GET` | `/config` | `RefinementConfig`. |
| `POST` | `/inject` | Same as common `/inject` but the response also includes `violations[]` detected in the injected source. |

The common control endpoints (`/pause`, `/inject`, `/branches/*`, `/rules/*`) are layered on and forward to whichever sub-session is currently active. The `Refiner` class has forwarding methods for each one — see `packages/core/src/refiner/refiner.ts` lines ~113–300.

**Injection-based fix semantics** (refine only): when an injection scores 0 AND `guideline.detect()` no longer finds the specific violation on the injected source, `Refiner.injectCode()` marks the violation `fixed` and stops the sub-session. This uses per-violation detection — it's more precise than the `candidateFilter`, which uses the broader `containsViolation` check.

## Cleanup mode extras

`createCleanupApp` exists in `server.ts` but no CLI command wires it up. The `/cleanup-state` endpoint it defines — `{ phase: 'idle' | 'phase2-smell-permutation', hasActiveSearch: boolean }` — is only reachable if you start the cleanup server yourself from library code. Phase 1 (canonicalize) is fast and deterministic with no `MutationSearch`, so common endpoints return empty between phases.

## `transmuter ctl` — CLI client

`packages/cli/src/commands/ctl.ts`. Reads the discovery file, sends the request, prints the JSON response. Actions map 1:1 to endpoints:

```bash
transmuter ctl session                      # GET /session
transmuter ctl candidates                   # GET /candidates
transmuter ctl best                         # GET /candidates/best
transmuter ctl candidate candidate-5        # GET /candidates/candidate-5
transmuter ctl lineage candidate-5          # GET /candidates/candidate-5/lineage
transmuter ctl assembly candidate-5         # GET /candidates/candidate-5/assembly
transmuter ctl graph                        # GET /graph
transmuter ctl timeline                     # GET /timeline
transmuter ctl report                       # GET /report
transmuter ctl pause                        # POST /pause
transmuter ctl stop                         # POST /stop
transmuter ctl prune 40                     # POST /branches/prune { maxScore: 40 }
transmuter ctl prune best 10                # POST /branches/prune { keepBestN: 10 }
transmuter ctl inject '<source>' [label]    # POST /inject
transmuter ctl inject-file path.c [label]   # POST /inject  (reads source from file)
transmuter ctl disable-branch target-3      # POST /branches/target-3/disable
transmuter ctl set-weight target-3 5        # POST /branches/target-3/weight { weight: 5 }
transmuter ctl update-rules reorder-stmts=40 asm-barrier=0
```

Pass `--control-file <path>` to point at a specific discovery file.

## Adding a new endpoint

1. **Read endpoint:** add the handler inside `registerSearchRoutes` in `packages/cli/src/api/server.ts`. Add a description entry to `COMMON_READ_ENDPOINTS` (the `GET /` catalog).
2. **Control endpoint:** add to the same file, inside `registerSearchRoutes`, and append to `COMMON_CONTROL_ENDPOINTS`. Also add support to the `batch` handler if the operation should be scriptable.
3. **Mode-specific:** register BEFORE `registerSearchRoutes(app, ...)` so Hono's first-match-wins routing lets your override take precedence. See how `refine` overrides `/report` and `/rules/history` at lines ~1086–1092 in `server.ts`.
4. **CLI shortcut:** add an entry to `ACTIONS` in `packages/cli/src/commands/ctl.ts` and update `CTL_USAGE`.
5. **`transmuter ctl` test:** add to `packages/cli/src/api/server.spec.ts`. The spec file sets up a real Hono app and makes real HTTP requests to it.

## Testing with curl

```bash
# Discovery
PORT=$(jq -r '.port' transmuter-control.json)
BASE="http://127.0.0.1:$PORT"

# Poll best score
curl -s "$BASE/session" | jq .bestScore

# Get full graph
curl -s "$BASE/graph" | jq '.candidates | length'

# Inject a hypothesis (dry run)
curl -s -X POST "$BASE/inject" \
  -H 'content-type: application/json' \
  -d '{"source":"void f(){}","dryRun":true}'

# Prune anything worse than score 20
curl -s -X POST "$BASE/branches/prune" \
  -H 'content-type: application/json' \
  -d '{"maxScore":20}'
```

## Audit log

There isn't a dedicated audit log file — all mutating operations emit through the `MutationSearchEvent`/`RefinerEvent` stream, which the respective store captures. The `SessionReport`/`RefinementReport` includes every state change visible from events (forks, target enable/disable/weight, rule weight updates show up in the final `config.ruleWeights`). If you need a durable audit trail, wire your own `onEvent` callback and log from there.

## Pitfalls

- **Ports are ephemeral.** The discovery file holds the active port for one session. Always re-read it.
- **`/candidates/:id/assembly` spawns a compiler.** Cheap in isolation, expensive in a loop. Prefer reading cached assembly from `GET /candidates/:id` when you already have the candidate in hand — every `CandidateNode` carries its own `assembly` and `assemblyDiff` fields.
- **Refine `/report` ≠ match `/report`.** They return different types. Check `report.type` (`'match'` | `'refinement'`) before destructuring.
- **Common control routes in refine mode act on the first active sub-session.** During the merge phase, there's only one anyway. During parallel Phase 1, `updateWeights` etc. broadcast to all sub-sessions — see `Refiner.#activeSubSessions`.
- **`POST /stop` is terminal.** You can't restart a stopped session — launch a new CLI process.

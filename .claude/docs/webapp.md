# Webapp

`@transmuter/webapp` is a private Vite + React app that renders `SessionReport` and `RefinementReport` JSON. Ships two artifacts:

- **Build:** `pnpm run build:webapp` → a single-file `dist/index.html` via `vite-plugin-singlefile`. The CLI's match/refine commands embed this bundle into saved reports (the HTML includes both the UI and the report JSON injected as `window.__SESSION_REPORT__`).
- **Dev:** `pnpm run dev:webapp -- ./path/to/session-report.json` → Vite dev server on port 3001 that injects the JSON via a `transformIndexHtml` plugin and hot-reloads on file changes. See `packages/webapp/src/dev-server.ts`.

## Framework

- React 19 + Vite 6
- Tailwind 3 (config in `packages/webapp/`), with utility classes used directly in components.
- `@xyflow/react` 12 for the interactive candidate graph.
- `@dagrejs/dagre` 3 for graph layout.
- `echarts` 5 for the score timeline chart.
- `@wooorm/starry-night` 3 for syntax highlighting (C, C++, Pascal, asm, diff).

## Data flow

```
Session JSON file → window.__SESSION_REPORT__ (injected by dev-server or build)
  → useMemo(() => window.__SESSION_REPORT__, [])   // App.tsx
  → isRefinement(report) branch
    → App.tsx (match view) OR RefinementApp.tsx (refinement view)
      → Components read nested fields: report.graph, report.summary, report.ruleStats, ...
```

There is **no server** — everything is static. The webapp never compiles code, never calls objdiff. Every field it renders already lives in the report JSON, including per-candidate `assembly` and `assemblyDiff` strings.

## Package alias

The webapp imports directly from core's `src/`, not the built package:

```ts
// packages/webapp/vite.config.ts
resolve: { alias: { '@core': path.resolve(__dirname, '../core/src') } }
```

Used in exactly one place: `CandidateGraph.tsx` imports `computeCollapsedGraph` from `@core/session/collapsed-graph.js`. This means **the webapp can compile without `@transmuter/core`'s `dist/` existing**, which is why `pnpm run build:webapp` works on a clean clone.

## Match view (`App.tsx`)

Tabs (shown only when there's data to render):

| Tab | Component | Source |
|---|---|---|
| Overview | `SessionSummaryView` + `ScoreTimeline` | `report.summary`, `report.config`, `report.metadata`, `report.scoreTimeline` |
| Graph | `CandidateGraph` | `report.graph.candidates`, `report.graph.mutationTargets`, `report.graph.superNodes`, `report.config.language`, `report.cleanup` |
| Rules | `RuleEffectiveness` | `report.ruleStats` |
| Focus | `FocusResults` | `report.focusResults` |

### Candidate detail panel

Clicking a node in the Graph tab opens a right-side panel with sub-tabs: **Source**, **Source Diff**, **Assembly**, **Assembly Diff**. All four are driven by `CandidateNode` fields already in the JSON.

- **Source** — syntax-highlighted via `CodeBlock` (language from `report.config.language`).
- **Source Diff** — unified diff against a selected reference candidate (default: genesis), computed client-side via LCS.
- **Assembly** — `CandidateNode.assembly`.
- **Assembly Diff** — `CandidateNode.assemblyDiff` with diff highlighting.

## Refinement view (`RefinementApp.tsx`)

Tabs:

| Tab | Component | Source |
|---|---|---|
| Overview | `RefinementSummary` | `report.config`, `report.finalResult`, `report.guideline` |
| Violations | `ViolationList` | `report.violations[]` with `exploration.subSession` for drill-down |
| Graph | `CandidateGraph` | Aggregated across all sub-sessions via `aggregateGraph()` — IDs prefixed with `<violationId>/` to avoid collisions |
| Rules | `RuleEffectiveness` | `report.ruleStats` (already merged by the refinement store) |
| Merge | `MergeTimeline` | `report.mergeLog` — hidden when there's only one violation |
| Result | `ResultViewer` | `report.finalResult.source` |

`aggregateGraph()` (top of `RefinementApp.tsx`) walks every violation's `exploration.subSession.graph`, prefixes candidate/target/supernode IDs with `<violationId>/`, and merges them into a single renderable graph. This is why sub-session graphs can be viewed alongside each other without ID collisions.

## Component structure

```
packages/webapp/src/
  App.tsx                     # match view router
  RefinementApp.tsx           # refine view router + aggregateGraph helper
  main.tsx                    # React root
  types.ts                    # Webapp-side type definitions (mirror of @transmuter/core types)
  dev-server.ts               # Vite dev server with JSON injection + file watch
  styles.css                  # Tailwind entry
  components/
    CandidateGraph.tsx        # xyflow graph, dagre layout, detail panel
    CodeBlock.tsx             # starry-night syntax highlighter wrapper
    DiffView.tsx              # unified diff renderer
    FocusResults.tsx
    Header.tsx                # shared top bar
    Icon.tsx                  # icon set enum + SVGs
    MergeTimeline.tsx         # refine Phase 2 timeline
    RefinementSummary.tsx
    ResultViewer.tsx          # final refined source viewer
    RuleEffectiveness.tsx     # rule stats table
    ScoreTimeline.tsx         # echarts score-over-time chart
    SessionSummary.tsx
    ViolationList.tsx         # per-violation cards with sub-session drill-down
```

## Adding a new view

1. Create the component in `packages/webapp/src/components/`.
2. Add a `Tab` entry and a `TabContent` case in `App.tsx` (match) or `RefinementApp.tsx` (refine). Gate visibility on data availability.
3. Add an entry to the `Icon` component's enum if you need a new icon — they're inlined SVGs.
4. Read from report fields that already exist. If you need new data, the flow is: extend the event type in `core/types.ts` → store it in `SessionStore` → expose via `SessionReport` → render in the webapp.

## Running during development

```bash
# Match view on a saved report
pnpm run dev:webapp -- test-fixture/fade-out-controller/session-1775163640997.json

# Rebuild on report change (dev-server watches the file and hot-reloads)
# Just re-save the JSON file — no restart needed.

# Build the single-file bundle (used by the saved-report HTML embed)
pnpm run build:webapp
```

The CLI's report generator reads the built `dist/index.html` and uses it as the template when writing HTML reports. If the webapp isn't built, the CLI's match/refine HTML output will fall back to JSON-only. **Rebuild the webapp after any UI change or the CLI's HTML reports won't reflect it.**

## Pitfalls

- **Don't add runtime dependencies on core's dist.** The `@core` alias resolves to source. If you import a non-pure runtime helper, you'll tie the webapp build to the core build order.
- **Refinement sub-session IDs must be prefixed.** If you add a new cross-sub-session aggregation, reuse `aggregateGraph()`'s `<violationId>/` prefix pattern so candidate IDs stay unique.
- **Syntax highlighting language must be in report.config.language.** The `SessionConfig.language` field is what `CodeBlock` reads. If you're testing on an old report that predates this field, default to `'c'`.
- **Dev server port is 3001, not 5173.** The fixture runner and any Playwright test fixtures assume that.
- **`window.__SESSION_REPORT__` is only set by the injection script.** Opening a built `dist/index.html` without injecting data shows "No session report data found."

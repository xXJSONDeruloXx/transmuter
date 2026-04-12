# Library usage

## Cleanup API

```typescript
import { Cleanup } from '@transmuter/core';

const cleanup = new Cleanup({
  source: matchingSource,  // must already compile to score 0
  functionName: 'my_func',
  targetObjectPath: './target.o',
  compilerCommand: 'agbcc -O2 -mthumb {{inputPath}} -o {{outputPath}}',
  cwd: '/path/to/project',
});

const result = await cleanup.run();
// result.source — cleaned code, identical assembly
// result.smellBefore.total → result.smellAfter.total
```

## Using `SessionStore` in the library

The `SessionStore` class provides a typed query API for programmatic access to session data. Wire it to a `MutationSearch` instance via the event callback:

```typescript
import { MutationSearch, SessionStore } from '@transmuter/core';

const store = new SessionStore({
  metadata: { label: 'sub_807ECFC attempt 3' },
});
store.setOriginalSource(cCode);

const search = new MutationSearch({
  source: cCode,
  functionName: 'sub_807ECFC',
  targetObjectPath: './target.o',
  compilerCommand: 'agbcc -O2 -mthumb {{inputPath}} -o {{outputPath}}',
  cwd: '/path/to/project',
  onEvent(event) {
    store.push(event);  // Feed events to the store
  },
});

const result = await search.start();

// Query the session
const summary = store.getSummary();
console.log(`Best: ${summary.bestScore}, forks: ${summary.forkCount}`);

const best = store.getBestCandidate();
console.log(`Best candidate: ${best.id} (score ${best.score})`);

const ruleStats = store.getRuleStats();
const topRule = ruleStats[0];
console.log(`Most effective: ${topRule.ruleId} (${topRule.forked} forks)`);

// Save to disk
await store.saveReportAtomic('./session-report.json');

// Load a previous report
const loaded = await SessionStore.loadReport('./session-report.json');
console.log(loaded.getSummary());
```

### Available queries

| Method | Returns | Description |
|--------|---------|-------------|
| `getSummary()` | `SessionSummary` | Aggregate stats: scores, iterations, timing, fork count |
| `getAllCandidates()` | `CandidateNode[]` | All candidates with source, assembly, and score |
| `getBestCandidate()` | `CandidateNode` | Candidate with the lowest score |
| `getLineage(id)` | `CandidateNode[]` | Ancestor chain from a candidate to the genesis root |
| `getGraph()` | `{ candidates, mutationTargets, superNodes? }` | Full candidate graph including supernodes from compaction |
| `getRuleStats()` | `RuleStatsEntry[]` | Per-rule effectiveness: applied, forked, success rate, delta, deltaByType |
| `getScoreTimeline()` | `TimelinePoint[]` | Sampled score-over-time data for charting |
| `getFocusResults()` | `FocusResult[]` | Outcomes of focus constraints |

## Focus constraints

When using the library API, you can pass focus constraints to direct the MutationSearch's mutations:

```typescript
const search = new MutationSearch({
  // ...standard options...
  focusConstraints: [
    // Concentrate mutations on lines 3-4
    {
      type: 'focus-region',
      id: 'fix-reg-swap',
      description: 'Fix register swap at lines 3-4',
      lines: { start: 3, end: 4 },
      strength: 0.7,  // 70% of mutations target this region
    },
    // Protect the already-matching loop from mutation
    {
      type: 'avoid-region',
      id: 'protect-loop',
      description: 'Loop at lines 10-15 already matches',
      lines: { start: 10, end: 15 },
    },
    // Test a specific hypothesis — compiled, scored, and injected as a branch
    {
      type: 'hypothesis',
      id: 'swap-assignments',
      description: 'Try swapping temp1 and temp2',
      source: 'void my_func() { int temp2 = b; int temp1 = a; ... }',
    },
  ],
});
```

After the session, query `store.getFocusResults()` to see whether each constraint was effective.

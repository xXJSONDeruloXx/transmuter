/**
 * Test fixture: multi-branch session with EntityItemDrop.
 *
 * Demonstrates the SessionStore and branch system by running MutationSearch
 * on a harder function and injecting alternative candidates that each fix
 * different subsets of issues.
 *
 * Usage: npx tsx test-fixture/entity-item-drop/run-multi-branch.ts
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { MutationSearch, SessionStore, type SessionConfig } from '@transmuter/core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sharedDir = path.join(__dirname, '..', 'shared');

async function main() {
  const sourcePrefix = await fs.readFile(path.join(sharedDir, 'context.h'), 'utf-8');
  const baseSource = await fs.readFile(path.join(__dirname, 'base.c'), 'utf-8');
  const targetPath = path.join(__dirname, 'target.o');
  const compilerCmd = `${path.join(sharedDir, 'compile.sh')} {{inputPath}} {{outputPath}}`;

  const store = new SessionStore({
    metadata: { sessionId: 'multi-branch-demo', label: 'EntityItemDrop — multi-branch' },
  });
  store.setOriginalSource(baseSource);
  store.setConfig({
    functionName: 'EntityItemDrop',
    targetObjectPath: targetPath,
    compilerCommand: compilerCmd,
    profile: 'agbcc',
    concurrency: 4,
    maxIterations: 20000,
    timeoutMs: 30000,
    seed: 42,
    mutationDepth: 1,
    lateralForkBudget: 0,
    ruleWeights: {},
    disabledRules: [],
    focusConstraints: [],
  } satisfies SessionConfig);

  const search = new MutationSearch({
    source: baseSource,
    functionName: 'EntityItemDrop',
    targetObjectPath: targetPath,
    compilerCommand: compilerCmd,
    cwd: process.cwd(),
    profile: 'agbcc',
    concurrency: 4,
    maxIterations: 20000,
    timeoutMs: 30000,
    seed: 42,
    sourcePrefix,
    onEvent(event) {
      store.push(event);
      if (event.type === 'started') {
        console.log(`Base score: ${event.baseScore}`);
      }
      if (event.type === 'forked') {
        console.log(`  Forked: ${event.oldScore} → ${event.newScore} via ${event.ruleId}`);
      }
      if (event.type === 'perfect-match') {
        console.log(`  PERFECT MATCH at iteration ${event.iteration}`);
      }
    },
  });

  // Start the transmuter (non-blocking)
  const resultPromise = search.start();

  // Wait for the session to produce some results, then inject alternatives.
  // Each alternative fixes a different subset of non-matchings, simulating
  // what an LLM might suggest after analyzing the objdiff output.
  setTimeout(async () => {
    try {
      // Pause the transmuter briefly so inject compilations can complete
      search.pause();

      // Alt 1: fix the early-despawn reorder + state setup reorder
      const alt1 = baseSource
        .replace(
          'e[0x10] = zero;\n        e[0x0F] = 0x1C;',
          'e[0x0F] = 0x1C;\n        e[0x10] = zero;',
        )
        .replace(
          'arrayBase = base;\n    state = entity[0x0F];',
          'state = entity[0x0F];\n    arrayBase = base;',
        );
      const result1 = await search.injectCode(alt1);
      if (result1) {
        console.log(`  Injected alt1 (top fixes): score ${result1.candidate.score}`);
      }

      // Alt 3: fix the case 3/4 statement reordering
      const alt3 = baseSource
        .replaceAll(
          'one = 1;\n            *(u16 *)(entity + 0x14) = zero;',
          '*(u16 *)(entity + 0x14) = zero;\n            one = 1;',
        )
        .replaceAll(
          'ent[0x16] = 4;\n            ent[0x09] = *(u8 *)idx;',
          'ent[0x09] = *(u8 *)idx;\n            ent[0x16] = 4;',
        )
        .replaceAll(
          'ent[0x16] = 2;\n            ent[0x09] = *(u8 *)idx;',
          'ent[0x09] = *(u8 *)idx;\n            ent[0x16] = 2;',
        );
      const result3 = await search.injectCode(alt3);
      if (result3) {
        console.log(`  Injected alt3 (case body fixes): score ${result3.candidate.score}`);
      }

      search.resume();
    } catch (err) {
      console.error('  Injection error:', err);
      search.resume();
    }
  }, 500);

  const result = await resultPromise;

  console.log(`\nResult: ${result.perfectMatch ? 'PERFECT MATCH' : `best score ${result.bestScore}`}`);
  console.log(`Iterations: ${result.totalIterations}, Time: ${result.elapsed}ms`);

  const summary = store.getSummary();
  console.log(`Forks: ${summary.forkCount}`);

  const ruleStats = store.getRuleStats();
  const topRules = ruleStats
    .filter((r) => r.forked > 0)
    .sort((a, b) => b.forked - a.forked)
    .slice(0, 5);
  console.log(`Top rules: ${topRules.map((r) => `${r.ruleId}(${r.forked})`).join(', ')}`);

  const graph = store.getGraph();
  const targets = graph.mutationTargets;
  console.log(`\nTargets: ${targets.length}`);
  for (const t of targets) {
    const status = t.enabled ? 'active' : 'disabled';
    console.log(`  ${t.id}: weight ${t.weight}, ${t.attempts} attempts, ${status}`);
  }

  const reportPath = path.join(__dirname, `session-${Date.now()}.json`);
  await store.saveReportAtomic(reportPath);
  console.log(`\nReport: ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

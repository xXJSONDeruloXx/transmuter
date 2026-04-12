/**
 * Test fixture: permute FadeOutController to match target assembly.
 *
 * Usage: npx tsx test-fixture/fade-out-controller/run-permute.ts
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { MutationSearch, SessionStore, type MutationSearchEvent, type SessionConfig } from '@transmuter/core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sharedDir = path.join(__dirname, '..', 'shared');

async function main() {
  const sourcePrefix = await fs.readFile(path.join(sharedDir, 'context.h'), 'utf-8');
  const baseSource = await fs.readFile(path.join(__dirname, 'base.c'), 'utf-8');
  const targetPath = path.join(__dirname, 'target.o');
  const compilerCmd = `${path.join(sharedDir, 'compile.sh')} {{inputPath}} {{outputPath}}`;

  console.log('FadeOutController permutation');
  console.log('='.repeat(50));
  console.log();

  const store = new SessionStore({
    metadata: { sessionId: 'fade-out-controller-demo', label: 'FadeOutController — permute' },
  });
  store.setOriginalSource(baseSource);
  store.setConfig({
    functionName: 'FadeOutController',
    targetObjectPath: targetPath,
    compilerCommand: compilerCmd,
    language: 'c',
    profile: 'agbcc',
    concurrency: 4,
    maxIterations: 10000,
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
    language: 'c',
    functionName: 'FadeOutController',
    targetObjectPath: targetPath,
    compilerCommand: compilerCmd,
    cwd: process.cwd(),
    profile: 'agbcc',
    sourcePrefix,
    concurrency: 4,
    maxIterations: 10000,
    timeoutMs: 30000,
    seed: 42,
    onEvent(event: MutationSearchEvent) {
      store.push(event);
      if (event.type === 'started') {
        console.log(`Base score: ${event.baseScore}`);
      }
      if (event.type === 'forked') {
        console.log(`  Improved: ${event.oldScore} -> ${event.newScore} via ${event.ruleId}`);
      }
      if (event.type === 'perfect-match') {
        console.log(`  PERFECT MATCH at iteration ${event.iteration}`);
      }
    },
  });

  const result = await search.start();

  console.log();
  console.log(`Result: ${result.perfectMatch ? 'PERFECT MATCH' : `best score ${result.bestScore}`}`);
  console.log(`Iterations: ${result.totalIterations}, Time: ${result.elapsed}ms`);

  const reportPath = path.join(__dirname, `session-${Date.now()}.json`);
  await store.saveReportAtomic(reportPath);
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

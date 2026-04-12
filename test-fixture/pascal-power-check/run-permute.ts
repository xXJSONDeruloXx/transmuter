/**
 * Fixture test: Pascal permutation with IsPowerOfTwo.
 *
 * Verifies that the MutationSearch correctly handles Pascal source files,
 * compiles them with IDO Pascal (cc + upas via .p extension), and
 * only fires Pascal-compatible rules.
 *
 * Prerequisites:
 * - IDO 7.1: built via ./setup-compilers.sh
 * - target.o present (generated via ./generate-target.sh)
 *
 * Usage:
 *   npx tsx test-fixture/pascal-power-check/run-permute.ts
 */
import { type SessionConfig, SessionStore, MutationSearch, type MutationSearchEvent } from '@transmuter/core';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sharedDir = path.resolve(__dirname, '../shared');

async function main() {
  const baseSource = await fs.readFile(path.join(__dirname, 'base.pas'), 'utf-8');
  const targetPath = path.join(__dirname, 'target.o');

  try {
    await fs.access(targetPath);
  } catch {
    console.error('target.o not found. Run generate-target.sh first.');
    process.exit(1);
  }

  // IDO cc routes .p files to upas (Pascal frontend) via USR_LIB.
  // The shared compile script handles the .pas → .p rename.
  const compilerCmd = `${sharedDir}/compile-ido-pascal.sh {{inputPath}} {{outputPath}}`;

  // IDO Pascal lowercases all symbol names
  const functionName = 'update_coords';

  const store = new SessionStore({
    metadata: { sessionId: 'pascal-power-check-demo', label: 'update_coords — Pascal permute' },
  });
  store.setOriginalSource(baseSource);
  store.setConfig({
    functionName,
    targetObjectPath: targetPath,
    compilerCommand: compilerCmd,
    language: 'pascal',
    profile: 'ido',
    concurrency: 4,
    maxIterations: 50_000,
    timeoutMs: 90_000,
    seed: 42,
    mutationDepth: 1,
    lateralForkBudget: 0,
    ruleWeights: {},
    disabledRules: [],
    focusConstraints: [],
  } satisfies SessionConfig);

  console.log('Pascal power-of-two permutation test');
  console.log('='.repeat(50));
  console.log(`Language: pascal`);
  console.log(`Function: ${functionName}`);
  console.log();

  const search = new MutationSearch({
    source: baseSource,
    language: 'pascal',
    functionName,
    targetObjectPath: targetPath,
    compilerCommand: compilerCmd,
    cwd: process.cwd(),
    profile: 'ido',
    concurrency: 4,
    maxIterations: 50_000,
    timeoutMs: 90_000,
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
      if (event.type === 'error') {
        console.log(`  Error: ${event.message}`);
      }
    },
  });

  const result = await search.start();

  console.log();
  console.log(`Result: ${result.perfectMatch ? 'PERFECT MATCH' : `best score ${result.bestScore}`}`);
  console.log(`Iterations: ${result.totalIterations}, Time: ${result.elapsed}ms`);

  // Verify no C++-only rules fired
  const ruleStats = store.getRuleStats();
  const cppOnlyRules = ruleStats.filter(
    (r) => ['explicit-this', 'cast-style-swap', 'reorder-field-init'].includes(r.ruleId) && r.applied > 0,
  );
  if (cppOnlyRules.length > 0) {
    console.error(`ERROR: C++-only rules fired in Pascal mode: ${cppOnlyRules.map((r) => r.ruleId).join(', ')}`);
    process.exit(1);
  }
  console.log('Verified: no C++-only rules fired in Pascal mode');

  const reportPath = path.join(__dirname, `session-${Date.now()}.json`);
  await store.saveReportAtomic(reportPath);
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

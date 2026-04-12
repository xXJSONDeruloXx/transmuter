/**
 * Fixture test: C++ permutation with IDO method ordering.
 *
 * Verifies that the MutationSearch correctly handles C++ source files and
 * only fires C++-compatible rules when language is set to 'cpp'.
 *
 * Prerequisites:
 * - Compilers built via ./setup-compilers.sh
 * - target.o generated via ./generate-target.sh
 *
 * Usage:
 *   npx tsx test-fixture/cpp-method-order/run-permute.ts
 */
import { type SessionConfig, SessionStore, MutationSearch, type MutationSearchEvent } from '@transmuter/core';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(__dirname, '../..');

async function main() {
  const baseSource = await fs.readFile(path.join(__dirname, 'base.cpp'), 'utf-8');
  const targetPath = path.join(__dirname, 'target.o');

  try {
    await fs.access(targetPath);
  } catch {
    console.error('target.o not found. Run generate-target.sh first.');
    process.exit(1);
  }

  const idoDir = path.join(repoDir, 'compilers', 'ido-static-recomp', 'build', '7.1', 'out');
  const compilerCmd = `${idoDir}/NCC -c -mips2 -O2 -32 -o {{outputPath}} {{inputPath}}`;

  const store = new SessionStore({
    metadata: { sessionId: 'cpp-method-order-demo', label: 'update_position — C++ method order' },
  });
  store.setOriginalSource(baseSource);
  store.setConfig({
    functionName: 'update_position',
    targetObjectPath: targetPath,
    compilerCommand: compilerCmd,
    language: 'cpp',
    profile: 'ido',
    concurrency: 4,
    maxIterations: 50_0000,
    timeoutMs: 90_000,
    seed: 42,
    mutationDepth: 1,
    lateralForkBudget: 0,
    ruleWeights: {},
    disabledRules: [],
    focusConstraints: [],
  } satisfies SessionConfig);

  console.log('C++ method order permutation test');
  console.log('='.repeat(50));
  console.log(`Language: cpp`);
  console.log(`Function: update_position`);
  console.log();

  const search = new MutationSearch({
    source: baseSource,
    language: 'cpp',
    functionName: 'update_position',
    targetObjectPath: targetPath,
    compilerCommand: compilerCmd,
    cwd: process.cwd(),
    profile: 'ido',
    concurrency: 4,
    maxIterations: 50_0000,
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
    },
  });

  const result = await search.start();

  console.log();
  console.log(`Result: ${result.perfectMatch ? 'PERFECT MATCH' : `best score ${result.bestScore}`}`);
  console.log(`Iterations: ${result.totalIterations}, Time: ${result.elapsed}ms`);

  // Verify no Pascal rules fired
  const ruleStats = store.getRuleStats();
  const pascalRules = ruleStats.filter((r) => r.ruleId.startsWith('pascal-') && r.applied > 0);
  if (pascalRules.length > 0) {
    console.error(`ERROR: Pascal rules fired in C++ mode: ${pascalRules.map((r) => r.ruleId).join(', ')}`);
    process.exit(1);
  }
  console.log('Verified: no Pascal rules fired in C++ mode');

  const reportPath = path.join(__dirname, `session-${Date.now()}.json`);
  await store.saveReportAtomic(reportPath);
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Fixture test: Pascal refinement removing redundant type casts.
 *
 * Verifies that the Refiner detects redundant Integer() casts in Pascal code
 * via the 'no-redundant-cast-pascal' guideline and attempts to remove them
 * while preserving assembly output.
 *
 * Prerequisites:
 * - IDO 7.1: built via ./setup-compilers.sh
 * - target.o present (generated via ./generate-target.sh)
 *
 * Usage:
 *   npx tsx test-fixture/pascal-cast-cleanup/run-refine.ts
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Refiner, type RefinerEvent, type RefinementResult } from '@transmuter/core';

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

  const compilerCmd = `${sharedDir}/compile-ido-pascal.sh {{inputPath}} {{outputPath}}`;

  // IDO Pascal lowercases all symbol names
  const functionName = 'clampbyte';

  console.log('Pascal cast cleanup refinement test');
  console.log('='.repeat(50));
  console.log(`Language: pascal`);
  console.log(`Guideline: no-redundant-cast-pascal`);
  console.log();

  const refiner = new Refiner({
    source: baseSource,
    language: 'pascal',
    functionName,
    targetObjectPath: targetPath,
    compilerCommand: compilerCmd,
    cwd: process.cwd(),
    profile: 'ido',
    guidelineId: 'no-redundant-cast-pascal',
    concurrency: 4,
    maxIterationsPerViolation: 50_000,
    timeoutMsPerViolation: 60_000,
    seed: 42,
    onEvent(event: RefinerEvent) {
      switch (event.type) {
        case 'sanity-check-passed':
          console.log('Sanity check: PASSED (score 0)');
          break;
        case 'sanity-check-failed':
          console.log(`Sanity check: FAILED — ${event.error}`);
          break;
        case 'violations-detected':
          console.log(`Violations detected: ${event.count}`);
          for (const v of event.violations) {
            console.log(`  - ${v.id}: ${v.description}`);
          }
          break;
        case 'violation-trivially-fixed':
          console.log(`  ${event.violationId}: TRIVIALLY FIXED`);
          break;
        case 'violation-fixed':
          console.log(`  ${event.violationId}: FIXED in ${event.iterations.toLocaleString()} iterations`);
          break;
        case 'completed':
          printResult(event.result);
          break;
      }
    },
  });

  const result = await refiner.refine();

  // Save report
  const store = refiner.getStore();
  const reportPath = path.join(__dirname, `refine-${Date.now()}.json`);
  await store.saveReportAtomic(reportPath);
  console.log(`\nReport: ${reportPath}`);

  if (result.violationsFixed > 0) {
    const outputPath = path.join(__dirname, 'refined.pas');
    await fs.writeFile(outputPath, result.source);
    console.log(`Refined source: ${outputPath}`);
  }

  process.exit(result.violationsFixed > 0 ? 0 : 1);
}

function printResult(result: RefinementResult) {
  console.log('\n' + '='.repeat(50));
  console.log(`Result: ${result.violationsFixed}/${result.violationsTotal} violations fixed`);
  console.log(`  Trivial: ${result.trivialFixes}, Permuted: ${result.permutedFixes}`);
  console.log(`  Time: ${(result.elapsed / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Fixture test: C++ refinement removing C-style casts.
 *
 * Verifies that the Refiner detects C-style casts in C++ code via the
 * 'no-c-style-cast' guideline and attempts to replace them with
 * static_cast<> equivalents while preserving assembly output.
 *
 * Prerequisites:
 * - Compilers built via ./setup-compilers.sh
 * - target.o generated via ./generate-target.sh
 *
 * Usage:
 *   npx tsx test-fixture/cpp-cast-cleanup/run-refine.ts
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Refiner, type RefinerEvent, type RefinementResult } from '@transmuter/core';

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

  console.log('C++ cast cleanup refinement test');
  console.log('='.repeat(50));
  console.log(`Language: cpp`);
  console.log(`Guideline: no-c-style-cast`);
  console.log();

  const refiner = new Refiner({
    source: baseSource,
    language: 'cpp',
    functionName: 'clamp_health',
    targetObjectPath: targetPath,
    compilerCommand: compilerCmd,
    cwd: process.cwd(),
    profile: 'ido',
    guidelineId: 'no-c-style-cast',
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
          console.log(`Sanity check: FAILED - ${event.error}`);
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
    const outputPath = path.join(__dirname, 'refined.cpp');
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

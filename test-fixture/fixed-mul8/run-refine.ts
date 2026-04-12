/**
 * Test fixture: refine FixedMul8 to remove the register asm pin.
 *
 * FixedMul8 is a small 8.8 fixed-point multiplication function that uses
 * `register s32 shifted asm("r1") = result;` to pin a variable to r1.
 * This fixture tests whether `transmuter refine --guideline no-asm-pin`
 * can find an equivalent C expression that produces the same assembly
 * without the asm pin, and then whether `--cleanup` can simplify the result.
 *
 * Usage: npx tsx test-fixture/fixed-mul8/run-refine.ts
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Cleanup, type CleanupEvent, type CleanupResult, Refiner, type RefinerEvent, type RefinementResult } from '@transmuter/core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sharedDir = path.join(__dirname, '..', 'shared');

async function main() {
  const sourcePrefix = await fs.readFile(path.join(sharedDir, 'context.h'), 'utf-8');
  const baseSource = await fs.readFile(path.join(__dirname, 'base.c'), 'utf-8');
  const targetPath = path.join(__dirname, 'target.o');
  const compilerCmd = `${path.join(sharedDir, 'compile.sh')} {{inputPath}} {{outputPath}}`;

  console.log('FixedMul8 refine — removing asm register pin');
  console.log('='.repeat(50));
  console.log();
  console.log('Source:');
  console.log(baseSource.trim());
  console.log();

  const refiner = new Refiner({
    source: baseSource,
    functionName: 'FixedMul8',
    targetObjectPath: targetPath,
    compilerCommand: compilerCmd,
    cwd: process.cwd(),
    profile: 'agbcc',
    guidelineId: 'no-asm-pin',
    sourcePrefix,
    concurrency: 4,
    maxIterationsPerViolation: 100_000,  // cap for test fixture; CLI defaults to unlimited
    timeoutMsPerViolation: 120_000,    // cap for test fixture; CLI defaults to unlimited
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
          console.log();
          break;
        case 'violation-trivially-fixed':
          console.log(`  ${event.violationId}: TRIVIALLY FIXED (removal alone scores 0)`);
          break;
        case 'violation-fix-started':
          console.log(`  ${event.violationId}: attempting fix...`);
          break;
        case 'violation-fix-progress':
          if (event.iteration % 1000 === 0) {
            process.stdout.write(`\r  ${event.violationId}: iter ${event.iteration.toLocaleString()}, score ${event.score}  `);
          }
          break;
        case 'violation-fixed':
          process.stdout.write('\n');
          console.log(`  ${event.violationId}: FIXED in ${event.iterations.toLocaleString()} iterations (${(event.elapsed / 1000).toFixed(1)}s)`);
          break;
        case 'violation-not-fixable':
          process.stdout.write('\n');
          console.log(`  ${event.violationId}: NOT FIXABLE (best score: ${event.bestScore}, ${event.iterations.toLocaleString()} iterations)`);
          break;
        case 'merge-started':
          console.log('\nMerge phase:');
          break;
        case 'merge-step':
          console.log(`  Step ${event.step}: ${event.violationId} — ${event.action}`);
          break;
        case 'completed':
          printResult(event.result);
          break;
      }
    },
  });

  const result = await refiner.refine();
  const store = refiner.getStore();

  // Save refined source if any fixes were applied
  let finalSource = result.source;
  if (result.violationsFixed > 0) {
    const outputPath = path.join(__dirname, 'refined.c');
    await fs.writeFile(outputPath, result.source);
    console.log(`Refined source: ${outputPath}`);

    // --- Cleanup phase ---
    console.log('\n' + '='.repeat(50));
    console.log('Cleanup — simplifying refined code');
    console.log('='.repeat(50));
    console.log();

    const cleanupResult = await runCleanup(result.source, sourcePrefix, targetPath, compilerCmd);
    finalSource = cleanupResult.source;

    // Save cleaned source
    const cleanedPath = path.join(__dirname, 'cleaned.c');
    await fs.writeFile(cleanedPath, finalSource);
    console.log(`Cleaned source: ${cleanedPath}`);

    // Attach cleanup data to the report
    const report = store.toJSON();
    report.cleanup = Cleanup.toReportData(result.source, cleanupResult);
    const reportPath = path.join(__dirname, `refine-${Date.now()}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nReport: ${reportPath}`);
  } else {
    // No fixes — save report without cleanup
    const reportPath = path.join(__dirname, `refine-${Date.now()}.json`);
    await store.saveReportAtomic(reportPath);
    console.log(`\nReport: ${reportPath}`);
  }

  process.exit(result.violationsFixed > 0 ? 0 : 1);
}

async function runCleanup(
  source: string,
  sourcePrefix: string,
  targetPath: string,
  compilerCmd: string,
): Promise<CleanupResult> {
  const cleanup = new Cleanup({
    source,
    language: 'c',
    functionName: 'FixedMul8',
    targetObjectPath: targetPath,
    compilerCommand: compilerCmd,
    cwd: process.cwd(),
    profile: 'agbcc',
    sourcePrefix,
    maxIterations: 50_000,
    timeoutMs: 60_000,
    seed: 123,
    onEvent(event: CleanupEvent) {
      switch (event.type) {
        case 'phase1-started':
          console.log('Phase 1: Canonicalization');
          break;
        case 'phase1-progress':
          console.log(`  Applied: ${event.pass} (+${event.applied})`);
          break;
        case 'phase1-completed':
          console.log(`  Done — smell ${event.smellBefore.total} → ${event.smellAfter.total}`);
          if (event.result.totalApplied > 0) {
            for (const p of event.result.passes) {
              console.log(`    ${p.name}: ${p.applied} applied`);
            }
          }
          console.log();
          break;
        case 'phase2-started':
          console.log(`Phase 2: Smell permutation (starting smell: ${event.smellScore})`);
          break;
        case 'phase2-progress':
          if (event.iteration % 5000 === 0) {
            process.stdout.write(`\r  iter ${event.iteration.toLocaleString()}, best smell ${event.bestSmell}  `);
          }
          break;
        case 'phase2-completed':
          if (event.result.iterations > 0) {
            process.stdout.write('\n');
          }
          if (event.result.improved) {
            console.log(`  Done — smell ${event.result.smellBefore} → ${event.result.smellAfter} (${event.result.iterations.toLocaleString()} iterations, ${(event.result.elapsed / 1000).toFixed(1)}s)`);
          } else {
            console.log(`  No improvement (${event.result.iterations.toLocaleString()} iterations, ${(event.result.elapsed / 1000).toFixed(1)}s)`);
          }
          console.log();
          break;
        case 'completed':
          console.log('Cleanup result:');
          console.log(`  Smell: ${event.result.smellBefore.total} → ${event.result.smellAfter.total}`);
          console.log(`  Time: ${(event.result.elapsed / 1000).toFixed(1)}s`);
          console.log();
          console.log('Cleaned source:');
          console.log(event.result.source.trim());
          break;
      }
    },
  });

  return cleanup.run();
}

function printResult(result: RefinementResult) {
  console.log('\n' + '='.repeat(50));
  console.log(`Result: ${result.violationsFixed}/${result.violationsTotal} violations fixed`);
  console.log(`  Trivial: ${result.trivialFixes}`);
  console.log(`  Permuted: ${result.permutedFixes}`);
  console.log(`  Resolved by prior: ${result.resolvedByPrior}`);
  console.log(`  Not fixable: ${result.notFixable}`);
  console.log(`  Time: ${(result.elapsed / 1000).toFixed(1)}s`);

  if (result.violationsFixed > 0) {
    console.log('\nRefined source:');
    console.log(result.source.trim());
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

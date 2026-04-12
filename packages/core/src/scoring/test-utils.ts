/**
 * Shared fixtures for `scoring/*.spec.ts` — assembles small ARMv4T Thumb
 * sources via the system `arm-none-eabi-as` so the scoring layer is exercised
 * against real ELF object files and real objdiff-wasm (no mocks).
 */
import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

/** ARMv4T / Thumb — the profile used by the agbcc-targeted GBA fixtures. */
export const ARM_DIFF_SETTINGS: Record<string, string> = {
  'arm.archVersion': 'v4t',
  functionRelocDiffs: 'none',
};

/** Wrap a body of function definitions in a Thumb `.text` section header. */
export function armThumbAsm(body: string): string {
  return `\t.text\n\t.align 2\n\t.thumb\n${body}\n`;
}

/**
 * Emit a named Thumb function with a `.size` directive so the symbol is
 * properly bounded in the ELF symbol table.
 */
export function thumbFunc(name: string, instructions: readonly string[]): string {
  return [
    `\t.globl ${name}`,
    `\t.type ${name}, %function`,
    `\t.thumb_func`,
    `${name}:`,
    ...instructions.map((i) => `\t${i}`),
    `\t.size ${name}, .-${name}`,
  ].join('\n');
}

/**
 * Emit a Thumb function whose label has NO `.size` directive. ELF then
 * reports `size=0` and the symbol extends to the end of its section,
 * covering anything that follows it. Use this to reproduce the ROM-extracted
 * "symbol spans into the next function" scenario that real decomp targets
 * occasionally hit.
 */
export function unsizedThumbFunc(name: string, instructions: readonly string[]): string {
  return [
    `\t.globl ${name}`,
    `\t.type ${name}, %function`,
    `\t.thumb_func`,
    `${name}:`,
    ...instructions.map((i) => `\t${i}`),
  ].join('\n');
}

/**
 * Assemble a `.s` source into an ELF `.o` file inside `tempDir`, returning
 * the object path. Throws if `arm-none-eabi-as` fails.
 */
export async function assembleArmThumb(tempDir: string, name: string, source: string): Promise<string> {
  const sPath = path.join(tempDir, `${name}.s`);
  const oPath = path.join(tempDir, `${name}.o`);
  await fs.writeFile(sPath, source);
  execSync(`arm-none-eabi-as -mcpu=arm7tdmi -mthumb-interwork "${sPath}" -o "${oPath}"`, { stdio: 'pipe' });
  return oPath;
}

/**
 * Fail-fast preflight: verifies `arm-none-eabi-as` is on PATH before any
 * fixtures are built. Mirrors the pattern used by `compiler.spec.ts` so the
 * failure message points the reader at the missing toolchain rather than
 * exploding deep inside a fixture-building loop.
 */
export function ensureArmToolchain(): void {
  try {
    execSync('arm-none-eabi-as --version', { stdio: 'pipe' });
  } catch {
    throw new Error(
      'arm-none-eabi-as not found in PATH — install the ARM GNU Toolchain (or devkitPro) before running these tests.',
    );
  }
}

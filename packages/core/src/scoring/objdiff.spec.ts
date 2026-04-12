import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Objdiff } from './objdiff.js';
import {
  ARM_DIFF_SETTINGS,
  armThumbAsm,
  assembleArmThumb,
  ensureArmToolchain,
  thumbFunc,
  unsizedThumbFunc,
} from './test-utils.js';

describe('Objdiff', () => {
  let tempDir: string;
  let addOnePath: string;
  let addImm2Path: string;
  let subOnePath: string;
  let addOneTwicePath: string;
  let multiPath: string;
  let unsizedTargetPath: string;
  let boundedCandidatePath: string;

  beforeAll(async () => {
    ensureArmToolchain();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'transmuter-objdiff-spec-'));

    addOnePath = await assembleArmThumb(tempDir, 'add_one', armThumbAsm(thumbFunc('add_one', ['add r0, #1', 'bx lr'])));
    addImm2Path = await assembleArmThumb(
      tempDir,
      'add_imm2',
      armThumbAsm(thumbFunc('add_one', ['add r0, #2', 'bx lr'])),
    );
    subOnePath = await assembleArmThumb(tempDir, 'sub_one', armThumbAsm(thumbFunc('add_one', ['sub r0, #1', 'bx lr'])));
    addOneTwicePath = await assembleArmThumb(
      tempDir,
      'add_one_twice',
      armThumbAsm(thumbFunc('add_one', ['add r0, #1', 'add r0, #1', 'bx lr'])),
    );
    multiPath = await assembleArmThumb(
      tempDir,
      'multi',
      armThumbAsm(
        [thumbFunc('add_one', ['add r0, #1', 'bx lr']), '', thumbFunc('mul_two', ['lsl r0, r0, #1', 'bx lr'])].join(
          '\n',
        ),
      ),
    );
    // size=0 regression fixture pair — the target has `F` with no `.size`
    // directive, so ELF reports its size as 0 and objdiff treats it as
    // spanning to the end of the section, absorbing the four trailing
    // instructions. Mirrors the real-world ROM-extracted decomp scenario.
    unsizedTargetPath = await assembleArmThumb(
      tempDir,
      'unsized_target',
      armThumbAsm(
        [
          unsizedThumbFunc('F', ['add r0, #1', 'bx lr']),
          '\tmov r0, r1',
          '\tlsl r0, r0, #2',
          '\tadd r0, #5',
          '\tbx lr',
        ].join('\n'),
      ),
    );
    boundedCandidatePath = await assembleArmThumb(
      tempDir,
      'bounded_candidate',
      armThumbAsm(thumbFunc('F', ['add r0, #1', 'bx lr'])),
    );
  });

  afterAll(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // ---------------------------------------------------------------------------
  // parseObjectFile
  // ---------------------------------------------------------------------------

  describe('parseObjectFile()', () => {
    it('produces a ParsedObject that downstream methods can consume', async () => {
      // Chain through `getSymbolNames` rather than asserting `toBeDefined()` —
      // a silently-broken parse would still pass the weaker check.
      const objdiff = new Objdiff(ARM_DIFF_SETTINGS);
      const obj = await objdiff.parseObjectFile(addOnePath, 'base');
      const names = await objdiff.getSymbolNames(obj);
      expect(names).toContain('add_one');
    });

    it('rejects when the file does not exist', async () => {
      const objdiff = new Objdiff(ARM_DIFF_SETTINGS);
      await expect(objdiff.parseObjectFile('/nonexistent/path.o', 'base')).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // getSymbolNames
  // ---------------------------------------------------------------------------

  describe('getSymbolNames()', () => {
    it('lists a single function symbol', async () => {
      const objdiff = new Objdiff(ARM_DIFF_SETTINGS);
      const obj = await objdiff.parseObjectFile(addOnePath, 'base');
      const names = await objdiff.getSymbolNames(obj);
      expect(names).toContain('add_one');
    });

    it('lists every global function symbol in a multi-symbol object', async () => {
      const objdiff = new Objdiff(ARM_DIFF_SETTINGS);
      const obj = await objdiff.parseObjectFile(multiPath, 'base');
      const names = await objdiff.getSymbolNames(obj);
      expect(names).toContain('add_one');
      expect(names).toContain('mul_two');
    });
  });

  // ---------------------------------------------------------------------------
  // getAssemblyFromSymbol
  // ---------------------------------------------------------------------------

  describe('getAssemblyFromSymbol()', () => {
    it('returns a non-empty assembly listing for an existing function', async () => {
      const objdiff = new Objdiff(ARM_DIFF_SETTINGS);
      const obj = await objdiff.parseObjectFile(addOnePath, 'base');
      const { left } = await objdiff.runDiff(obj);
      expect(left).toBeDefined();
      const text = await objdiff.getAssemblyFromSymbol(left!, 'add_one');
      expect(text.length).toBeGreaterThan(0);
      // The only register we used in the fixture.
      expect(text).toMatch(/r0/);
    });

    it('returns only the rows belonging to the requested symbol', async () => {
      // `multi` has two functions side-by-side in the same .text section.
      // Asking for one must not leak the other's instructions.
      const objdiff = new Objdiff(ARM_DIFF_SETTINGS);
      const obj = await objdiff.parseObjectFile(multiPath, 'base');
      const { left } = await objdiff.runDiff(obj);
      const addOneAsm = await objdiff.getAssemblyFromSymbol(left!, 'add_one');
      const mulTwoAsm = await objdiff.getAssemblyFromSymbol(left!, 'mul_two');

      // `lsl` is only in mul_two.
      expect(addOneAsm.toLowerCase()).not.toMatch(/lsl/);
      expect(mulTwoAsm.toLowerCase()).toMatch(/lsl/);
    });
  });

  // ---------------------------------------------------------------------------
  // getDifferences
  // ---------------------------------------------------------------------------

  describe('getDifferences()', () => {
    it('reports zero differences and exact matching count for two identical objects', async () => {
      const objdiff = new Objdiff(ARM_DIFF_SETTINGS);
      const left = await objdiff.parseObjectFile(addOnePath, 'base');
      const right = await objdiff.parseObjectFile(addOnePath, 'target');
      const { left: leftDiff, right: rightDiff } = await objdiff.runDiff(left, right);

      const result = await objdiff.getDifferences(leftDiff!, rightDiff!, 'add_one');

      expect(result.differenceCount).toBe(0);
      // Fixture has exactly two instructions — `add r0, #1` and `bx lr`.
      expect(result.matchingCount).toBe(2);
      expect(result.differences).toEqual([]);
      expect(result.structuredDifferences).toEqual([]);
    });

    it('classifies a single immediate change as argMismatch', async () => {
      const objdiff = new Objdiff(ARM_DIFF_SETTINGS);
      const left = await objdiff.parseObjectFile(addOnePath, 'base');
      const right = await objdiff.parseObjectFile(addImm2Path, 'target');
      const { left: leftDiff, right: rightDiff } = await objdiff.runDiff(left, right);

      const result = await objdiff.getDifferences(leftDiff!, rightDiff!, 'add_one');

      expect(result.differenceCount).toBeGreaterThan(0);
      expect(result.structuredDifferences.some((d) => d.type === 'argMismatch')).toBe(true);
      // The formatted output must mention both sides of the differing row.
      const joined = result.differences.join('\n');
      expect(joined).toContain('Current:');
      expect(joined).toContain('Target:');
    });

    it('classifies a different-mnemonic change as replace', async () => {
      // On ARMv4T, objdiff's alignment rules do NOT emit `op-mismatch` for a
      // different-mnemonic diff — they fall through to `replace`. Documented
      // here so the `replace` bucket has an explicit regression gate.
      const objdiff = new Objdiff(ARM_DIFF_SETTINGS);
      const left = await objdiff.parseObjectFile(addOnePath, 'base');
      const right = await objdiff.parseObjectFile(subOnePath, 'target');
      const { left: leftDiff, right: rightDiff } = await objdiff.runDiff(left, right);

      const result = await objdiff.getDifferences(leftDiff!, rightDiff!, 'add_one');

      expect(result.differenceCount).toBeGreaterThan(0);
      expect(result.structuredDifferences.some((d) => d.type === 'replace')).toBe(true);
      expect(result.structuredDifferences.some((d) => d.type === 'opMismatch')).toBe(false);
    });

    it("classifies an extra instruction in the TARGET as insert (from the candidate's perspective)", async () => {
      // candidate = addOne (2 insns), target = addOneTwice (3 insns).
      const objdiff = new Objdiff(ARM_DIFF_SETTINGS);
      const left = await objdiff.parseObjectFile(addOnePath, 'base');
      const right = await objdiff.parseObjectFile(addOneTwicePath, 'target');
      const { left: leftDiff, right: rightDiff } = await objdiff.runDiff(left, right);

      const result = await objdiff.getDifferences(leftDiff!, rightDiff!, 'add_one');

      expect(result.differenceCount).toBeGreaterThan(0);
      expect(result.structuredDifferences.some((d) => d.type === 'insert')).toBe(true);
    });

    it("classifies an extra instruction in the CANDIDATE as delete (from the candidate's perspective)", async () => {
      // Mirror of the previous test with target/candidate swapped.
      const objdiff = new Objdiff(ARM_DIFF_SETTINGS);
      const left = await objdiff.parseObjectFile(addOneTwicePath, 'base');
      const right = await objdiff.parseObjectFile(addOnePath, 'target');
      const { left: leftDiff, right: rightDiff } = await objdiff.runDiff(left, right);

      const result = await objdiff.getDifferences(leftDiff!, rightDiff!, 'add_one');

      expect(result.differenceCount).toBeGreaterThan(0);
      expect(result.structuredDifferences.some((d) => d.type === 'delete')).toBe(true);
    });

    it('populates candidate/target instruction text on each structured difference', async () => {
      const objdiff = new Objdiff(ARM_DIFF_SETTINGS);
      const left = await objdiff.parseObjectFile(addOnePath, 'base');
      const right = await objdiff.parseObjectFile(addImm2Path, 'target');
      const { left: leftDiff, right: rightDiff } = await objdiff.runDiff(left, right);

      const result = await objdiff.getDifferences(leftDiff!, rightDiff!, 'add_one');

      const argDiff = result.structuredDifferences.find((d) => d.type === 'argMismatch');
      expect(argDiff).toBeDefined();
      expect(argDiff!.candidateInstruction.length).toBeGreaterThan(0);
      expect(argDiff!.targetInstruction.length).toBeGreaterThan(0);
      // The immediate literally differs — "1" on one side, "2" on the other.
      expect(argDiff!.candidateInstruction).not.toBe(argDiff!.targetInstruction);
    });

    it('detects absorbed instructions when the target symbol has size=0', async () => {
      // Regression for the real ROM-extraction scenario: the target .o has a
      // symbol with no `.size` directive, so it extends to the end of the
      // section — covering instructions that "belong" to the next function.
      // objdiff must detect the extra absorbed rows as differences rather
      // than silently matching mismatched functions. (Mirrors mizuchi's
      // `src/plugins/objdiff/objdiff-plugin.spec.ts` regression test.)
      const objdiff = new Objdiff(ARM_DIFF_SETTINGS);
      const left = await objdiff.parseObjectFile(boundedCandidatePath, 'base');
      const right = await objdiff.parseObjectFile(unsizedTargetPath, 'target');
      const { left: leftDiff, right: rightDiff } = await objdiff.runDiff(left, right);

      const result = await objdiff.getDifferences(leftDiff!, rightDiff!, 'F');

      // The first two rows (add + bx) match exactly; the four trailing
      // absorbed rows on the target side are reported as differences.
      expect(result.matchingCount).toBe(2);
      expect(result.differenceCount).toBeGreaterThan(0);
    });
  });
});

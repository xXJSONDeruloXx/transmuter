/**
 * Guideline interface.
 *
 * A guideline detects a specific code smell in source code and provides
 * a strategy for removing it. The Refiner uses guidelines to improve code
 * quality while preserving assembly output.
 */
import type { Language } from '~/language.js';

/** A detected code-smell instance in the source. */
export interface Violation {
  /** Stable ID derived from location + pattern (e.g., "asm-pin:L42") */
  id: string;
  /** 1-indexed source lines spanning the violation */
  lines: { start: number; end: number };
  /** Human-readable description */
  description: string;
  /** The violating source text */
  text: string;
}

/** A guideline plugin that detects and removes a specific code smell. */
export interface Guideline {
  /** Unique identifier (kebab-case, e.g., 'no-asm-pin') */
  readonly id: string;

  /** One-sentence description shown in `transmuter refine` listing */
  readonly description: string;

  /** Languages this guideline supports (e.g., ['c', 'cpp'] or ['pascal']). */
  readonly languages: readonly Language[];

  /**
   * Mutation rule IDs to disable during fix attempts.
   * Prevents the permuter from re-introducing the violation pattern.
   */
  readonly disabledRules: string[];

  /**
   * Detect all violations of this guideline in the source.
   */
  detect(source: string, functionName: string): Violation[];

  /**
   * Produce a source with the given violation removed/neutralized.
   * The result must compile (though it may not match the target).
   * Returns null if no clean removal is possible.
   */
  remove(source: string, violation: Violation): string | null;

  /**
   * Fast check: does this source still contain the given violation?
   * Used as a candidate filter during permutation to prevent re-introduction.
   * Default: falls back to detect() if not provided.
   */
  containsViolation?(source: string, violation: Violation): boolean;
}

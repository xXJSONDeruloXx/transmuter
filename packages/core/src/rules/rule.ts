/**
 * Mutation rule interface.
 *
 * Each rule defines one type of code mutation. Rules use ast-grep
 * for AST parsing and pattern matching, and return mutated source strings
 * with the location of the targeted AST node.
 */
import type { SgNode, SgRoot } from '@ast-grep/napi';
import type { Language } from '~/language.js';
import type { Rng } from '~/rng.js';
import type { DiffType, MutationApplyResult } from '~/types.js';

/** Biases AST node selection toward focus regions or away from avoid regions. */
export interface NodeFilter {
  /** Given candidate AST nodes, return a filtered/weighted subset. */
  filter(nodes: SgNode[], rng: Rng): SgNode[];
}

/** Context provided to a rule's apply() method. */
export interface MutationContext {
  /** Original source code */
  readonly source: string;
  /** Pre-parsed AST root (read-only — do not mutate) */
  readonly root: SgRoot;
  /** Seeded PRNG for deterministic reproduction */
  readonly rng: Rng;
  /** Target function name (mutations should focus on this function) */
  readonly functionName: string;
  /** Source language */
  readonly language: Language;
  /** Optional node filter that biases selection toward focus regions */
  readonly nodeFilter?: NodeFilter;
}

/** A mutation rule plugin. */
export interface Rule {
  /** Unique identifier (kebab-case, e.g., 'reorder-stmts') */
  readonly id: string;

  /** Human-readable description (one sentence) */
  readonly description: string;

  /** Languages this rule supports (e.g., ['c', 'cpp'] or ['pascal']). */
  readonly languages: readonly Language[];

  /** Default weight. Higher = more likely to be selected. 0 = disabled. */
  readonly defaultWeight: number;

  /**
   * Diff types this rule is relevant for. When set, the rule is excluded from
   * selection if none of the specified types remain in the target candidate's
   * assembly diff breakdown. Rules without this field are always eligible.
   */
  readonly relevantDiffTypes?: ReadonlySet<DiffType>;

  /**
   * Apply the mutation to the source code.
   *
   * @returns Mutated source string with AST location, or null if the rule
   *          couldn't apply (e.g., no matching AST nodes found). Returning
   *          null is normal — the engine will try another rule.
   */
  apply(ctx: MutationContext): MutationApplyResult | null;
}

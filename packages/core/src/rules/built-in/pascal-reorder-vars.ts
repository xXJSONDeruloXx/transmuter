/**
 * Rule: pascal-reorder-vars
 *
 * Swap two adjacent var declarations in a Pascal var section.
 */
import type { DiffType, MutationApplyResult } from '~/types.js';

import { findTargetFunction, swapRanges } from '../helpers.js';
import { getPascalVarDeclarations } from '../pascal-helpers.js';
import type { MutationContext, Rule } from '../rule.js';

export const pascalReorderVars: Rule = {
  id: 'pascal-reorder-vars',
  description: 'Swap two adjacent var declarations in a Pascal var section.',
  languages: ['pascal'],
  defaultWeight: 20,
  relevantDiffTypes: new Set<DiffType>(['argMismatch']),

  apply(ctx: MutationContext): MutationApplyResult | null {
    const { source, root, rng, functionName } = ctx;
    const fn = findTargetFunction(root, functionName, 'pascal');
    if (!fn) {
      return null;
    }

    const decls = getPascalVarDeclarations(fn);
    if (decls.length < 2) {
      return null;
    }

    const idx = rng.int(0, decls.length - 2);
    const a = decls[idx]!;
    const b = decls[idx + 1]!;

    const aRange = a.range();
    const bRange = b.range();

    return {
      source: swapRanges(source, aRange.start.index, aRange.end.index, bRange.start.index, bRange.end.index),
      location: { line: aRange.start.line + 1, column: aRange.start.column + 1 },
    };
  },
};

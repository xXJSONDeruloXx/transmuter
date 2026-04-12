/**
 * Rule: pad-var-decl
 *
 * Insert an unused variable declaration to adjust stack layout.
 */
import type { DiffType, MutationApplyResult } from '~/types.js';

import { findTargetFunction, getDeclarations, getIndentation, replaceRange } from '../helpers.js';
import type { MutationContext, Rule } from '../rule.js';

const PAD_TYPES = ['int', 'char', 'short', 'long', 'unsigned', 'u8', 'u16', 'u32', 's8', 's16', 's32'];

export const padVarDecl: Rule = {
  id: 'pad-var-decl',
  description: 'Insert an unused variable declaration to adjust stack layout.',
  languages: ['c', 'cpp'],
  defaultWeight: 10,
  relevantDiffTypes: new Set<DiffType>(['argMismatch']),

  apply(ctx: MutationContext): MutationApplyResult | null {
    const { source, root, rng, functionName } = ctx;
    const fn = findTargetFunction(root, functionName);
    if (!fn) {
      return null;
    }

    // Find the function body (compound_statement)
    const body = fn.find({ rule: { kind: 'compound_statement' } });
    if (!body) {
      return null;
    }

    const decls = getDeclarations(body);
    if (decls.length === 0) {
      return null;
    }

    // Pick a random position among existing declarations to insert after
    const insertAfter = rng.pick(decls);
    const insertRange = insertAfter.range();
    const indent = getIndentation(source, insertAfter);

    const padType = rng.pick(PAD_TYPES);
    const padNum = rng.int(0, 999);
    const padName = `_pad${padNum}`;

    const newDecl = `\n${indent}${padType} ${padName};`;

    // Insert after the chosen declaration
    return {
      source: replaceRange(source, insertRange.end.index, insertRange.end.index, newDecl),
      location: { line: insertAfter.range().start.line + 1, column: insertAfter.range().start.column + 1 },
    };
  },
};

/**
 * Rule: pascal-begin-wrap
 *
 * Wrap a single statement in a begin/end block when it is the direct
 * body of an if/while/for (not already inside begin/end).
 */
import type { SgNode } from '@ast-grep/napi';
import type { DiffType, MutationApplyResult } from '~/types.js';

import { findTargetFunction, getIndentation, replaceRange } from '../helpers.js';
import type { MutationContext, Rule } from '../rule.js';

export const pascalBeginWrap: Rule = {
  id: 'pascal-begin-wrap',
  description: 'Wrap a single statement in a begin/end block.',
  languages: ['pascal'],
  defaultWeight: 10,
  relevantDiffTypes: new Set<DiffType>(['opMismatch', 'insert', 'delete']),

  apply(ctx: MutationContext): MutationApplyResult | null {
    const { source, root, rng, functionName } = ctx;
    const fn = findTargetFunction(root, functionName, 'pascal');
    if (!fn) {
      return null;
    }

    const candidates: SgNode[] = [];

    // Find if/while/for statements with a body that is NOT a block
    for (const kind of ['if', 'while', 'for']) {
      const nodes = fn.findAll({ rule: { kind } });
      for (const node of nodes) {
        const children = node.children();
        for (const child of children) {
          const ck = String(child.kind());
          // Skip keywords, operators, conditions, and block (begin/end)
          if (ck === 'block') {
            continue;
          }
          // A statement child that isn't begin/end and isn't a keyword token
          if (
            ck === 'assignment' ||
            ck === 'exprCall' ||
            ck === 'if' ||
            ck === 'while' ||
            ck === 'for' ||
            ck === 'repeat'
          ) {
            candidates.push(child);
          }
        }
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    const stmt = rng.pick(candidates);
    const range = stmt.range();
    const indent = getIndentation(source, stmt);
    const stmtText = stmt.text();

    const replacement = `begin\n${indent}  ${stmtText}\n${indent}end`;

    return {
      source: replaceRange(source, range.start.index, range.end.index, replacement),
      location: { line: stmt.range().start.line + 1, column: stmt.range().start.column + 1 },
    };
  },
};

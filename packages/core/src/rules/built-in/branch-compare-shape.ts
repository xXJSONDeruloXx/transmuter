/**
 * Rule: branch-compare-shape
 *
 * Rewrite equality/inequality conditions into logically-equivalent forms that
 * give old MIPS compilers another chance to choose branch operand order.
 * This is especially useful for IDO branch-likely near-misses such as
 * `bnel a,b,label` vs `bnel b,a,label`, where a plain commutative swap can be
 * canonicalized back to the same compare order.
 */
import type { SgNode } from '@ast-grep/napi';
import type { DiffType, MutationApplyResult } from '~/types.js';

import { findAllByKind, findTargetFunction, isInsideAsm, replaceRange } from '../helpers.js';
import type { MutationContext, Rule } from '../rule.js';

const INVERT_EQ_OPS: Record<string, string> = {
  '==': '!=',
  '!=': '==',
};

function isIfCondition(node: SgNode): boolean {
  let parent = node.parent();
  while (parent) {
    if (parent.kind() === 'parenthesized_expression') {
      parent = parent.parent();
      continue;
    }
    return parent.kind() === 'if_statement';
  }
  return false;
}

export const branchCompareShape: Rule = {
  id: 'branch-compare-shape',
  description: 'Reshape if equality comparisons to influence MIPS branch operand order.',
  languages: ['c', 'cpp'],
  defaultWeight: 18,
  relevantDiffTypes: new Set<DiffType>(['argMismatch', 'replace']),

  apply(ctx: MutationContext): MutationApplyResult | null {
    const { source, root, rng, functionName } = ctx;
    const fn = findTargetFunction(root, functionName);
    if (!fn) {
      return null;
    }

    const candidates = findAllByKind(fn, 'binary_expression').filter((node) => {
      if (isInsideAsm(node) || !isIfCondition(node)) {
        return false;
      }
      const children = node.children();
      if (children.length < 3) {
        return false;
      }
      return children[1]!.text() in INVERT_EQ_OPS;
    });

    if (candidates.length === 0) {
      return null;
    }

    const node = rng.pick(candidates);
    const left = node.field('left');
    const right = node.field('right');
    if (!left || !right) {
      return null;
    }

    const op = node.children()[1]!.text();
    const inverted = INVERT_EQ_OPS[op]!;
    const variants = [
      `!(${right.text()} ${inverted} ${left.text()})`,
      `!(${left.text()} ${inverted} ${right.text()})`,
      `(${right.text()} ${op} ${left.text()})`,
    ];
    const replacement = rng.pick(variants);
    if (replacement === node.text()) {
      return null;
    }

    const range = node.range();
    return {
      source: replaceRange(source, range.start.index, range.end.index, replacement),
      location: { line: range.start.line + 1, column: range.start.column + 1 },
    };
  },
};

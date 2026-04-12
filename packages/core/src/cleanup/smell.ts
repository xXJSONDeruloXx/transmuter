/**
 * Smell scorer — counts code smells in C source for cleanup prioritization.
 *
 * Returns a numeric "smell score" (lower = cleaner). Used as the optimization
 * target in Phase 2 of the cleanup pipeline.
 */
import type { SgNode, SgRoot } from '@ast-grep/napi';
import { escapeRegex, findTargetFunction, getStatements } from '~/rules/helpers.js';

export interface SmellBreakdown {
  /** Total smell score (sum of all metrics) */
  total: number;
  /** Number of temp variable declarations (_tNNN pattern) */
  tempVariables: number;
  /** Number of type cast expressions */
  casts: number;
  /** Number of do { ... } while(0) wrappers */
  doWhileZero: number;
  /** Number of variables assigned once and used once (inlining candidates) */
  singleUseVariables: number;
  /** Total AST statement count (proxy for complexity) */
  statementCount: number;
}

/**
 * Count code smells in the target function of a parsed source.
 * The smell score is a weighted sum of metrics where higher = worse.
 */
export function countSmells(root: SgRoot, functionName: string): SmellBreakdown {
  const fn = findTargetFunction(root, functionName);
  if (!fn) {
    return { total: 0, tempVariables: 0, casts: 0, doWhileZero: 0, singleUseVariables: 0, statementCount: 0 };
  }

  const tempVariables = countTempVariables(fn);
  const casts = countCasts(fn);
  const doWhileZero = countDoWhileZero(fn);
  const singleUseVariables = countSingleUseVariables(fn);
  const statementCount = countStatements(fn);

  // Weights: temp vars and do-while(0) are the most offensive smells,
  // casts are moderate, single-use vars are mild, statement count is tiny.
  const total = tempVariables * 10 + doWhileZero * 10 + casts * 3 + singleUseVariables * 5 + statementCount;

  return { total, tempVariables, casts, doWhileZero, singleUseVariables, statementCount };
}

/** Count declarations with _tNNN-style names (temp variables from mutations). */
function countTempVariables(fn: SgNode): number {
  const decls = fn.findAll({ rule: { kind: 'declaration' } });
  let count = 0;
  for (const decl of decls) {
    const declarator = decl.find({ rule: { kind: 'init_declarator' } }) ?? decl.find({ rule: { kind: 'identifier' } });
    if (!declarator) {
      continue;
    }
    const ident = declarator.kind() === 'identifier' ? declarator : declarator.find({ rule: { kind: 'identifier' } });
    if (ident && /^_t\d+$/.test(ident.text())) {
      count++;
    }
  }
  return count;
}

/** Count cast expressions. */
function countCasts(fn: SgNode): number {
  return fn.findAll({ rule: { kind: 'cast_expression' } }).length;
}

/** Count do { ... } while(0) blocks. */
function countDoWhileZero(fn: SgNode): number {
  const doStmts = fn.findAll({ rule: { kind: 'do_statement' } });
  let count = 0;
  for (const doStmt of doStmts) {
    const condition = doStmt.field('condition');
    if (condition) {
      const condChild = condition.kind() === 'parenthesized_expression' ? condition.children()[1] : condition;
      if (condChild && condChild.text() === '0') {
        count++;
      }
    }
  }
  return count;
}

/**
 * Count variables that are assigned exactly once and read exactly once.
 * These are inlining candidates.
 */
function countSingleUseVariables(fn: SgNode): number {
  // Collect all variable declarations with initializers
  const body = fn.find({ rule: { kind: 'compound_statement' } });
  if (!body) {
    return 0;
  }

  const decls = fn.findAll({ rule: { kind: 'init_declarator' } });
  let count = 0;

  for (const decl of decls) {
    const ident = decl.field('declarator');
    if (!ident || ident.kind() !== 'identifier') {
      continue;
    }

    const varName = ident.text();

    // Count all references to this variable in the function body
    const refs = fn.findAll({ rule: { kind: 'identifier', regex: `^${escapeRegex(varName)}$` } }).filter((n) => {
      // Exclude the declaration itself
      if (n.range().start.index === ident.range().start.index) {
        return false;
      }
      // Exclude LHS of assignments (those are writes, not reads)
      const parent = n.parent();
      if (
        parent &&
        parent.kind() === 'assignment_expression' &&
        parent.field('left')?.range().start.index === n.range().start.index
      ) {
        return false;
      }
      return true;
    });

    if (refs.length === 1) {
      count++;
    }
  }

  return count;
}

/** Count total statements in the function body (recursive into nested blocks). */
function countStatements(fn: SgNode): number {
  const blocks = fn.findAll({ rule: { kind: 'compound_statement' } });
  let count = 0;
  for (const block of blocks) {
    count += getStatements(block).length;
  }
  return count;
}

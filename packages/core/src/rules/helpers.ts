/**
 * Shared utilities for mutation rules.
 */
import type { SgNode, SgRoot } from '@ast-grep/napi';
import type { Language } from '~/language.js';

/**
 * Find the target function's definition node in the AST.
 * Handles C, C++ (qualified names like Foo::bar), and Pascal.
 * Returns null if the function is not found.
 */
export function findTargetFunction(root: SgRoot, functionName: string, language?: Language): SgNode | null {
  if (language === 'pascal') {
    return findPascalFunction(root, functionName);
  }

  // C/C++ — try unqualified first
  const unqualified = root.root().find({
    rule: {
      kind: 'function_definition',
      has: {
        kind: 'function_declarator',
        has: { kind: 'identifier', regex: `^${escapeRegex(functionName)}$` },
      },
    },
  });
  if (unqualified) {
    return unqualified;
  }

  // C++ — try qualified_identifier (e.g., Class::method)
  if (language === 'cpp') {
    return root.root().find({
      rule: {
        kind: 'function_definition',
        has: {
          kind: 'function_declarator',
          has: {
            kind: 'qualified_identifier',
            has: { kind: 'identifier', regex: `^${escapeRegex(functionName)}$` },
          },
        },
      },
    });
  }

  return null;
}

/**
 * Find a Pascal function or procedure by name.
 * tree-sitter-pascal uses defProc > declProc > identifier.
 * Case-insensitive because IDO Pascal lowercases all symbol names.
 */
function findPascalFunction(root: SgRoot, functionName: string): SgNode | null {
  return root.root().find({
    rule: {
      kind: 'defProc',
      has: {
        kind: 'declProc',
        has: { kind: 'identifier', regex: `(?i)^${escapeRegex(functionName)}$` },
      },
    },
  });
}

/**
 * Check if a node is inside a GNU asm expression.
 * Rules that manipulate arbitrary nodes should call this guard.
 */
export function isInsideAsm(node: SgNode): boolean {
  let current: SgNode | null = node;
  while (current) {
    const kind = current.kind();
    if (kind === 'gnu_asm_expression' || kind === 'asm_expression') {
      return true;
    }
    current = current.parent();
  }
  return false;
}

/**
 * Get all statement nodes (direct children) of a compound_statement,
 * excluding braces and whitespace/comment nodes.
 */
export function getStatements(block: SgNode): SgNode[] {
  return block.children().filter((c) => {
    const kind = c.kind();
    return kind !== '{' && kind !== '}' && kind !== 'comment';
  });
}

/**
 * Get all declaration nodes (variable declarations) at the top of a function body.
 */
export function getDeclarations(fnBody: SgNode): SgNode[] {
  return fnBody.children().filter((c) => c.kind() === 'declaration');
}

export interface SimpleAssignment {
  lhsText: string;
  rhsText: string;
}

/**
 * Extract a plain `lhs = rhs;` assignment from an expression statement.
 * Returns null if the statement is not an expression_statement wrapping a plain
 * assignment_expression, or if either side is missing.
 */
export function extractSimpleAssignment(stmt: SgNode): SimpleAssignment | null {
  if (stmt.kind() !== 'expression_statement') {
    return null;
  }

  const assign = stmt.find({ rule: { kind: 'assignment_expression' } });
  if (!assign) {
    return null;
  }

  // Must use plain '=' operator
  const children = assign.children();
  const opNode = children.find((c) => c.text() === '=');
  if (!opNode) {
    return null;
  }

  const left = assign.field('left');
  const right = assign.field('right');
  if (!left || !right) {
    return null;
  }

  return { lhsText: left.text(), rhsText: right.text() };
}

/**
 * Replace a node's text range in the source string.
 * Returns the new source string.
 */
export function replaceRange(source: string, startIndex: number, endIndex: number, replacement: string): string {
  return source.slice(0, startIndex) + replacement + source.slice(endIndex);
}

/**
 * Swap two non-overlapping ranges in the source string.
 * Assumes rangeA starts before rangeB.
 */
export function swapRanges(source: string, aStart: number, aEnd: number, bStart: number, bEnd: number): string {
  if (aStart > bStart) {
    return swapRanges(source, bStart, bEnd, aStart, aEnd);
  }
  const textA = source.slice(aStart, aEnd);
  const textB = source.slice(bStart, bEnd);
  return source.slice(0, aStart) + textB + source.slice(aEnd, bStart) + textA + source.slice(bEnd);
}

/**
 * Compare two AST nodes by position.
 * ast-grep does not guarantee reference identity for SgNode objects,
 * so `===` can fail even when two handles point at the same node.
 */
export function isSameNode(a: SgNode | null, b: SgNode): boolean {
  return a !== null && a.range().start.index === b.range().start.index;
}

/** Escape special regex characters in a string. */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get the indentation of a node (whitespace before it on its line).
 */
export function getIndentation(source: string, node: SgNode): string {
  const startIndex = node.range().start.index;
  let lineStart = startIndex;
  while (lineStart > 0 && source[lineStart - 1] !== '\n') {
    lineStart--;
  }
  const prefix = source.slice(lineStart, startIndex);
  const match = prefix.match(/^(\s*)/);
  return match ? match[1]! : '';
}

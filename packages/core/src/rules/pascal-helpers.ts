/**
 * Pascal-specific AST helper functions.
 *
 * tree-sitter-pascal (Isopod/tree-sitter-pascal) node kinds:
 * - defProc (function/procedure definition, contains declProc + block)
 * - declProc (header: kFunction, identifier, declArgs, typeref)
 * - block (begin/end body, contains kBegin, statements, kEnd)
 * - declVars (var section, contains kVar + declVar children)
 * - declVar (single variable declaration)
 * - assignment (a := b, contains identifier, kAssign, expression)
 */
import type { SgNode, SgRoot } from '@ast-grep/napi';

import { escapeRegex } from './helpers.js';

/**
 * Find a Pascal function or procedure definition by name.
 * Case-insensitive because IDO Pascal lowercases all symbol names.
 * Returns the defProc node.
 */
export function findPascalFunction(root: SgRoot, functionName: string): SgNode | null {
  // defProc > declProc > identifier
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
 * Find the body (block node) of a Pascal function or procedure.
 */
export function findPascalFunctionBody(root: SgRoot, functionName: string): SgNode | null {
  const fn = findPascalFunction(root, functionName);
  if (!fn) {
    return null;
  }
  return fn.find({ rule: { kind: 'block' } }) ?? null;
}

/**
 * Get child statements from a Pascal block,
 * filtering out kBegin, kEnd, `;` tokens and comments.
 */
export function getPascalStatements(block: SgNode): SgNode[] {
  return block.children().filter((c) => {
    const kind = c.kind();
    return kind !== 'kBegin' && kind !== 'kEnd' && kind !== ';' && kind !== 'comment' && kind !== 'line_comment';
  });
}

/**
 * Find declVar children within the declVars section of a defProc node.
 */
export function getPascalVarDeclarations(fnNode: SgNode): SgNode[] {
  const varSection = fnNode.find({ rule: { kind: 'declVars' } });
  if (!varSection) {
    return [];
  }
  return varSection.children().filter((c) => c.kind() === 'declVar');
}

/**
 * All built-in mutation rules.
 */
import type { Rule } from '../rule.js';
import { addMask } from './add-mask.js';
import { addSubSwap } from './add-sub-swap.js';
import { asmBarrier } from './asm-barrier.js';
import { asmRegisterSwap } from './asm-register-swap.js';
import { castExpr } from './cast-expr.js';
import { castStyleSwap } from './cast-style-swap.js';
import { chainAssignment } from './chain-assignment.js';
import { commaExpr } from './comma-expr.js';
import { commutativeSwap } from './commutative-swap.js';
import { compoundReturn } from './compound-return.js';
import { deleteStmt } from './delete-stmt.js';
import { duplicateAssignment } from './duplicate-assignment.js';
import { emptyStmt } from './empty-stmt.js';
import { expandExpr } from './expand-expr.js';
import { explicitThis } from './explicit-this.js';
import { extraParens } from './extra-parens.js';
import { factorMult } from './factor-mult.js';
import { factorShift } from './factor-shift.js';
import { floatLiteral } from './float-literal.js';
import { inequalitySwap } from './inequality-swap.js';
import { insertBlock } from './insert-block.js';
import { longChainAssignment } from './long-chain-assignment.js';
import { modifyCondition } from './modify-condition.js';
import { multZero } from './mult-zero.js';
import { padVarDecl } from './pad-var-decl.js';
import { pascalArithShift } from './pascal-arith-shift.js';
import { pascalBeginWrap } from './pascal-begin-wrap.js';
import { pascalBoolNegate } from './pascal-bool-negate.js';
import { pascalCommutativeSwap } from './pascal-commutative-swap.js';
import { pascalExtraParens } from './pascal-extra-parens.js';
import { pascalIntrinsicSwap } from './pascal-intrinsic-swap.js';
import { pascalLoopSwap } from './pascal-loop-swap.js';
import { pascalReorderStmts } from './pascal-reorder-stmts.js';
import { pascalReorderVars } from './pascal-reorder-vars.js';
import { pascalTypeCast } from './pascal-type-cast.js';
import { randomizeType } from './randomize-type.js';
import { referToVar } from './refer-to-var.js';
import { removeCast } from './remove-cast.js';
import { reorderDecls } from './reorder-decls.js';
import { reorderFieldInit } from './reorder-field-init.js';
import { reorderStmts } from './reorder-stmts.js';
import { sameline } from './sameline.js';
import { selfAssignment } from './self-assignment.js';
import { shiftDivSwap } from './shift-div-swap.js';
import { splitAssignment } from './split-assignment.js';
import { structRefSwap } from './struct-ref-swap.js';
import { tempForExpr } from './temp-for-expr.js';
import { voidCast } from './void-cast.js';
import { xorZero } from './xor-zero.js';

/** All 49 built-in mutation rules. */
export const builtInRules: Rule[] = [
  tempForExpr,
  reorderStmts,
  reorderDecls,
  castExpr,
  removeCast,
  addMask,
  commutativeSwap,
  insertBlock,
  structRefSwap,
  addSubSwap,
  inequalitySwap,
  splitAssignment,
  chainAssignment,
  padVarDecl,
  selfAssignment,
  asmBarrier,
  asmRegisterSwap,
  voidCast,
  emptyStmt,
  expandExpr,
  randomizeType,
  sameline,
  modifyCondition,
  duplicateAssignment,
  longChainAssignment,
  xorZero,
  multZero,
  factorMult,
  factorShift,
  referToVar,
  floatLiteral,
  commaExpr,
  extraParens,
  explicitThis,
  castStyleSwap,
  reorderFieldInit,
  deleteStmt,
  shiftDivSwap,
  compoundReturn,
  pascalReorderStmts,
  pascalReorderVars,
  pascalCommutativeSwap,
  pascalBoolNegate,
  pascalArithShift,
  pascalLoopSwap,
  pascalIntrinsicSwap,
  pascalExtraParens,
  pascalBeginWrap,
  pascalTypeCast,
];

export {
  tempForExpr,
  reorderStmts,
  reorderDecls,
  castExpr,
  removeCast,
  addMask,
  commutativeSwap,
  insertBlock,
  structRefSwap,
  addSubSwap,
  inequalitySwap,
  splitAssignment,
  chainAssignment,
  padVarDecl,
  selfAssignment,
  asmBarrier,
  asmRegisterSwap,
  voidCast,
  emptyStmt,
  expandExpr,
  randomizeType,
  sameline,
  modifyCondition,
  duplicateAssignment,
  longChainAssignment,
  xorZero,
  multZero,
  factorMult,
  factorShift,
  referToVar,
  floatLiteral,
  commaExpr,
  extraParens,
  explicitThis,
  castStyleSwap,
  reorderFieldInit,
  deleteStmt,
  shiftDivSwap,
  compoundReturn,
  pascalReorderStmts,
  pascalReorderVars,
  pascalCommutativeSwap,
  pascalBoolNegate,
  pascalArithShift,
  pascalLoopSwap,
  pascalIntrinsicSwap,
  pascalExtraParens,
  pascalBeginWrap,
  pascalTypeCast,
};

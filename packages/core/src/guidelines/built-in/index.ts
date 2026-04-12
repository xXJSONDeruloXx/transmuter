/**
 * All built-in guidelines.
 */
import type { Guideline } from '../guideline.js';
import { noAsmPin } from './no-asm-pin.js';
import { noCStyleCast } from './no-c-style-cast.js';
import { noGoto } from './no-goto.js';
import { noRedundantCastPascal } from './no-redundant-cast-pascal.js';

export const builtInGuidelines: Guideline[] = [noAsmPin, noGoto, noCStyleCast, noRedundantCastPascal];

export { noAsmPin, noGoto, noCStyleCast, noRedundantCastPascal };

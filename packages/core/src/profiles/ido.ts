import type { Profile } from './profile.js';

export const idoProfile: Profile = {
  id: 'ido',
  name: 'IDO (MIPS, N64/IRIX)',
  description:
    'Silicon Graphics IDO compiler. MIPS III/IV target. Used by N64 decompilation projects (e.g., OoT, SM64).',
  ruleWeights: {
    'temp-for-expr': 100,
    'reorder-stmts': 30,
    'cast-expr': 25,
    'commutative-swap': 20,
    'branch-compare-shape': 18,
    sameline: 10,
    'pad-var-decl': 5,
  },
  disabledRules: ['asm-barrier', 'asm-register-swap'],
  detect: (cmd) => /\bido\b/i.test(cmd),
};

import type { Profile } from './profile.js';

export const mipsGcc272Profile: Profile = {
  id: 'mips-gcc-272',
  name: 'GCC 2.7.2 (MIPS, N64)',
  description: 'KMC GCC 2.7.2 for MIPS. Used by N64 projects.',
  ruleWeights: {
    'temp-for-expr': 100,
    'reorder-stmts': 30,
    'commutative-swap': 20,
    'add-mask': 10,
  },
  disabledRules: ['asm-barrier', 'asm-register-swap'],
  detect: (cmd) => cmd.includes('gcc_kmc') || cmd.includes('mips-gcc-2.7.2'),
};

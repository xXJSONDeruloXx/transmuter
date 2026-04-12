import type { Profile } from './profile.js';

export const agbccProfile: Profile = {
  id: 'agbcc',
  name: 'agbcc (ARM/Thumb, GBA)',
  description:
    'The agbcc compiler used by GBA decompilation projects (e.g., pokeemerald, pokefirered). ARM7TDMI (ARMv4T) target.',
  ruleWeights: {
    'asm-barrier': 25,
    'asm-register-swap': 15,
    'pad-var-decl': 20,
    'temp-for-expr': 100,
    'reorder-stmts': 40,
  },
  disabledRules: ['sameline'],
  detect: (cmd) => cmd.includes('agbcc') && !cmd.includes('old_agbcc'),
};

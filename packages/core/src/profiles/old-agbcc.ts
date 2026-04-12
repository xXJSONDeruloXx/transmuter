import type { Profile } from './profile.js';

export const oldAgbccProfile: Profile = {
  id: 'old-agbcc',
  name: 'old_agbcc (ARM/Thumb, GBA)',
  description: 'Older version of agbcc with different optimization behavior. Used by some GBA projects.',
  ruleWeights: {
    'asm-barrier': 25,
    'asm-register-swap': 15,
    'pad-var-decl': 25,
    'temp-for-expr': 100,
    'reorder-stmts': 40,
    'self-assignment': 10,
  },
  disabledRules: ['sameline'],
  detect: (cmd) => cmd.includes('old_agbcc'),
};

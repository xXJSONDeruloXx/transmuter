import { describe, expect, it } from 'vitest';

import { getProfile } from './get-profile.js';

describe('getProfile', () => {
  // ---------------------------------------------------------------------------
  // 1. Explicit profile ID
  // ---------------------------------------------------------------------------

  describe('explicit profileId', () => {
    it('returns agbcc profile by ID', () => {
      const { profile, explicitProfile, compilerMatched, platformMatched } = getProfile({ profileId: 'agbcc' });
      expect(profile.id).toBe('agbcc');
      expect(explicitProfile).toBe('agbcc');
      expect(compilerMatched).toBe(false);
      expect(platformMatched).toBe(false);
    });

    it('returns old-agbcc profile by ID', () => {
      const { profile } = getProfile({ profileId: 'old-agbcc' });
      expect(profile.id).toBe('old-agbcc');
    });

    it('returns ido profile by ID', () => {
      const { profile } = getProfile({ profileId: 'ido' });
      expect(profile.id).toBe('ido');
    });

    it('returns mips-gcc-272 profile by ID', () => {
      const { profile } = getProfile({ profileId: 'mips-gcc-272' });
      expect(profile.id).toBe('mips-gcc-272');
    });

    it('returns base profile by ID', () => {
      const { profile } = getProfile({ profileId: 'base' });
      expect(profile.id).toBe('base');
    });

    it('falls back to base for unknown profile ID', () => {
      const { profile, explicitProfile } = getProfile({ profileId: 'nonexistent' });
      expect(profile.id).toBe('base');
      expect(explicitProfile).toBe('nonexistent');
    });

    it('explicit profileId takes priority over compilerCommand', () => {
      const { profile, compilerMatched } = getProfile({ profileId: 'ido', compilerCommand: 'agbcc -O2' });
      expect(profile.id).toBe('ido');
      expect(compilerMatched).toBe(false);
    });

    it('explicit profileId takes priority over platform', () => {
      const { profile, platformMatched } = getProfile({ profileId: 'ido', platform: 'gba' });
      expect(profile.id).toBe('ido');
      expect(platformMatched).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Compiler command detection
  // ---------------------------------------------------------------------------

  describe('compiler command detection', () => {
    it('detects agbcc from compiler command', () => {
      const { profile, compilerMatched, explicitProfile } = getProfile({ compilerCommand: 'agbcc -O2 -mthumb' });
      expect(profile.id).toBe('agbcc');
      expect(compilerMatched).toBe(true);
      expect(explicitProfile).toBeUndefined();
    });

    it('detects old_agbcc from compiler command', () => {
      const { profile, compilerMatched } = getProfile({ compilerCommand: 'old_agbcc -O2' });
      expect(profile.id).toBe('old-agbcc');
      expect(compilerMatched).toBe(true);
    });

    it('distinguishes agbcc from old_agbcc', () => {
      expect(getProfile({ compilerCommand: 'old_agbcc -O2' }).profile.id).toBe('old-agbcc');
      expect(getProfile({ compilerCommand: 'agbcc -O2' }).profile.id).toBe('agbcc');
    });

    it('detects ido from compiler command (case insensitive)', () => {
      const { profile, compilerMatched } = getProfile({ compilerCommand: '/usr/bin/IDO -O2' });
      expect(profile.id).toBe('ido');
      expect(compilerMatched).toBe(true);
    });

    it('detects mips-gcc-272 from gcc_kmc', () => {
      const { profile, compilerMatched } = getProfile({ compilerCommand: 'gcc_kmc -O2' });
      expect(profile.id).toBe('mips-gcc-272');
      expect(compilerMatched).toBe(true);
    });

    it('detects mips-gcc-272 from mips-gcc-2.7.2', () => {
      const { profile, compilerMatched } = getProfile({ compilerCommand: '/tools/mips-gcc-2.7.2 -O2' });
      expect(profile.id).toBe('mips-gcc-272');
      expect(compilerMatched).toBe(true);
    });

    it('compiler command takes priority over platform', () => {
      const { profile, compilerMatched, platformMatched } = getProfile({
        compilerCommand: 'agbcc -O2',
        platform: 'n64',
      });
      expect(profile.id).toBe('agbcc');
      expect(compilerMatched).toBe(true);
      expect(platformMatched).toBe(false);
    });

    it('falls through to platform when compiler command does not match', () => {
      const { profile, compilerMatched, platformMatched } = getProfile({
        compilerCommand: 'gcc -O2',
        platform: 'gba',
      });
      expect(profile.id).toBe('agbcc');
      expect(compilerMatched).toBe(false);
      expect(platformMatched).toBe(true);
    });

    it('falls through to base when compiler command does not match and no platform', () => {
      const { profile, compilerMatched, platformMatched } = getProfile({ compilerCommand: 'gcc -O2' });
      expect(profile.id).toBe('base');
      expect(compilerMatched).toBe(false);
      expect(platformMatched).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Platform detection
  // ---------------------------------------------------------------------------

  describe('platform detection', () => {
    it.each([
      ['gba', 'agbcc'],
      ['nds', 'agbcc'],
      ['n3ds', 'agbcc'],
      ['n64', 'ido'],
      ['ps1', 'ido'],
      ['ps2', 'ido'],
      ['psp', 'ido'],
      ['irix', 'ido'],
    ])('platform "%s" maps to %s profile', (platform, expectedId) => {
      const { profile, platformMatched, compilerMatched, explicitProfile } = getProfile({ platform });
      expect(profile.id).toBe(expectedId);
      expect(platformMatched).toBe(true);
      expect(compilerMatched).toBe(false);
      expect(explicitProfile).toBeUndefined();
    });

    it('unknown platform falls back to base', () => {
      const { profile, platformMatched } = getProfile({ platform: 'dreamcast' });
      expect(profile.id).toBe('base');
      expect(platformMatched).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Fallback
  // ---------------------------------------------------------------------------

  describe('fallback', () => {
    it('returns base profile with no options', () => {
      const { profile, explicitProfile, compilerMatched, platformMatched } = getProfile();
      expect(profile.id).toBe('base');
      expect(explicitProfile).toBeUndefined();
      expect(compilerMatched).toBe(false);
      expect(platformMatched).toBe(false);
    });

    it('returns base profile with empty options', () => {
      const { profile } = getProfile({});
      expect(profile.id).toBe('base');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Trace correctness
  // ---------------------------------------------------------------------------

  describe('trace', () => {
    it('preserves compilerCommand in trace even when platform wins', () => {
      const trace = getProfile({ compilerCommand: 'gcc -O2', platform: 'n64' });
      expect(trace.compilerCommand).toBe('gcc -O2');
      expect(trace.compilerMatched).toBe(false);
      expect(trace.platform).toBe('n64');
      expect(trace.platformMatched).toBe(true);
    });

    it('preserves platform in trace even when compiler wins', () => {
      const trace = getProfile({ compilerCommand: 'agbcc -O2', platform: 'n64' });
      expect(trace.platform).toBe('n64');
      expect(trace.platformMatched).toBe(false);
      expect(trace.compilerMatched).toBe(true);
    });

    it('preserves all inputs in trace on fallback', () => {
      const trace = getProfile({ compilerCommand: 'gcc -O2', platform: 'dreamcast' });
      expect(trace.compilerCommand).toBe('gcc -O2');
      expect(trace.platform).toBe('dreamcast');
      expect(trace.compilerMatched).toBe(false);
      expect(trace.platformMatched).toBe(false);
      expect(trace.profile.id).toBe('base');
    });

    it('trace has undefined fields when inputs are omitted', () => {
      const trace = getProfile();
      expect(trace.explicitProfile).toBeUndefined();
      expect(trace.compilerCommand).toBeUndefined();
      expect(trace.platform).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Profile content sanity checks
  // ---------------------------------------------------------------------------

  describe('profile content', () => {
    it('agbcc has expected rule weights', () => {
      const { profile } = getProfile({ profileId: 'agbcc' });
      expect(profile.ruleWeights['asm-barrier']).toBe(25);
      expect(profile.ruleWeights['temp-for-expr']).toBe(100);
      expect(profile.disabledRules).toContain('sameline');
    });

    it('ido disables asm rules', () => {
      const { profile } = getProfile({ profileId: 'ido' });
      expect(profile.disabledRules).toContain('asm-barrier');
      expect(profile.disabledRules).toContain('asm-register-swap');
    });

    it('base has no rule weight overrides and no disabled rules', () => {
      const { profile } = getProfile({ profileId: 'base' });
      expect(Object.keys(profile.ruleWeights)).toHaveLength(0);
      expect(profile.disabledRules).toHaveLength(0);
    });
  });
});

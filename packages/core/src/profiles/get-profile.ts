/**
 * Profile detection — single source of truth.
 *
 * `getProfile()` is the only exported function. It resolves a profile from
 * explicit ID, compiler command, or platform — in that precedence order —
 * and returns a trace explaining how the decision was made.
 */
import { agbccProfile } from './agbcc.js';
import { idoProfile } from './ido.js';
import { mipsGcc272Profile } from './mips-gcc-272.js';
import { oldAgbccProfile } from './old-agbcc.js';
import type { Profile } from './profile.js';

export type { Profile };

/** Base profile: all default weights, no overrides. */
const baseProfile: Profile = {
  id: 'base',
  name: 'Base (generic)',
  description: 'Generic profile with all default rule weights. Used when no specific compiler is detected.',
  ruleWeights: {},
  disabledRules: [],
};

/** All built-in profiles (order matters — first match wins for compiler detection). */
const profiles: Profile[] = [agbccProfile, oldAgbccProfile, idoProfile, mipsGcc272Profile, baseProfile];

/** Map a decomp_settings platform string to a default profile. */
function profileForPlatform(platform: string): Profile | null {
  switch (platform) {
    case 'gba':
    case 'nds':
    case 'n3ds':
      return agbccProfile;
    case 'n64':
      return idoProfile;
    case 'ps1':
    case 'ps2':
    case 'psp':
    case 'irix':
      return idoProfile;
    // gc, wii -> mwcc (future)
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Trace — explains how the profile was selected
// ---------------------------------------------------------------------------

export interface ProfileTrace {
  /** The resolved profile. */
  profile: Profile;
  /** Was an explicit profile ID provided? */
  explicitProfile: string | undefined;
  /** Compiler command that was checked (from flag or config). */
  compilerCommand: string | undefined;
  /** Did the compiler command match a known profile? */
  compilerMatched: boolean;
  /** Platform string that was checked (from decomp.yaml). */
  platform: string | undefined;
  /** Did the platform map to a profile? */
  platformMatched: boolean;
}

// ---------------------------------------------------------------------------
// getProfile — single entry point
// ---------------------------------------------------------------------------

export interface GetProfileOptions {
  /** Explicit profile ID (e.g., from --profile flag). Highest priority. */
  profileId?: string;
  /** Compiler command string for auto-detection. */
  compilerCommand?: string;
  /** Platform from decomp.yaml (e.g., 'gba', 'n64'). Lowest priority. */
  platform?: string;
}

/**
 * Resolve a compiler profile.
 *
 * Precedence:
 * 1. Explicit `profileId` — look up by ID
 * 2. `compilerCommand` — try each profile's `detect()` method
 * 3. `platform` — map known platform strings to profiles
 * 4. Fall back to the base (generic) profile
 *
 * Returns the profile and a trace explaining the decision.
 */
export function getProfile(opts: GetProfileOptions = {}): ProfileTrace {
  const { profileId, compilerCommand, platform } = opts;

  // 1. Explicit profile ID
  if (profileId) {
    const found = profiles.find((p) => p.id === profileId) ?? baseProfile;
    return {
      profile: found,
      explicitProfile: profileId,
      compilerCommand,
      compilerMatched: false,
      platform,
      platformMatched: false,
    };
  }

  // 2. Compiler command detection
  if (compilerCommand) {
    for (const profile of profiles) {
      if (profile.detect?.(compilerCommand)) {
        return {
          profile,
          explicitProfile: undefined,
          compilerCommand,
          compilerMatched: true,
          platform,
          platformMatched: false,
        };
      }
    }
  }

  // 3. Platform mapping
  if (platform) {
    const mapped = profileForPlatform(platform);
    if (mapped) {
      return {
        profile: mapped,
        explicitProfile: undefined,
        compilerCommand,
        compilerMatched: false,
        platform,
        platformMatched: true,
      };
    }
  }

  // 4. Fallback
  return {
    profile: baseProfile,
    explicitProfile: undefined,
    compilerCommand,
    compilerMatched: false,
    platform,
    platformMatched: false,
  };
}

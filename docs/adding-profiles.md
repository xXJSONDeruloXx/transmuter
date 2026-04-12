# Adding Compiler Profiles

Guide for adding new compiler target profiles to Transmuter.

## Overview

A profile tunes mutation rule weights and disables rules for a specific compiler. Profiles let Transmuter prioritize mutations that are most likely to affect the target compiler's code generation. For example, the `agbcc` profile raises `asm-barrier` weight because agbcc is sensitive to register barriers, while the `ido` profile disables asm rules entirely because IDO does not support GCC inline assembly syntax.

## File Location

```
packages/core/src/profiles/<profile-id>.ts
```

## Implement the Profile Interface

```typescript
import type { Profile } from './profile.js';

export const myCompilerProfile: Profile = {
  id: 'my-compiler',
  name: 'My Compiler (Platform)',
  description: 'Description of the compiler and target platform.',
  ruleWeights: {
    'temp-for-expr': 80,      // lower than default 100
    'asm-barrier': 0,          // effectively disable via weight
    'reorder-stmts': 50,      // raise from default 30
  },
  disabledRules: [
    'asm-register-swap',       // compiler doesn't support inline asm
  ],
  detect: (cmd) => cmd.includes('my-compiler'),
};
```

### Key Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique profile identifier (used with `--profile` flag) |
| `name` | `string` | Human-readable name shown in UI |
| `description` | `string` | Compiler and platform description |
| `ruleWeights` | `Record<string, number>` | Override default weights for specific rules. Only include rules you want to change |
| `disabledRules` | `string[]` | Rule IDs to disable entirely (effective weight = 0) |
| `detect?` | `(compilerCommand: string) => boolean` | Auto-detection from the compiler command string |

### Weight Precedence

When resolving a rule's effective weight:

```
disabled (0) > user override (CLI/API) > profile weight > rule defaultWeight
```

Rules in `disabledRules` always have weight 0, regardless of other settings. User overrides (via `--ruleWeights` or the API) take precedence over profile defaults.

## Register the Profile

In `packages/core/src/profiles/profile.ts`, import and add to the `profiles` array:

```typescript
import { myCompilerProfile } from './my-compiler.js';

const profiles: Profile[] = [
  agbccProfile,
  oldAgbccProfile,
  idoProfile,
  mipsGcc272Profile,
  myCompilerProfile,
  baseProfile,
];

export { myCompilerProfile };
```

Also add the export in `packages/core/src/index.ts`:

```typescript
export {
  getProfile,
  detectProfile,
  baseProfile,
  agbccProfile,
  oldAgbccProfile,
  idoProfile,
  mipsGcc272Profile,
  myCompilerProfile,
} from './profiles/profile.js';
```

## Auto-Detection

Profiles are auto-detected in two ways:

### 1. Compiler command detection (highest priority)

The `detect()` method receives the compiler command string and returns `true` if it matches. This runs before platform-based detection.

```typescript
detect: (cmd) => cmd.includes('my-compiler') || cmd.includes('mycc'),
```

Tips:
- Check for the compiler binary name, not just any substring
- Handle common variations (e.g., `agbcc` vs `old_agbcc`)
- Return `false` by default -- don't be too aggressive

### 2. Platform mapping (fallback)

The `profileForPlatform()` function in `profile.ts` maps `decomp.yaml` platform strings to default profiles:

```typescript
function profileForPlatform(platform: string): Profile | null {
  switch (platform) {
    case 'gba':
    case 'nds':
      return agbccProfile;
    case 'n64':
      return idoProfile;
    case 'my-platform':
      return myCompilerProfile;
    default:
      return null;
  }
}
```

Add your platform mapping here if there is a standard `decomp.yaml` platform string for your target.

### Detection Priority

```
explicit --profile flag > detect(compilerCommand) > platform mapping > base fallback
```

## Weight Tuning Tips

- **Start from `base`**: Only override weights you have a reason to change
- **Compiler-specific mutations**: If the compiler ignores certain patterns, set their weight to 0 or disable them (e.g., IDO ignores GCC `asm()`, so asm rules are disabled)
- **High-impact mutations**: If certain mutations frequently improve scores for this compiler, raise their weight (e.g., `asm-barrier` is high for agbcc because register barriers strongly affect ARM code generation)
- **Low-value mutations**: If certain mutations rarely help or often cause compile errors, lower their weight
- **Zero weight vs disabled**: Setting weight to 0 in `ruleWeights` means the profile disables it by default but users can re-enable. Adding to `disabledRules` means it is explicitly disabled and requires `enableRule()` to re-enable

## Built-In Profiles Reference

| Profile | Platform | Compiler | Key Traits |
|---------|----------|----------|------------|
| `agbcc` | GBA (ARM/Thumb) | agbcc | High asm-barrier (25) and pad-var-decl (20) weights |
| `old-agbcc` | GBA (ARM/Thumb) | old_agbcc | Like agbcc but with higher self-assignment weight |
| `ido` | N64/IRIX (MIPS) | IDO | Asm rules disabled; higher cast-expr weight |
| `mips-gcc-272` | N64 (MIPS) | GCC 2.7.2 (KMC) | Asm rules disabled; tuned for N64 GCC projects |
| `base` | Any | Any | All default weights, nothing disabled (fallback) |

## Example: agbcc Profile

```typescript
export const agbccProfile: Profile = {
  id: 'agbcc',
  name: 'agbcc (ARM/Thumb, GBA)',
  description:
    'The agbcc compiler used by GBA decompilation projects. ARM7TDMI (ARMv4T) target.',
  ruleWeights: {
    'asm-barrier': 25,
    'asm-register-swap': 15,
    'pad-var-decl': 20,
    'temp-for-expr': 100,
    'reorder-stmts': 40,
  },
  disabledRules: [],
  detect: (cmd) => cmd.includes('agbcc') && !cmd.includes('old_agbcc'),
};
```

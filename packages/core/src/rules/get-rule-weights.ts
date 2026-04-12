/**
 * Rule weight resolution — single source of truth.
 *
 * `getRuleWeights()` resolves the effective weight for every built-in rule,
 * applying profile overrides, user overrides, and disabled rules in the same
 * precedence order as `RuleRegistry.getWeight()`.
 *
 * Used by the CLI for display and available for any consumer that needs to
 * inspect effective weights without constructing a mutable RuleRegistry.
 */
import type { Language } from '~/language.js';
import type { GetProfileOptions } from '~/profiles/get-profile.js';
import { getProfile } from '~/profiles/get-profile.js';

import { builtInRules } from './built-in/index.js';

export interface ResolvedRule {
  ruleId: string;
  description: string;
  languages: readonly Language[];
  /** The rule's built-in default weight. */
  defaultWeight: number;
  /** Weight after profile override (0 if profile-disabled). */
  profileWeight: number;
  /** Final effective weight (matches RuleRegistry.getWeight() precedence). */
  effectiveWeight: number;
  /** Disabled by the profile's disabledRules. */
  profileDisabled: boolean;
  /** Disabled by user's disabledRules (from decomp.yaml). */
  userDisabled: boolean;
  /** Explicit user weight override (from decomp.yaml ruleWeights), if any. */
  userWeight: number | undefined;
}

export interface GetRuleWeightsOptions extends GetProfileOptions {
  /** User weight overrides (from decomp.yaml tools.transmuter.ruleWeights). */
  userRuleWeights?: Record<string, number>;
  /** User disabled rules (from decomp.yaml tools.transmuter.disabledRules). */
  userDisabledRules?: string[];
}

/**
 * Resolve the effective weight for every built-in rule.
 *
 * Precedence (matches RuleRegistry.getWeight()):
 * 1. Disabled (profile or user) → effectiveWeight = 0
 * 2. User weight override → effectiveWeight = userWeight
 * 3. Profile weight → effectiveWeight = profileWeight
 * 4. Rule default → effectiveWeight = defaultWeight
 */
export function getRuleWeights(opts: GetRuleWeightsOptions = {}): ResolvedRule[] {
  const { profile } = getProfile(opts);
  const userRuleWeights = opts.userRuleWeights ?? {};
  const userDisabledRules = new Set(opts.userDisabledRules ?? []);

  return builtInRules.map((rule) => {
    const profileDisabled = profile.disabledRules.includes(rule.id);
    const userDisabled = userDisabledRules.has(rule.id);
    const disabled = profileDisabled || userDisabled;

    const profileWeight = profileDisabled ? 0 : (profile.ruleWeights[rule.id] ?? rule.defaultWeight);

    const userWeight = rule.id in userRuleWeights ? userRuleWeights[rule.id]! : undefined;

    // Match RuleRegistry.getWeight() precedence: disabled always wins
    let effectiveWeight: number;
    if (disabled) {
      effectiveWeight = 0;
    } else if (userWeight !== undefined) {
      effectiveWeight = userWeight;
    } else {
      effectiveWeight = profileWeight;
    }

    return {
      ruleId: rule.id,
      description: rule.description,
      languages: rule.languages,
      defaultWeight: rule.defaultWeight,
      profileWeight,
      effectiveWeight,
      profileDisabled,
      userDisabled,
      userWeight,
    };
  });
}

/**
 * Rule registry — manages rule registration, weights, and enable/disable state.
 */
import type { Language } from '~/language.js';
import type { Profile } from '~/profiles/profile.js';

import type { Rule } from './rule.js';

export class RuleRegistry {
  #rules = new Map<string, Rule>();
  #weightOverrides = new Map<string, number>();
  #disabled = new Set<string>();
  #profileWeights = new Map<string, number>();

  /** Register a rule. Throws if ID conflicts. */
  register(rule: Rule): void {
    if (this.#rules.has(rule.id)) {
      throw new Error(`Rule '${rule.id}' is already registered`);
    }
    this.#rules.set(rule.id, rule);
  }

  /** Register multiple rules at once. */
  registerAll(rules: Rule[]): void {
    for (const rule of rules) {
      this.register(rule);
    }
  }

  /** Get all registered rules. */
  all(): Rule[] {
    return [...this.#rules.values()];
  }

  /** Get a rule by ID. */
  get(id: string): Rule | undefined {
    return this.#rules.get(id);
  }

  /**
   * Get the effective weight for a rule.
   * Precedence: disabled(0) > user override > profile default > rule default.
   */
  getWeight(id: string): number {
    if (this.#disabled.has(id)) {
      return 0;
    }
    const override = this.#weightOverrides.get(id);
    if (override !== undefined) {
      return override;
    }
    const profileWeight = this.#profileWeights.get(id);
    if (profileWeight !== undefined) {
      return profileWeight;
    }
    return this.#rules.get(id)?.defaultWeight ?? 0;
  }

  /** Check whether a rule is registered. */
  has(id: string): boolean {
    return this.#rules.has(id);
  }

  /** Set the effective weight for a rule (user override). Returns false if the rule doesn't exist. */
  setWeight(id: string, weight: number): boolean {
    if (!this.#rules.has(id)) {
      return false;
    }
    this.#weightOverrides.set(id, weight);
    return true;
  }

  /**
   * Set multiple weights at once.
   * Returns a list of rule IDs that were not found (empty if all were valid).
   */
  setWeights(weights: Record<string, number>): string[] {
    const unknown: string[] = [];
    for (const [id, weight] of Object.entries(weights)) {
      if (!this.setWeight(id, weight)) {
        unknown.push(id);
      }
    }
    return unknown;
  }

  /** Disable a rule (effective weight becomes 0). Returns false if the rule doesn't exist. */
  disable(id: string): boolean {
    if (!this.#rules.has(id)) {
      return false;
    }
    this.#disabled.add(id);
    return true;
  }

  /** Enable a previously disabled rule (restores effective weight). Returns false if the rule doesn't exist. */
  enable(id: string): boolean {
    if (!this.#rules.has(id)) {
      return false;
    }
    this.#disabled.delete(id);
    return true;
  }

  /** Apply a profile's default weights (and disabled rules). */
  applyProfile(profile: Profile): void {
    this.#profileWeights.clear();
    for (const [id, weight] of Object.entries(profile.ruleWeights)) {
      this.#profileWeights.set(id, weight);
    }
    for (const id of profile.disabledRules) {
      this.disable(id);
    }
  }

  /** Get all effective weights as a record. */
  getAllWeights(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const rule of this.#rules.values()) {
      result[rule.id] = this.getWeight(rule.id);
    }
    return result;
  }

  /** Get only the rules that have weight > 0, optionally filtered by language. */
  getActiveRules(language?: Language): { rule: Rule; weight: number }[] {
    const active: { rule: Rule; weight: number }[] = [];
    for (const rule of this.#rules.values()) {
      if (language && !rule.languages.includes(language)) {
        continue;
      }
      const weight = this.getWeight(rule.id);
      if (weight > 0) {
        active.push({ rule, weight });
      }
    }
    return active;
  }
}

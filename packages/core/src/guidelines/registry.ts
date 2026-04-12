/**
 * Guideline registry — stores and retrieves guideline plugins.
 */
import type { Language } from '~/language.js';

import type { Guideline } from './guideline.js';

export class GuidelineRegistry {
  #guidelines = new Map<string, Guideline>();

  /** Register a single guideline. */
  register(guideline: Guideline): void {
    this.#guidelines.set(guideline.id, guideline);
  }

  /** Register multiple guidelines at once. */
  registerAll(guidelines: Guideline[]): void {
    for (const g of guidelines) {
      this.register(g);
    }
  }

  /** Get a guideline by ID. Returns undefined if not found. */
  get(id: string): Guideline | undefined {
    return this.#guidelines.get(id);
  }

  /** List all registered guidelines, optionally filtered by language. */
  list(language?: Language): Guideline[] {
    const all = [...this.#guidelines.values()];
    if (!language) {
      return all;
    }
    return all.filter((g) => g.languages.includes(language));
  }
}

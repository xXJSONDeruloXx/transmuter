/**
 * NodeFilter implementation for focus/avoid region constraints.
 *
 * Composes multiple focus and avoid constraints into a single filter
 * that biases AST node selection toward focus regions and away from
 * avoid regions.
 */
import type { SgNode } from '@ast-grep/napi';
import type { Rng } from '~/rng.js';
import type { NodeFilter } from '~/rules/rule.js';
import type { AvoidRegionConstraint, FocusRegionConstraint } from '~/types.js';

const DEFAULT_FOCUS_STRENGTH = 0.7;

export class CompositeNodeFilter implements NodeFilter {
  #focusRegions: FocusRegionConstraint[];
  #avoidRegions: AvoidRegionConstraint[];

  constructor(focusRegions: FocusRegionConstraint[], avoidRegions: AvoidRegionConstraint[]) {
    this.#focusRegions = focusRegions;
    this.#avoidRegions = avoidRegions;
  }

  filter(nodes: SgNode[], rng: Rng): SgNode[] {
    if (nodes.length === 0) {
      return nodes;
    }

    // Step 1: Remove nodes that fall entirely within avoid regions
    let filtered = nodes.filter((node) => !this.#isInAvoidRegion(node));
    if (filtered.length === 0) {
      return nodes;
    } // fallback: don't filter everything out

    // Step 2: If no focus regions, return the filtered set
    if (this.#focusRegions.length === 0) {
      return filtered;
    }

    // Step 3: Bias selection toward focus regions using weighted random
    const inFocus: SgNode[] = [];
    const outFocus: SgNode[] = [];

    for (const node of filtered) {
      if (this.#isInFocusRegion(node)) {
        inFocus.push(node);
      } else {
        outFocus.push(node);
      }
    }

    // If nothing matches the focus region, return all filtered nodes
    if (inFocus.length === 0) {
      return filtered;
    }
    // If everything is in focus, return as-is
    if (outFocus.length === 0) {
      return inFocus;
    }

    // Use the strongest focus strength
    const strength = Math.max(...this.#focusRegions.map((r) => r.strength ?? DEFAULT_FOCUS_STRENGTH));

    // Weighted selection: pick from inFocus with probability `strength`,
    // from outFocus with probability `1 - strength`
    if (rng.chance(strength)) {
      return inFocus;
    }
    return outFocus;
  }

  #isInFocusRegion(node: SgNode): boolean {
    const range = node.range();
    const startLine = range.start.line + 1; // SgNode lines are 0-indexed
    const endLine = range.end.line + 1;

    return this.#focusRegions.some((r) => startLine <= r.lines.end && endLine >= r.lines.start);
  }

  #isInAvoidRegion(node: SgNode): boolean {
    const range = node.range();
    const startLine = range.start.line + 1;
    const endLine = range.end.line + 1;

    return this.#avoidRegions.some((r) => startLine >= r.lines.start && endLine <= r.lines.end);
  }
}

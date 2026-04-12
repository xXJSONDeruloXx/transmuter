import { describe, expect, it } from 'vitest';
import type { CandidateNode } from '~/types.js';

import { computeCollapsedGraph } from './collapsed-graph.js';

function makeCandidate(overrides: Partial<CandidateNode> & { id: string; score: number }): CandidateNode {
  return {
    source: `source-${overrides.id}`,
    iteration: 0,
    timestamp: Date.now(),
    mutationTargetId: `mt-${overrides.id}`,
    origin: 'organic',
    assembly: '',
    assemblyDiff: '',
    breakdown: { total: 0, insert: 0, delete: 0, replace: 0, opMismatch: 0, argMismatch: 0 },
    ...overrides,
  };
}

describe('computeCollapsedGraph', () => {
  it('returns empty spine for empty input', () => {
    const result = computeCollapsedGraph([]);
    expect(result.spine).toEqual([]);
    expect(result.totalCandidates).toBe(0);
    expect(result.collapsedCount).toBe(0);
  });

  it('returns single-node spine for a lone genesis', () => {
    const genesis = makeCandidate({ id: 'g', score: 10, origin: 'genesis' });
    const result = computeCollapsedGraph([genesis]);

    expect(result.spine).toHaveLength(1);
    expect(result.spine[0]!.candidate.id).toBe('g');
    expect(result.spine[0]!.cluster).toBeNull();
    expect(result.totalCandidates).toBe(1);
    expect(result.collapsedCount).toBe(0);
  });

  it('builds a spine from genesis to best candidate', () => {
    const g = makeCandidate({ id: 'g', score: 100, origin: 'genesis' });
    const a = makeCandidate({ id: 'a', score: 80, parentId: 'g', ruleId: 'r1' });
    const b = makeCandidate({ id: 'b', score: 60, parentId: 'a', ruleId: 'r2' });

    const result = computeCollapsedGraph([g, a, b]);

    expect(result.spine).toHaveLength(3);
    expect(result.spine.map((s) => s.candidate.id)).toEqual(['g', 'a', 'b']);
    expect(result.collapsedCount).toBe(0);
  });

  it('collapses off-spine branches into clusters', () => {
    //     g (100)
    //    / \
    //   a   x (90)  ← off-spine dead end
    //  (80)
    //   |
    //   b (60)  ← best
    const g = makeCandidate({ id: 'g', score: 100, origin: 'genesis' });
    const a = makeCandidate({ id: 'a', score: 80, parentId: 'g', ruleId: 'r1' });
    const b = makeCandidate({ id: 'b', score: 60, parentId: 'a', ruleId: 'r2' });
    const x = makeCandidate({ id: 'x', score: 90, parentId: 'g', ruleId: 'r3' });

    const result = computeCollapsedGraph([g, a, b, x]);

    expect(result.spine).toHaveLength(3);
    expect(result.spine.map((s) => s.candidate.id)).toEqual(['g', 'a', 'b']);

    // Genesis has a cluster with the off-spine branch
    const genesisNode = result.spine[0]!;
    expect(genesisNode.cluster).not.toBeNull();
    expect(genesisNode.cluster!.candidateCount).toBe(1);
    expect(genesisNode.cluster!.bestScore).toBe(90);
    expect(genesisNode.cluster!.candidates[0]!.id).toBe('x');
    expect(genesisNode.cluster!.rules).toEqual(['r3']);

    // Other spine nodes have no clusters
    expect(result.spine[1]!.cluster).toBeNull();
    expect(result.spine[2]!.cluster).toBeNull();

    expect(result.totalCandidates).toBe(4);
    expect(result.collapsedCount).toBe(1);
  });

  it('collapses deep off-spine subtrees recursively', () => {
    //     g (100)
    //    / \
    //   a   x (90)
    //  (50) |
    //       y (85)
    //       |
    //       z (82)
    const g = makeCandidate({ id: 'g', score: 100, origin: 'genesis' });
    const a = makeCandidate({ id: 'a', score: 50, parentId: 'g', ruleId: 'r1' });
    const x = makeCandidate({ id: 'x', score: 90, parentId: 'g', ruleId: 'r2' });
    const y = makeCandidate({ id: 'y', score: 85, parentId: 'x', ruleId: 'r3' });
    const z = makeCandidate({ id: 'z', score: 82, parentId: 'y', ruleId: 'r2' });

    const result = computeCollapsedGraph([g, a, x, y, z]);

    // Spine: g → a (best score 50)
    expect(result.spine).toHaveLength(2);
    expect(result.spine.map((s) => s.candidate.id)).toEqual(['g', 'a']);

    // Genesis cluster includes x, y, z
    const cluster = result.spine[0]!.cluster!;
    expect(cluster.candidateCount).toBe(3);
    expect(cluster.bestScore).toBe(82);
    expect(cluster.worstScore).toBe(90);
    expect(cluster.rules).toEqual(['r2', 'r3']);
    expect(cluster.candidates.map((c) => c.id)).toEqual(['x', 'y', 'z']);

    expect(result.collapsedCount).toBe(3);
  });

  it('handles clusters branching from multiple spine nodes', () => {
    //   g (100)
    //   |   \
    //   a    x1 (95)
    //  (80)
    //   |  \
    //   b   x2 (75)
    //  (60)
    const g = makeCandidate({ id: 'g', score: 100, origin: 'genesis' });
    const a = makeCandidate({ id: 'a', score: 80, parentId: 'g', ruleId: 'r1' });
    const b = makeCandidate({ id: 'b', score: 60, parentId: 'a', ruleId: 'r2' });
    const x1 = makeCandidate({ id: 'x1', score: 95, parentId: 'g', ruleId: 'r3' });
    const x2 = makeCandidate({ id: 'x2', score: 75, parentId: 'a', ruleId: 'r4' });

    const result = computeCollapsedGraph([g, a, b, x1, x2]);

    expect(result.spine).toHaveLength(3);

    // Genesis has x1 in its cluster
    expect(result.spine[0]!.cluster!.candidateCount).toBe(1);
    expect(result.spine[0]!.cluster!.candidates[0]!.id).toBe('x1');

    // Node 'a' has x2 in its cluster
    expect(result.spine[1]!.cluster!.candidateCount).toBe(1);
    expect(result.spine[1]!.cluster!.candidates[0]!.id).toBe('x2');

    // Best node 'b' has no cluster
    expect(result.spine[2]!.cluster).toBeNull();

    expect(result.collapsedCount).toBe(2);
  });

  it('handles tie-breaking when multiple candidates have the same best score', () => {
    const g = makeCandidate({ id: 'g', score: 100, origin: 'genesis' });
    const a = makeCandidate({ id: 'a', score: 50, parentId: 'g', ruleId: 'r1' });
    const b = makeCandidate({ id: 'b', score: 50, parentId: 'g', ruleId: 'r2' });

    const result = computeCollapsedGraph([g, a, b]);

    // One of them becomes the spine, the other gets collapsed
    expect(result.spine).toHaveLength(2);
    expect(result.spine[0]!.candidate.id).toBe('g');
    expect(result.collapsedCount).toBe(1);
  });

  it('cluster ID is derived from spine candidate', () => {
    const g = makeCandidate({ id: 'g', score: 100, origin: 'genesis' });
    const a = makeCandidate({ id: 'a', score: 50, parentId: 'g', ruleId: 'r1' });
    const x = makeCandidate({ id: 'x', score: 90, parentId: 'g', ruleId: 'r2' });

    const result = computeCollapsedGraph([g, a, x]);

    expect(result.spine[0]!.cluster!.id).toBe('cluster-g');
  });

  it('handles external candidates on and off the spine', () => {
    const g = makeCandidate({ id: 'g', score: 100, origin: 'genesis' });
    const ext = makeCandidate({ id: 'ext', score: 30, origin: 'external' });

    const result = computeCollapsedGraph([g, ext]);

    // ext has no parentId, so it's a separate root. The best is ext (score 30).
    // The spine is just [ext] since it has no parent chain to genesis.
    expect(result.spine).toHaveLength(1);
    expect(result.spine[0]!.candidate.id).toBe('ext');
    // g is not connected to ext, so it's not on the spine and not a child — it's orphaned
    // Since g has no parent, it can't be part of any cluster (no spine node claims it as a child)
    expect(result.collapsedCount).toBe(1);
  });

  it('produces sorted rule list in clusters', () => {
    const g = makeCandidate({ id: 'g', score: 100, origin: 'genesis' });
    const a = makeCandidate({ id: 'a', score: 10, parentId: 'g', ruleId: 'r1' });
    const x = makeCandidate({ id: 'x', score: 90, parentId: 'g', ruleId: 'zebra-rule' });
    const y = makeCandidate({ id: 'y', score: 85, parentId: 'g', ruleId: 'alpha-rule' });

    const result = computeCollapsedGraph([g, a, x, y]);

    expect(result.spine[0]!.cluster!.rules).toEqual(['alpha-rule', 'zebra-rule']);
  });
});

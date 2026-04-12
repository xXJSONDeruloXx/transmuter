/**
 * Pure function to compute a collapsed DAG spine from a candidate graph.
 *
 * Uses relative imports (not the `~` alias) so the webapp can import this
 * file directly via the `@core/*` Vite/TS alias without needing core's
 * path resolution.
 */
import type { CandidateNode, ClusterSummary, CollapsedGraph, SpineNode, SuperNode } from '../types.js';

/**
 * Compute a collapsed view of the candidate graph.
 *
 * The winning lineage (genesis → best candidate) becomes the "spine".
 * All off-spine branches are grouped into cluster summaries attached to the
 * spine node where they diverge.
 *
 * When superNodes are provided (from graph compaction), they are attached to
 * the appropriate cluster or collected as disconnected supernodes.
 *
 * This is a pure function — safe to call from both Node.js (via SessionStore)
 * and the browser (via the webapp's `@core` alias).
 */
export function computeCollapsedGraph(candidates: CandidateNode[], superNodes?: SuperNode[]): CollapsedGraph {
  if (candidates.length === 0) {
    return { spine: [], totalCandidates: 0, collapsedCount: 0 };
  }

  const candidateMap = new Map(candidates.map((c) => [c.id, c]));

  // Find the best candidate (lowest score)
  let best = candidates[0]!;
  for (const c of candidates) {
    if (c.score < best.score) {
      best = c;
    }
  }

  // Walk up from best → genesis to build the winning lineage
  const spineIds = new Set<string>();
  const spineReversed: CandidateNode[] = [];
  let current: CandidateNode | undefined = best;
  while (current) {
    spineIds.add(current.id);
    spineReversed.push(current);
    current = current.parentId ? candidateMap.get(current.parentId) : undefined;
  }
  const spineOrdered = spineReversed.reverse(); // genesis → best

  // Build children index (parentId → children)
  const childrenOf = new Map<string, CandidateNode[]>();
  for (const c of candidates) {
    if (c.parentId) {
      let arr = childrenOf.get(c.parentId);
      if (!arr) {
        arr = [];
        childrenOf.set(c.parentId, arr);
      }
      arr.push(c);
    }
  }

  // Index supernodes by parentId for cluster attachment
  const superNodesByParent = new Map<string, SuperNode[]>();
  const disconnectedSuperNodes: SuperNode[] = [];
  if (superNodes) {
    for (const sn of superNodes) {
      if (sn.parentId === undefined) {
        disconnectedSuperNodes.push(sn);
      } else {
        let arr = superNodesByParent.get(sn.parentId);
        if (!arr) {
          arr = [];
          superNodesByParent.set(sn.parentId, arr);
        }
        arr.push(sn);
      }
    }
  }

  // For each spine node, collect the off-spine subtree into a cluster
  const spine: SpineNode[] = spineOrdered.map((sc) => {
    const children = childrenOf.get(sc.id) ?? [];
    const offSpineRoots = children.filter((c) => !spineIds.has(c.id));

    // Collect supernodes attached to any candidate in this cluster's subtree
    const clusterSuperNodes: SuperNode[] = [];

    // Supernodes attached directly to this spine candidate
    const spineSuper = superNodesByParent.get(sc.id);
    if (spineSuper) {
      clusterSuperNodes.push(...spineSuper);
    }

    if (offSpineRoots.length === 0 && clusterSuperNodes.length === 0) {
      return { candidate: sc, cluster: null };
    }

    // BFS to collect the entire subtree under off-spine roots
    const clusterCandidates: CandidateNode[] = [];
    const queue = [...offSpineRoots];
    while (queue.length > 0) {
      const node = queue.shift()!;
      clusterCandidates.push(node);
      // Also collect supernodes attached to this off-spine candidate
      const nodeSuperNodes = superNodesByParent.get(node.id);
      if (nodeSuperNodes) {
        clusterSuperNodes.push(...nodeSuperNodes);
      }
      const nodeChildren = childrenOf.get(node.id);
      if (nodeChildren) {
        queue.push(...nodeChildren);
      }
    }

    // Compute cluster statistics
    const rules = new Set<string>();
    let bestScore = Infinity;
    let worstScore = -Infinity;
    for (const c of clusterCandidates) {
      if (c.ruleId) {
        rules.add(c.ruleId);
      }
      if (c.score < bestScore) {
        bestScore = c.score;
      }
      if (c.score > worstScore) {
        worstScore = c.score;
      }
    }
    // Include supernode stats
    for (const sn of clusterSuperNodes) {
      for (const r of sn.rules) {
        rules.add(r);
      }
      if (sn.bestScore < bestScore) {
        bestScore = sn.bestScore;
      }
      if (sn.worstScore > worstScore) {
        worstScore = sn.worstScore;
      }
    }

    // Total count includes summarized candidates
    const summarizedCount = clusterSuperNodes.reduce((sum, sn) => sum + sn.summarizedCount, 0);

    const cluster: ClusterSummary = {
      id: `cluster-${sc.id}`,
      candidateCount: clusterCandidates.length + summarizedCount,
      bestScore,
      worstScore,
      rules: [...rules].sort(),
      candidates: clusterCandidates,
      ...(clusterSuperNodes.length > 0 ? { superNodes: clusterSuperNodes } : {}),
    };

    return { candidate: sc, cluster };
  });

  const collapsedCount = candidates.length - spineOrdered.length;

  return {
    spine,
    totalCandidates: candidates.length,
    collapsedCount,
    ...(disconnectedSuperNodes.length > 0 ? { disconnectedSuperNodes } : {}),
  };
}

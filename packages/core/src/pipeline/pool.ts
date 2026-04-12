/**
 * Candidate pool — manages the candidate graph, mutation targets, and selection.
 *
 * The pool tracks a graph of CandidateNodes connected by fork relationships.
 * Each MutationTarget points to a candidate that is being actively mutated.
 * When a mutation improves the score, it forks: the improved code becomes a
 * new candidate on a new MutationTarget, while the parent keeps exploring.
 */
import type { Rng } from '~/rng.js';
import type {
  CandidateNode,
  DiffBreakdown,
  MutationReport,
  MutationTarget,
  MutationTargetSummary,
  PoolStats,
  SuperNode,
} from '~/types.js';

export interface ForkResult {
  candidate: CandidateNode;
  mutationTarget: MutationTarget;
}

export interface SummarizeResult {
  removed: number;
  superNodes: SuperNode[];
  removedTargetIds: string[];
}

export class Pool {
  #candidates = new Map<string, CandidateNode>();
  #targets = new Map<string, MutationTarget>();
  /** Per-target fork dedup: targetId -> Set of "delta:ruleId:line:column" keys */
  #forkDedup = new Map<string, Set<string>>();
  /** Per-target lateral fork count: targetId -> number of lateral forks created */
  #lateralForkCounts = new Map<string, number>();
  #superNodes: SuperNode[] = [];
  #rng: Rng;
  #lateralForkBudget: number;
  #nextCandidateId = 0;
  #nextTargetId = 0;

  constructor(rng: Rng, lateralForkBudget: number = 0) {
    this.#rng = rng;
    this.#lateralForkBudget = lateralForkBudget;
  }

  #generateCandidateId(): string {
    return `candidate-${this.#nextCandidateId++}`;
  }

  #generateTargetId(): string {
    return `target-${this.#nextTargetId++}`;
  }

  /** Initialize the pool with the genesis candidate. */
  init(
    source: string,
    score: number,
    assemblyData: { assembly: string; assemblyDiff: string; breakdown: DiffBreakdown },
  ): { candidate: CandidateNode; target: MutationTarget } {
    const candidate: CandidateNode = {
      id: this.#generateCandidateId(),
      source,
      score,
      iteration: 0,
      timestamp: Date.now(),
      mutationTargetId: '', // set below
      origin: 'genesis',
      assembly: assemblyData.assembly,
      assemblyDiff: assemblyData.assemblyDiff,
      breakdown: assemblyData.breakdown,
    };

    const target: MutationTarget = {
      id: this.#generateTargetId(),
      candidateId: candidate.id,
      weight: 1,
      enabled: true,
      attempts: 0,
      attemptsWithoutFork: 0,
      createdAt: Date.now(),
      lastImprovedAtIteration: null,
    };

    candidate.mutationTargetId = target.id;
    this.#candidates.set(candidate.id, candidate);
    this.#targets.set(target.id, target);
    this.#forkDedup.set(target.id, new Set());

    return { candidate, target };
  }

  /**
   * Select a MutationTarget for mutation.
   * Weighted proportional random: probability of selecting target i = weight_i / sum(weights).
   */
  select(): MutationTarget {
    const active = this.getActiveTargets();
    if (active.length === 0) {
      throw new Error('No active mutation targets — call init() first');
    }
    if (active.length === 1) {
      return active[0]!;
    }

    const weights = active.map((t) => t.weight);
    const index = this.#rng.weightedIndex(weights);
    return active[index]!;
  }

  /**
   * Report a mutation result.
   *
   * If the score improved and the fork dedup key is new, forks:
   * creates a new CandidateNode and MutationTarget.
   * The parent target is unchanged — it keeps exploring from the same candidate.
   */
  report(report: MutationReport, iteration: number): { forked?: ForkResult } {
    const target = this.#targets.get(report.mutationTargetId);
    if (!target) {
      return {};
    }

    target.attempts++;
    target.attemptsWithoutFork++;

    const head = this.#candidates.get(target.candidateId);
    if (!head) {
      return {};
    }

    // Check for improvement or lateral move
    const isImprovement = report.score < head.score;
    const isLateral = report.score === head.score;

    if (!isImprovement && !isLateral) {
      return {}; // score got worse
    }

    if (isLateral) {
      // Lateral forks: same score, different code. Only allowed if budget permits.
      if (this.#lateralForkBudget <= 0) {
        return {};
      }
      const lateralCount = this.#lateralForkCounts.get(target.id) ?? 0;
      if (lateralCount >= this.#lateralForkBudget) {
        return {};
      }
    }

    // Check fork dedup
    const delta = head.score - report.score;
    const key = `${delta}:${report.ruleId}:${report.location.line}:${report.location.column}`;
    const dedupSet = this.#forkDedup.get(target.id)!;

    if (dedupSet.has(key)) {
      return {}; // duplicate fork, skip
    }

    dedupSet.add(key);

    // All checks passed — now safe to consume a lateral budget slot.
    if (isLateral) {
      this.#lateralForkCounts.set(target.id, (this.#lateralForkCounts.get(target.id) ?? 0) + 1);
    }

    // Fork: create new candidate and new mutation target
    const candidate: CandidateNode = {
      id: this.#generateCandidateId(),
      source: report.source,
      score: report.score,
      iteration,
      timestamp: Date.now(),
      mutationTargetId: '', // set below
      parentId: head.id,
      origin: 'organic',
      ruleId: report.ruleId,
      location: report.location,
      assembly: report.assembly,
      assemblyDiff: report.assemblyDiff,
      breakdown: report.breakdown,
    };

    const newTarget: MutationTarget = {
      id: this.#generateTargetId(),
      candidateId: candidate.id,
      weight: 1,
      enabled: true,
      attempts: 0,
      attemptsWithoutFork: 0,
      createdAt: Date.now(),
      lastImprovedAtIteration: null,
    };

    candidate.mutationTargetId = newTarget.id;
    this.#candidates.set(candidate.id, candidate);
    this.#targets.set(newTarget.id, newTarget);
    this.#forkDedup.set(newTarget.id, new Set());

    target.lastImprovedAtIteration = iteration;
    target.attemptsWithoutFork = 0;
    return { forked: { candidate, mutationTarget: newTarget } };
  }

  /** Record a compilation failure for a target. */
  recordFailure(mutationTargetId: string): void {
    const target = this.#targets.get(mutationTargetId);
    if (target) {
      target.attempts++;
      target.attemptsWithoutFork++;
    }
  }

  /**
   * Inject external code as a new candidate and mutation target.
   */
  inject(
    source: string,
    score: number,
    options: {
      assembly: string;
      assemblyDiff: string;
      breakdown: DiffBreakdown;
      label?: string;
    },
  ): { candidate: CandidateNode; target: MutationTarget } {
    const candidate: CandidateNode = {
      id: this.#generateCandidateId(),
      source,
      score,
      iteration: 0,
      timestamp: Date.now(),
      mutationTargetId: '', // set below
      origin: 'external',
      externalLabel: options.label,
      assembly: options.assembly,
      assemblyDiff: options.assemblyDiff,
      breakdown: options.breakdown,
    };

    const target: MutationTarget = {
      id: this.#generateTargetId(),
      candidateId: candidate.id,
      weight: 1,
      enabled: true,
      attempts: 0,
      attemptsWithoutFork: 0,
      createdAt: Date.now(),
      lastImprovedAtIteration: null,
    };

    candidate.mutationTargetId = target.id;
    this.#candidates.set(candidate.id, candidate);
    this.#targets.set(target.id, target);
    this.#forkDedup.set(target.id, new Set());

    return { candidate, target };
  }

  // -------------------------------------------------------------------------
  // Target management
  // -------------------------------------------------------------------------

  /** Disable a mutation target (removed from scheduling, graph preserved). Returns false if not found. */
  disable(mutationTargetId: string): boolean {
    const target = this.#targets.get(mutationTargetId);
    if (!target) {
      return false;
    }
    target.enabled = false;
    return true;
  }

  /** Re-enable a disabled mutation target. Returns false if not found. */
  enable(mutationTargetId: string): boolean {
    const target = this.#targets.get(mutationTargetId);
    if (!target) {
      return false;
    }
    target.enabled = true;
    return true;
  }

  /** Set the weight of a mutation target. Returns false if not found. */
  setWeight(mutationTargetId: string, weight: number): boolean {
    const target = this.#targets.get(mutationTargetId);
    if (!target) {
      return false;
    }
    target.weight = Math.max(0, weight);
    return true;
  }

  /** Check whether a mutation target exists. */
  hasTarget(mutationTargetId: string): boolean {
    return this.#targets.has(mutationTargetId);
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  /** Get the global best (lowest score) candidate. */
  getBest(): CandidateNode {
    let best: CandidateNode | null = null;
    for (const candidate of this.#candidates.values()) {
      if (!best || candidate.score < best.score) {
        best = candidate;
      }
    }
    if (!best) {
      throw new Error('Pool is empty');
    }
    return best;
  }

  /** Get a candidate by ID. */
  getCandidate(id: string): CandidateNode | undefined {
    return this.#candidates.get(id);
  }

  /** Get all candidates. */
  getAllCandidates(): CandidateNode[] {
    return [...this.#candidates.values()];
  }

  /** Get a mutation target by ID. */
  getTarget(id: string): MutationTarget | undefined {
    return this.#targets.get(id);
  }

  /** Get all mutation targets. */
  getAllTargets(): MutationTarget[] {
    return [...this.#targets.values()];
  }

  /** Get all enabled mutation targets. */
  getActiveTargets(): MutationTarget[] {
    return [...this.#targets.values()].filter((t) => t.enabled);
  }

  /** Get pool statistics. */
  getStats(): PoolStats {
    const targets = this.getAllTargets();
    const active = targets.filter((t) => t.enabled);
    const best = this.#candidates.size > 0 ? this.getBest() : null;
    return {
      targetCount: targets.length,
      activeTargetCount: active.length,
      candidateCount: this.#candidates.size,
      bestScore: best?.score ?? Infinity,
      totalAttempts: targets.reduce((sum, t) => sum + t.attempts, 0),
      targets: targets.map((t) => this.#toTargetSummary(t)),
    };
  }

  // -------------------------------------------------------------------------
  // Graph summarization (compaction)
  // -------------------------------------------------------------------------

  /** Get supernodes created by previous summarize() calls. */
  getSuperNodes(): SuperNode[] {
    return this.#superNodes;
  }

  /**
   * Summarize dead-end subtrees into lightweight supernodes.
   *
   * Handles the forest case (multiple roots from injections):
   * - Dead branches off active lineages → supernode with parentId = branch root
   * - Entire dead trees (pruned injections) → supernode with parentId = undefined
   *
   * For branches off active lineages, the branch root (depth-0) is kept as a
   * real CandidateNode. The supernode summarizes depth-1+ candidates.
   * For entire dead trees, the supernode summarizes everything including the root.
   */
  summarize(): SummarizeResult {
    // 1. Compute reachable set: walk from every active target to root.
    const reachable = new Set<string>();
    for (const target of this.#targets.values()) {
      if (!target.enabled) {
        continue;
      }
      let current = this.#candidates.get(target.candidateId);
      while (current && !reachable.has(current.id)) {
        reachable.add(current.id);
        current = current.parentId ? this.#candidates.get(current.parentId) : undefined;
      }
    }

    // 2. Build children index: parentId → children.
    const childrenOf = new Map<string, CandidateNode[]>();
    for (const c of this.#candidates.values()) {
      if (c.parentId) {
        let arr = childrenOf.get(c.parentId);
        if (!arr) {
          arr = [];
          childrenOf.set(c.parentId, arr);
        }
        arr.push(c);
      }
    }

    // 3a. Dead branch roots: reachable candidates with unreachable children.
    const branchRoots: CandidateNode[] = [];
    for (const candidateId of reachable) {
      const children = childrenOf.get(candidateId) ?? [];
      for (const child of children) {
        if (!reachable.has(child.id)) {
          branchRoots.push(child);
        }
      }
    }

    // 3b. Unreachable root trees: root candidates not in the reachable set.
    const deadRoots: CandidateNode[] = [];
    for (const c of this.#candidates.values()) {
      if (!c.parentId && !reachable.has(c.id)) {
        deadRoots.push(c);
      }
    }

    const newSuperNodes: SuperNode[] = [];
    const toDelete: string[] = []; // candidate IDs to remove
    const removedTargetIds: string[] = [];

    // 4 + 5a. Process dead branch roots (off active lineages).
    // Include the branch root (depth-0) in the supernode so its memory is freed.
    // The supernode's parentId points to the branch root's reachable parent.
    for (const root of branchRoots) {
      const subtree: CandidateNode[] = [];
      const queue = childrenOf.get(root.id) ?? [];
      while (queue.length > 0) {
        const node = queue.shift()!;
        subtree.push(node);
        const nodeChildren = childrenOf.get(node.id);
        if (nodeChildren) {
          queue.push(...nodeChildren);
        }
      }

      const allCandidates = [root, ...subtree];
      const superNode = this.#buildSuperNode(`supernode-${root.id}`, root.parentId, allCandidates);
      newSuperNodes.push(superNode);

      for (const c of allCandidates) {
        toDelete.push(c.id);
      }
    }

    // 5b. Process entire dead trees (from pruned injections).
    for (const root of deadRoots) {
      const entireTree: CandidateNode[] = [root];
      const queue = childrenOf.get(root.id) ?? [];
      while (queue.length > 0) {
        const node = queue.shift()!;
        entireTree.push(node);
        const nodeChildren = childrenOf.get(node.id);
        if (nodeChildren) {
          queue.push(...nodeChildren);
        }
      }

      const superNode = this.#buildSuperNode(`supernode-root-${root.id}`, undefined, entireTree);
      newSuperNodes.push(superNode);

      for (const c of entireTree) {
        toDelete.push(c.id);
      }
    }

    // 6 + 7. Delete summarized candidates and their associated targets/dedup/lateral.
    for (const candidateId of toDelete) {
      const candidate = this.#candidates.get(candidateId);
      if (candidate) {
        const targetId = candidate.mutationTargetId;
        this.#targets.delete(targetId);
        this.#forkDedup.delete(targetId);
        this.#lateralForkCounts.delete(targetId);
        removedTargetIds.push(targetId);
      }
      this.#candidates.delete(candidateId);
    }

    this.#superNodes.push(...newSuperNodes);

    return { removed: toDelete.length, superNodes: newSuperNodes, removedTargetIds };
  }

  #buildSuperNode(id: string, parentId: string | undefined, candidates: CandidateNode[]): SuperNode {
    let bestScore = Infinity;
    let worstScore = -Infinity;
    let bestSource = '';
    const rules = new Set<string>();

    for (const c of candidates) {
      if (c.score < bestScore) {
        bestScore = c.score;
        bestSource = c.source;
      }
      if (c.score > worstScore) {
        worstScore = c.score;
      }
      if (c.ruleId) {
        rules.add(c.ruleId);
      }
    }

    return {
      id,
      parentId,
      summarizedCount: candidates.length,
      bestScore,
      worstScore,
      rules: [...rules].sort(),
      bestSource,
    };
  }

  #toTargetSummary(target: MutationTarget): MutationTargetSummary {
    const candidate = this.#candidates.get(target.candidateId);
    return {
      id: target.id,
      candidateId: target.candidateId,
      score: candidate?.score ?? Infinity,
      weight: target.weight,
      enabled: target.enabled,
      attempts: target.attempts,
    };
  }
}

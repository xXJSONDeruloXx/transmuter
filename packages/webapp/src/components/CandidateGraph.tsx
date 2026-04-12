import { computeCollapsedGraph } from '@core/session/collapsed-graph.js';
import dagre from '@dagrejs/dagre';
import {
  Background,
  Controls,
  type Edge,
  Handle,
  MiniMap,
  type Node,
  type NodeProps,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import type { CandidateNode, CleanupReportData, MutationTarget, SuperNode } from '../types';
import { CodeBlock } from './CodeBlock';

interface CandidateGraphProps {
  candidates: CandidateNode[];
  mutationTargets: MutationTarget[];
  superNodes?: SuperNode[];
  /** Source language for syntax highlighting (default: 'c') */
  sourceLanguage?: 'c' | 'cpp' | 'pascal';
  /** Cleanup report data (if --cleanup was used) */
  cleanup?: CleanupReportData;
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

function computeWinningLineage(candidates: CandidateNode[]): Set<string> {
  if (candidates.length === 0) {
    return new Set();
  }
  const candidateMap = new Map(candidates.map((c) => [c.id, c]));
  let best: CandidateNode = candidates[0]!;
  for (const c of candidates) {
    if (c.score < best.score) {
      best = c;
    }
  }
  const lineageIds = new Set<string>();
  let current: CandidateNode | undefined = best;
  while (current) {
    lineageIds.add(current.id);
    current = current.parentId ? candidateMap.get(current.parentId) : undefined;
  }
  return lineageIds;
}

// ---------------------------------------------------------------------------
// Full graph layout (existing behavior)
// ---------------------------------------------------------------------------

function layoutFullGraph(candidates: CandidateNode[]) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const c of candidates) {
    g.setNode(c.id, { width: 200, height: 60 });
  }
  for (const c of candidates) {
    if (c.parentId) {
      g.setEdge(c.parentId, c.id);
    }
  }

  dagre.layout(g);

  const lineageIds = computeWinningLineage(candidates);

  const nodes: Node[] = candidates.map((c) => {
    const pos = g.node(c.id);
    return {
      id: c.id,
      type: 'candidate',
      position: { x: (pos?.x ?? 0) - 100, y: (pos?.y ?? 0) - 30 },
      data: c as unknown as Record<string, unknown>,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    };
  });

  const edges: Edge[] = candidates
    .filter((c) => c.parentId)
    .map((c) => {
      const parent = candidates.find((p) => p.id === c.parentId);
      const delta = parent ? parent.score - c.score : 0;
      const onLineage = lineageIds.has(c.id) && lineageIds.has(c.parentId!);
      return {
        id: `${c.parentId}-${c.id}`,
        source: c.parentId!,
        target: c.id,
        type: 'smoothstep',
        animated: false,
        label: `${c.ruleId ?? 'external'} (Δ${delta})`,
        style: { stroke: onLineage ? '#2dd4bf' : '#64748b', strokeWidth: onLineage ? 2.5 : 1 },
        labelStyle: { fontSize: 10, fill: '#94a3b8' },
        labelBgStyle: { fill: '#1e293b', fillOpacity: 0.85 },
        labelBgPadding: [4, 2] as [number, number],
      };
    });

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Collapsed graph layout
// ---------------------------------------------------------------------------

interface ClusterData {
  clusterId: string;
  parentSpineId: string;
  candidateCount: number;
  bestScore: number;
  worstScore: number;
  rules: string[];
  candidates: CandidateNode[];
}

function layoutCollapsedGraph(candidates: CandidateNode[], expandedClusters: Set<string>, superNodes?: SuperNode[]) {
  const collapsed = computeCollapsedGraph(candidates, superNodes);

  if (collapsed.spine.length === 0) {
    return { nodes: [] as Node[], edges: [] as Edge[], collapsed };
  }

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 100 });
  g.setDefaultEdgeLabel(() => ({}));

  // Track which candidates are shown expanded (so we can build their edges)
  const expandedCandidateIds = new Set<string>();

  // Add spine nodes
  for (const sn of collapsed.spine) {
    g.setNode(sn.candidate.id, { width: 220, height: 70 });
  }

  // Add spine edges
  for (let i = 1; i < collapsed.spine.length; i++) {
    const parent = collapsed.spine[i - 1]!.candidate;
    const child = collapsed.spine[i]!.candidate;
    g.setEdge(parent.id, child.id);
  }

  // Add cluster nodes (or expanded candidates)
  for (const sn of collapsed.spine) {
    if (!sn.cluster) {
      continue;
    }
    const clusterId = sn.cluster.id;

    if (expandedClusters.has(clusterId)) {
      // Expanded: add all cluster candidates as regular nodes
      for (const c of sn.cluster.candidates) {
        g.setNode(c.id, { width: 200, height: 60 });
        expandedCandidateIds.add(c.id);
      }
      // Add edges for expanded candidates
      for (const c of sn.cluster.candidates) {
        if (c.parentId) {
          const parentExists = g.hasNode(c.parentId);
          if (parentExists) {
            g.setEdge(c.parentId, c.id);
          }
        }
      }
    } else {
      // Collapsed: add a single cluster summary node
      g.setNode(clusterId, { width: 180, height: 50 });
      g.setEdge(sn.candidate.id, clusterId);
    }
  }

  dagre.layout(g);

  // Build ReactFlow nodes
  const nodes: Node[] = [];

  for (const sn of collapsed.spine) {
    const pos = g.node(sn.candidate.id);
    nodes.push({
      id: sn.candidate.id,
      type: 'candidate',
      position: { x: (pos?.x ?? 0) - 110, y: (pos?.y ?? 0) - 35 },
      data: { ...sn.candidate, _isSpine: true } as unknown as Record<string, unknown>,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    });
  }

  for (const sn of collapsed.spine) {
    if (!sn.cluster) {
      continue;
    }

    if (expandedClusters.has(sn.cluster.id)) {
      for (const c of sn.cluster.candidates) {
        const pos = g.node(c.id);
        nodes.push({
          id: c.id,
          type: 'candidate',
          position: { x: (pos?.x ?? 0) - 100, y: (pos?.y ?? 0) - 30 },
          data: c as unknown as Record<string, unknown>,
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
        });
      }
    } else {
      const pos = g.node(sn.cluster.id);
      nodes.push({
        id: sn.cluster.id,
        type: 'cluster',
        position: { x: (pos?.x ?? 0) - 90, y: (pos?.y ?? 0) - 25 },
        data: {
          clusterId: sn.cluster.id,
          parentSpineId: sn.candidate.id,
          candidateCount: sn.cluster.candidateCount,
          bestScore: sn.cluster.bestScore,
          worstScore: sn.cluster.worstScore,
          rules: sn.cluster.rules,
          candidates: sn.cluster.candidates,
        } satisfies ClusterData as unknown as Record<string, unknown>,
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
      });
    }
  }

  // Build edges
  const edges: Edge[] = [];

  // Spine edges
  for (let i = 1; i < collapsed.spine.length; i++) {
    const parent = collapsed.spine[i - 1]!.candidate;
    const child = collapsed.spine[i]!.candidate;
    const delta = parent.score - child.score;
    edges.push({
      id: `spine-${parent.id}-${child.id}`,
      source: parent.id,
      target: child.id,
      type: 'smoothstep',
      animated: false,
      label: `${child.ruleId ?? 'external'} (Δ${delta})`,
      style: { stroke: '#2dd4bf', strokeWidth: 2.5 },
      labelStyle: { fontSize: 10, fill: '#94a3b8' },
      labelBgStyle: { fill: '#1e293b', fillOpacity: 0.85 },
      labelBgPadding: [4, 2] as [number, number],
    });
  }

  // Cluster/expanded edges
  for (const sn of collapsed.spine) {
    if (!sn.cluster) {
      continue;
    }

    if (expandedClusters.has(sn.cluster.id)) {
      // Edges for expanded cluster candidates
      const spineId = sn.candidate.id;
      for (const c of sn.cluster.candidates) {
        if (!c.parentId) {
          continue;
        }
        const parentOnGraph = g.hasNode(c.parentId);
        if (!parentOnGraph) {
          continue;
        }
        const parentCandidate = candidates.find((p) => p.id === c.parentId);
        const delta = parentCandidate ? parentCandidate.score - c.score : 0;
        const isBranchRoot = c.parentId === spineId;
        edges.push({
          id: `exp-${c.parentId}-${c.id}`,
          source: c.parentId,
          target: c.id,
          type: 'smoothstep',
          animated: false,
          label: isBranchRoot
            ? `${c.ruleId ?? 'external'} (Δ${delta}) · collapse`
            : `${c.ruleId ?? 'external'} (Δ${delta})`,
          data: isBranchRoot ? { clusterId: sn.cluster!.id } : undefined,
          style: isBranchRoot
            ? { stroke: '#475569', strokeWidth: 1, strokeDasharray: '4 2' }
            : { stroke: '#64748b', strokeWidth: 1 },
          labelStyle: {
            fontSize: 10,
            fill: '#94a3b8',
            cursor: isBranchRoot ? 'pointer' : 'default',
          },
          labelBgStyle: { fill: '#1e293b', fillOpacity: 0.85 },
          labelBgPadding: [4, 2] as [number, number],
        });
      }
    } else {
      // Edge from spine to collapsed cluster
      edges.push({
        id: `cluster-edge-${sn.cluster.id}`,
        source: sn.candidate.id,
        target: sn.cluster.id,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#475569', strokeWidth: 1, strokeDasharray: '4 2' },
      });
    }
  }

  return { nodes, edges, collapsed };
}

// ---------------------------------------------------------------------------
// Custom nodes
// ---------------------------------------------------------------------------

function CandidateNodeComponent({ data, selected }: NodeProps<Node<any>>) {
  const c = data as unknown as CandidateNode & { _isSpine?: boolean };
  const isGenesis = c.origin === 'genesis';
  const isExternal = c.origin === 'external';
  const isSpine = c._isSpine;

  const borderColor = selected
    ? 'border-teal-400 shadow-lg shadow-teal-500/30'
    : isSpine
      ? 'border-teal-500/60'
      : isGenesis
        ? 'border-slate-600'
        : isExternal
          ? 'border-emerald-500/60'
          : 'border-slate-600';

  return (
    <div
      className={`bg-slate-800/90 backdrop-blur-sm rounded-lg border-2 ${borderColor} px-3 py-2 min-w-[180px] cursor-pointer transition-all hover:border-teal-400/70`}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-500 !w-2 !h-2" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold font-mono text-slate-100">{c.score}</span>
        {isGenesis && (
          <span className="text-[10px] px-1.5 py-0.5 bg-slate-700/80 text-slate-400 rounded border border-slate-600">
            genesis
          </span>
        )}
        {isExternal && (
          <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/15 text-emerald-300 rounded border border-emerald-500/30">
            external
          </span>
        )}
      </div>
      {c.ruleId && <p className="text-[10px] text-slate-400 mt-0.5 truncate font-mono">{c.ruleId}</p>}
      {c.externalLabel && <p className="text-[10px] text-emerald-300 mt-0.5 truncate font-mono">{c.externalLabel}</p>}
      <Handle type="source" position={Position.Bottom} className="!bg-slate-500 !w-2 !h-2" />
    </div>
  );
}

function ClusterNodeComponent({ data }: NodeProps<Node<any>>) {
  const cluster = data as unknown as ClusterData;

  return (
    <div className="bg-slate-800/40 backdrop-blur-sm rounded-lg border border-dashed border-slate-600 px-3 py-2 min-w-[160px] cursor-pointer hover:border-teal-400/70 hover:bg-slate-800/70 transition-all">
      <Handle type="target" position={Position.Top} className="!bg-slate-600 !w-2 !h-2" />
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold font-mono text-slate-300">{cluster.candidateCount}</span>
        <span className="text-[10px] text-slate-500">{cluster.candidateCount === 1 ? 'candidate' : 'candidates'}</span>
      </div>
      <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
        best {cluster.bestScore}
        {cluster.worstScore !== cluster.bestScore && <span> · worst {cluster.worstScore}</span>}
      </div>
      {cluster.rules.length > 0 && (
        <p className="text-[10px] text-slate-600 mt-0.5 truncate font-mono">
          {cluster.rules.length <= 3 ? cluster.rules.join(', ') : `${cluster.rules.length} rules`}
        </p>
      )}
      <p className="text-[10px] text-teal-400/70 mt-1 italic">click to expand</p>
      <Handle type="source" position={Position.Bottom} className="!bg-slate-600 !w-2 !h-2" />
    </div>
  );
}

interface SuperNodeData {
  superNode: SuperNode;
}

function SuperNodeComponent({ data }: NodeProps<Node<any>>) {
  const sn = (data as unknown as SuperNodeData).superNode;

  return (
    <div className="bg-slate-900/40 rounded-lg border border-dashed border-slate-700 px-3 py-2 min-w-[160px] cursor-pointer hover:border-slate-500 transition-colors">
      <Handle type="target" position={Position.Top} className="!bg-slate-700 !w-2 !h-2" />
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold font-mono text-slate-400">{sn.summarizedCount}</span>
        <span className="text-[10px] text-slate-600">pruned</span>
      </div>
      <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
        best {sn.bestScore}
        {sn.worstScore !== sn.bestScore && <span> · worst {sn.worstScore}</span>}
      </div>
      {sn.rules.length > 0 && (
        <p className="text-[10px] text-slate-600 mt-0.5 truncate font-mono">
          {sn.rules.length <= 3 ? sn.rules.join(', ') : `${sn.rules.length} rules`}
        </p>
      )}
    </div>
  );
}

function CleanupDividerComponent(_props: NodeProps<Node<any>>) {
  return (
    <div className="flex items-center gap-3 min-w-[300px]">
      <div className="flex-1 border-t border-dashed border-emerald-500/50" />
      <span className="text-[10px] font-semibold text-emerald-300 uppercase tracking-wider whitespace-nowrap">
        cleanup
      </span>
      <div className="flex-1 border-t border-dashed border-emerald-500/50" />
    </div>
  );
}

interface CleanupNodeData {
  label: string;
  source: string;
  smellTotal: number;
  detail: string;
  phase: 'canonicalization' | 'smell-match';
}

function CleanupNodeComponent({ data, selected }: NodeProps<Node<any>>) {
  const d = data as unknown as CleanupNodeData;
  const borderColor = selected ? 'border-emerald-300 shadow-lg shadow-emerald-500/30' : 'border-emerald-700';
  return (
    <div
      className={`bg-slate-800/90 backdrop-blur-sm rounded-lg border-2 ${borderColor} px-3 py-2 min-w-[200px] cursor-pointer transition-all hover:border-emerald-400/70`}
    >
      <Handle type="target" position={Position.Top} className="!bg-emerald-500 !w-2 !h-2" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold font-mono text-emerald-300">smell {d.smellTotal}</span>
        <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/15 text-emerald-300 rounded border border-emerald-500/30">
          {d.label}
        </span>
      </div>
      <p className="text-[10px] text-slate-400 mt-0.5">{d.detail}</p>
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-500 !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = {
  candidate: CandidateNodeComponent,
  cluster: ClusterNodeComponent,
  supernode: SuperNodeComponent,
  'cleanup-divider': CleanupDividerComponent,
  'cleanup-node': CleanupNodeComponent,
};

// ---------------------------------------------------------------------------
// Diff computation
// ---------------------------------------------------------------------------

function computeUnifiedDiff(before: string, after: string): string {
  const a = before.split('\n');
  const b = after.split('\n');

  const m = a.length;
  const n = b.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }

  // Backtrack to produce diff ops
  type DiffOp = { type: 'keep' | 'remove' | 'add'; line: string };
  const ops: DiffOp[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({ type: 'keep', line: a[i - 1]! });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      ops.push({ type: 'add', line: b[j - 1]! });
      j--;
    } else {
      ops.push({ type: 'remove', line: a[i - 1]! });
      i--;
    }
  }

  ops.reverse();

  // Generate unified diff with context
  const result: string[] = ['--- a', '+++ b'];

  let idx = 0;
  while (idx < ops.length) {
    // Skip to next change
    while (idx < ops.length && ops[idx]!.type === 'keep') {
      idx++;
    }
    if (idx >= ops.length) {
      break;
    }

    const contextStart = Math.max(0, idx - 3);
    const hunkOps: DiffOp[] = [];

    // Collect context before
    for (let k = contextStart; k < idx; k++) {
      hunkOps.push(ops[k]!);
    }

    // Collect changes and interleaved context
    while (idx < ops.length) {
      const op = ops[idx]!;
      if (op.type !== 'keep') {
        hunkOps.push(op);
        idx++;
      } else {
        // Check if there's another change within 3 lines
        let nextChange = -1;
        for (let k = idx + 1; k < Math.min(idx + 4, ops.length); k++) {
          if (ops[k]!.type !== 'keep') {
            nextChange = k;
            break;
          }
        }
        if (nextChange >= 0) {
          for (let k = idx; k <= nextChange; k++) {
            hunkOps.push(ops[k]!);
          }
          idx = nextChange + 1;
        } else {
          for (let k = idx; k < Math.min(idx + 3, ops.length); k++) {
            hunkOps.push(ops[k]!);
          }
          idx = Math.min(idx + 3, ops.length);
          break;
        }
      }
    }

    result.push('@@ @@');
    for (const op of hunkOps) {
      switch (op.type) {
        case 'keep':
          result.push(` ${op.line}`);
          break;
        case 'add':
          result.push(`+${op.line}`);
          break;
        case 'remove':
          result.push(`-${op.line}`);
          break;
      }
    }
  }

  if (result.length <= 2) {
    return 'No differences.';
  }

  return result.join('\n');
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

type DetailTab = 'source' | 'source-diff' | 'assembly' | 'asm-diff';

function DetailPanel({
  candidate,
  candidates,
  mutationTargets,
  sourceLanguage,
  onClose,
}: {
  candidate: CandidateNode;
  candidates: CandidateNode[];
  mutationTargets: MutationTarget[];
  sourceLanguage: 'c' | 'cpp' | 'pascal';
  onClose: () => void;
}) {
  const c = candidate;
  const parent = c.parentId ? candidates.find((p) => p.id === c.parentId) : null;
  const children = candidates.filter((ch) => ch.parentId === c.id);
  const target = mutationTargets.find((t) => t.candidateId === c.id);

  // Find the mutation target this candidate belongs to (for "Iterations" card)
  const ownerTarget = mutationTargets.find((t) => t.id === c.mutationTargetId);

  const [activeTab, setActiveTab] = useState<DetailTab>('source');

  // For diff comparison: default to genesis candidate
  const genesis = candidates.find((gc) => gc.origin === 'genesis');
  const [diffTargetId, setDiffTargetId] = useState<string>(genesis?.id ?? candidates[0]?.id ?? '');

  const diffTarget = candidates.find((dc) => dc.id === diffTargetId);
  const diffText = useMemo(() => {
    if (!diffTarget) {
      return 'No candidate selected for comparison.';
    }
    if (diffTarget.id === c.id) {
      return 'Same candidate — no differences.';
    }
    return computeUnifiedDiff(diffTarget.source, c.source);
  }, [diffTarget, c]);

  return (
    <div className="absolute right-0 top-0 bottom-0 w-96 bg-slate-900/95 backdrop-blur-sm border-l border-slate-700 overflow-y-auto z-50 p-4 rounded-r-xl">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-bold font-mono text-teal-300 truncate">{c.id}</h3>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-100 text-lg w-7 h-7 flex items-center justify-center rounded hover:bg-slate-800 transition-colors flex-shrink-0"
        >
          &times;
        </button>
      </div>

      <div className="space-y-3 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-800/60 rounded-lg p-2.5 border border-slate-700/50">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Score</span>
            <p className={`font-bold font-mono ${c.score === 0 ? 'text-emerald-400' : 'text-slate-100'}`}>{c.score}</p>
          </div>
          <div className="bg-slate-800/60 rounded-lg p-2.5 border border-slate-700/50">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Origin</span>
            <p className="text-slate-100">{c.origin}</p>
          </div>
          <div className="bg-slate-800/60 rounded-lg p-2.5 border border-slate-700/50">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Created at iteration</span>
            <p className="text-slate-100 font-mono">{c.iteration.toLocaleString()}</p>
          </div>
          {ownerTarget && (
            <div className="bg-slate-800/60 rounded-lg p-2.5 border border-slate-700/50">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Iterations</span>
              <p className="text-slate-100 font-mono">{ownerTarget.attempts.toLocaleString()}</p>
            </div>
          )}
          {c.ruleId && (
            <div className="bg-slate-800/60 rounded-lg p-2.5 border border-slate-700/50">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Rule</span>
              <p className="text-teal-300 font-mono truncate">{c.ruleId}</p>
            </div>
          )}
          {c.location && (
            <div className="bg-slate-800/60 rounded-lg p-2.5 border border-slate-700/50">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Location</span>
              <p className="text-slate-100 font-mono">
                L{c.location.line}:C{c.location.column}
              </p>
            </div>
          )}
        </div>

        {parent && (
          <div className="bg-slate-800/60 rounded-lg p-2.5 border border-slate-700/50">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Parent</span>
            <p className="text-slate-300 font-mono text-[10px] truncate">
              {parent.id} (score {parent.score})
            </p>
          </div>
        )}

        {target && (
          <div className="bg-slate-800/60 rounded-lg p-2.5 border border-slate-700/50">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Mutation Target</span>
            <p className="text-slate-300 text-[10px]">
              {target.id} — weight: {target.weight}, attempts: {target.attempts.toLocaleString()},{' '}
              {target.enabled ? 'active' : 'disabled'}
            </p>
          </div>
        )}

        {children.length > 0 && (
          <div className="bg-slate-800/60 rounded-lg p-2.5 border border-slate-700/50">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Forks ({children.length})</span>
            {children.map((ch) => (
              <p key={ch.id} className="text-slate-300 font-mono text-[10px] truncate">
                → {ch.id} (score {ch.score}, {ch.ruleId ?? ch.origin})
              </p>
            ))}
          </div>
        )}

        {/* Source / Diff / Assembly / Objdiff tabs */}
        <div>
          <div className="flex border-b border-slate-700 mb-2 flex-wrap">
            {(['source', 'source-diff', 'assembly', 'asm-diff'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-teal-400 text-teal-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab === 'source'
                  ? 'Source'
                  : tab === 'source-diff'
                    ? 'Source Diff'
                    : tab === 'assembly'
                      ? 'Assembly'
                      : 'Assembly Diff'}
              </button>
            ))}
          </div>

          {activeTab === 'source' && <CodeBlock code={c.source} language={sourceLanguage} />}

          {activeTab === 'source-diff' && (
            <div>
              <div className="mb-2">
                <label className="text-slate-500 text-[10px] mr-1 uppercase tracking-wider">Compare against:</label>
                <select
                  value={diffTargetId}
                  onChange={(e) => setDiffTargetId(e.target.value)}
                  className="bg-slate-800 text-slate-300 text-[10px] rounded-md px-2 py-1 border border-slate-700 focus:outline-none focus:border-teal-400"
                >
                  {candidates.map((dc) => (
                    <option key={dc.id} value={dc.id}>
                      {dc.id} (score {dc.score}
                      {dc.origin === 'genesis' ? ', genesis' : ''})
                    </option>
                  ))}
                </select>
              </div>
              <CodeBlock code={diffText} language="diff" />
            </div>
          )}

          {activeTab === 'assembly' && <CodeBlock code={c.assembly} language="asm" />}

          {activeTab === 'asm-diff' && (
            <pre className="bg-slate-900/80 rounded-lg border border-slate-700/50 p-3 text-slate-300 overflow-x-auto whitespace-pre font-mono text-[10px] max-h-64 overflow-y-auto">
              {c.assemblyDiff.split('\n').map((line, i) => {
                const isDiff =
                  line.startsWith('Difference ') || line.startsWith('- Current:') || line.startsWith('- Target:');
                return (
                  <div key={i} className={isDiff ? 'text-amber-300' : 'text-slate-400'}>
                    {line}
                  </div>
                );
              })}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type ViewMode = 'collapsed' | 'full';

function appendCleanupNodes(
  nodes: Node[],
  edges: Edge[],
  candidates: CandidateNode[],
  cleanup: CleanupReportData,
): { nodes: Node[]; edges: Edge[] } {
  // Find the best candidate (score 0) as the cleanup anchor
  const best = candidates.reduce((a, b) => (a.score <= b.score ? a : b), candidates[0]!);
  if (!best || best.score !== 0) {
    return { nodes, edges };
  }

  // Find the y position of the best candidate to position cleanup nodes below it
  const bestNode = nodes.find((n) => n.id === best.id);
  const anchorY = bestNode ? bestNode.position.y + 70 : 0;
  const anchorX = bestNode ? bestNode.position.x : 0;

  const cleanupNodes: Node[] = [];
  const cleanupEdges: Edge[] = [];

  // Divider
  const dividerId = '__cleanup-divider__';
  cleanupNodes.push({
    id: dividerId,
    type: 'cleanup-divider',
    position: { x: anchorX - 50, y: anchorY + 40 },
    data: {},
    selectable: false,
    draggable: false,
  });

  cleanupEdges.push({
    id: `${best.id}-to-divider`,
    source: best.id,
    target: dividerId,
    type: 'smoothstep',
    style: { stroke: '#34d399', strokeWidth: 1, strokeDasharray: '6 3' },
  });

  let prevId = dividerId;
  let yOffset = anchorY + 100;

  // Phase 1 node (canonicalization)
  if (cleanup.canonicalization.totalApplied > 0) {
    const p1Id = '__cleanup-phase1__';
    const passNames = cleanup.canonicalization.passes.map((p) => `${p.name} (${p.applied})`).join(', ');
    cleanupNodes.push({
      id: p1Id,
      type: 'cleanup-node',
      position: { x: anchorX, y: yOffset },
      data: {
        label: 'Phase 1',
        source: '', // filled from cleanup data at selection time
        smellTotal:
          cleanup.smellAfter.total +
          (cleanup.smellPermutation?.improved ? cleanup.smellPermutation.smellAfter - cleanup.smellAfter.total : 0),
        detail: passNames,
        phase: 'canonicalization',
      } satisfies CleanupNodeData as unknown as Record<string, unknown>,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    });
    cleanupEdges.push({
      id: `divider-to-phase1`,
      source: prevId,
      target: p1Id,
      type: 'smoothstep',
      style: { stroke: '#34d399', strokeWidth: 1.5 },
      labelStyle: { fontSize: 10, fill: '#34d399' },
    });
    prevId = p1Id;
    yOffset += 90;
  }

  // Phase 2 node (smell match)
  if (cleanup.smellPermutation?.improved) {
    const p2Id = '__cleanup-phase2__';
    cleanupNodes.push({
      id: p2Id,
      type: 'cleanup-node',
      position: { x: anchorX, y: yOffset },
      data: {
        label: 'Phase 2',
        source: cleanup.sourceAfter,
        smellTotal: cleanup.smellAfter.total,
        detail: `${cleanup.smellPermutation.iterations.toLocaleString()} iters, smell ${cleanup.smellPermutation.smellBefore} → ${cleanup.smellPermutation.smellAfter}`,
        phase: 'smell-match',
      } satisfies CleanupNodeData as unknown as Record<string, unknown>,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    });
    cleanupEdges.push({
      id: `${prevId}-to-phase2`,
      source: prevId,
      target: p2Id,
      type: 'smoothstep',
      style: { stroke: '#34d399', strokeWidth: 1.5 },
    });
    yOffset += 90;
  }

  // Final result node (if there was any cleanup improvement at all)
  if (cleanup.smellBefore.total !== cleanup.smellAfter.total) {
    const finalId = '__cleanup-result__';
    cleanupNodes.push({
      id: finalId,
      type: 'cleanup-node',
      position: { x: anchorX, y: yOffset },
      data: {
        label: 'cleaned',
        source: cleanup.sourceAfter,
        smellTotal: cleanup.smellAfter.total,
        detail: `smell ${cleanup.smellBefore.total} → ${cleanup.smellAfter.total}`,
        phase: 'canonicalization',
      } satisfies CleanupNodeData as unknown as Record<string, unknown>,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    });
    cleanupEdges.push({
      id: `${prevId}-to-final`,
      source: prevId,
      target: finalId,
      type: 'smoothstep',
      style: { stroke: '#34d399', strokeWidth: 1.5 },
    });
  }

  return {
    nodes: [...nodes, ...cleanupNodes],
    edges: [...edges, ...cleanupEdges],
  };
}

function GraphInner({ candidates, mutationTargets, superNodes, sourceLanguage, cleanup }: CandidateGraphProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('collapsed');
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateNode | null>(null);
  const [selectedCleanupNode, setSelectedCleanupNode] = useState<CleanupNodeData | null>(null);

  const {
    nodes: layoutNodes,
    edges: layoutEdges,
    collapsed,
  } = useMemo(() => {
    let result;
    if (viewMode === 'full') {
      result = { ...layoutFullGraph(candidates), collapsed: undefined };
    } else {
      result = layoutCollapsedGraph(candidates, expandedClusters, superNodes);
    }
    // Append cleanup nodes if available
    if (cleanup && candidates.length > 0) {
      const appended = appendCleanupNodes(result.nodes, result.edges, candidates, cleanup);
      return { nodes: appended.nodes, edges: appended.edges, collapsed: result.collapsed };
    }
    return result;
  }, [candidates, viewMode, expandedClusters, cleanup]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges);

  useEffect(() => {
    setNodes(layoutNodes);
    setEdges(layoutEdges);
  }, [layoutNodes, layoutEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      // Cluster node: expand
      if (node.type === 'cluster') {
        const cluster = node.data as unknown as ClusterData;
        setExpandedClusters((prev) => {
          const next = new Set(prev);
          next.add(cluster.clusterId);
          return next;
        });
        return;
      }

      // Cleanup node: show source in detail panel
      if (node.type === 'cleanup-node') {
        const d = node.data as unknown as CleanupNodeData;
        setSelectedCleanupNode(d);
        setSelectedCandidate(null);
        return;
      }

      // Otherwise, select the candidate for the detail panel
      const c = candidates.find((c) => c.id === node.id);
      setSelectedCandidate(c ?? null);
      setSelectedCleanupNode(null);
    },
    [candidates],
  );

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    const clusterId = (edge.data as Record<string, unknown> | undefined)?.clusterId as string | undefined;
    if (clusterId) {
      setExpandedClusters((prev) => {
        const next = new Set(prev);
        next.delete(clusterId);
        return next;
      });
    }
  }, []);

  if (candidates.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6 text-center text-slate-400">
        No candidates yet.
      </div>
    );
  }

  const spineLength = collapsed?.spine.length ?? 0;
  const collapsedCount = collapsed?.collapsedCount ?? 0;

  return (
    <div
      className="relative bg-slate-800/30 rounded-xl border border-slate-700 overflow-hidden"
      style={{ height: '70vh' }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
      >
        <Background color="#334155" gap={20} />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            if (n.type === 'cluster') {
              return '#475569';
            }
            if (n.type === 'cleanup-node' || n.type === 'cleanup-divider') {
              return '#34d399';
            }
            const c = n.data as unknown as CandidateNode & { _isSpine?: boolean };
            if (c._isSpine) {
              return '#2dd4bf';
            }
            if (c.origin === 'genesis') {
              return '#cbd5e1';
            }
            if (c.origin === 'external') {
              return '#34d399';
            }
            return '#64748b';
          }}
          maskColor="rgba(15, 23, 42, 0.6)"
          style={{ background: '#0f172a' }}
        />
        <Panel position="top-left">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="bg-slate-900/80 backdrop-blur-sm rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 font-mono">
              <span className="text-teal-400 font-bold">{candidates.length}</span> candidates ·{' '}
              <span className="text-slate-200">{mutationTargets.length}</span> targets ·{' '}
              <span className="text-emerald-400">{mutationTargets.filter((t) => t.enabled).length}</span> active
            </div>
            <div className="bg-slate-900/80 backdrop-blur-sm rounded-lg border border-slate-700 flex overflow-hidden">
              <button
                onClick={() => {
                  setViewMode('collapsed');
                  setExpandedClusters(new Set());
                }}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === 'collapsed'
                    ? 'bg-teal-500/20 text-teal-300 border-r border-teal-500/30'
                    : 'text-slate-400 hover:text-slate-200 border-r border-slate-700'
                }`}
              >
                Spine
              </button>
              <button
                onClick={() => setViewMode('full')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === 'full' ? 'bg-teal-500/20 text-teal-300' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Full
              </button>
            </div>
            {viewMode === 'collapsed' && collapsed && (
              <div className="bg-slate-900/80 backdrop-blur-sm rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-500 font-mono">
                {spineLength} spine · {collapsedCount} collapsed
                {expandedClusters.size > 0 && ` · ${expandedClusters.size} expanded`}
              </div>
            )}
          </div>
        </Panel>
      </ReactFlow>

      {selectedCandidate && (
        <DetailPanel
          candidate={selectedCandidate}
          candidates={candidates}
          mutationTargets={mutationTargets}
          sourceLanguage={sourceLanguage ?? 'c'}
          onClose={() => setSelectedCandidate(null)}
        />
      )}

      {selectedCleanupNode && (
        <div className="absolute right-0 top-0 bottom-0 w-96 bg-slate-900/95 backdrop-blur-sm border-l border-slate-700 overflow-y-auto z-50 p-4 rounded-r-xl">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-emerald-300">Cleanup — {selectedCleanupNode.label}</h3>
            <button
              onClick={() => setSelectedCleanupNode(null)}
              className="text-slate-400 hover:text-slate-100 text-lg w-7 h-7 flex items-center justify-center rounded hover:bg-slate-800 transition-colors"
            >
              &times;
            </button>
          </div>
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-800/60 rounded-lg p-2.5 border border-slate-700/50">
                <span className="text-[10px] uppercase tracking-wider text-slate-500">Smell</span>
                <p className="font-bold font-mono text-emerald-300">{selectedCleanupNode.smellTotal}</p>
              </div>
              <div className="bg-slate-800/60 rounded-lg p-2.5 border border-slate-700/50">
                <span className="text-[10px] uppercase tracking-wider text-slate-500">Phase</span>
                <p className="text-slate-100">{selectedCleanupNode.phase}</p>
              </div>
            </div>
            <div className="bg-slate-800/60 rounded-lg p-2.5 border border-slate-700/50">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Detail</span>
              <p className="text-slate-300">{selectedCleanupNode.detail}</p>
            </div>
            {selectedCleanupNode.source && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Source</p>
                <CodeBlock code={selectedCleanupNode.source} language={sourceLanguage ?? 'c'} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function CandidateGraph(props: CandidateGraphProps): React.ReactElement {
  return (
    <ReactFlowProvider>
      <GraphInner {...props} />
    </ReactFlowProvider>
  );
}

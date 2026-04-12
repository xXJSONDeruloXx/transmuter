import React, { useMemo, useState } from 'react';

import { CandidateGraph } from './components/CandidateGraph';
import { Header } from './components/Header';
import { Icon, type IconName } from './components/Icon';
import { MergeTimeline } from './components/MergeTimeline';
import { RefinementSummary } from './components/RefinementSummary';
import { ResultViewer } from './components/ResultViewer';
import { RuleEffectiveness } from './components/RuleEffectiveness';
import { ViolationList } from './components/ViolationList';
import type { CandidateNode, MutationTarget, RefinementReport, SuperNode } from './types';

type Tab = 'overview' | 'violations' | 'graph' | 'rules' | 'merge' | 'result';

/**
 * Aggregate all candidates and targets from sub-sessions across violations.
 * Prefixes IDs with the violation ID to avoid collisions between sub-sessions.
 */
function aggregateGraph(report: RefinementReport): {
  candidates: CandidateNode[];
  mutationTargets: MutationTarget[];
  superNodes?: SuperNode[];
} {
  const candidates: CandidateNode[] = [];
  const mutationTargets: MutationTarget[] = [];
  const superNodes: SuperNode[] = [];

  for (const v of report.violations) {
    const sub = v.exploration?.subSession;
    if (!sub) {
      continue;
    }
    const prefix = `${v.id}/`;
    for (const c of sub.graph.candidates) {
      candidates.push({
        ...c,
        id: prefix + c.id,
        parentId: c.parentId ? prefix + c.parentId : undefined,
        mutationTargetId: prefix + c.mutationTargetId,
        externalLabel: c.origin === 'genesis' ? v.id : c.externalLabel,
      });
    }
    for (const t of sub.graph.mutationTargets) {
      mutationTargets.push({
        ...t,
        id: prefix + t.id,
        candidateId: prefix + t.candidateId,
      });
    }
    if (sub.graph.superNodes) {
      for (const sn of sub.graph.superNodes) {
        superNodes.push({
          ...sn,
          id: prefix + sn.id,
          parentId: sn.parentId ? prefix + sn.parentId : undefined,
        });
      }
    }
  }

  return { candidates, mutationTargets, ...(superNodes.length > 0 ? { superNodes } : {}) };
}

export function RefinementApp({ report }: { report: RefinementReport }): React.ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const graph = useMemo(() => aggregateGraph(report), [report]);

  const tabs: { id: Tab; label: string; icon: IconName; show: boolean }[] = [
    { id: 'overview', label: 'Overview', icon: 'document', show: true },
    {
      id: 'violations',
      label: `Violations (${report.violations.length})`,
      icon: 'alertTriangle',
      show: report.violations.length > 0,
    },
    {
      id: 'graph',
      label: `Graph (${graph.candidates.length})`,
      icon: 'gitBranch',
      show: graph.candidates.length > 0,
    },
    {
      id: 'rules',
      label: 'Rules',
      icon: 'rules',
      show: report.ruleStats.length > 0,
    },
    {
      id: 'merge',
      label: `Merge Log (${report.mergeLog.length})`,
      icon: 'collection',
      show: report.mergeLog.length > 0,
    },
    {
      id: 'result',
      label: 'Result',
      icon: 'checkCircle',
      show: report.finalResult.violationsFixed > 0,
    },
  ];

  return (
    <div className="min-h-screen">
      <div className="max-w-[1600px] mx-auto px-4 py-8">
        <Header subtitle="Refinement Report" rightContent={<RefinementHeaderStats report={report} />} />

        <div className="flex items-center gap-2 mb-6 overflow-x-auto">
          {tabs
            .filter((t) => t.show)
            .map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-teal-500/20 to-emerald-500/10 text-teal-300 border border-teal-500/30 shadow-lg shadow-teal-500/10'
                      : 'text-slate-400 border border-transparent hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Icon name={tab.icon} className={`w-4 h-4 ${isActive ? 'text-teal-400' : 'text-slate-500'}`} />
                  {tab.label}
                </button>
              );
            })}
        </div>

        <main>
          <TabContent tab={activeTab} report={report} graph={graph} />
        </main>
      </div>
    </div>
  );
}

function RefinementHeaderStats({ report }: { report: RefinementReport }): React.ReactElement {
  const { finalResult: r, config, guideline } = report;
  const allFixed = r.violationsFixed === r.violationsTotal;
  const partial = r.violationsFixed > 0 && !allFixed;

  return (
    <div className="flex items-center gap-4 justify-end">
      <div className="flex flex-col items-end">
        <p className="text-white text-lg font-bold font-mono tracking-tight">{config.functionName}</p>
        <div className="flex items-center gap-2 mt-0.5 text-sm">
          <span className="font-mono text-slate-300">
            {r.violationsFixed}/{r.violationsTotal}
          </span>
          {allFixed && <span className="text-emerald-400">✓</span>}
          {partial && <span className="text-amber-300">~</span>}
          {r.violationsFixed === 0 && r.violationsTotal > 0 && <span className="text-red-400">✗</span>}
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono">
            {guideline.id}
          </span>
        </div>
      </div>
    </div>
  );
}

function TabContent({
  tab,
  report,
  graph,
}: {
  tab: Tab;
  report: RefinementReport;
  graph: { candidates: CandidateNode[]; mutationTargets: MutationTarget[] };
}): React.ReactElement {
  switch (tab) {
    case 'overview':
      return <RefinementSummary report={report} />;
    case 'violations':
      return <ViolationList violations={report.violations} focusResults={report.focusResults} />;
    case 'graph':
      return (
        <CandidateGraph
          candidates={graph.candidates}
          mutationTargets={graph.mutationTargets}
          superNodes={graph.superNodes}
          sourceLanguage={report.config.language}
          cleanup={report.cleanup}
        />
      );
    case 'rules':
      return <RuleEffectiveness stats={report.ruleStats} />;
    case 'merge':
      return <MergeTimeline entries={report.mergeLog} />;
    case 'result': {
      return <ResultViewer refinedSource={report.finalResult.source} cleanup={report.cleanup} />;
    }
  }
}

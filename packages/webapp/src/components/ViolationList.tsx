import React, { useState } from 'react';

import type { FocusResult, SessionReport, ViolationReport } from '../types';
import { CandidateGraph } from './CandidateGraph';
import { FocusResults } from './FocusResults';
import { RuleEffectiveness } from './RuleEffectiveness';

export function ViolationList({
  violations,
  focusResults,
}: {
  violations: ViolationReport[];
  focusResults?: Record<string, FocusResult[]>;
}): React.ReactElement {
  if (violations.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6 text-center text-slate-400">
        No violations were detected.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {violations.map((v) => (
        <ViolationCard key={v.id} violation={v} focusResults={focusResults?.[v.id]} />
      ))}
    </div>
  );
}

type SubTab = 'overview' | 'graph' | 'rules' | 'focus';

function ViolationCard({
  violation,
  focusResults,
}: {
  violation: ViolationReport;
  focusResults?: FocusResult[];
}): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const [showSubSession, setShowSubSession] = useState(false);
  const [subTab, setSubTab] = useState<SubTab>('overview');
  const v = violation;
  const sub = v.exploration?.subSession;

  const statusConfig = {
    'trivially-fixed': {
      label: 'Trivially fixed',
      badge: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
      border: 'border-l-emerald-500',
    },
    fixed: {
      label: 'Fixed',
      badge: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
      border: 'border-l-emerald-500',
    },
    'resolved-by-prior': {
      label: 'Resolved by prior',
      badge: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
      border: 'border-l-emerald-500',
    },
    'removal-failed': {
      label: 'Removal failed',
      badge: 'bg-red-500/15 text-red-300 border border-red-500/30',
      border: 'border-l-red-500',
    },
    'transmuter-exhausted': {
      label: 'Exhausted',
      badge: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
      border: 'border-l-amber-500',
    },
  };

  const status = statusConfig[v.status];

  return (
    <div className={`bg-slate-800/50 rounded-xl border-y border-r border-slate-700 border-l-4 ${status.border} p-5`}>
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${status.badge}`}>
          {status.label}
        </span>
        <span className="font-mono text-sm text-teal-300">{v.id}</span>
        <span className="text-xs text-slate-500 font-mono">
          lines {v.lines.start}&ndash;{v.lines.end}
        </span>
      </div>

      <p className="text-sm text-slate-300 mb-3">{v.description}</p>

      {v.exploration && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3">
          <div>
            <span className="text-slate-500">Score after removal: </span>
            <span className="text-slate-300 font-mono">{v.exploration.scoreAfterRemoval}</span>
          </div>
          <div>
            <span className="text-slate-500">Final score: </span>
            <span className={`font-mono ${v.exploration.finalScore === 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
              {v.exploration.finalScore}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Iterations: </span>
            <span className="text-slate-300 font-mono">{v.exploration.iterations.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-slate-500">Time: </span>
            <span className="text-slate-300 font-mono">{formatMs(v.exploration.elapsed)}</span>
          </div>
        </div>
      )}

      <div className="flex gap-3 mb-2">
        {(v.fixDiff || v.originalText) && (
          <button
            onClick={() => {
              setExpanded(!expanded);
              setShowSubSession(false);
            }}
            className={`text-xs font-medium transition-colors ${
              expanded ? 'text-teal-300' : 'text-teal-400 hover:text-teal-300'
            }`}
          >
            {expanded ? 'Hide code' : 'Show code'}
          </button>
        )}
        {sub && (
          <button
            onClick={() => {
              setShowSubSession(!showSubSession);
              setExpanded(false);
            }}
            className={`text-xs font-medium transition-colors ${
              showSubSession ? 'text-emerald-300' : 'text-emerald-400 hover:text-emerald-300'
            }`}
          >
            {showSubSession ? 'Hide sub-session' : 'Sub-session report'}
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-3 space-y-2">
          <div>
            <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider">Original code</p>
            <pre className="text-xs bg-slate-900/80 rounded-lg p-3 text-red-300 overflow-x-auto border border-slate-700/50">
              {v.originalText}
            </pre>
          </div>
          {v.fixDiff && (
            <div>
              <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider">Diff</p>
              <pre className="text-xs bg-slate-900/80 rounded-lg p-3 text-slate-300 overflow-x-auto whitespace-pre border border-slate-700/50">
                {v.fixDiff}
              </pre>
            </div>
          )}
          {v.exploration?.assemblyDiff && (
            <div>
              <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider">
                Assembly diff (candidate vs target)
              </p>
              <pre className="text-xs bg-slate-900/80 rounded-lg p-3 text-slate-300 overflow-x-auto whitespace-pre font-mono border border-slate-700/50">
                {v.exploration.assemblyDiff}
              </pre>
            </div>
          )}
        </div>
      )}

      {showSubSession && sub && (
        <SubSessionView report={sub} focusResults={focusResults} activeTab={subTab} onTabChange={setSubTab} />
      )}
    </div>
  );
}

function SubSessionView({
  report,
  focusResults,
  activeTab,
  onTabChange,
}: {
  report: SessionReport;
  focusResults?: FocusResult[];
  activeTab: SubTab;
  onTabChange: (tab: SubTab) => void;
}): React.ReactElement {
  const candidateCount = report.graph.candidates.length;
  const tabs: { id: SubTab; label: string; show: boolean }[] = [
    { id: 'overview', label: 'Overview', show: true },
    { id: 'graph', label: `Graph (${candidateCount})`, show: candidateCount > 0 },
    { id: 'rules', label: 'Rules', show: report.ruleStats.length > 0 },
    { id: 'focus', label: 'Focus', show: (focusResults ?? report.focusResults).length > 0 },
  ];

  return (
    <div className="mt-4 border border-slate-700 rounded-xl overflow-hidden">
      <div className="bg-slate-900/40 px-4 py-3 border-b border-slate-700">
        <p className="text-xs text-slate-400 mb-2 font-mono">
          Sub-session: <span className="text-slate-200">{report.summary.baseScore}</span>
          <span className="text-slate-600"> → </span>
          <span className="text-teal-300">{report.summary.bestScore}</span>
          <span className="text-slate-600"> · </span>
          {report.summary.totalIterations.toLocaleString()} iterations
          <span className="text-slate-600"> · </span>
          {report.summary.forkCount} forks
          {report.summary.completionReason && (
            <span className="text-slate-600"> · {report.summary.completionReason}</span>
          )}
        </p>
        <div className="flex gap-1 overflow-x-auto">
          {tabs
            .filter((t) => t.show)
            .map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'text-slate-400 border border-transparent hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
        </div>
      </div>
      <div className="p-4 bg-slate-900/20">
        <SubSessionTabContent tab={activeTab} report={report} focusResults={focusResults} />
      </div>
    </div>
  );
}

function SubSessionTabContent({
  tab,
  report,
  focusResults,
}: {
  tab: SubTab;
  report: SessionReport;
  focusResults?: FocusResult[];
}): React.ReactElement {
  switch (tab) {
    case 'overview': {
      const s = report.summary;
      return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <StatBox label="Base score" value={s.baseScore} />
          <StatBox
            label="Best score"
            value={s.bestScore}
            accent={s.bestScore === 0 ? 'green' : s.bestScore < s.baseScore ? 'brand' : undefined}
          />
          <StatBox label="Iterations" value={s.totalIterations.toLocaleString()} />
          <StatBox label="Compiled" value={s.totalCompiled.toLocaleString()} />
          <StatBox
            label="Errors"
            value={s.totalErrors.toLocaleString()}
            accent={s.totalErrors > 0 ? 'red' : undefined}
          />
          <StatBox label="Deduped" value={s.totalDeduped.toLocaleString()} />
          <StatBox label="Forks" value={String(s.forkCount)} accent={s.forkCount > 0 ? 'green' : undefined} />
        </div>
      );
    }
    case 'graph':
      return (
        <CandidateGraph
          candidates={report.graph.candidates}
          mutationTargets={report.graph.mutationTargets}
          superNodes={report.graph.superNodes}
          sourceLanguage={report.config.language}
        />
      );
    case 'rules':
      return <RuleEffectiveness stats={report.ruleStats} />;
    case 'focus':
      return <FocusResults results={focusResults ?? report.focusResults} />;
  }
}

function StatBox({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: 'green' | 'brand' | 'red';
}): React.ReactElement {
  const colors = {
    green: 'text-emerald-400',
    brand: 'text-teal-300',
    red: 'text-red-400',
  };
  return (
    <div className="bg-slate-900/60 rounded-lg border border-slate-700/50 p-2.5">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">{label}</p>
      <p className={`font-bold font-mono ${accent ? colors[accent] : 'text-slate-200'}`}>{value}</p>
    </div>
  );
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m > 0) {
    return `${m}m ${s % 60}s`;
  }
  return `${s}s`;
}

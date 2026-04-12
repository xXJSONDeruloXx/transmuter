import React, { useState } from 'react';

import type { MergeLogEntry } from '../types';

export function MergeTimeline({ entries }: { entries: MergeLogEntry[] }): React.ReactElement {
  if (entries.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6 text-center text-slate-400">
        No merge steps were recorded.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <MergeStep key={entry.step} entry={entry} />
      ))}
    </div>
  );
}

function MergeStep({ entry }: { entry: MergeLogEntry }): React.ReactElement {
  const [showDiff, setShowDiff] = useState(false);

  const actionConfig: Record<string, { label: string; color: string; border: string }> = {
    'skipped-already-resolved': {
      label: 'Resolved by prior fix',
      color: 'text-emerald-300',
      border: 'border-l-emerald-500',
    },
    'applied-trivially': { label: 'Applied trivially', color: 'text-emerald-400', border: 'border-l-emerald-500' },
    permuted: { label: 'Fixed via match', color: 'text-emerald-400', border: 'border-l-emerald-500' },
    failed: { label: 'Failed', color: 'text-red-400', border: 'border-l-red-500' },
  };

  const config = actionConfig[entry.action] ?? {
    label: entry.action,
    color: 'text-slate-400',
    border: 'border-l-slate-600',
  };

  return (
    <div className={`bg-slate-800/50 rounded-xl border-y border-r border-slate-700 border-l-4 ${config.border} p-4`}>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[11px] uppercase tracking-wider text-slate-500 font-mono w-16">Step {entry.step}</span>
        <span className="font-mono text-sm text-teal-300">{entry.violationId}</span>
        <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
        {entry.iterations !== undefined && (
          <span className="text-xs text-slate-500 font-mono">({entry.iterations.toLocaleString()} iterations)</span>
        )}
      </div>

      {entry.diff && (
        <>
          <button
            onClick={() => setShowDiff(!showDiff)}
            className="text-xs text-teal-400 hover:text-teal-300 mt-2 transition-colors"
          >
            {showDiff ? 'Hide diff' : 'Show diff'}
          </button>
          {showDiff && (
            <pre className="mt-2 text-xs bg-slate-900/80 rounded-lg p-3 text-slate-300 overflow-x-auto whitespace-pre border border-slate-700/50">
              {entry.diff}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

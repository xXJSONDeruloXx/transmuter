import React from 'react';

import type { FocusResult } from '../types';

export function FocusResults({ results }: { results: FocusResult[] }): React.ReactElement {
  if (results.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6 text-center text-slate-400">
        No focus constraints were applied in this session.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {results.map((result) => {
        const c = result.constraint;
        const typeColors = {
          'focus-region': 'bg-teal-500/15 text-teal-300 border border-teal-500/30',
          'avoid-region': 'bg-red-500/15 text-red-300 border border-red-500/30',
          hypothesis: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
        };

        return (
          <div key={result.constraintId} className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
            <div className="flex items-center gap-3 mb-3">
              <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${typeColors[c.type]}`}>
                {c.type}
              </span>
              <span className="font-mono text-sm text-slate-200">{result.constraintId}</span>
            </div>

            <p className="text-sm text-slate-300 mb-3">{c.description}</p>

            {'lines' in c && (
              <p className="text-xs text-slate-500 mb-2">
                Lines {c.lines.start}&ndash;{c.lines.end}
                {'strength' in c && c.strength !== undefined && ` (strength: ${c.strength})`}
              </p>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
              {c.type === 'focus-region' && (
                <>
                  <StatItem label="Mutations attempted" value={result.mutationsAttempted} />
                  <StatItem label="Improved" value={result.mutationsForked} accent="green" />
                </>
              )}
              {c.type === 'avoid-region' && (
                <StatItem label="Mutations rejected" value={result.mutationsRejected} accent="red" />
              )}
              {c.type === 'hypothesis' && (
                <>
                  <StatItem
                    label="Hypothesis score"
                    value={result.hypothesisScore ?? 'N/A'}
                    accent={result.hypothesisScore !== undefined && result.hypothesisScore >= 0 ? 'brand' : 'slate'}
                  />
                  {result.hypothesisMutationTargetId && (
                    <StatItem label="Mutation Target" value={result.hypothesisMutationTargetId} />
                  )}
                </>
              )}
            </div>

            <p className="text-sm text-slate-400 bg-slate-900/60 rounded-lg p-3 border border-slate-700/50">
              {result.summary}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function StatItem({
  label,
  value,
  accent = 'slate',
}: {
  label: string;
  value: string | number;
  accent?: 'green' | 'red' | 'brand' | 'slate';
}): React.ReactElement {
  const colors = {
    green: 'text-emerald-400',
    red: 'text-red-400',
    brand: 'text-teal-300',
    slate: 'text-slate-300',
  };
  return (
    <div>
      <span className="text-slate-500">{label}: </span>
      <span className={`font-mono ${colors[accent]}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
    </div>
  );
}

import React, { useState } from 'react';

import type { RuleStatsEntry } from '../types';

type SortKey = 'ruleId' | 'applied' | 'forked' | 'successRate' | 'avgDelta' | 'bestDelta' | 'errors';

export function RuleEffectiveness({ stats }: { stats: RuleStatsEntry[] }): React.ReactElement {
  const [sortKey, setSortKey] = useState<SortKey>('forked');
  const [sortAsc, setSortAsc] = useState(false);

  if (stats.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6 text-center text-slate-400">
        No rule statistics available.
      </div>
    );
  }

  const sorted = [...stats].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === 'string' && typeof bv === 'string') {
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  const maxApplied = Math.max(...stats.map((s) => s.applied), 1);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <th
      className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 cursor-pointer hover:text-teal-300 select-none transition-colors"
      onClick={() => handleSort(field)}
    >
      {label}
      {sortKey === field && <span className="ml-1 text-teal-400">{sortAsc ? '\u25B2' : '\u25BC'}</span>}
    </th>
  );

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-slate-900/40 border-b border-slate-700">
          <tr>
            <SortHeader label="Rule" field="ruleId" />
            <SortHeader label="Applied" field="applied" />
            <SortHeader label="Forked" field="forked" />
            <SortHeader label="Rate" field="successRate" />
            <SortHeader label="Avg Δ" field="avgDelta" />
            <SortHeader label="Best Δ" field="bestDelta" />
            <SortHeader label="Errors" field="errors" />
            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 w-32">
              Usage
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((rule, idx) => (
            <tr
              key={rule.ruleId}
              className={`border-b border-slate-800/60 last:border-b-0 hover:bg-slate-700/30 transition-colors ${
                idx % 2 === 0 ? 'bg-slate-800/10' : ''
              }`}
            >
              <td className="px-4 py-2.5 font-mono text-teal-300">
                {rule.ruleId}
                {rule.description && (
                  <span
                    title={rule.description}
                    className="inline-flex items-center justify-center ml-1.5 w-3.5 h-3.5 rounded-full bg-slate-700 text-slate-400 text-[9px] cursor-help hover:bg-teal-500/20 hover:text-teal-300 transition-colors"
                  >
                    i
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-slate-300 font-mono tabular-nums">{rule.applied.toLocaleString()}</td>
              <td className="px-4 py-2.5 font-mono tabular-nums">
                <span className={rule.forked > 0 ? 'text-emerald-400' : 'text-slate-600'}>{rule.forked}</span>
              </td>
              <td className="px-4 py-2.5 text-slate-300 font-mono tabular-nums">
                {(rule.successRate * 100).toFixed(1)}%
              </td>
              <td className="px-4 py-2.5 text-slate-300 font-mono tabular-nums">
                {rule.avgDelta > 0 ? rule.avgDelta.toFixed(1) : '\u2014'}
              </td>
              <td className="px-4 py-2.5 text-slate-300 font-mono tabular-nums">
                {rule.bestDelta > 0 ? rule.bestDelta : '\u2014'}
              </td>
              <td className="px-4 py-2.5 font-mono tabular-nums">
                <span className={rule.errors > 0 ? 'text-red-400' : 'text-slate-600'}>
                  {rule.errors.toLocaleString()}
                </span>
              </td>
              <td className="px-4 py-2.5">
                <div className="bg-slate-700/50 rounded-full h-2 w-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full h-2 shadow-sm shadow-teal-500/20"
                    style={{ width: `${(rule.applied / maxApplied) * 100}%` }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

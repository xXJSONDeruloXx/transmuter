import React, { useState } from 'react';

import type { CleanupReportData } from '../types';

type ViewTab = 'result' | 'before-cleanup' | 'side-by-side';

export function ResultViewer({
  originalSource,
  refinedSource,
  cleanup,
}: {
  originalSource?: string;
  refinedSource: string;
  cleanup?: CleanupReportData;
}): React.ReactElement {
  const hasCleanup = cleanup && cleanup.sourceAfter !== cleanup.sourceBefore;
  const [view, setView] = useState<ViewTab>('result');

  const displaySource = hasCleanup ? cleanup.sourceAfter : refinedSource;
  const beforeCleanupSource = hasCleanup ? cleanup.sourceBefore : undefined;

  const tabBtn = (active: boolean): string =>
    `px-4 py-2 text-sm rounded-lg font-medium transition-all ${
      active
        ? 'bg-gradient-to-r from-teal-500/20 to-emerald-500/10 text-teal-300 border border-teal-500/30 shadow-lg shadow-teal-500/10'
        : 'bg-slate-800/60 text-slate-300 border border-slate-700 hover:text-slate-100 hover:border-slate-600'
    }`;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setView('result')} className={tabBtn(view === 'result')}>
          {hasCleanup ? 'Cleaned source' : 'Refined source'}
        </button>
        {beforeCleanupSource && (
          <button onClick={() => setView('before-cleanup')} className={tabBtn(view === 'before-cleanup')}>
            Before cleanup
          </button>
        )}
        {(originalSource || beforeCleanupSource) && (
          <button onClick={() => setView('side-by-side')} className={tabBtn(view === 'side-by-side')}>
            Side by side
          </button>
        )}
      </div>

      {hasCleanup && (
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono">
            smell {cleanup.smellBefore.total} → {cleanup.smellAfter.total}
          </span>
          {cleanup.canonicalization.totalApplied > 0 && (
            <span className="text-slate-500">
              Phase 1: {cleanup.canonicalization.passes.map((p) => `${p.name} (${p.applied})`).join(', ')}
            </span>
          )}
          {cleanup.smellPermutation?.improved && (
            <span className="text-slate-500">
              Phase 2: {cleanup.smellPermutation.iterations.toLocaleString()} iters
            </span>
          )}
          <span className="text-slate-600 font-mono">{(cleanup.elapsed / 1000).toFixed(1)}s</span>
        </div>
      )}

      {view === 'result' && (
        <pre className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 text-sm text-slate-300 overflow-x-auto whitespace-pre font-mono">
          {displaySource}
        </pre>
      )}

      {view === 'before-cleanup' && beforeCleanupSource && (
        <pre className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 text-sm text-slate-400 overflow-x-auto whitespace-pre font-mono">
          {beforeCleanupSource}
        </pre>
      )}

      {view === 'side-by-side' && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">
              {hasCleanup ? 'Before cleanup' : 'Original'}
            </p>
            <pre className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 text-xs text-slate-400 overflow-x-auto whitespace-pre font-mono">
              {beforeCleanupSource ?? originalSource ?? refinedSource}
            </pre>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">
              {hasCleanup ? 'After cleanup' : 'Refined'}
            </p>
            <pre className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 text-xs text-slate-300 overflow-x-auto whitespace-pre font-mono">
              {displaySource}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

import React from 'react';

export function DiffView({ diff }: { diff: string }): React.ReactElement {
  if (!diff) {
    return <p className="text-slate-500 text-sm">No diff available.</p>;
  }

  const lines = diff.split('\n');

  return (
    <pre className="bg-slate-900/80 rounded-lg border border-slate-700/50 p-3 text-xs overflow-x-auto max-h-96 font-mono">
      {lines.map((line, i) => {
        let className = 'text-slate-400';
        if (line.startsWith('+') && !line.startsWith('+++')) {
          className = 'diff-add';
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          className = 'diff-remove';
        } else if (line.startsWith('@@')) {
          className = 'text-teal-400';
        } else if (line.startsWith('---') || line.startsWith('+++')) {
          className = 'diff-header';
        }
        return (
          <div key={i} className={className}>
            {line}
          </div>
        );
      })}
    </pre>
  );
}

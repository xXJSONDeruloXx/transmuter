import { common, createStarryNight } from '@wooorm/starry-night';
import sourceAssembly from '@wooorm/starry-night/source.assembly';
import { useEffect, useRef, useState } from 'react';

const grammars = [...common, sourceAssembly];

type Language = 'c' | 'cpp' | 'pascal' | 'asm' | 'diff';

const scopeMap: Record<Language, string> = {
  c: 'source.c',
  cpp: 'source.c++',
  pascal: 'source.pascal',
  asm: 'source.assembly',
  diff: 'source.diff',
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function toHtml(node: any): string {
  if (node.type === 'text') {
    return escapeHtml(node.value);
  }
  if (node.type === 'element') {
    const className = node.properties?.className?.join(' ') ?? '';

    const children = node.children?.map((child: any) => toHtml(child)).join('') ?? '';
    return `<span class="${className}">${children}</span>`;
  }
  if (node.type === 'root') {
    return node.children?.map((child: any) => toHtml(child)).join('') ?? '';
  }
  return '';
}

interface CodeBlockProps {
  code: string;
  language: Language;
  className?: string;
}

export function CodeBlock({ code, language, className }: CodeBlockProps) {
  const [html, setHtml] = useState<string>('');
  const starryNightRef = useRef<Awaited<ReturnType<typeof createStarryNight>> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      if (!starryNightRef.current) {
        starryNightRef.current = await createStarryNight(grammars);
      }
      if (cancelled) {
        return;
      }
      const tree = starryNightRef.current.highlight(code, scopeMap[language]);
      setHtml(toHtml(tree));
    }

    highlight();
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  return (
    <pre
      className={`bg-slate-900/80 rounded-lg border border-slate-700/50 p-3 overflow-x-auto whitespace-pre font-mono text-[10px] max-h-64 overflow-y-auto ${className ?? ''}`}
    >
      <code dangerouslySetInnerHTML={{ __html: html || escapeHtml(code) }} />
    </pre>
  );
}

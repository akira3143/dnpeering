import React, { useMemo } from 'react';
import { FileCode } from 'lucide-react';

interface CodeViewerProps {
  code: string;
  language: 'wg' | 'bird';
  showLineNumbers?: boolean;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({
  code,
  language,
  showLineNumbers = true,
}) => {
  const lines = useMemo(() => {
    return code.split('\n');
  }, [code]);

  const renderLine = (line: string, lineIndex: number) => {
    const trimmed = line.trim();

    // 1. Comments
    if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
      return <span key={lineIndex} className="text-slate-500 italic">{line}</span>;
    }

    // 2. WireGuard Syntax Highlighting (Minimalist & Clean)
    if (language === 'wg') {
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        return (
          <span key={lineIndex} className="text-cyan-400 font-semibold tracking-wide">
            {line}
          </span>
        );
      }

      if (line.includes('=')) {
        const [key, ...rest] = line.split('=');
        const value = rest.join('=');

        let valColor = 'text-cyan-100';
        if (value.includes('<YOUR_PRIVATE_KEY>')) {
          valColor = 'text-yellow-200/85'; // Soft natural yellow
        } else if (key.trim() === 'PostUp') {
          valColor = 'text-slate-300';
        }

        return (
          <span key={lineIndex}>
            <span className="text-slate-300 font-medium">{key}</span>
            <span className="text-slate-600">=</span>
            <span className={valColor}>{value}</span>
          </span>
        );
      }
    }

    // 3. BIRD Syntax Highlighting (Minimalist & Clean)
    if (language === 'bird') {
      if (trimmed.startsWith('protocol bgp')) {
        return (
          <span key={lineIndex}>
            <span className="text-cyan-400 font-semibold">protocol bgp </span>
            <span className="text-cyan-100">{trimmed.replace(/^protocol\s+bgp\s+/, '').replace(/\s+from\s+dnpeers.*$/, '')} </span>
            <span className="text-slate-400">from </span>
            <span className="text-slate-300">dnpeers {'{'}</span>
          </span>
        );
      }

      if (trimmed.startsWith('neighbor')) {
        const target = trimmed.replace(/^neighbor\s+/, '').replace(/\s+as\s+.*$/, '');
        const asMatch = trimmed.match(/as\s+(\d+);?/)?.[1] || '';

        return (
          <span key={lineIndex}>
            <span className="text-cyan-400">    neighbor </span>
            <span className="text-cyan-100">{target} </span>
            <span className="text-slate-400">as </span>
            <span className="text-yellow-200/85">{asMatch};</span>
          </span>
        );
      }

      if (trimmed.startsWith('ipv4') || trimmed.startsWith('ipv6')) {
        return (
          <span key={lineIndex}>
            <span className="text-cyan-400">{line}</span>
          </span>
        );
      }

      if (trimmed.includes('extended next hop on')) {
        return (
          <span key={lineIndex} className="text-slate-300">
            {line}
          </span>
        );
      }

      if (trimmed.includes('import filter') || trimmed.includes('export filter')) {
        return (
          <span key={lineIndex}>
            <span className="text-cyan-400">{line.split(/filter/)[0]}filter </span>
            <span className="text-slate-300">{line.split(/filter/)[1]}</span>
          </span>
        );
      }

      if (trimmed === '}' || trimmed === '};') {
        return <span key={lineIndex} className="text-slate-500">{line}</span>;
      }
    }

    return <span key={lineIndex} className="text-slate-200">{line}</span>;
  };

  const filename = language === 'wg' ? 'wg0.conf' : 'bird.conf';

  return (
    <div className="flex flex-col h-full rounded-2xl bg-black/85 border border-white/10 overflow-hidden shadow-2xl">
      
      {/* Clean Minimal Header: Filename & Line Count only */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.03] border-b border-white/10 text-xs font-mono select-none">
        <div className="flex items-center gap-2">
          <FileCode className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-slate-300 font-mono text-xs font-medium">
            {filename}
          </span>
        </div>

        <span className="text-slate-500 font-mono text-[11px]">
          {lines.length} lines
        </span>
      </div>

      {/* Code Area with Line Numbers */}
      <div className="flex-1 overflow-auto p-3.5 sm:p-4 text-xs font-mono leading-relaxed scrollbar-thin">
        <div className="table w-full">
          {lines.map((line, idx) => (
            <div key={idx} className="table-row hover:bg-white/[0.02] transition-colors">
              {showLineNumbers && (
                <span className="table-cell pr-4 text-right text-slate-600 select-none text-[11px] font-mono w-8 shrink-0">
                  {idx + 1}
                </span>
              )}
              <span className="table-cell whitespace-pre font-mono">
                {renderLine(line, idx)}
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

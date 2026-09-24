'use client';

import React, { useState, useMemo } from 'react';

export interface MarkdownPreviewProps {
  content: string;
  repoName: string;
  cloneUrl?: string;
  defaultBranch?: string;
  onEdit?: () => void;
}

// Token-level syntax highlighting for code fences
function highlightCode(code: string, lang: string): React.ReactNode {
  const lines = code.split('\n');

  if (lang === 'bash' || lang === 'sh' || lang === 'shell') {
    return lines.map((line, i) => {
      // Comment line
      if (line.trim().startsWith('#')) {
        return (
          <div key={i} className="text-[#8B949E] italic">
            {line}
          </div>
        );
      }

      // Tokenize bash command
      const tokens = line.split(/(\s+|"[^"]*"|'[^']*'|--?[a-zA-Z0-9_-]+)/g).filter(Boolean);
      return (
        <div key={i}>
          {tokens.map((tok, j) => {
            if (/^(git|pnpm|npm|yarn|turbo|npx|node|curl|echo|cd|mkdir|rm|cp)$/.test(tok.trim())) {
              return (
                <span key={j} className="text-[#79C0FF] font-bold">
                  {tok}
                </span>
              );
            }
            if (
              /^(clone|install|dev|run|build|test|lint|add|commit|push|pull|checkout|switch)$/.test(
                tok.trim(),
              )
            ) {
              return (
                <span key={j} className="text-[#D2A8FF]">
                  {tok}
                </span>
              );
            }
            if (tok.startsWith('-')) {
              return (
                <span key={j} className="text-[#FFA657]">
                  {tok}
                </span>
              );
            }
            if (tok.startsWith('"') || tok.startsWith("'")) {
              return (
                <span key={j} className="text-[#A5D6FF]">
                  {tok}
                </span>
              );
            }
            if (tok.startsWith('$')) {
              return (
                <span key={j} className="text-[#FF7B72]">
                  {tok}
                </span>
              );
            }
            return <span key={j}>{tok}</span>;
          })}
        </div>
      );
    });
  }

  if (lang === 'typescript' || lang === 'ts' || lang === 'javascript' || lang === 'js') {
    const keywords =
      /^(import|export|from|const|let|var|function|return|async|await|type|interface|class|default|if|else|try|catch|new|throw|typeof|extends|implements)$/;
    const typeWords =
      /^(string|number|boolean|any|void|unknown|never|Promise|Record|Array|FileNode|Repo|React)$/;

    return lines.map((line, i) => {
      if (line.trim().startsWith('//')) {
        return (
          <div key={i} className="text-[#8B949E] italic">
            {line}
          </div>
        );
      }
      const tokens = line
        .split(/(\s+|"[^"]*"|'[^']*'|`[^`]*`|[{}\[\](),;.:=<>+*!?-])/g)
        .filter(Boolean);
      return (
        <div key={i}>
          {tokens.map((tok, j) => {
            const trimmed = tok.trim();
            if (keywords.test(trimmed)) {
              return (
                <span key={j} className="text-[#FF7B72] font-semibold">
                  {tok}
                </span>
              );
            }
            if (typeWords.test(trimmed)) {
              return (
                <span key={j} className="text-[#FFA657]">
                  {tok}
                </span>
              );
            }
            if (tok.startsWith('"') || tok.startsWith("'") || tok.startsWith('`')) {
              return (
                <span key={j} className="text-[#A5D6FF]">
                  {tok}
                </span>
              );
            }
            if (/^[0-9]+(\.[0-9]+)?$/.test(trimmed)) {
              return (
                <span key={j} className="text-[#79C0FF]">
                  {tok}
                </span>
              );
            }
            return <span key={j}>{tok}</span>;
          })}
        </div>
      );
    });
  }

  if (lang === 'json') {
    return lines.map((line, i) => {
      const isKey = line.includes('":');
      if (isKey) {
        const parts = line.split('":');
        return (
          <div key={i}>
            <span className="text-[#79C0FF]">{parts[0]}"</span>:
            <span className="text-[#A5D6FF]">{parts.slice(1).join('":')}</span>
          </div>
        );
      }
      return (
        <div key={i} className="text-[#A5D6FF]">
          {line}
        </div>
      );
    });
  }

  if (lang === 'diff' || lang === 'patch') {
    return lines.map((line, i) => {
      if (line.startsWith('+')) {
        return (
          <div key={i} className="text-[#3FB950] bg-[#238636]/10 px-1 rounded-sm">
            {line}
          </div>
        );
      }
      if (line.startsWith('-')) {
        return (
          <div key={i} className="text-[#F85149] bg-[#DA3633]/10 px-1 rounded-sm">
            {line}
          </div>
        );
      }
      if (line.startsWith('@@')) {
        return (
          <div key={i} className="text-[#D2A8FF] font-semibold">
            {line}
          </div>
        );
      }
      return <div key={i}>{line}</div>;
    });
  }

  // Default fallback
  return lines.map((l, i) => <div key={i}>{l || '\u00A0'}</div>);
}

// Inline Markdown Parser: parses `code`, **bold**, *italic*, [link](url)
function renderInlineMarkdown(text: string): React.ReactNode {
  // Regex to split by inline code, links, bold, italic
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIdx = 0;

  while (remaining.length > 0) {
    // Match inline code `...`
    const codeMatch = remaining.match(/^(.*?)`([^`]+)`(.*)$/s);
    // Match bold **...**
    const boldMatch = remaining.match(/^(.*?)\*\*([^*]+)\*\*(.*)$/s);
    // Match link [text](url)
    const linkMatch = remaining.match(/^(.*?)\[([^\]]+)\]\(([^)]+)\)(.*)$/s);

    let earliestIdx = remaining.length;
    let matchType: 'code' | 'bold' | 'link' | 'none' = 'none';

    if (codeMatch && codeMatch[1].length < earliestIdx) {
      earliestIdx = codeMatch[1].length;
      matchType = 'code';
    }
    if (boldMatch && boldMatch[1].length < earliestIdx) {
      earliestIdx = boldMatch[1].length;
      matchType = 'bold';
    }
    if (linkMatch && linkMatch[1].length < earliestIdx) {
      earliestIdx = linkMatch[1].length;
      matchType = 'link';
    }

    if (matchType === 'code' && codeMatch) {
      if (codeMatch[1]) parts.push(codeMatch[1]);
      parts.push(
        <code
          key={keyIdx++}
          className="px-1.5 py-0.5 rounded bg-[#161B22] border border-[#30363D] text-[#58A6FF] font-mono text-[11px]"
        >
          {codeMatch[2]}
        </code>,
      );
      remaining = codeMatch[3];
    } else if (matchType === 'bold' && boldMatch) {
      if (boldMatch[1]) parts.push(boldMatch[1]);
      parts.push(
        <strong key={keyIdx++} className="font-bold text-white">
          {boldMatch[2]}
        </strong>,
      );
      remaining = boldMatch[3];
    } else if (matchType === 'link' && linkMatch) {
      if (linkMatch[1]) parts.push(linkMatch[1]);
      parts.push(
        <a
          key={keyIdx++}
          href={linkMatch[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#58A6FF] hover:underline font-medium"
        >
          {linkMatch[2]}
        </a>,
      );
      remaining = linkMatch[4];
    } else {
      parts.push(remaining);
      break;
    }
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

export function MarkdownPreview({
  content,
  repoName,
  cloneUrl,
  defaultBranch = 'main',
  onEdit,
}: MarkdownPreviewProps) {
  const [viewMode, setViewMode] = useState<'preview' | 'raw'>('preview');
  const [copiedCodeIdx, setCopiedCodeIdx] = useState<number | null>(null);
  const [copiedRaw, setCopiedRaw] = useState(false);

  const handleCopyRaw = () => {
    navigator.clipboard?.writeText(content);
    setCopiedRaw(true);
    setTimeout(() => setCopiedRaw(false), 2000);
  };

  const handleCopyCodeBlock = (code: string, idx: number) => {
    navigator.clipboard?.writeText(code);
    setCopiedCodeIdx(idx);
    setTimeout(() => setCopiedCodeIdx(null), 2000);
  };

  // Structured Markdown AST parser
  const parsedSections = useMemo(() => {
    const rawLines = content.split('\n');
    const sections: Array<
      | { type: 'h1' | 'h2' | 'h3' | 'h4'; text: string }
      | { type: 'code'; lang: string; code: string }
      | { type: 'quote'; alertType?: string; text: string }
      | { type: 'list'; items: string[] }
      | { type: 'table'; headers: string[]; rows: string[][] }
      | { type: 'paragraph'; text: string }
      | { type: 'hr' }
    > = [];

    let i = 0;
    while (i < rawLines.length) {
      const line = rawLines[i];

      // Code Block fence
      if (line.trim().startsWith('```')) {
        const lang = line.trim().slice(3).trim();
        const codeLines: string[] = [];
        i++;
        while (i < rawLines.length && !rawLines[i].trim().startsWith('```')) {
          codeLines.push(rawLines[i]);
          i++;
        }
        sections.push({ type: 'code', lang: lang || 'text', code: codeLines.join('\n') });
        i++;
        continue;
      }

      // Headings
      if (line.startsWith('# ')) {
        sections.push({ type: 'h1', text: line.slice(2).trim() });
        i++;
        continue;
      }
      if (line.startsWith('## ')) {
        sections.push({ type: 'h2', text: line.slice(3).trim() });
        i++;
        continue;
      }
      if (line.startsWith('### ')) {
        sections.push({ type: 'h3', text: line.slice(4).trim() });
        i++;
        continue;
      }
      if (line.startsWith('#### ')) {
        sections.push({ type: 'h4', text: line.slice(5).trim() });
        i++;
        continue;
      }

      // Horizontal Rule
      if (/^(\*\*\*|---|___)$/.test(line.trim())) {
        sections.push({ type: 'hr' });
        i++;
        continue;
      }

      // Blockquote / Alerts (e.g. > [!NOTE])
      if (line.startsWith('>')) {
        const quoteLines: string[] = [];
        let alertType: string | undefined;

        while (i < rawLines.length && rawLines[i].startsWith('>')) {
          const cleanLine = rawLines[i].replace(/^>\s?/, '');
          const alertMatch = cleanLine.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
          if (alertMatch) {
            alertType = alertMatch[1].toUpperCase();
          } else {
            quoteLines.push(cleanLine);
          }
          i++;
        }
        sections.push({ type: 'quote', alertType, text: quoteLines.join(' ') });
        continue;
      }

      // GFM Table
      if (line.includes('|') && line.trim().startsWith('|') && line.trim().endsWith('|')) {
        const tableLines: string[] = [];
        while (
          i < rawLines.length &&
          rawLines[i].includes('|') &&
          rawLines[i].trim().startsWith('|')
        ) {
          tableLines.push(rawLines[i]);
          i++;
        }
        if (tableLines.length >= 2) {
          const parseCells = (row: string) =>
            row
              .split('|')
              .slice(1, -1)
              .map((c) => c.trim());
          const headers = parseCells(tableLines[0]);
          // Skip separator row (tableLines[1])
          const rows = tableLines.slice(2).map(parseCells);
          sections.push({ type: 'table', headers, rows });
          continue;
        }
      }

      // Bullet List
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        const items: string[] = [];
        while (
          i < rawLines.length &&
          (rawLines[i].trim().startsWith('- ') || rawLines[i].trim().startsWith('* '))
        ) {
          items.push(rawLines[i].trim().slice(2).trim());
          i++;
        }
        sections.push({ type: 'list', items });
        continue;
      }

      // Blank line
      if (!line.trim()) {
        i++;
        continue;
      }

      // Regular Paragraph (accumulate consecutive non-empty lines)
      const paraLines: string[] = [line];
      i++;
      while (
        i < rawLines.length &&
        rawLines[i].trim() &&
        !rawLines[i].startsWith('#') &&
        !rawLines[i].startsWith('>') &&
        !rawLines[i].startsWith('```') &&
        !rawLines[i].trim().startsWith('- ') &&
        !rawLines[i].trim().startsWith('* ') &&
        !rawLines[i].trim().startsWith('|')
      ) {
        paraLines.push(rawLines[i]);
        i++;
      }
      sections.push({ type: 'paragraph', text: paraLines.join(' ') });
    }

    return sections;
  }, [content]);

  return (
    <div className="border border-[#30363D] rounded-md bg-[#0D1117] overflow-hidden mt-6 shadow-sm">
      {/* Header Bar */}
      <div className="bg-[#161B22] border-b border-[#30363D] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 font-bold text-white">
          <svg height="16" viewBox="0 0 16 16" width="16" fill="#7D8590" className="shrink-0">
            <path d="M0 1.75A.75.75 0 0 1 .75 1h4.253c1.227 0 2.317.59 3 1.501A3.743 3.743 0 0 1 11.006 1h4.245a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-4.507a2.25 2.25 0 0 0-1.591.659l-.622.621a.75.75 0 0 1-1.06 0l-.622-.621A2.25 2.25 0 0 0 5.258 13H.75a.75.75 0 0 1-.75-.75Zm7.251 10.324.53-.53a3.75 3.75 0 0 1 2.65-1.094h3.57V2.5h-3.006a2.25 2.25 0 0 0-2.25 2.25v6.524ZM6.75 4.75A2.25 2.25 0 0 0 4.504 2.5H1.5v7.95h3.757a3.75 3.75 0 0 1 2.651 1.094Z" />
          </svg>
          <span>README.md</span>
          <span className="text-[11px] text-[#7D8590] font-normal hidden sm:inline">
            ({content.split('\n').length} lines · {(content.length / 1024).toFixed(1)} KB)
          </span>
        </div>

        {/* View Mode & Badges */}
        <div className="flex items-center gap-2 text-[11px]">
          <div className="flex items-center bg-[#0D1117] rounded-md border border-[#30363D] p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                viewMode === 'preview'
                  ? 'bg-[#21262D] text-white shadow-xs'
                  : 'text-[#7D8590] hover:text-[#E6EDF3]'
              }`}
            >
              Preview
            </button>
            <button
              type="button"
              onClick={() => setViewMode('raw')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                viewMode === 'raw'
                  ? 'bg-[#21262D] text-white shadow-xs'
                  : 'text-[#7D8590] hover:text-[#E6EDF3]'
              }`}
            >
              Raw
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopyRaw}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#21262D] border border-[#30363D] text-[#E6EDF3] hover:bg-[#30363D] font-semibold transition-colors"
            title="Copy raw markdown"
          >
            {copiedRaw ? (
              <>
                <span className="text-[#3FB950]">✓</span>
                <span className="text-[#3FB950]">Copied</span>
              </>
            ) : (
              <>
                <svg height="12" viewBox="0 0 16 16" width="12" fill="currentColor">
                  <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z" />
                  <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
                </svg>
                <span>Copy</span>
              </>
            )}
          </button>

          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#21262D] border border-[#30363D] text-[#E6EDF3] hover:bg-[#30363D] font-semibold transition-colors"
              title="Edit README"
            >
              <svg height="12" viewBox="0 0 16 16" width="12" fill="currentColor">
                <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25a1.75 1.75 0 0 1 .445-.758l8.61-8.61Zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086ZM11.189 6.25 9.75 4.81 3.25 11.31l-.547 1.916 1.916-.547L11.19 6.25Z" />
              </svg>
              <span>Edit</span>
            </button>
          )}

          <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-[#30363D]">
            <span className="px-1.5 py-0.2 rounded bg-[#21262D] text-[#3FB950] font-semibold">
              build: passing
            </span>
            <span className="px-1.5 py-0.2 rounded bg-[#21262D] text-[#58A6FF] font-semibold">
              license: MIT
            </span>
          </div>
        </div>
      </div>

      {/* Content Area */}
      {viewMode === 'raw' ? (
        <div className="p-4 bg-[#010409] font-mono text-xs overflow-x-auto">
          <pre className="text-[#C9D1D9] leading-relaxed select-text whitespace-pre-wrap">
            {content}
          </pre>
        </div>
      ) : (
        <div className="p-6 sm:p-8 space-y-4 text-xs leading-relaxed text-[#E6EDF3]">
          {parsedSections.map((sec, idx) => {
            if (sec.type === 'h1') {
              return (
                <h1
                  key={idx}
                  className="text-2xl font-bold text-white border-b border-[#21262D] pb-3 tracking-tight flex items-center gap-2"
                >
                  {sec.text}
                </h1>
              );
            }

            if (sec.type === 'h2') {
              return (
                <h2
                  key={idx}
                  className="text-lg font-bold text-white border-b border-[#21262D] pb-2 pt-4 tracking-tight flex items-center gap-2"
                >
                  {sec.text}
                </h2>
              );
            }

            if (sec.type === 'h3') {
              return (
                <h3 key={idx} className="text-sm font-bold text-white pt-2">
                  {sec.text}
                </h3>
              );
            }

            if (sec.type === 'h4') {
              return (
                <h4 key={idx} className="text-xs font-bold text-[#E6EDF3] pt-1">
                  {sec.text}
                </h4>
              );
            }

            if (sec.type === 'hr') {
              return <hr key={idx} className="border-[#30363D] my-4" />;
            }

            if (sec.type === 'quote') {
              const alertColor =
                sec.alertType === 'IMPORTANT'
                  ? 'border-[#A371F7] text-[#D2A8FF]'
                  : sec.alertType === 'WARNING'
                    ? 'border-[#D29922] text-[#E3B341]'
                    : sec.alertType === 'TIP'
                      ? 'border-[#3FB950] text-[#7EE787]'
                      : 'border-[#58A6FF] text-[#79C0FF]';

              return (
                <div
                  key={idx}
                  className={`border-l-4 ${alertColor} pl-4 py-2 my-3 bg-[#161B22]/50 rounded-r text-[#C9D1D9] leading-relaxed`}
                >
                  {sec.alertType && (
                    <div className="font-bold uppercase tracking-wider text-[10px] mb-1 flex items-center gap-1.5">
                      <span>ℹ️</span> {sec.alertType}
                    </div>
                  )}
                  <div>{renderInlineMarkdown(sec.text)}</div>
                </div>
              );
            }

            if (sec.type === 'code') {
              return (
                <div
                  key={idx}
                  className="my-3 rounded-md bg-[#161B22] border border-[#30363D] overflow-hidden"
                >
                  <div className="bg-[#0D1117] border-b border-[#30363D] px-3.5 py-1.5 flex items-center justify-between text-[11px] text-[#7D8590]">
                    <span className="font-mono text-[#58A6FF] uppercase font-semibold">
                      {sec.lang}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyCodeBlock(sec.code, idx)}
                      className="hover:text-white flex items-center gap-1 transition-colors text-[10px]"
                    >
                      {copiedCodeIdx === idx ? (
                        <>
                          <span className="text-[#3FB950]">✓</span>
                          <span className="text-[#3FB950]">Copied</span>
                        </>
                      ) : (
                        <>
                          <svg height="12" viewBox="0 0 16 16" width="12" fill="currentColor">
                            <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z" />
                            <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
                          </svg>
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="p-3.5 font-mono text-[11px] leading-relaxed text-[#E6EDF3] overflow-x-auto">
                    {highlightCode(sec.code, sec.lang)}
                  </pre>
                </div>
              );
            }

            if (sec.type === 'list') {
              return (
                <ul key={idx} className="space-y-1.5 my-2 pl-2">
                  {sec.items.map((it, itemIdx) => (
                    <li key={itemIdx} className="flex items-start gap-2">
                      <span className="text-[#FF8C42] mt-1 shrink-0">•</span>
                      <span className="text-[#C9D1D9]">{renderInlineMarkdown(it)}</span>
                    </li>
                  ))}
                </ul>
              );
            }

            if (sec.type === 'table') {
              return (
                <div key={idx} className="overflow-x-auto my-3">
                  <table className="w-full text-left border-collapse border border-[#30363D] text-[11px]">
                    <thead className="bg-[#161B22] text-white">
                      <tr>
                        {sec.headers.map((h, hIdx) => (
                          <th key={hIdx} className="border border-[#30363D] px-3 py-2 font-bold">
                            {renderInlineMarkdown(h)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#30363D]">
                      {sec.rows.map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          className={rIdx % 2 === 0 ? 'bg-[#0D1117]' : 'bg-[#161B22]/40'}
                        >
                          {row.map((cell, cIdx) => (
                            <td
                              key={cIdx}
                              className="border border-[#30363D] px-3 py-2 text-[#C9D1D9]"
                            >
                              {renderInlineMarkdown(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            }

            // Regular paragraph
            return (
              <p key={idx} className="text-[#8B949E] leading-relaxed">
                {renderInlineMarkdown(sec.text)}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}

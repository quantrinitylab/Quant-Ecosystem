'use client';

import React from 'react';
import { CodeBlock } from './CodeBlock';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

interface ParsedBlock {
  type: 'paragraph' | 'heading' | 'code' | 'list' | 'blockquote' | 'table' | 'hr';
  content: string;
  level?: number;
  language?: string;
  ordered?: boolean;
  items?: string[];
  rows?: string[][];
}

function parseBlocks(text: string): ParsedBlock[] {  const blocks: ParsedBlock[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block (fenced)
    if (line.startsWith('```')) {
      const language = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: 'code', content: codeLines.join('\n'), language });
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push({ type: 'hr', content: '' });
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      blocks.push({ type: 'heading', content: headingMatch[2], level: headingMatch[1].length });
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'blockquote', content: quoteLines.join('\n') });
      continue;
    }

    // Table
    if (line.includes('|') && i + 1 < lines.length && /^\|?[\s\-:|]+\|?$/.test(lines[i + 1])) {
      const tableRows: string[][] = [];
      while (i < lines.length && lines[i].includes('|')) {
        const row = lines[i]
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim());
        // Skip separator row
        if (!/^[\s\-:|]+$/.test(lines[i].replace(/\|/g, ''))) {
          tableRows.push(row);
        }
        i++;
      }
      blocks.push({ type: 'table', content: '', rows: tableRows });
      continue;
    }

    // Unordered list
    if (/^[\s]*[-*+]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[\s]*[-*+]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[\s]*[-*+]\s/, ''));
        i++;
      }
      blocks.push({ type: 'list', content: '', ordered: false, items });
      continue;
    }

    // Ordered list
    if (/^[\s]*\d+[.)]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[\s]*\d+[.)]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[\s]*\d+[.)]\s/, ''));
        i++;
      }
      blocks.push({ type: 'list', content: '', ordered: true, items });
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph (collect consecutive non-empty, non-special lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('#') &&
      !lines[i].startsWith('```') &&
      !lines[i].startsWith('>') &&
      !/^[\s]*[-*+]\s/.test(lines[i]) &&
      !/^[\s]*\d+[.)]\s/.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', content: paraLines.join('\n') });
    }
  }

  return blocks;
}

/**
 * Allowlist-based URL sanitizer for markdown links (XSS defense).
 * Only http, https, and mailto schemes are permitted, plus relative
 * URLs and fragment links. Dangerous schemes (javascript:, data:,
 * vbscript:, etc.) are rejected. Returns null when the URL is unsafe,
 * in which case the caller should render the text without a link.
 */
export function sanitizeMarkdownHref(raw: string): string | null {
  const url = raw.trim();
  if (!url) return null;
  // Extract scheme if present (handles leading whitespace/control chars via trim above)
  const schemeMatch = url.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (scheme !== 'http' && scheme !== 'https' && scheme !== 'mailto') {
      return null;
    }
  }
  return url;
}

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Process inline formatting with regex
  const pattern = /(\*\*\*.+?\*\*\*|\*\*.+?\*\*|\*.+?\*|`.+?`|\[.+?\]\(.+?\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    // Add plain text before match
    if (match.index > lastIndex) {
      nodes.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }

    const segment = match[0];

    // Bold+Italic
    if (segment.startsWith('***') && segment.endsWith('***')) {
      nodes.push(
        <strong key={key++} className="font-bold italic">
          {segment.slice(3, -3)}
        </strong>,
      );
    }
    // Bold
    else if (segment.startsWith('**') && segment.endsWith('**')) {
      nodes.push(
        <strong key={key++} className="font-semibold">
          {segment.slice(2, -2)}
        </strong>,
      );
    }
    // Italic
    else if (segment.startsWith('*') && segment.endsWith('*')) {
      nodes.push(
        <em key={key++} className="italic">
          {segment.slice(1, -1)}
        </em>,
      );
    }
    // Inline code
    else if (segment.startsWith('`') && segment.endsWith('`')) {
      nodes.push(
        <code
          key={key++}
          className="px-1.5 py-0.5 rounded bg-[var(--quant-surface-hover)] text-[var(--quant-accent)] text-[0.85em] font-mono"
        >
          {segment.slice(1, -1)}
        </code>,
      );
    }
    // Link
    else if (segment.startsWith('[')) {
      const linkMatch = segment.match(/\[(.+?)\]\((.+?)\)/);
      if (linkMatch) {
        const safeHref = sanitizeMarkdownHref(linkMatch[2]);
        if (safeHref) {
          nodes.push(
            <a
              key={key++}
              href={safeHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--quant-accent)] hover:underline"
            >
              {linkMatch[1]}
            </a>,
          );
        } else {
          // Unsafe URL scheme (e.g. javascript:) — render as plain text, never as a link
          nodes.push(<span key={key++}>{linkMatch[1]}</span>);
        }
      }
    }

    lastIndex = match.index + segment.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    nodes.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }

  return nodes.length > 0 ? nodes : [<span key={0}>{text}</span>];
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const blocks = parseBlocks(content);

  return (
    <div className={`markdown-content space-y-3 ${className}`}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'heading': {
            const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3';
            const sizeClass =
              block.level === 1
                ? 'text-xl font-bold'
                : block.level === 2
                  ? 'text-lg font-semibold'
                  : 'text-base font-semibold';
            return (
              <Tag key={i} className={`${sizeClass} text-[var(--foreground)] mt-4 mb-2`}>
                {renderInline(block.content)}
              </Tag>
            );
          }

          case 'code':
            return <CodeBlock key={i} code={block.content} language={block.language} />;

          case 'list':
            if (block.ordered) {
              return (
                <ol
                  key={i}
                  className="list-decimal list-inside space-y-1 text-sm text-[var(--foreground)]"
                >
                  {block.items?.map((item, j) => (
                    <li key={j} className="pl-1">
                      {renderInline(item)}
                    </li>
                  ))}
                </ol>
              );
            }
            return (
              <ul
                key={i}
                className="list-disc list-inside space-y-1 text-sm text-[var(--foreground)]"
              >
                {block.items?.map((item, j) => (
                  <li key={j} className="pl-1">
                    {renderInline(item)}
                  </li>
                ))}
              </ul>
            );

          case 'blockquote':
            return (
              <blockquote
                key={i}
                className="border-l-3 border-[var(--quant-accent)] pl-3 py-1 text-sm italic text-[var(--foreground-secondary)]"
              >
                {renderInline(block.content)}
              </blockquote>
            );

          case 'table':
            return (
              <div key={i} className="overflow-x-auto rounded border border-[var(--quant-border)]">
                <table className="w-full text-sm">
                  {block.rows && block.rows.length > 0 && (
                    <>
                      <thead className="bg-[var(--quant-surface-hover)]">
                        <tr>
                          {block.rows[0].map((cell, j) => (
                            <th
                              key={j}
                              className="px-3 py-2 text-left font-medium text-[var(--foreground)]"
                            >
                              {renderInline(cell)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {block.rows.slice(1).map((row, ri) => (
                          <tr key={ri} className="border-t border-[var(--quant-border)]">
                            {row.map((cell, ci) => (
                              <td key={ci} className="px-3 py-2 text-[var(--foreground)]">
                                {renderInline(cell)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </>
                  )}
                </table>
              </div>
            );

          case 'hr':
            return <hr key={i} className="border-[var(--quant-border)]" />;

          case 'paragraph':
          default:
            return (
              <p key={i} className="text-sm text-[var(--foreground)] leading-relaxed">
                {renderInline(block.content)}
              </p>
            );
        }
      })}
    </div>
  );
}

export default MarkdownRenderer;

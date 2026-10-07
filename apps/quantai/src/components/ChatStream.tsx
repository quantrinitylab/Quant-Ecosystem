// ============================================================================
// QuantAI - ChatStream Component
// Streaming AI response with markdown rendering, code blocks, citations
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

interface Citation {
  id: string;
  text: string;
  source: string;
  url?: string;
}

interface ChatStreamProps {
  content: string;
  isStreaming: boolean;
  model?: string;
  citations?: Citation[];
  onCopyCode?: (code: string) => void;
  onCitationClick?: (citation: Citation) => void;
}

interface ParsedBlock {
  type: 'text' | 'code' | 'heading' | 'list' | 'citation';
  content: string;
  language?: string;
  level?: number;
}

export default function ChatStream({
  content,
  isStreaming,
  model,
  citations = [],
  onCopyCode,
  onCitationClick,
}: ChatStreamProps): JSX.Element {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const parsedBlocks = useMemo((): ParsedBlock[] => {
    const blocks: ParsedBlock[] = [];
    const lines = content.split('\n');
    let inCodeBlock = false;
    let codeBuffer = '';
    let codeLang = '';

    for (const line of lines) {
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          blocks.push({ type: 'code', content: codeBuffer.trim(), language: codeLang });
          codeBuffer = '';
          codeLang = '';
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
          codeLang = line.slice(3).trim();
        }
      } else if (inCodeBlock) {
        codeBuffer += line + '\n';
      } else if (line.startsWith('# ')) {
        blocks.push({ type: 'heading', content: line.slice(2), level: 1 });
      } else if (line.startsWith('## ')) {
        blocks.push({ type: 'heading', content: line.slice(3), level: 2 });
      } else if (line.startsWith('### ')) {
        blocks.push({ type: 'heading', content: line.slice(4), level: 3 });
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        blocks.push({ type: 'list', content: line.slice(2) });
      } else if (line.match(/^\d+\.\s/)) {
        blocks.push({ type: 'list', content: line.replace(/^\d+\.\s/, '') });
      } else if (line.startsWith('[cite:')) {
        blocks.push({ type: 'citation', content: line });
      } else if (line.trim()) {
        blocks.push({ type: 'text', content: line });
      }
    }

    if (inCodeBlock && codeBuffer) {
      blocks.push({ type: 'code', content: codeBuffer.trim(), language: codeLang });
    }

    return blocks;
  }, [content]);

  useEffect(() => {
    if (isStreaming && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content, isStreaming]);

  const handleCopyCode = useCallback(
    (code: string, index: number) => {
      navigator.clipboard?.writeText(code);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
      onCopyCode?.(code);
    },
    [onCopyCode],
  );

  const renderInlineFormatting = useCallback((text: string): JSX.Element => {
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
    return (
      <span>
        {parts.map((part, i) => {
          if (part.startsWith('`') && part.endsWith('`')) {
            return (
              <code key={i} className="inline-code">
                {part.slice(1, -1)}
              </code>
            );
          }
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i}>{part.slice(2, -2)}</strong>;
          }
          if (part.startsWith('*') && part.endsWith('*')) {
            return <em key={i}>{part.slice(1, -1)}</em>;
          }
          return <span key={i}>{part}</span>;
        })}
      </span>
    );
  }, []);

  return (
    <div className="chat-stream" ref={contentRef}>
      <div className="stream-content">
        {parsedBlocks.map((block, i) => {
          switch (block.type) {
            case 'heading':
              const HeadingTag = `h${block.level || 1}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
              return (
                <HeadingTag key={i} className="stream-heading">
                  {block.content}
                </HeadingTag>
              );

            case 'code':
              return (
                <div key={i} className="code-block">
                  <div className="code-header">
                    <span className="code-lang">{block.language || 'code'}</span>
                    <button
                      className="btn-copy-code"
                      onClick={() => handleCopyCode(block.content, i)}
                    >
                      {copiedIndex === i ? '✓ Copied' : '📋 Copy'}
                    </button>
                  </div>
                  <pre className="code-content">
                    <code>{block.content}</code>
                  </pre>
                </div>
              );

            case 'list':
              return (
                <div key={i} className="list-item">
                  <span className="list-bullet">-</span>
                  <span className="list-text">{renderInlineFormatting(block.content)}</span>
                </div>
              );

            case 'citation':
              const citationMatch = block.content.match(/\[cite:(\d+)\]/);
              const citationId = citationMatch?.[1];
              const citation = citations.find((c) => c.id === citationId);
              if (citation) {
                return (
                  <div
                    key={i}
                    className="citation-block"
                    onClick={() => onCitationClick?.(citation)}
                  >
                    <span className="citation-icon">📑</span>
                    <span className="citation-text">{citation.text}</span>
                    <span className="citation-source">{citation.source}</span>
                  </div>
                );
              }
              return <p key={i}>{block.content}</p>;

            default:
              return (
                <p key={i} className="stream-paragraph">
                  {renderInlineFormatting(block.content)}
                </p>
              );
          }
        })}

        {isStreaming && <span className="streaming-cursor">|</span>}
      </div>

      {model && (
        <div className="stream-footer">
          <span className="model-badge">{model}</span>
        </div>
      )}

      {citations.length > 0 && !isStreaming && (
        <div className="citations-section">
          <h4>Sources</h4>
          <div className="citations-list">
            {citations.map((citation) => (
              <div
                key={citation.id}
                className="citation-item"
                onClick={() => onCitationClick?.(citation)}
              >
                <span className="citation-num">[{citation.id}]</span>
                <span className="citation-source">{citation.source}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

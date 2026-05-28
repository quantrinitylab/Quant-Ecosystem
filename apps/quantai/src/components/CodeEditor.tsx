// ============================================================================
// QuantAI - CodeEditor Component
// Monaco-like editor with AI suggestions, error highlighting, run button
// ============================================================================

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { sanitizeCodeHighlight } from '@quant/shared-ui';

interface EditorError {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

interface AISuggestion {
  id: string;
  text: string;
  type: 'completion' | 'fix' | 'refactor';
  confidence: number;
}

interface CodeEditorProps {
  code: string;
  language: string;
  onChange: (code: string) => void;
  onRun?: () => void;
  errors?: EditorError[];
  suggestions?: AISuggestion[];
  onSuggestionAccept?: (suggestion: AISuggestion) => void;
  readOnly?: boolean;
  showLineNumbers?: boolean;
  theme?: 'dark' | 'light';
}

const LANGUAGE_KEYWORDS: Record<string, string[]> = {
  javascript: [
    'function',
    'const',
    'let',
    'var',
    'return',
    'if',
    'else',
    'for',
    'while',
    'class',
    'import',
    'export',
    'async',
    'await',
    'try',
    'catch',
    'throw',
    'new',
    'this',
    'typeof',
    'instanceof',
  ],
  typescript: [
    'function',
    'const',
    'let',
    'var',
    'return',
    'if',
    'else',
    'for',
    'while',
    'class',
    'import',
    'export',
    'async',
    'await',
    'interface',
    'type',
    'enum',
    'implements',
    'extends',
    'abstract',
    'readonly',
  ],
  python: [
    'def',
    'class',
    'return',
    'if',
    'elif',
    'else',
    'for',
    'while',
    'import',
    'from',
    'try',
    'except',
    'raise',
    'with',
    'as',
    'lambda',
    'yield',
    'async',
    'await',
    'pass',
    'None',
    'True',
    'False',
  ],
  go: [
    'func',
    'package',
    'import',
    'return',
    'if',
    'else',
    'for',
    'range',
    'struct',
    'interface',
    'var',
    'const',
    'type',
    'defer',
    'go',
    'chan',
    'select',
    'switch',
    'case',
    'map',
    'make',
  ],
  rust: [
    'fn',
    'let',
    'mut',
    'return',
    'if',
    'else',
    'for',
    'while',
    'loop',
    'struct',
    'impl',
    'enum',
    'use',
    'pub',
    'mod',
    'trait',
    'match',
    'async',
    'await',
    'self',
    'Self',
    'where',
  ],
  java: [
    'public',
    'private',
    'protected',
    'class',
    'interface',
    'extends',
    'implements',
    'return',
    'if',
    'else',
    'for',
    'while',
    'new',
    'import',
    'package',
    'void',
    'static',
    'final',
    'abstract',
    'try',
    'catch',
    'throw',
  ],
};

export default function CodeEditor({
  code,
  language,
  onChange,
  onRun,
  errors = [],
  suggestions = [],
  onSuggestionAccept,
  readOnly = false,
  showLineNumbers = true,
  theme = 'dark',
}: CodeEditorProps): JSX.Element {
  const [cursorLine, setCursorLine] = useState<number>(1);
  const [cursorCol, setCursorCol] = useState<number>(1);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<number>(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const lines = useMemo(() => code.split('\n'), [code]);
  const lineCount = useMemo(() => lines.length, [lines]);

  const errorsByLine = useMemo(() => {
    const map: Record<number, EditorError[]> = {};
    errors.forEach((err) => {
      if (!map[err.line]) map[err.line] = [];
      map[err.line].push(err);
    });
    return map;
  }, [errors]);

  const highlightLine = useCallback(
    (line: string): string => {
      const keywords = LANGUAGE_KEYWORDS[language] || [];
      let result = line;
      result = result.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      keywords.forEach((kw) => {
        const regex = new RegExp(`\\b(${kw})\\b`, 'g');
        result = result.replace(regex, '<span class="kw">$1</span>');
      });
      result = result.replace(/(\/\/.*$)/g, '<span class="comment">$1</span>');
      result = result.replace(/(#.*$)/g, '<span class="comment">$1</span>');
      result = result.replace(/(&quot;|"|'|`)([^"'`]*?)(\1)/g, '<span class="str">$1$2$3</span>');
      result = result.replace(/\b(\d+\.?\d*)\b/g, '<span class="num">$1</span>');
      return result;
    },
    [language],
  );

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (readOnly) return;
      onChange(e.target.value);
      const pos = e.target.selectionStart;
      const textBefore = e.target.value.substring(0, pos);
      const linesBefore = textBefore.split('\n');
      setCursorLine(linesBefore.length);
      setCursorCol(linesBefore[linesBefore.length - 1].length + 1);
    },
    [readOnly, onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        if (!readOnly && textareaRef.current) {
          const start = textareaRef.current.selectionStart;
          const end = textareaRef.current.selectionEnd;
          const newCode = code.substring(0, start) + '  ' + code.substring(end);
          onChange(newCode);
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
            }
          }, 0);
        }
      }
      if (showSuggestions && suggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedSuggestion((prev) => (prev + 1) % suggestions.length);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedSuggestion((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        } else if (e.key === 'Enter' && e.ctrlKey) {
          e.preventDefault();
          onSuggestionAccept?.(suggestions[selectedSuggestion]);
          setShowSuggestions(false);
        } else if (e.key === 'Escape') {
          setShowSuggestions(false);
        }
      }
      if (e.key === ' ' && e.ctrlKey) {
        setShowSuggestions(true);
        setSelectedSuggestion(0);
      }
    },
    [
      code,
      readOnly,
      onChange,
      showSuggestions,
      suggestions,
      selectedSuggestion,
      onSuggestionAccept,
    ],
  );

  return (
    <div className={`code-editor-component theme-${theme}`}>
      <div className="editor-toolbar">
        <span className="language-label">{language}</span>
        <span className="cursor-position">
          Ln {cursorLine}, Col {cursorCol}
        </span>
        {errors.length > 0 && (
          <span className="error-count">
            {errors.length} error{errors.length > 1 ? 's' : ''}
          </span>
        )}
        {onRun && (
          <button className="btn-run" onClick={onRun}>
            ▶ Run
          </button>
        )}
      </div>

      <div className="editor-body">
        {showLineNumbers && (
          <div className="line-numbers-gutter">
            {Array.from({ length: lineCount }).map((_, i) => (
              <div
                key={i}
                className={`line-number ${cursorLine === i + 1 ? 'active' : ''} ${errorsByLine[i + 1] ? 'has-error' : ''}`}
              >
                {errorsByLine[i + 1] && <span className="error-marker">●</span>}
                {i + 1}
              </div>
            ))}
          </div>
        )}

        <div className="editor-content">
          <div className="syntax-layer" aria-hidden="true">
            {lines.map((line, i) => (
              <div
                key={i}
                className={`syntax-line ${cursorLine === i + 1 ? 'active-line' : ''} ${errorsByLine[i + 1] ? 'error-line' : ''}`}
                dangerouslySetInnerHTML={{
                  __html: sanitizeCodeHighlight(highlightLine(line) || ' '),
                }}
              />
            ))}
          </div>
          <textarea
            ref={textareaRef}
            className="code-input"
            value={code}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            readOnly={readOnly}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
        </div>
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="suggestions-popup">
          {suggestions.map((sug, i) => (
            <div
              key={sug.id}
              className={`suggestion-item ${i === selectedSuggestion ? 'selected' : ''}`}
              onClick={() => {
                onSuggestionAccept?.(sug);
                setShowSuggestions(false);
              }}
            >
              <span className={`sug-type ${sug.type}`}>
                {sug.type === 'completion' ? 'C' : sug.type === 'fix' ? 'F' : 'R'}
              </span>
              <span className="sug-text">{sug.text}</span>
              <span className="sug-confidence">{Math.round(sug.confidence * 100)}%</span>
            </div>
          ))}
          <div className="suggestions-hint">Ctrl+Enter to accept, Esc to dismiss</div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="errors-panel">
          {errors.map((err, i) => (
            <div key={i} className={`error-item ${err.severity}`}>
              <span className="error-severity">{err.severity}</span>
              <span className="error-location">
                Ln {err.line}:{err.column}
              </span>
              <span className="error-message">{err.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import { useMemo } from 'react';

interface SyntaxHighlighterProps {
  code: string;
  language: string;
  lineNumbers?: boolean;
  highlightedLines?: number[];
  onLineClick?: (lineNumber: number) => void;
}

// Simple token-based syntax highlighting for common languages
// In production, this would use Shiki or Prism — but for now, we do client-side regex tokenization
type TokenType = 'keyword' | 'string' | 'comment' | 'number' | 'function' | 'type' | 'operator' | 'punctuation' | 'plain';

interface Token {
  type: TokenType;
  value: string;
}

const KEYWORDS: Record<string, Set<string>> = {
  typescript: new Set(['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'interface', 'type', 'export', 'import', 'from', 'default', 'async', 'await', 'new', 'this', 'true', 'false', 'null', 'undefined', 'throw', 'try', 'catch', 'finally', 'switch', 'case', 'break', 'continue', 'extends', 'implements', 'static', 'readonly', 'enum', 'namespace', 'abstract', 'declare', 'module', 'require', 'yield', 'of', 'in', 'instanceof', 'typeof', 'void', 'delete', 'super']),
  javascript: new Set(['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'export', 'import', 'from', 'default', 'async', 'await', 'new', 'this', 'true', 'false', 'null', 'undefined', 'throw', 'try', 'catch', 'finally', 'switch', 'case', 'break', 'continue', 'extends', 'static', 'yield', 'of', 'in', 'instanceof', 'typeof', 'void', 'delete', 'super']),
  python: new Set(['def', 'class', 'if', 'elif', 'else', 'for', 'while', 'return', 'import', 'from', 'as', 'try', 'except', 'finally', 'with', 'yield', 'lambda', 'pass', 'break', 'continue', 'True', 'False', 'None', 'and', 'or', 'not', 'in', 'is', 'global', 'nonlocal', 'raise', 'assert', 'del', 'async', 'await']),
  go: new Set(['func', 'package', 'import', 'var', 'const', 'type', 'struct', 'interface', 'map', 'chan', 'go', 'defer', 'return', 'if', 'else', 'for', 'range', 'switch', 'case', 'default', 'break', 'continue', 'select', 'fallthrough', 'true', 'false', 'nil', 'make', 'new', 'len', 'cap', 'append', 'copy', 'delete']),
  rust: new Set(['fn', 'let', 'mut', 'const', 'struct', 'enum', 'impl', 'trait', 'pub', 'mod', 'use', 'crate', 'self', 'super', 'if', 'else', 'for', 'while', 'loop', 'match', 'return', 'break', 'continue', 'move', 'async', 'await', 'where', 'type', 'true', 'false', 'Some', 'None', 'Ok', 'Err', 'Self', 'unsafe', 'static', 'ref', 'as', 'in', 'dyn', 'extern']),
};

function tokenizeLine(line: string, language: string): Token[] {
  const tokens: Token[] = [];
  const keywords = KEYWORDS[language] ?? KEYWORDS.typescript ?? new Set();
  let i = 0;

  while (i < line.length) {
    // Comments
    if (line.startsWith('//', i) || (language === 'python' && line[i] === '#')) {
      tokens.push({ type: 'comment', value: line.slice(i) });
      break;
    }

    // Strings (single/double/backtick)
    if (line[i] === '"' || line[i] === "'" || line[i] === '`') {
      const quote = line[i];
      let j = i + 1;
      while (j < line.length && line[j] !== quote) {
        if (line[j] === '\\') j++;
        j++;
      }
      tokens.push({ type: 'string', value: line.slice(i, j + 1) });
      i = j + 1;
      continue;
    }

    // Numbers
    if (/\d/.test(line[i]) && (i === 0 || /[\s(,=+\-*/%<>!&|^~[{:]/.test(line[i - 1]))) {
      let j = i;
      while (j < line.length && /[\d._xXbBoOeE]/.test(line[j])) j++;
      tokens.push({ type: 'number', value: line.slice(i, j) });
      i = j;
      continue;
    }

    // Words (keywords, functions, types, identifiers)
    if (/[a-zA-Z_$]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[a-zA-Z0-9_$]/.test(line[j])) j++;
      const word = line.slice(i, j);
      if (keywords.has(word)) {
        tokens.push({ type: 'keyword', value: word });
      } else if (j < line.length && line[j] === '(') {
        tokens.push({ type: 'function', value: word });
      } else if (word[0] === word[0].toUpperCase() && /[a-z]/.test(word)) {
        tokens.push({ type: 'type', value: word });
      } else {
        tokens.push({ type: 'plain', value: word });
      }
      i = j;
      continue;
    }

    // Operators
    if (/[+\-*/%=<>!&|^~?:]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[+\-*/%=<>!&|^~?:]/.test(line[j])) j++;
      tokens.push({ type: 'operator', value: line.slice(i, j) });
      i = j;
      continue;
    }

    // Punctuation
    if (/[{}()\[\];,.]/.test(line[i])) {
      tokens.push({ type: 'punctuation', value: line[i] });
      i++;
      continue;
    }

    // Whitespace and other
    tokens.push({ type: 'plain', value: line[i] });
    i++;
  }

  return tokens;
}

const TOKEN_COLORS: Record<TokenType, string> = {
  keyword: '#c678dd',
  string: '#98c379',
  comment: '#5c6370',
  number: '#d19a66',
  function: '#61afef',
  type: '#e5c07b',
  operator: '#56b6c2',
  punctuation: '#abb2bf',
  plain: '#abb2bf',
};

/**
 * Client-side syntax highlighter with line numbers and click-to-permalink.
 * Supports TypeScript, JavaScript, Python, Go, Rust.
 * Provides basic but functional highlighting without external deps.
 */
export function SyntaxHighlighter({
  code,
  language,
  lineNumbers = true,
  highlightedLines = [],
  onLineClick,
}: SyntaxHighlighterProps) {
  const lines = useMemo(() => code.split('\n'), [code]);
  const tokenizedLines = useMemo(
    () => lines.map((line) => tokenizeLine(line, language)),
    [lines, language],
  );

  return (
    <div className="syntax-highlighter">
      <pre className="syntax-pre">
        <code>
          {tokenizedLines.map((tokens, lineIdx) => {
            const lineNum = lineIdx + 1;
            const isHighlighted = highlightedLines.includes(lineNum);
            return (
              <div
                key={lineIdx}
                className={`syntax-line ${isHighlighted ? 'is-highlighted' : ''}`}
              >
                {lineNumbers && (
                  <span
                    className="syntax-line-number"
                    onClick={() => onLineClick?.(lineNum)}
                    role={onLineClick ? 'button' : undefined}
                    tabIndex={onLineClick ? 0 : undefined}
                    aria-label={`Line ${lineNum}`}
                  >
                    {lineNum}
                  </span>
                )}
                <span className="syntax-line-content">
                  {tokens.length === 0 ? '\n' : tokens.map((token, ti) => (
                    <span key={ti} style={{ color: TOKEN_COLORS[token.type] }}>
                      {token.value}
                    </span>
                  ))}
                </span>
              </div>
            );
          })}
        </code>
      </pre>
    </div>
  );
}

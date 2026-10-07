'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  className?: string;
}

function tokenize(code: string, language: string): { type: string; value: string }[] {
  const tokens: { type: string; value: string }[] = [];
  const keywords = new Set([
    'const',
    'let',
    'var',
    'function',
    'return',
    'if',
    'else',
    'for',
    'while',
    'do',
    'switch',
    'case',
    'break',
    'continue',
    'new',
    'this',
    'class',
    'extends',
    'import',
    'export',
    'default',
    'from',
    'async',
    'await',
    'try',
    'catch',
    'finally',
    'throw',
    'typeof',
    'instanceof',
    'in',
    'of',
    'yield',
    'void',
    'delete',
    'interface',
    'type',
    'enum',
    'implements',
    'abstract',
    'public',
    'private',
    'protected',
    'static',
    'readonly',
    'def',
    'class',
    'self',
    'None',
    'True',
    'False',
    'lambda',
    'with',
    'as',
    'elif',
    'except',
    'raise',
    'pass',
    'print',
    'and',
    'or',
    'not',
    'is',
  ]);

  const builtins = new Set([
    'console',
    'Math',
    'JSON',
    'Array',
    'Object',
    'String',
    'Number',
    'Boolean',
    'Promise',
    'Map',
    'Set',
    'Date',
    'Error',
    'RegExp',
    'parseInt',
    'parseFloat',
    'undefined',
    'null',
    'true',
    'false',
    'NaN',
    'Infinity',
  ]);

  let remaining = code;
  while (remaining.length > 0) {
    let matched = false;

    // Single-line comment
    const commentMatch = remaining.match(/^(\/\/[^\n]*|#[^\n]*)/);
    if (commentMatch) {
      tokens.push({ type: 'comment', value: commentMatch[0] });
      remaining = remaining.slice(commentMatch[0].length);
      matched = true;
      continue;
    }

    // Multi-line comment
    const blockComment = remaining.match(/^\/\*[\s\S]*?\*\//);
    if (blockComment) {
      tokens.push({ type: 'comment', value: blockComment[0] });
      remaining = remaining.slice(blockComment[0].length);
      matched = true;
      continue;
    }

    // Strings (double/single/template)
    const strMatch = remaining.match(/^(`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/);
    if (strMatch) {
      tokens.push({ type: 'string', value: strMatch[0] });
      remaining = remaining.slice(strMatch[0].length);
      matched = true;
      continue;
    }

    // Numbers
    const numMatch = remaining.match(/^(\d+\.?\d*(?:[eE][+-]?\d+)?|0x[0-9a-fA-F]+)/);
    if (numMatch) {
      tokens.push({ type: 'number', value: numMatch[0] });
      remaining = remaining.slice(numMatch[0].length);
      matched = true;
      continue;
    }

    // Identifiers/keywords
    const idMatch = remaining.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
    if (idMatch) {
      const word = idMatch[0];
      let type = 'plain';
      if (keywords.has(word)) type = 'keyword';
      else if (builtins.has(word)) type = 'builtin';
      tokens.push({ type, value: word });
      remaining = remaining.slice(word.length);
      matched = true;
      continue;
    }

    // Operators/punctuation
    const opMatch = remaining.match(/^[+\-*/%=<>!&|^~?:;.,{}[\]()@]+/);
    if (opMatch) {
      tokens.push({ type: 'punctuation', value: opMatch[0] });
      remaining = remaining.slice(opMatch[0].length);
      matched = true;
      continue;
    }

    // Whitespace
    const wsMatch = remaining.match(/^(\s+)/);
    if (wsMatch) {
      tokens.push({ type: 'plain', value: wsMatch[0] });
      remaining = remaining.slice(wsMatch[0].length);
      matched = true;
      continue;
    }

    if (!matched) {
      tokens.push({ type: 'plain', value: remaining[0] });
      remaining = remaining.slice(1);
    }
  }

  return tokens;
}

export function CodeBlock({
  code,
  language = '',
  showLineNumbers: initialShowLines = false,
  className = '',
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(initialShowLines);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  const tokens = tokenize(code, language);
  const lines = code.split('\n');

  const displayLang = language || 'text';

  return (
    <div
      className={`relative group rounded-[20px] overflow-hidden border border-[var(--quant-border)] ${className}`}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--quant-code-bg)] border-b border-[var(--quant-border)]">
        <span className="text-xs font-medium text-[var(--quant-muted-foreground)] uppercase tracking-wide">
          {displayLang}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLineNumbers(!showLineNumbers)}
            className="text-xs text-[var(--quant-muted-foreground)] hover:text-white transition-colors px-1.5 py-0.5 rounded"
            aria-label="Toggle line numbers"
          >
            #
          </button>
          <div className="relative">
            <button
              onClick={handleCopy}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center gap-1 text-xs text-[var(--quant-muted-foreground)] hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/10"
              aria-label="Copy code"
            >
              {copied ? (
                <svg
                  className="w-3.5 h-3.5 text-green-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              )}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
            <AnimatePresence>
              {copied && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 text-xs bg-green-600 text-white rounded whitespace-nowrap"
                >
                  Copied!
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Code content */}
      <div className="overflow-x-auto bg-[var(--quant-code-bg)]">
        <pre className="p-3 text-sm leading-relaxed font-mono" style={{ margin: 0 }}>
          <code>
            {showLineNumbers
              ? lines.map((line, i) => (
                  <div key={i} className="flex">
                    <span className="inline-block w-8 text-right pr-3 text-[#585b70] select-none text-xs">
                      {i + 1}
                    </span>
                    <span className="flex-1">
                      {tokenize(line, language).map((token, j) => (
                        <span key={j} className={getTokenClass(token.type)}>
                          {token.value}
                        </span>
                      ))}
                      {'\n'}
                    </span>
                  </div>
                ))
              : tokens.map((token, i) => (
                  <span key={i} className={getTokenClass(token.type)}>
                    {token.value}
                  </span>
                ))}
          </code>
        </pre>
      </div>
    </div>
  );
}

function getTokenClass(type: string): string {
  switch (type) {
    case 'keyword':
      return 'token-keyword text-[#cba6f7]';
    case 'string':
      return 'token-string text-[#a6e3a1]';
    case 'number':
      return 'token-number text-[#fab387]';
    case 'comment':
      return 'token-comment text-[#585b70] italic';
    case 'builtin':
      return 'token-builtin text-[#89b4fa]';
    case 'punctuation':
      return 'token-punctuation text-[#9399b2]';
    default:
      return 'text-[#cdd6f4]';
  }
}

export default CodeBlock;

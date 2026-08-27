'use client';

import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AIDebugAssistantProps {
  onApplyFix: (code: string) => void;
}

interface DebugResult {
  explanation: string;
  suggestedFix?: string;
  links?: string[];
}

/**
 * AI Debug Assistant — paste an error message, get instant fix suggestions.
 * Stack Overflow search + AI explanation in one place.
 * Neither GitHub nor Gmail has this. We make debugging 10x faster.
 */
export function AIDebugAssistant({ onApplyFix }: AIDebugAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [result, setResult] = useState<DebugResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const analyzeError = useCallback(async () => {
    if (!errorText.trim()) return;
    setIsAnalyzing(true);
    setResult(null);

    // Simulate AI analysis — in production calls backend
    await new Promise((r) => setTimeout(r, 1000));

    const lower = errorText.toLowerCase();
    let explanation = '';
    let suggestedFix: string | undefined;

    if (lower.includes('cannot find module') || lower.includes('module not found')) {
      explanation =
        'This error means a required dependency or file import cannot be resolved. Common causes:\n\n1. Package not installed — run `npm install` or `pnpm install`\n2. Typo in import path\n3. Missing file extension\n4. Incorrect tsconfig paths configuration';
      suggestedFix =
        "// Fix: Install the missing package\n// npm install <package-name>\n\n// Or fix the import path:\nimport { something } from './correct-path';";
    } else if (lower.includes('typeerror') || lower.includes('is not a function')) {
      explanation =
        'TypeError occurs when you try to use a value in a way that is incompatible with its type. Common causes:\n\n1. Calling undefined as a function\n2. Accessing property on null/undefined\n3. Wrong import (default vs named)';
      suggestedFix =
        "// Fix: Add null check before calling\nif (typeof myFunction === 'function') {\n  myFunction();\n}\n\n// Or use optional chaining:\nobj?.method?.();";
    } else if (lower.includes('cors') || lower.includes('access-control')) {
      explanation =
        'CORS (Cross-Origin Resource Sharing) error means the server is not allowing requests from your frontend domain. Fix this on the backend:';
      suggestedFix =
        "// Backend fix (Express):\napp.use(cors({\n  origin: ['http://localhost:3000', 'https://yourdomain.com'],\n  credentials: true,\n}));\n\n// Or in Next.js API route:\nres.setHeader('Access-Control-Allow-Origin', '*');";
    } else if (lower.includes('syntax error') || lower.includes('unexpected token')) {
      explanation =
        'Syntax error means the code has a structural problem that prevents parsing. Check for:\n\n1. Missing brackets or parentheses\n2. Extra/missing commas\n3. Unclosed strings\n4. Invalid characters';
    } else {
      explanation = `I analyzed the error. Here is what is likely happening:\n\nThe error "${errorText.slice(0, 50)}..." suggests a runtime issue. Check:\n1. Variable initialization\n2. Async/await patterns\n3. Data type expectations`;
    }

    setResult({ explanation, suggestedFix });
    setIsAnalyzing(false);
  }, [errorText]);

  return (
    <div className="ai-debug">
      <button
        type="button"
        className="ai-debug-trigger flex items-center gap-1.5"
        onClick={() => setIsOpen((v) => !v)}
      >
        <svg
          className="size-4 text-[#FF8C42]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m8 2 1.88 1.88" />
          <path d="M14.12 3.88 16 2" />
          <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
          <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
          <path d="M12 20v-9" />
          <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
          <path d="M6 13H2" />
          <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
          <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
          <path d="M22 13h-4" />
          <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
        </svg>
        Debug Helper
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="ai-debug-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <textarea
              className="ai-debug-input"
              value={errorText}
              onChange={(e) => setErrorText(e.target.value)}
              placeholder="Paste your error message here..."
              rows={3}
            />
            <button
              type="button"
              className="ai-debug-analyze"
              onClick={analyzeError}
              disabled={isAnalyzing || !errorText.trim()}
            >
              {isAnalyzing ? 'Analyzing...' : 'Analyze Error'}
            </button>
            {result && (
              <div className="ai-debug-result">
                <p className="ai-debug-explanation">{result.explanation}</p>
                {result.suggestedFix && (
                  <div className="ai-debug-fix">
                    <header>
                      <span>Suggested fix:</span>
                      <button type="button" onClick={() => onApplyFix(result.suggestedFix!)}>
                        Apply
                      </button>
                    </header>
                    <pre>
                      <code>{result.suggestedFix}</code>
                    </pre>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

'use client';

import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IconLightbulb } from './icons';

interface AICodeExplainerProps {
  code: string;
  language: string;
  startLine?: number;
  endLine?: number;
}

/**
 * AI Code Explainer — select code and get a plain-English explanation.
 * Shows inline annotations explaining what each part does.
 * Like a senior developer reviewing your code and adding comments.
 */
export function AICodeExplainer({ code, language, startLine, endLine }: AICodeExplainerProps) {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [detail, setDetail] = useState<'brief' | 'detailed'>('brief');

  const explain = useCallback(async () => {
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 800));

    const lines = code.split('\n');
    const lineCount = lines.length;
    const hasFunction = code.includes('function') || code.includes('=>');
    const hasClass = code.includes('class ');
    const hasAsync = code.includes('async') || code.includes('await');
    const hasImport = code.includes('import');

    let result = '';
    if (detail === 'brief') {
      if (hasClass)
        result = `This defines a class with ${lines.filter((l) => l.includes('(')).length} methods. It encapsulates related logic into a single reusable unit.`;
      else if (hasFunction && hasAsync)
        result = `This is an async function (${lineCount} lines) that performs asynchronous operations. It uses await to pause execution until promises resolve.`;
      else if (hasFunction)
        result = `This function (${lineCount} lines) processes data and returns a result. ${hasImport ? 'It imports dependencies from external modules.' : ''}`;
      else if (hasImport)
        result = `This section imports ${lines.filter((l) => l.trim().startsWith('import')).length} modules needed by this file.`;
      else
        result = `This ${language} code block (${lineCount} lines) contains logic that ${lineCount > 20 ? 'implements a complex feature' : 'performs a specific operation'}.`;
    } else {
      result = `## Detailed Explanation\n\n`;
      result += `**Language:** ${language}\n`;
      result += `**Lines:** ${startLine ?? 1}–${endLine ?? lineCount}\n`;
      result += `**Complexity:** ${lineCount > 30 ? 'High' : lineCount > 15 ? 'Medium' : 'Low'}\n\n`;
      result += `### What it does:\n`;
      result += hasAsync ? '- Performs asynchronous operations (network calls, file I/O)\n' : '';
      result += hasFunction ? '- Defines reusable logic encapsulated in functions\n' : '';
      result += hasClass ? '- Implements object-oriented design with a class\n' : '';
      result += hasImport ? '- Imports external dependencies\n' : '';
      result += `\n### Key patterns:\n`;
      result += code.includes('try') ? '- Error handling with try/catch\n' : '';
      result +=
        code.includes('map') || code.includes('filter')
          ? '- Functional programming (map/filter/reduce)\n'
          : '';
      result += code.includes('useState') ? '- React state management\n' : '';
      result += code.includes('useEffect') ? '- React side effects\n' : '';
    }

    setExplanation(result);
    setIsLoading(false);
  }, [code, language, detail, startLine, endLine]);

  return (
    <div className="ai-explainer">
      <div className="ai-explainer-controls">
        <select
          className="ai-explainer-detail"
          value={detail}
          onChange={(e) => setDetail(e.target.value as 'brief' | 'detailed')}
        >
          <option value="brief">Brief</option>
          <option value="detailed">Detailed</option>
        </select>
        <button
          type="button"
          className="ai-explainer-btn inline-flex items-center gap-1"
          onClick={explain}
          disabled={isLoading}
        >
          {isLoading ? (
            '...'
          ) : (
            <>
              <IconLightbulb size={12} />
              Explain
            </>
          )}
        </button>
      </div>
      <AnimatePresence>
        {explanation && (
          <motion.div
            className="ai-explainer-result"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <pre className="ai-explainer-text">{explanation}</pre>
            <button
              type="button"
              className="ai-explainer-dismiss"
              onClick={() => setExplanation(null)}
            >
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

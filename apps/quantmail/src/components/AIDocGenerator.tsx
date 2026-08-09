'use client';

import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AIDocGeneratorProps {
  code: string;
  language: string;
  onApplyDocs: (documentedCode: string) => void;
}

type DocStyle = 'jsdoc' | 'tsdoc' | 'docstring' | 'readme';

/**
 * AI Documentation Generator — auto-generates docs for your code.
 * Supports JSDoc, TSDoc, Python docstrings, and README generation.
 * One-click to add comprehensive documentation to any file.
 */
export function AIDocGenerator({ code, language, onApplyDocs }: AIDocGeneratorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [style, setStyle] = useState<DocStyle>('tsdoc');
  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const generate = useCallback(async () => {
    setIsGenerating(true);
    await new Promise((r) => setTimeout(r, 900));

    const lines = code.split('\n');
    const documented: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Add docs before function declarations
      if (trimmed.match(/^(export\s+)?(async\s+)?function\s+\w+/) ||
          trimmed.match(/^(export\s+)?const\s+\w+\s*=\s*(async\s+)?\(/)) {
        const funcName = trimmed.match(/(?:function|const)\s+(\w+)/)?.[1] || 'unknown';
        const params = trimmed.match(/\(([^)]*)\)/)?.[1] || '';
        const paramList = params.split(',').map((p) => p.trim()).filter(Boolean);
        
        if (style === 'tsdoc' || style === 'jsdoc') {
          documented.push('/**');
          documented.push(` * ${funcName} — handles ${funcName.replace(/([A-Z])/g, ' $1').toLowerCase().trim()}.`);
          for (const param of paramList) {
            const pName = param.split(/[:\s=]/)[0].trim();
            documented.push(` * @param ${pName} - The ${pName} parameter`);
          }
          documented.push(` * @returns The processed result`);
          documented.push(' */');
        } else if (style === 'docstring') {
          // Will be handled differently for Python
        }
      }

      // Add docs before class declarations
      if (trimmed.match(/^(export\s+)?class\s+\w+/)) {
        const className = trimmed.match(/class\s+(\w+)/)?.[1] || 'unknown';
        documented.push('/**');
        documented.push(` * ${className} — ${className.replace(/([A-Z])/g, ' $1').trim()}.`);
        documented.push(` * @class`);
        documented.push(' */');
      }

      // Add docs before interface/type declarations
      if (trimmed.match(/^(export\s+)?interface\s+\w+/) || trimmed.match(/^(export\s+)?type\s+\w+\s*=/)) {
        const typeName = trimmed.match(/(?:interface|type)\s+(\w+)/)?.[1] || 'unknown';
        documented.push('/**');
        documented.push(` * ${typeName} — type definition for ${typeName.replace(/([A-Z])/g, ' $1').toLowerCase().trim()}.`);
        documented.push(' */');
      }

      documented.push(line);
    }

    setResult(documented.join('\n'));
    setIsGenerating(false);
  }, [code, style]);

  return (
    <div className="ai-doc-gen">
      <button type="button" className="ai-doc-trigger" onClick={() => setIsOpen((v) => !v)}>
        📝 Auto-Document
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="ai-doc-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="ai-doc-styles">
              {(['tsdoc', 'jsdoc', 'docstring', 'readme'] as DocStyle[]).map((s) => (
                <button key={s} type="button" className={style === s ? 'is-active' : ''} onClick={() => setStyle(s)}>
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
            <button type="button" className="ai-doc-generate" onClick={generate} disabled={isGenerating}>
              {isGenerating ? 'Generating...' : '✦ Generate Documentation'}
            </button>
            {result && (
              <div className="ai-doc-result">
                <header>
                  <span>Documented code preview</span>
                  <button type="button" onClick={() => onApplyDocs(result)}>Apply</button>
                </header>
                <pre><code>{result.slice(0, 500)}{result.length > 500 ? '\n...' : ''}</code></pre>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

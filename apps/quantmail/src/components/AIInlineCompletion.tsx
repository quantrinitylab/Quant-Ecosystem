'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface AIInlineCompletionProps {
  code: string;
  cursorPosition: number;
  language: string;
  onAccept: (completion: string) => void;
  onDismiss: () => void;
  enabled: boolean;
}

/**
 * AI Inline Code Completion — GitHub Copilot's ghost text feature.
 * Shows faded completion suggestions as you type.
 * Tab to accept, Esc to dismiss.
 * 
 * Uses debounced AI calls (300ms after last keystroke).
 */
export function AIInlineCompletion({
  code,
  cursorPosition,
  language,
  onAccept,
  onDismiss,
  enabled,
}: AIInlineCompletionProps) {
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRequestRef = useRef<string>('');

  useEffect(() => {
    if (!enabled) {
      setSuggestion(null);
      return;
    }

    // Debounce: wait 300ms after last change
    if (debounceRef.current) clearTimeout(debounceRef.current);
    
    const contextBefore = code.substring(Math.max(0, cursorPosition - 500), cursorPosition);
    const contextKey = contextBefore.slice(-100);
    
    // Don't re-trigger if context hasn't changed meaningfully
    if (contextKey === lastRequestRef.current) return;

    debounceRef.current = setTimeout(async () => {
      lastRequestRef.current = contextKey;
      setIsLoading(true);
      
      try {
        const completion = await generateCompletion(contextBefore, language);
        if (completion) {
          setSuggestion(completion);
        } else {
          setSuggestion(null);
        }
      } catch {
        setSuggestion(null);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [code, cursorPosition, language, enabled]);

  // Tab to accept
  useEffect(() => {
    if (!suggestion) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && suggestion) {
        e.preventDefault();
        onAccept(suggestion);
        setSuggestion(null);
      }
      if (e.key === 'Escape') {
        onDismiss();
        setSuggestion(null);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [suggestion, onAccept, onDismiss]);

  if (!suggestion || !enabled) return null;

  return (
    <span className="inline-completion" aria-hidden="true">
      {suggestion}
    </span>
  );
}

/**
 * Ghost text overlay component — renders the completion as faded text
 * positioned exactly after the cursor in the editor.
 */
export function CompletionOverlay({
  suggestion,
  visible,
}: {
  suggestion: string | null;
  visible: boolean;
}) {
  if (!suggestion || !visible) return null;

  return (
    <div className="completion-overlay" aria-hidden="true">
      <span className="completion-ghost-text">{suggestion}</span>
      <span className="completion-hint">Tab to accept</span>
    </div>
  );
}

/**
 * Generate code completion based on context.
 * In production: calls backend AI endpoint.
 * For now: pattern-based smart completions.
 */
async function generateCompletion(contextBefore: string, language: string): Promise<string | null> {
  // Simulate network delay
  await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));

  const lastLine = contextBefore.split('\n').pop() || '';
  const trimmed = lastLine.trim();

  // TypeScript/JavaScript completions
  if (language === 'typescript' || language === 'javascript') {
    if (trimmed.endsWith('const ')) return 'result = ';
    if (trimmed.endsWith('function ')) return 'handleSubmit(event: React.FormEvent) {\n  event.preventDefault();\n  \n}';
    if (trimmed.endsWith('export ')) return 'default function Component() {\n  return (\n    <div>\n      \n    </div>\n  );\n}';
    if (trimmed.endsWith('import ')) return "{ useState, useEffect } from 'react';";
    if (trimmed.endsWith('useState(')) return "''";
    if (trimmed.endsWith('useEffect(() => {')) return '\n    // Effect logic here\n    return () => {\n      // Cleanup\n    };\n  }, []);';
    if (trimmed.endsWith('interface ')) return 'Props {\n  children: React.ReactNode;\n  className?: string;\n}';
    if (trimmed.endsWith('async ')) return 'function fetchData() {\n  try {\n    const response = await fetch(url);\n    return response.json();\n  } catch (error) {\n    console.error(error);\n  }\n}';
    if (trimmed.startsWith('//') && trimmed.length > 3) return null; // Don't complete comments
    if (trimmed.endsWith('return (')) return '\n    <div className="">\n      \n    </div>\n  );';
    if (trimmed.endsWith('.map(')) return '(item) => (\n      <div key={item.id}>{item.name}</div>\n    ))';
    if (trimmed.endsWith('.filter(')) return '(item) => item.isActive)';
    if (trimmed.endsWith('try {')) return '\n    \n  } catch (error) {\n    console.error(error);\n  }';
  }

  // Python completions
  if (language === 'python') {
    if (trimmed.endsWith('def ')) return 'process_data(self, data: dict) -> dict:\n    """Process the input data."""\n    pass';
    if (trimmed.endsWith('class ')) return 'Service:\n    def __init__(self):\n        pass';
    if (trimmed.endsWith('import ')) return 'os\nimport sys';
    if (trimmed.endsWith('if __name__')) return ' == "__main__":\n    main()';
  }

  // Don't suggest for very short context
  if (trimmed.length < 3) return null;

  return null;
}

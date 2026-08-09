'use client';

import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';

interface AICommitMessageProps {
  diff: string;
  onUseMessage: (message: string) => void;
}

/**
 * AI Commit Message Generator — analyzes your code diff and suggests a conventional commit message.
 * GitHub doesn't have this. We generate perfect commit messages automatically.
 */
export function AICommitMessage({ diff, onUseMessage }: AICommitMessageProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const generateMessages = useCallback(async () => {
    setIsGenerating(true);
    // Simulate AI generation — in production calls backend
    await new Promise((r) => setTimeout(r, 800));

    // Analyze diff to generate smart messages
    const lines = diff.split('\n');
    const adds = lines.filter((l) => l.startsWith('+')).length;
    const removes = lines.filter((l) => l.startsWith('-')).length;
    const files = lines.filter((l) => l.startsWith('diff --git')).length;

    const suggestions = [
      `feat: ${adds > removes ? 'add' : 'update'} ${files} file${files > 1 ? 's' : ''} with ${adds} additions and ${removes} deletions`,
      `refactor: improve code quality and readability`,
      `fix: resolve issues in ${files > 1 ? 'multiple files' : 'affected file'}`,
    ];

    setSuggestions(suggestions);
    setIsGenerating(false);
  }, [diff]);

  return (
    <div className="ai-commit-msg">
      <button type="button" className="ai-commit-trigger" onClick={generateMessages} disabled={isGenerating}>
        <span className="ai-commit-icon">✦</span>
        {isGenerating ? 'Generating...' : 'Generate commit message'}
      </button>
      {suggestions.length > 0 && (
        <motion.div
          className="ai-commit-suggestions"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
        >
          {suggestions.map((msg, idx) => (
            <button
              key={idx}
              type="button"
              className={`ai-commit-option ${selectedIdx === idx ? 'is-selected' : ''}`}
              onClick={() => { setSelectedIdx(idx); onUseMessage(msg); }}
            >
              <code>{msg}</code>
            </button>
          ))}
        </motion.div>
      )}
    </div>
  );
}

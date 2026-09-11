'use client';

import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { IconSparkle } from './icons';
import { errorMessage, requestCommitMessage } from './codehub-ai-client';

interface AICommitMessageProps { diff: string; onUseMessage: (message: string) => void }

export function AICommitMessage({ diff, onUseMessage }: AICommitMessageProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generateMessages = useCallback(async () => {
    if (!diff.trim()) return;
    setIsGenerating(true); setError(null); setSuggestions([]);
    try { setSuggestions(await requestCommitMessage(diff)); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setIsGenerating(false); }
  }, [diff]);

  return <div className="ai-commit-msg">
    <button type="button" className="ai-commit-trigger inline-flex items-center gap-1.5" onClick={generateMessages} disabled={isGenerating || !diff.trim()}>
      <span className="ai-commit-icon inline-flex"><IconSparkle size={12} /></span>
      {isGenerating ? 'Generating...' : 'Generate commit message'}
    </button>
    {error && <p className="text-xs text-rose-400" role="alert">{error}</p>}
    {suggestions.length > 0 && <motion.div className="ai-commit-suggestions" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
      {suggestions.map((msg, idx) => <button key={`${msg}-${idx}`} type="button" className={`ai-commit-option ${selectedIdx === idx ? 'is-selected' : ''}`} onClick={() => { setSelectedIdx(idx); onUseMessage(msg); }}><code>{msg}</code></button>)}
    </motion.div>}
  </div>;
}

'use client';

import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { errorMessage, parseAIJson, requestCodeHubAI } from './codehub-ai-client';

interface AIDebugAssistantProps { onApplyFix: (code: string) => void }
interface DebugResult { explanation: string; suggestedFix?: string }

export function AIDebugAssistant({ onApplyFix }: AIDebugAssistantProps) {
  const [isOpen, setIsOpen] = useState(false); const [errorText, setErrorText] = useState('');
  const [result, setResult] = useState<DebugResult | null>(null); const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const analyzeError = useCallback(async () => {
    if (!errorText.trim()) return; setIsAnalyzing(true); setResult(null); setError(null);
    try {
      const response = await requestCodeHubAI(`Act as a senior debugging assistant. Analyze this error, explain the root cause and provide a concrete minimal fix when possible. Return ONLY JSON: {"explanation":"...","suggestedFix":"code or empty string"}.\n\nError:\n${errorText}`);
      const parsed = parseAIJson<DebugResult>(response); setResult({ explanation: parsed.explanation, suggestedFix: parsed.suggestedFix || undefined });
    } catch (cause) { setError(errorMessage(cause)); } finally { setIsAnalyzing(false); }
  }, [errorText]);
  return <div className="ai-debug">
    <button type="button" className="ai-debug-trigger flex items-center gap-1.5" onClick={() => setIsOpen(v => !v)}>Debug Helper</button>
    <AnimatePresence>{isOpen && <motion.div className="ai-debug-panel" initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}}>
      <textarea className="ai-debug-input" value={errorText} onChange={e=>setErrorText(e.target.value)} placeholder="Paste your error message here..." rows={3}/>
      <button type="button" className="ai-debug-analyze" onClick={analyzeError} disabled={isAnalyzing || !errorText.trim()}>{isAnalyzing?'Analyzing...':'Analyze Error'}</button>
      {error && <p className="text-xs text-rose-400" role="alert">{error}</p>}
      {result && <div className="ai-debug-result"><p className="ai-debug-explanation">{result.explanation}</p>{result.suggestedFix && <div className="ai-debug-fix"><header><span>Suggested fix:</span><button type="button" onClick={()=>onApplyFix(result.suggestedFix!)}>Apply</button></header><pre><code>{result.suggestedFix}</code></pre></div>}</div>}
    </motion.div>}</AnimatePresence>
  </div>;
}

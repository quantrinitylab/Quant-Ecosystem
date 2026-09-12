'use client';

import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IconLightbulb } from './icons';
import { errorMessage, requestCodeHubAI } from './codehub-ai-client';

interface AICodeExplainerProps { code: string; language: string; startLine?: number; endLine?: number }
export function AICodeExplainer({ code, language, startLine, endLine }: AICodeExplainerProps) {
  const [explanation,setExplanation]=useState<string|null>(null); const [isLoading,setIsLoading]=useState(false);
  const [detail,setDetail]=useState<'brief'|'detailed'>('brief'); const [error,setError]=useState<string|null>(null);
  const explain=useCallback(async()=>{ if(!code.trim()) return; setIsLoading(true); setError(null); setExplanation(null);
    try { setExplanation(await requestCodeHubAI(`Explain the following ${language} code in ${detail === 'brief' ? 'a concise plain-English paragraph' : 'a detailed Markdown walkthrough covering behavior, data flow, edge cases, and important patterns'}. The selected range is lines ${startLine ?? 1}-${endLine ?? code.split('\n').length}. Do not invent behavior not supported by the code.\n\n${code}`)); }
    catch(cause){setError(errorMessage(cause));} finally{setIsLoading(false);} },[code,language,detail,startLine,endLine]);
  return <div className="ai-explainer"><div className="ai-explainer-controls">
    <select className="ai-explainer-detail" value={detail} onChange={e=>setDetail(e.target.value as 'brief'|'detailed')}><option value="brief">Brief</option><option value="detailed">Detailed</option></select>
    <button type="button" className="ai-explainer-btn inline-flex items-center gap-1" onClick={explain} disabled={isLoading||!code.trim()}>{isLoading?'...':<><IconLightbulb size={12}/>Explain</>}</button>
  </div>{error&&<p className="text-xs text-rose-400" role="alert">{error}</p>}<AnimatePresence>{explanation&&<motion.div className="ai-explainer-result" initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}}><pre className="ai-explainer-text">{explanation}</pre><button type="button" className="ai-explainer-dismiss" onClick={()=>setExplanation(null)}>×</button></motion.div>}</AnimatePresence></div>;
}

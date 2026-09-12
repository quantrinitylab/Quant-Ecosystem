'use client';

import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { errorMessage, extractCode, requestCodeHubAI } from './codehub-ai-client';

type DocStyle='jsdoc'|'tsdoc'|'docstring'|'readme';
interface AIDocGeneratorProps { code:string; language:string; onApplyDocs:(documentedCode:string)=>void }
export function AIDocGenerator({code,language,onApplyDocs}:AIDocGeneratorProps){
  const[isOpen,setIsOpen]=useState(false);const[style,setStyle]=useState<DocStyle>('tsdoc');const[result,setResult]=useState<string|null>(null);const[isGenerating,setIsGenerating]=useState(false);const[error,setError]=useState<string|null>(null);
  const generate=useCallback(async()=>{if(!code.trim())return;setIsGenerating(true);setResult(null);setError(null);try{const response=await requestCodeHubAI(`Generate accurate ${style} documentation for this ${language} source. ${style==='readme'?'Return a README section describing usage and API.':'Return the complete source with documentation inserted; preserve behavior exactly.'} Return only the requested Markdown or one fenced code block.\n\n${code}`);setResult(extractCode(response));}catch(cause){setError(errorMessage(cause));}finally{setIsGenerating(false);}},[code,language,style]);
  return <div className="ai-doc-gen"><button type="button" className="ai-doc-trigger flex items-center gap-1.5" onClick={()=>setIsOpen(v=>!v)}>Auto-Document</button><AnimatePresence>{isOpen&&<motion.div className="ai-doc-panel" initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}}><div className="ai-doc-styles">{(['tsdoc','jsdoc','docstring','readme'] as DocStyle[]).map(s=><button key={s} type="button" className={style===s?'is-active':''} onClick={()=>setStyle(s)}>{s.toUpperCase()}</button>)}</div><button type="button" className="ai-doc-generate" onClick={generate} disabled={isGenerating||!code.trim()}>{isGenerating?'Generating...':'Generate Documentation'}</button>{error&&<p className="text-xs text-rose-400" role="alert">{error}</p>}{result&&<div className="ai-doc-result"><header><span>Documented code preview</span><button type="button" onClick={()=>onApplyDocs(result)}>Apply</button></header><pre><code>{result.slice(0,500)}{result.length>500?'\n...':''}</code></pre></div>}</motion.div>}</AnimatePresence></div>;
}

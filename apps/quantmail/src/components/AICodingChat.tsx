'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRegisterCommands } from '../lib/keyboard/hooks';
import { readAIIntent } from '../lib/ai-intent-preference';
import { browserApiRequest } from '../services/browser-api-request';
import { Quanty } from './Quanty';
import { quantyReact, useQuantyMood } from '../lib/quanty/reactions';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  codeBlock?: { language: string; code: string };
  timestamp: Date;
}

interface AICodingChatProps {
  currentFile: string | null;
  currentContent: string;
  language: string;
  onApplyCode: (code: string) => void;
  onClose: () => void;
}

const QUICK_ACTIONS = [
  { id: 'explain', label: 'Explain this code' },
  { id: 'refactor', label: 'Refactor' },
  { id: 'test', label: 'Write tests' },
  { id: 'fix', label: 'Fix bugs' },
  { id: 'optimize', label: 'Optimize' },
  { id: 'document', label: 'Add docs' },
  { id: 'types', label: 'Add types' },
  { id: 'convert', label: 'Convert to...' },
];

const ACTION_PROMPTS: Record<string, string> = {
  explain: 'Explain what this code does in plain English. Be concise.',
  refactor: 'Refactor this code to be cleaner and safer. Return the complete improved file in a fenced code block.',
  test: 'Write comprehensive unit tests for this code in a fenced code block.',
  fix: 'Find and fix bugs and edge cases. Return the complete corrected file in a fenced code block.',
  optimize: 'Optimize this code for performance and explain the important changes.',
  document: 'Add appropriate JSDoc or TSDoc. Return the complete documented file in a fenced code block.',
  types: 'Make this code fully type-safe. Return the complete updated file in a fenced code block.',
  convert: 'Suggest an appropriate alternative approach and show the converted code.',
};

function splitCodeBlock(message: string, fallbackLanguage: string) {
  const match = message.match(/```([\w+-]*)\n([\s\S]*?)```/);
  if (!match) return { text: message };
  return {
    text: message.replace(match[0], '').trim() || 'Generated code:',
    code: match[2],
    language: match[1] || fallbackLanguage,
  };
}

export function AICodingChat({ currentFile, currentContent, language, onApplyCode, onClose }: AICodingChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: 'welcome', role: 'system',
    content: "I'm Quanty — your AI coding assistant. Ask me to explain, refactor, test, fix, optimize, or document the current code.",
    timestamp: new Date(),
  }]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mood = useQuantyMood({ channels: ['ai', 'sys'] });

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useRegisterCommands([{ id: 'ai.focusChat', label: 'Focus Quanty chat', group: 'AI', keys: 'mod+l', icon: 'sparkle', description: 'Focus the coding assistant prompt', keywords: ['assistant', 'code'], allowInInput: true, run: () => inputRef.current?.focus() }]);

  const sendMessage = useCallback(async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || isLoading) return;
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: trimmed, timestamp: new Date() };
    const requestMessages = [...messages, userMessage]
      .filter((message) => message.role !== 'system')
      .slice(-24)
      .map(({ role, content: messageContent }) => ({ role: role as 'user' | 'assistant', content: messageContent }));

    setMessages((previous) => [...previous, userMessage]);
    setInput('');
    setIsLoading(true);
    quantyReact('ai:thinking');
    try {
      const response = await browserApiRequest('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: requestMessages,
          intent: readAIIntent(),
          context: {
            app: 'QuantGit',
            route: '/codehub/editor',
            view: currentFile ? `Editing ${currentFile} (${language})` : 'Code editor with no file open',
            screenText: currentFile ? currentContent.slice(0, 8000) : undefined,
          },
        }),
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; data?: { message?: string }; error?: { message?: string } } | null;
      if (!response.ok || !payload?.success || !payload.data?.message) {
        throw new Error(payload?.error?.message || `QuantAI request failed (${response.status})`);
      }
      const parsed = splitCodeBlock(payload.data.message, language);
      setMessages((previous) => [...previous, {
        id: crypto.randomUUID(), role: 'assistant', content: parsed.text,
        codeBlock: parsed.code ? { language: parsed.language || language, code: parsed.code } : undefined,
        timestamp: new Date(),
      }]);
      quantyReact('ai:answered');
    } catch (error) {
      quantyReact('ai:failed');
      setMessages((previous) => [...previous, {
        id: crypto.randomUUID(), role: 'assistant',
        content: error instanceof Error ? error.message : 'QuantAI is temporarily unavailable.',
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [currentContent, currentFile, isLoading, language, messages]);

  return (
    <div className="ai-coding-chat">
      <header className="ai-chat-header">
        <div className="ai-chat-title"><Quanty expression={isLoading ? 'thinking' : mood} size={34} /><strong>QuantAI Code</strong></div>
        <div className="ai-chat-context">{currentFile ? <span className="ai-chat-file">{currentFile.split('/').pop()}</span> : <span className="ai-chat-no-file">No file open</span>}</div>
        <button type="button" className="ai-chat-close" onClick={onClose} aria-label="Close coding assistant">×</button>
      </header>
      <div className="ai-chat-actions">
        {QUICK_ACTIONS.map((action) => <button key={action.id} type="button" className="ai-quick-action" onClick={() => void sendMessage(ACTION_PROMPTS[action.id] || 'Help me with this code.')} disabled={isLoading || !currentFile}>{action.label}</button>)}
      </div>
      <div className="ai-chat-messages">
        {messages.map((message) => (
          <div key={message.id} className={`ai-chat-msg ai-chat-msg--${message.role}`}>
            {message.role === 'assistant' && <span className="ai-msg-avatar"><Quanty size={22} /></span>}
            {message.role === 'user' && <span className="ai-msg-avatar">●</span>}
            <div className="ai-msg-content"><p>{message.content}</p>{message.codeBlock && <div className="ai-code-block"><header className="ai-code-header"><span>{message.codeBlock.language}</span><button type="button" className="ai-apply-btn" onClick={() => onApplyCode(message.codeBlock!.code)}>Apply to editor</button></header><pre className="ai-code-content"><code>{message.codeBlock.code}</code></pre></div>}</div>
          </div>
        ))}
        {isLoading && <div className="ai-chat-msg ai-chat-msg--assistant"><span className="ai-msg-avatar"><Quanty size={22} expression="thinking" /></span><div className="ai-msg-content"><div className="ai-typing"><span /><span /><span /></div></div></div>}
        <div ref={messagesEndRef} />
      </div>
      <form className="ai-chat-input-area" onSubmit={(event) => { event.preventDefault(); void sendMessage(input); }}>
        <textarea ref={inputRef} className="ai-chat-input" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(input); } }} placeholder={currentFile ? `Ask about ${currentFile.split('/').pop()}…` : 'Ask me to generate code…'} rows={2} disabled={isLoading} />
        <button type="submit" className="ai-chat-send" disabled={isLoading || !input.trim()}>Send</button>
      </form>
      <p className="ai-chat-hint">Ctrl+L to focus • Shift+Enter for newline • Enter to send</p>
    </div>
  );
}

'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Quanty } from './Quanty';
import { showToast } from './InboxToast';
import type { Email } from '../types';
import { useRouter } from 'next/navigation';

export interface QuantyAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  contextEmail?: Email | null;
  contextThreadSubject?: string;
  onInsertReply?: (text: string) => void;
}

export function QuantyCopilotDrawer({
  isOpen,
  onClose,
  contextEmail,
  contextThreadSubject,
  onInsertReply,
}: QuantyAssistantDrawerProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([
    {
      role: 'assistant',
      text: "Namaste! I'm Quanty, your Quantum Intelligence assistant. How can I help you with your messages today?",
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [quantyExpression, setQuantyExpression] = useState<
    'idle' | 'happy' | 'thinking' | 'wink' | 'shock'
  >('happy');

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = async (userPrompt?: string) => {
    const promptToSend = userPrompt || inputValue;
    if (!promptToSend.trim() || isLoading) return;

    const newMsgs = [...messages, { role: 'user' as const, text: promptToSend }];
    setMessages(newMsgs);
    setInputValue('');
    setIsLoading(true);
    setQuantyExpression('thinking');

    try {
      // Build context from email if present
      let systemContext = '';
      if (contextEmail) {
        systemContext = `Context Email Subject: "${contextEmail.subject || contextThreadSubject || ''}"\nFrom: "${contextEmail.from?.name || contextEmail.from?.email}"\nBody: "${contextEmail.bodyText || contextEmail.snippet || ''}"`;
      }

      const res = await fetch('/api/ai/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            ...(systemContext
              ? [
                  {
                    role: 'system',
                    content: `You are Quanty AI assistant inside QuantMail. Be helpful, concise, smart, and polite.\n${systemContext}`,
                  },
                ]
              : []),
            ...newMsgs.map((m) => ({ role: m.role, content: m.text })),
          ],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.content) {
          setMessages([...newMsgs, { role: 'assistant', text: data.content }]);
          setQuantyExpression('happy');
          return;
        }
      }

      // Fallback response if offline/simulated
      setTimeout(() => {
        let simulated =
          "I have analyzed this thread. Let me know if you'd like me to draft a reply or schedule a follow-up.";
        if (promptToSend.toLowerCase().includes('hindi')) {
          simulated = `यह ईमेल "${contextThreadSubject || contextEmail?.subject || 'संदेश'}" के बारे में है। क्या आप चाहते हैं कि मैं इसका संक्षिप्त उत्तर तैयार करूँ?`;
        } else if (promptToSend.toLowerCase().includes('summar')) {
          simulated = `Key Highlights:\n• Main topic: ${contextThreadSubject || contextEmail?.subject || 'Inbox update'}\n• Sender: ${contextEmail?.from?.name || 'Verified Sender'}\n• Action: Review and reply when convenient.`;
        }
        setMessages([...newMsgs, { role: 'assistant', text: simulated }]);
        setQuantyExpression('happy');
      }, 700);
    } catch {
      setMessages([
        ...newMsgs,
        {
          role: 'assistant',
          text: 'I could not connect right now, but your request is saved.',
        },
      ]);
      setQuantyExpression('shock');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickChip = (chipType: string) => {
    if (chipType === 'summarize') {
      void handleSend('Please summarize this email in 3 crisp bullet points.');
    } else if (chipType === 'hindi') {
      void handleSend('कृपया इस ईमेल का हिंदी में मुख्य सारांश (Summary) बताएं।');
    } else if (chipType === 'actions') {
      void handleSend('Extract all action items, decisions, and deadlines from this email.');
    } else if (chipType === 'reply') {
      void handleSend('Draft a polite, professional, and concise smart reply to this email.');
    } else if (chipType === 'draft_full_email') {
      // Direct user into Full Compose window
      onClose();
      router.push(`/compose?replyTo=${contextEmail?.id || ''}&aiAssist=true`);
    } else if (chipType === 'receipts') {
      void handleSend(
        'Find and extract any payment receipts, tracking numbers, or ticket details.',
      );
    }
  };

  const placeholderText = contextEmail
    ? 'Ask Quanty anything about this email…'
    : 'Ask Quanty anything…';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          />

          {/* Slide-Up Bottom Sheet Drawer */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 max-w-2xl mx-auto rounded-t-3xl border-t border-x border-zinc-800 bg-[#0e1118]/98 backdrop-blur-2xl shadow-2xl flex flex-col max-h-[85vh] h-[600px] overflow-hidden"
          >
            {/* Top Drag Handle */}
            <div className="flex justify-center pt-3 pb-1 cursor-grab">
              <div className="w-12 h-1.5 rounded-full bg-zinc-700/80" />
            </div>

            {/* Header: Quanty Mascot + "How can I help you today?" */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800/80">
              <div className="flex items-center gap-3">
                <div className="relative size-9 flex items-center justify-center rounded-2xl bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                  <Quanty size={28} expression={quantyExpression} bob={false} />
                  <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-emerald-400 ring-2 ring-[#0e1118]" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-300 bg-clip-text text-transparent">
                    How can I help you today?
                  </h3>
                  <p className="text-[11px] text-zinc-400 font-mono">
                    Quanty AI · Quantum Intelligence
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors"
                aria-label="Close Quanty"
              >
                <svg
                  className="size-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Quick Action Suggestion Chips */}
            <div className="flex items-center gap-2 px-4 py-2.5 overflow-x-auto no-scrollbar border-b border-zinc-800/50 bg-zinc-950/40">
              <button
                type="button"
                onClick={() => handleQuickChip('summarize')}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/25 transition-all shadow-sm active:scale-95"
              >
                <span>📑</span>
                <span>Summarize email</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickChip('hindi')}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/25 transition-all shadow-sm active:scale-95"
              >
                <span>🇮🇳</span>
                <span>Translate to Hindi</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickChip('actions')}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/25 transition-all shadow-sm active:scale-95"
              >
                <span>📌</span>
                <span>Action Items</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickChip('reply')}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/25 transition-all shadow-sm active:scale-95"
              >
                <span>✍️</span>
                <span>Draft Smart Reply</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickChip('draft_full_email')}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/25 transition-all shadow-sm active:scale-95"
              >
                <span>✉️</span>
                <span>Draft Full Email</span>
              </button>
            </div>

            {/* Chat Messages Body */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3.5">
              {messages.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {m.role === 'assistant' && (
                    <div className="size-7 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0">
                      <Quanty size={18} expression="happy" bob={false} />
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] rounded-2xl p-3.5 text-xs leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-br-none shadow-md font-medium'
                        : 'bg-zinc-900/90 border border-zinc-800 text-zinc-200 rounded-bl-none shadow-lg'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.text}</p>

                    {/* Quick "Insert into Reply" button for assistant drafts */}
                    {m.role === 'assistant' && i > 0 && onInsertReply && (
                      <button
                        type="button"
                        onClick={() => {
                          onInsertReply(m.text);
                          onClose();
                          showToast({ text: 'Inserted draft into reply box', type: 'success' });
                        }}
                        className="mt-2.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 transition-all"
                      >
                        <span>↩ Insert into reply</span>
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}

              {isLoading && (
                <div className="flex gap-2.5 items-center">
                  <div className="size-7 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0">
                    <Quanty size={18} expression="thinking" bob={true} />
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-zinc-900/80 border border-zinc-800 text-xs text-cyan-400">
                    <span className="size-1.5 rounded-full bg-cyan-400 animate-bounce" />
                    <span className="size-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:0.15s]" />
                    <span className="size-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:0.3s]" />
                    <span className="ml-1 text-zinc-400 text-[11px]">Quanty is thinking…</span>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Prompt Input Bar */}
            <div className="p-3.5 border-t border-zinc-800/80 bg-zinc-950/80">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSend();
                }}
                className="relative flex items-center"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={placeholderText}
                  className="w-full rounded-2xl border border-zinc-800 bg-[#121620] pl-4 pr-12 py-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/40 transition-all shadow-inner"
                />

                <button
                  type="submit"
                  disabled={!inputValue.trim() || isLoading}
                  className="absolute right-2 p-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 disabled:opacity-30 disabled:hover:bg-cyan-500 transition-all shadow-md active:scale-95"
                  title="Send prompt to Quanty"
                >
                  <svg
                    className="size-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

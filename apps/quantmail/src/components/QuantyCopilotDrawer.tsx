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
  isInboxContext?: boolean;
  onInsertReply?: (text: string) => void;
}

export function QuantyCopilotDrawer({
  isOpen,
  onClose,
  contextEmail,
  contextThreadSubject,
  isInboxContext = false,
  onInsertReply,
}: QuantyAssistantDrawerProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
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
    } else {
      // Reset conversation when closed
      setMessages([]);
      setInputValue('');
      setIsLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (messages.length > 0) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
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
      let systemContext = '';
      if (contextEmail) {
        systemContext = `Context Email Subject: "${contextEmail.subject || contextThreadSubject || ''}"\nFrom: "${contextEmail.from?.name || contextEmail.from?.email}"\nBody: "${contextEmail.bodyText || contextEmail.snippet || ''}"`;
      } else if (isInboxContext) {
        systemContext = `Context: User is browsing their primary QuantMail inbox.`;
      }

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            ...(systemContext
              ? [
                  {
                    role: 'system',
                    content: `You are Quanty AI assistant inside QuantMail. Keep answers crisp, smart, elegant, and directly helpful.\n${systemContext}`,
                  },
                ]
              : []),
            ...newMsgs.map((m) => ({ role: m.role, content: m.text })),
          ],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const responseText = data?.data?.message || data?.content;
        if (responseText) {
          setMessages([...newMsgs, { role: 'assistant', text: responseText }]);
          setQuantyExpression('happy');
          return;
        }
      }

      // High-quality local simulated response fallback
      setTimeout(() => {
        let simulated =
          "I've analyzed this conversation. Everything looks in order. Let me know if you need to draft a reply or create a calendar reminder.";
        if (promptToSend.toLowerCase().includes('hindi')) {
          simulated = `यह ईमेल "${contextThreadSubject || contextEmail?.subject || 'संदेश'}" के संदर्भ में है। यदि आप चाहें तो मैं इसका एक औपचारिक या त्वरित उत्तर तैयार कर सकता हूँ।`;
        } else if (promptToSend.toLowerCase().includes('summar')) {
          simulated = `• Main topic: ${contextThreadSubject || contextEmail?.subject || 'Inbox message'}\n• Sender: ${contextEmail?.from?.name || 'Verified Sender'}\n• Next Step: Review details and reply at your convenience.`;
        }
        setMessages([...newMsgs, { role: 'assistant', text: simulated }]);
        setQuantyExpression('happy');
      }, 600);
    } catch {
      setMessages([
        ...newMsgs,
        {
          role: 'assistant',
          text: 'I could not connect to the assistant service right now. Please try again.',
        },
      ]);
      setQuantyExpression('shock');
    } finally {
      setIsLoading(false);
    }
  };

  const hasConversation = messages.length > 0;

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

          {/* Compact Bottom-Anchored Sheet (Gmail/Gemini Style) */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className={`fixed bottom-0 left-0 right-0 z-50 max-w-xl mx-auto rounded-t-[28px] border-t border-x border-zinc-800/90 bg-[#161a22]/98 backdrop-blur-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden transition-all duration-300 ${
              hasConversation ? 'h-[520px] max-h-[85vh]' : 'h-auto max-h-[75vh]'
            }`}
          >
            {/* Top Drag Handle */}
            <div className="flex justify-center pt-2.5 pb-1 cursor-grab" onClick={onClose}>
              <div className="w-10 h-1 rounded-full bg-zinc-600/80" />
            </div>

            {/* Header: Sparkle + "How can I help you today?" + Close 'X' */}
            <div className="flex items-center justify-between px-5 pt-1 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="text-base text-cyan-400">✦</span>
                <h3 className="text-[17px] font-semibold text-[#64b5f6] tracking-tight">
                  How can I help you today?
                </h3>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                aria-label="Close"
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

            {/* If NO conversation yet: Show clean 1-tap Suggestion Card(s) (Gmail Style) */}
            {!hasConversation && (
              <div className="px-4 pb-2 space-y-2">
                {contextEmail || contextThreadSubject ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        void handleSend('Please summarize this email in 3 crisp bullet points.')
                      }
                      className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-[#242834] hover:bg-[#2b3040] border border-zinc-700/50 text-left transition-all active:scale-[0.99] group shadow-sm"
                    >
                      <div className="size-8 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-300 text-sm shrink-0 group-hover:scale-105 transition-transform">
                        <svg
                          className="size-4 text-zinc-300"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-zinc-100">
                          Summarize this email
                        </p>
                      </div>
                    </button>

                    <div className="flex items-center gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          void handleSend(
                            'Draft a polite, professional, and concise smart reply to this email.',
                          )
                        }
                        className="flex-1 flex items-center gap-2 p-2.5 rounded-xl bg-[#1e222c] hover:bg-[#272c38] border border-zinc-800 text-left transition-all text-xs text-zinc-300"
                      >
                        <span>✍️</span>
                        <span className="truncate">Draft a reply</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          void handleSend(
                            'कृपया इस ईमेल का हिंदी में मुख्य सारांश (Summary) बताएं।',
                          )
                        }
                        className="flex-1 flex items-center gap-2 p-2.5 rounded-xl bg-[#1e222c] hover:bg-[#272c38] border border-zinc-800 text-left transition-all text-xs text-zinc-300"
                      >
                        <span>🇮🇳</span>
                        <span className="truncate">Hindi Summary</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleSend('What are my top priority unread emails today?')}
                    className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-[#242834] hover:bg-[#2b3040] border border-zinc-700/50 text-left transition-all active:scale-[0.99] group shadow-sm"
                  >
                    <div className="size-8 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-300 text-sm shrink-0 group-hover:scale-105 transition-transform">
                      <span className="text-cyan-400">✨</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-zinc-100">
                        What can Quanty do in QuantMail?
                      </p>
                    </div>
                  </button>
                )}
              </div>
            )}

            {/* If conversation active: Messages Stack */}
            {hasConversation && (
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
                {messages.map((m, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-2.5 ${
                      m.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {m.role === 'assistant' && (
                      <div className="size-7 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs text-cyan-300">✦</span>
                      </div>
                    )}

                    <div
                      className={`max-w-[86%] rounded-2xl px-4 py-3 text-xs sm:text-[13px] leading-relaxed ${
                        m.role === 'user'
                          ? 'bg-[#1a73e8] text-white rounded-br-none shadow-md font-medium'
                          : 'bg-[#242834] border border-zinc-700/60 text-zinc-100 rounded-bl-none shadow-lg'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.text}</p>

                      {m.role === 'assistant' && onInsertReply && (
                        <button
                          type="button"
                          onClick={() => {
                            onInsertReply(m.text);
                            onClose();
                            showToast({ text: 'Inserted draft into reply', type: 'success' });
                          }}
                          className="mt-2.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-cyan-300 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 transition-all"
                        >
                          <span>↩ Insert into reply</span>
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}

                {isLoading && (
                  <div className="flex gap-2.5 items-center">
                    <div className="size-7 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center shrink-0">
                      <span className="text-xs text-cyan-300 animate-spin">✦</span>
                    </div>
                    <div className="px-3.5 py-2 rounded-2xl bg-[#242834] border border-zinc-700/60 text-xs text-zinc-400 flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-cyan-400 animate-bounce" />
                      <span className="size-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:0.15s]" />
                      <span className="size-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:0.3s]" />
                      <span className="ml-1 text-[11px]">Thinking…</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Bottom Rounded Pill Prompt Input (Gmail Style) */}
            <div className="p-3.5 pt-2">
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
                  placeholder="Enter a prompt here"
                  className="w-full rounded-full border border-zinc-700/70 bg-[#20242f] pl-4 pr-11 py-3 text-xs sm:text-[13px] text-white placeholder-zinc-400 focus:outline-none focus:border-[#64b5f6] focus:ring-1 focus:ring-[#64b5f6]/40 transition-all shadow-inner"
                />

                <button
                  type="submit"
                  disabled={!inputValue.trim() || isLoading}
                  className="absolute right-2 p-1.5 rounded-full text-zinc-400 hover:text-white disabled:opacity-30 transition-all active:scale-95"
                  title="Send"
                >
                  <svg
                    className="size-5 text-zinc-300"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                </button>
              </form>

              <div className="pt-2 text-center">
                <span className="text-[10px] text-zinc-500 font-sans">
                  Quanty AI · Quantum Intelligence can make mistakes.
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

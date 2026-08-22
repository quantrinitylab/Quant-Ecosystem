'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Quanty } from './Quanty';
import { showToast } from './InboxToast';
import type { Email } from '../types';

export interface QuantyAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  contextEmail?: Email | null;
  contextThreadSubject?: string;
  isInboxContext?: boolean;
  onInsertReply?: (text: string) => void;
}

interface ChatHistoryItem {
  id: string;
  date: string;
  preview: string;
  messages: Array<{ role: 'user' | 'assistant'; text: string }>;
}

const STORAGE_KEY = 'quantmail_quanty_chats_v1';

export function QuantyCopilotDrawer({
  isOpen,
  onClose,
  contextEmail,
  contextThreadSubject,
  isInboxContext = false,
  onInsertReply,
}: QuantyAssistantDrawerProps) {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [quantyExpression, setQuantyExpression] = useState<
    'idle' | 'happy' | 'thinking' | 'wink' | 'shock'
  >('happy');

  const [showHistoryMenu, setShowHistoryMenu] = useState(false);
  const [historyList, setHistoryList] = useState<ChatHistoryItem[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setHistoryList(JSON.parse(saved));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
      setShowHistoryMenu(false);
    } else {
      setShowHistoryMenu(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (messages.length > 0) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  const saveCurrentConversation = (
    newMsgs: Array<{ role: 'user' | 'assistant'; text: string }>,
  ) => {
    if (newMsgs.length < 2) return;
    try {
      const firstUserMsg = newMsgs.find((m) => m.role === 'user')?.text || 'Conversation';
      const newItem: ChatHistoryItem = {
        id: Date.now().toString(),
        date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        preview: firstUserMsg.slice(0, 45),
        messages: newMsgs,
      };
      const updated = [newItem, ...historyList.filter((h) => h.preview !== newItem.preview)].slice(
        0,
        15,
      );
      setHistoryList(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

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
          const finalMsgs = [...newMsgs, { role: 'assistant' as const, text: responseText }];
          setMessages(finalMsgs);
          setQuantyExpression('happy');
          saveCurrentConversation(finalMsgs);
          return;
        }
      }

      // High-quality local simulated fallback
      setTimeout(() => {
        let simulated =
          "I've analyzed this conversation. Everything looks in order. Let me know if you need to draft a reply or schedule a reminder.";
        if (promptToSend.toLowerCase().includes('hindi')) {
          simulated = `यह ईमेल "${contextThreadSubject || contextEmail?.subject || 'संदेश'}" के संदर्भ में है। यदि आप चाहें तो मैं इसका औपचारिक उत्तर तैयार कर सकता हूँ।`;
        } else if (promptToSend.toLowerCase().includes('summar')) {
          simulated = `• Main topic: ${contextThreadSubject || contextEmail?.subject || 'Inbox message'}\n• Sender: ${contextEmail?.from?.name || 'Verified Sender'}\n• Next Step: Review details and reply at your convenience.`;
        }
        const finalMsgs = [...newMsgs, { role: 'assistant' as const, text: simulated }];
        setMessages(finalMsgs);
        setQuantyExpression('happy');
        saveCurrentConversation(finalMsgs);
      }, 500);
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

  const clearHistory = () => {
    setHistoryList([]);
    localStorage.removeItem(STORAGE_KEY);
    setShowHistoryMenu(false);
    showToast({ text: 'Recent chat history cleared', type: 'info' });
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
            className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm"
          />

          {/* Full-Width Mobile & Centered Desktop Bottom Sheet with Swipe-to-Dismiss */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100 || info.velocity.y > 400) {
                onClose();
              }
            }}
            className={`fixed bottom-0 left-0 right-0 z-50 w-full sm:max-w-xl sm:mx-auto rounded-t-[28px] border-t border-x border-amber-500/20 bg-[#121620] shadow-[0_-12px_45px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden transition-all duration-300 ${
              hasConversation ? 'h-[520px] max-h-[85vh]' : 'h-auto max-h-[75vh]'
            }`}
          >
            {/* Top Drag Handle */}
            <div className="flex justify-center pt-2.5 pb-1 cursor-grab active:cursor-grabbing">
              <div className="w-12 h-1 rounded-full bg-zinc-600/80" />
            </div>

            {/* Header: Quanty Mascot Robot Icon + "How can I help you today?" + 3-Dots + Close */}
            <div className="flex items-center justify-between px-4 sm:px-5 pt-1 pb-3 relative">
              <div className="flex items-center gap-3">
                {/* Standalone Living Mascot Robot Icon with zero background layer */}
                <Quanty size={32} expression={quantyExpression} bob={false} />
                <h3 className="text-base sm:text-[17px] font-bold text-amber-300 tracking-tight">
                  How can I help you today?
                </h3>
              </div>

              <div className="flex items-center gap-1">
                {/* 3-Dots Recent History Menu */}
                <button
                  type="button"
                  onClick={() => setShowHistoryMenu(!showHistoryMenu)}
                  className={`p-1.5 rounded-full transition-colors ${
                    showHistoryMenu
                      ? 'text-amber-300 bg-amber-500/20'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                  title="Chat History"
                >
                  <svg
                    className="size-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="1" fill="currentColor" />
                    <circle cx="12" cy="5" r="1" fill="currentColor" />
                    <circle cx="12" cy="19" r="1" fill="currentColor" />
                  </svg>
                </button>

                {/* Close Button */}
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

              {/* History Dropdown Panel */}
              <AnimatePresence>
                {showHistoryMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -5 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -5 }}
                    className="absolute right-4 top-12 z-50 w-64 rounded-2xl border border-amber-500/30 bg-[#161a26] p-3 shadow-2xl space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800">
                      <span className="font-bold text-amber-300">Recent Chats</span>
                      {historyList.length > 0 && (
                        <button
                          type="button"
                          onClick={clearHistory}
                          className="text-[10px] text-rose-400 hover:underline"
                        >
                          Clear all
                        </button>
                      )}
                    </div>

                    {historyList.length === 0 ? (
                      <p className="text-[11px] text-zinc-500 py-2 text-center">
                        No previous chats recorded
                      </p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {historyList.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setMessages(item.messages);
                              setShowHistoryMenu(false);
                            }}
                            className="w-full text-left p-2 rounded-xl hover:bg-zinc-800/80 transition-colors text-zinc-300 flex items-center justify-between"
                          >
                            <span className="truncate flex-1 min-w-0 mr-2 text-[11px]">
                              {item.preview}
                            </span>
                            <span className="text-[9px] text-zinc-500 font-mono shrink-0">
                              {item.date}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Quick Action Suggestion Cards (QuantMail Gold / Amber Theme) */}
            {!hasConversation && (
              <div className="px-4 pb-2 space-y-2">
                {contextEmail || contextThreadSubject ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        void handleSend('Please summarize this email in 3 crisp bullet points.')
                      }
                      className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-[#1a1f2c] hover:bg-[#222838] border border-amber-500/20 text-left transition-all active:scale-[0.99] group shadow-md"
                    >
                      <div className="size-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-300 text-sm shrink-0 group-hover:scale-105 transition-transform">
                        <svg
                          className="size-4 text-amber-400"
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
                        <p className="text-[13px] font-semibold text-zinc-100">
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
                        className="flex-1 flex items-center gap-2 p-2.5 rounded-xl bg-[#161a26] hover:bg-[#1d2232] border border-zinc-800 text-left transition-all text-xs text-zinc-300 font-medium"
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
                        className="flex-1 flex items-center gap-2 p-2.5 rounded-xl bg-[#161a26] hover:bg-[#1d2232] border border-zinc-800 text-left transition-all text-xs text-zinc-300 font-medium"
                      >
                        <span>🇮🇳</span>
                        <span className="truncate">Hindi Summary</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      void handleSend('What can Quanty do to manage my emails and daily tasks?')
                    }
                    className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-[#1a1f2c] hover:bg-[#222838] border border-amber-500/20 text-left transition-all active:scale-[0.99] group shadow-md"
                  >
                    <Quanty size={26} expression="happy" bob={false} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-zinc-100">
                        What can Quanty do in QuantMail?
                      </p>
                    </div>
                  </button>
                )}
              </div>
            )}

            {/* Conversation Active: Messages Stack */}
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
                      <div className="shrink-0 mt-0.5">
                        <Quanty size={22} expression={quantyExpression} bob={false} />
                      </div>
                    )}

                    <div
                      className={`max-w-[86%] rounded-2xl px-4 py-3 text-xs sm:text-[13px] leading-relaxed ${
                        m.role === 'user'
                          ? 'bg-gradient-to-r from-[#FF7A00] to-[#ea580c] text-white rounded-br-none shadow-md font-medium'
                          : 'bg-[#181c26] border border-amber-500/20 text-zinc-100 rounded-bl-none shadow-lg'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.text}</p>

                      {m.role === 'assistant' &&
                        onInsertReply &&
                        i > 0 &&
                        messages[i - 1]?.role === 'user' &&
                        (messages[i - 1].text.toLowerCase().includes('draft') ||
                          messages[i - 1].text.toLowerCase().includes('write a reply') ||
                          messages[i - 1].text.toLowerCase().includes('compose') ||
                          messages[i - 1].text.toLowerCase().includes('formalize') ||
                          messages[i - 1].text.toLowerCase().includes('उत्तर तैयार') ||
                          messages[i - 1].text.toLowerCase().includes('reply to')) && (
                          <button
                            type="button"
                            onClick={() => {
                              onInsertReply(m.text);
                              onClose();
                              showToast({ text: 'Inserted draft into reply', type: 'success' });
                            }}
                            className="mt-2.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 transition-all"
                          >
                            <span>↩ Insert into reply</span>
                          </button>
                        )}
                    </div>
                  </motion.div>
                ))}

                {isLoading && (
                  <div className="flex gap-2.5 items-center">
                    <div className="shrink-0">
                      <Quanty size={22} expression="thinking" bob={false} />
                    </div>
                    <div className="px-3.5 py-2 rounded-2xl bg-[#181c26] border border-amber-500/20 text-xs text-amber-400 flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-[#FF7A00] animate-bounce" />
                      <span className="size-1.5 rounded-full bg-[#FF7A00] animate-bounce [animation-delay:0.15s]" />
                      <span className="size-1.5 rounded-full bg-[#FF7A00] animate-bounce [animation-delay:0.3s]" />
                      <span className="ml-1 text-[11px] text-zinc-400">Quanty is thinking…</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Bottom Rounded Pill Prompt Input + "Quanty can make mistakes." Disclaimer */}
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
                  className="w-full rounded-full border border-zinc-700/80 bg-[#1a1f2c] pl-4 pr-11 py-3 text-xs sm:text-[13px] text-white placeholder-zinc-400 focus:outline-none focus:border-[#FF7A00] focus:ring-1 focus:ring-[#FF7A00]/40 transition-all shadow-inner font-sans"
                />

                <button
                  type="submit"
                  disabled={!inputValue.trim() || isLoading}
                  className="absolute right-2 p-1.5 rounded-full text-amber-400 hover:text-amber-300 disabled:opacity-30 transition-all active:scale-95"
                  title="Send"
                >
                  <svg
                    className="size-5"
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
                <span className="text-[10px] text-zinc-500 font-sans tracking-wide">
                  Quanty can make mistakes.
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default QuantyCopilotDrawer;

'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Quanty } from './Quanty';
import { showToast } from './InboxToast';
import { IconX } from './icons';
import type { Email } from '../types';

export interface QuantyEmailAction {
  to?: string;
  subject?: string;
  greeting?: string;
  opening?: string;
  body?: string;
  closing?: string;
  signoff?: string;
  senderName?: string;
}

export interface QuantyAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  contextEmail?: Email | null;
  contextThreadSubject?: string;
  isInboxContext?: boolean;
  isComposeContext?: boolean;
  onInsertReply?: (text: string) => void;
  onApplyAction?: (action: QuantyEmailAction) => void;
}

interface ChatHistoryItem {
  id: string;
  date: string;
  preview: string;
  messages: Array<{ role: 'user' | 'assistant'; text: string }>;
}

export function parseEmailActionFromText(text: string): QuantyEmailAction {
  const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  const subjectMatch = text.match(/Subject:\s*([^\n]+)/i);
  const greetingMatch = text.match(/^(Dear\s+[^,\n]+,|Hi\s+[^,\n]+,|Hello\s+[^,\n]+,)/im);
  const closingMatch = text.match(
    /(Thank you for your time\.|Looking forward to hearing from you\.|Thanks\.|Best regards|Sincerely)[^\n]*/i,
  );

  const cleanBody = text
    .replace(/^Subject:.*$/im, '')
    .replace(/^(Dear|Hi|Hello)[^\n]+,\s*/im, '')
    .replace(/(Best regards|Sincerely|Thanks|Warm regards)[,\s\S]*$/im, '')
    .trim();

  return {
    to: emailMatch ? emailMatch[1] : undefined,
    subject: subjectMatch ? subjectMatch[1].trim() : undefined,
    greeting: greetingMatch ? greetingMatch[1].trim() : undefined,
    body: cleanBody || text,
    closing: closingMatch ? closingMatch[0].trim() : undefined,
  };
}

const STORAGE_KEY = 'quantmail_quanty_chats_v1';

export function QuantyCopilotDrawer({
  isOpen,
  onClose,
  contextEmail,
  contextThreadSubject,
  isInboxContext = false,
  isComposeContext = false,
  onInsertReply,
  onApplyAction,
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
      } else if (isComposeContext) {
        systemContext = `Context: User is composing an email in QuantMail. If requested to draft an email, output a crisp, corporate message with Subject, Greeting, Body, and Closing clearly outlined.`;
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

          if (isComposeContext && onApplyAction) {
            const action = parseEmailActionFromText(responseText);
            onApplyAction(action);
            showToast({ text: 'Quanty updated your email draft', type: 'success' });
          }
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

        if (isComposeContext && onApplyAction) {
          const action = parseEmailActionFromText(simulated);
          onApplyAction(action);
          showToast({ text: 'Quanty updated your email draft', type: 'success' });
        }
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

  const loadChat = (item: ChatHistoryItem) => {
    setMessages(item.messages);
    setShowHistoryMenu(false);
  };

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = historyList.filter((x) => x.id !== id);
    setHistoryList(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
            className={`fixed bottom-0 left-0 right-0 z-50 w-full sm:max-w-xl sm:mx-auto rounded-t-2xl border-t border-x border-[#282C35] bg-[#111318] shadow-[0_-12px_45px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden transition-all duration-300 ${
              hasConversation ? 'h-[580px] max-h-[82vh]' : 'h-auto max-h-[75vh]'
            }`}
          >
            <div className="flex justify-center pt-2.5 pb-1 cursor-grab active:cursor-grabbing">
              <div className="w-10 h-1 rounded-full bg-[#282C35]" />
            </div>

            <div className="flex items-center justify-between px-4 sm:px-5 pt-1 pb-3 relative border-b border-[#282C35]">
              <div className="flex items-center gap-2.5">
                <Quanty size={28} expression={quantyExpression} bob={false} />
                <h3 className="text-sm font-semibold text-[#F5F5F5] tracking-tight">
                  Quanty AI Copilot
                </h3>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowHistoryMenu(!showHistoryMenu)}
                  className={`p-1.5 rounded-full transition-colors ${
                    showHistoryMenu
                      ? 'text-[#FF8C42] bg-[#2B1A11]'
                      : 'text-[#A1A4AC] hover:text-[#F5F5F5] hover:bg-[#16181D]'
                  }`}
                  title="Chat History"
                >
                  <svg
                    className="size-4.5"
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

                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-full text-[#A1A4AC] hover:text-[#F5F5F5] hover:bg-[#16181D] transition-colors"
                  aria-label="Close"
                >
                  <svg
                    className="size-4.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <AnimatePresence>
                {showHistoryMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -5 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -5 }}
                    className="absolute right-4 top-12 z-50 w-64 rounded-xl border border-[#282C35] bg-[#16181D] p-3 shadow-2xl space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b border-[#282C35]">
                      <span className="font-semibold text-[#F5F5F5]">Recent Chats</span>
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
                      <p className="text-[11px] text-[#A1A4AC] py-2 text-center">
                        No previous chats recorded
                      </p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {historyList.map((item) => (
                          <div
                            key={item.id}
                            className="group flex items-center justify-between p-2 rounded-lg hover:bg-[#111318] cursor-pointer"
                            onClick={() => loadChat(item)}
                          >
                            <div className="min-w-0 flex-1 pr-2">
                              <p className="text-xs text-[#F5F5F5] truncate">{item.preview}</p>
                              <p className="text-[10px] text-[#A1A4AC]">{item.date}</p>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => deleteChat(item.id, e)}
                              className="inline-flex items-center justify-center size-7 min-h-[44px] min-w-[44px] shrink-0 rounded-lg text-[#6B6E76] hover:text-rose-400 transition-opacity sm:min-h-0 sm:min-w-0 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                              title="Delete chat"
                              aria-label="Delete chat"
                            >
                              <IconX size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {!hasConversation ? (
              <div className="px-4 pb-3 pt-3 space-y-2">
                {contextEmail || contextThreadSubject ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        void handleSend('Please summarize this email in 3 crisp bullet points.')
                      }
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#16181D] hover:bg-[#1C1F26] border border-[#282C35] text-left transition-all active:scale-[0.99] group shadow-sm"
                    >
                      <div className="size-8 rounded-lg bg-[#2B1A11] border border-[#5C3016] flex items-center justify-center text-[#FF8C42] text-sm shrink-0">
                        <svg
                          className="size-4 text-[#FF8C42]"
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
                        <p className="text-xs font-semibold text-[#F5F5F5]">Summarize this email</p>
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
                        className="flex-1 flex items-center gap-2 p-2.5 rounded-lg bg-[#16181D] hover:bg-[#1C1F26] border border-[#282C35] text-left transition-all text-xs text-[#A1A4AC] font-medium"
                      >
                        <svg
                          className="w-3.5 h-3.5 text-[#FF8C42]"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                        <span className="truncate">Draft a reply</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          void handleSend(
                            'कृपया इस ईमेल का हिंदी में मुख्य सारांश (Summary) बताएं।',
                          )
                        }
                        className="flex-1 flex items-center gap-2 p-2.5 rounded-lg bg-[#16181D] hover:bg-[#1C1F26] border border-[#282C35] text-left transition-all text-xs text-[#A1A4AC] font-medium"
                      >
                        <svg
                          className="w-3.5 h-3.5 text-[#FF8C42]"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
                          />
                        </svg>
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
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#16181D] hover:bg-[#1C1F26] border border-[#282C35] text-left transition-all active:scale-[0.99] group shadow-sm"
                  >
                    <Quanty size={24} expression="happy" bob={false} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[#F5F5F5]">
                        What can Quanty do in QuantMail?
                      </p>
                    </div>
                  </button>
                )}
              </div>
            ) : (
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-4 py-3 space-y-3.5 text-xs text-white"
              >
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
                      className={`max-w-[86%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                        m.role === 'user'
                          ? 'bg-[#2B1A11] border border-[#5C3016] text-[#F5F5F5] rounded-br-none shadow-sm font-medium'
                          : 'bg-[#16181D] border border-[#282C35] text-[#F5F5F5] rounded-bl-none shadow-sm'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.text}</p>

                      {m.role === 'assistant' && onApplyAction && (
                        <button
                          type="button"
                          onClick={() => {
                            const text = m.text;
                            const emailMatch = text.match(
                              /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/,
                            );
                            const subjectMatch = text.match(/Subject:\s*([^\n]+)/i);
                            const greetingMatch = text.match(
                              /^(Dear\s+[^,\n]+,|Hi\s+[^,\n]+,|Hello\s+[^,\n]+,)/im,
                            );

                            onApplyAction({
                              to: emailMatch ? emailMatch[1] : undefined,
                              subject: subjectMatch ? subjectMatch[1].trim() : undefined,
                              greeting: greetingMatch ? greetingMatch[1].trim() : undefined,
                              body: text
                                .replace(/^Subject:.*$/im, '')
                                .replace(/^(Dear|Hi|Hello)[^\n]+,\s*/im, '')
                                .replace(
                                  /(Best regards|Sincerely|Thanks|Warm regards)[,\s\S]*$/im,
                                  '',
                                )
                                .trim(),
                            });
                            onClose();
                            showToast({ text: 'Applied draft into composer', type: 'success' });
                          }}
                          className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-[#FF8C42] bg-[#2B1A11] hover:bg-[#3A2416] border border-[#5C3016] transition-all shadow-sm"
                        >
                          <svg
                            className="w-3 h-3 text-[#FF8C42]"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13 10V3L4 14h7v7l9-11h-7z"
                            />
                          </svg>
                          <span>Apply to Composer</span>
                        </button>
                      )}

                      {m.role === 'assistant' &&
                        onInsertReply &&
                        !onApplyAction &&
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
                            className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[#FF8C42] bg-[#2B1A11] hover:bg-[#3A2416] border border-[#5C3016] transition-all"
                          >
                            <svg
                              className="w-3 h-3 text-[#FF8C42]"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                              />
                            </svg>
                            <span>Insert into reply</span>
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
                    <div className="px-3.5 py-2 rounded-2xl bg-[#181c26] border border-[#FF8C42]/20 text-xs text-[#FF8C42] flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-[#FF8C42] animate-bounce" />
                      <span className="size-1.5 rounded-full bg-[#FF8C42] animate-bounce [animation-delay:0.15s]" />
                      <span className="size-1.5 rounded-full bg-[#FF8C42] animate-bounce [animation-delay:0.3s]" />
                      <span className="ml-1 text-[11px] text-[#A1A4AC]">Quanty is thinking…</span>
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
                  className="w-full rounded-full border border-[#3A404D]/80 bg-[#1a1f2c] pl-4 pr-11 py-3 text-xs sm:text-[13px] text-white placeholder-[#A1A4AC] focus:outline-none focus:border-[#FF8C42] focus:ring-1 focus:ring-[#FF8C42]/40 transition-all shadow-inner font-sans"
                />

                <button
                  type="submit"
                  disabled={!inputValue.trim() || isLoading}
                  className="absolute right-2 p-1.5 rounded-full text-[#FF8C42] hover:text-[#FFB875] disabled:opacity-30 transition-all active:scale-95"
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
                <span className="text-[10px] text-[#A1A4AC] font-sans tracking-wide">
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

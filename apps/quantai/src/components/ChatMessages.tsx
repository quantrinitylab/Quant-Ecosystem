'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { spring } from '@quant/brand';
import { HeroPromptBento } from './chat/HeroPromptBento';
import { MarkdownRenderer } from './MarkdownRenderer';

/* ============ Chat Messages Area ============ */

export function ChatMessages({
  messages,
  isStreaming,
  onFeedback,
  onRegenerate,
  onSelectPrompt,
  onStartVoice,
  onOpenCanvas,
  onAttachFile,
}: {
  messages: Array<{
    id: string;
    role: string;
    content: string;
    timestamp: string;
    isStreaming?: boolean;
    pending?: boolean;
    feedback?: 'POSITIVE' | 'NEGATIVE' | null;
  }>;
  isStreaming: boolean;
  onFeedback?: (messageId: string, value: 'POSITIVE' | 'NEGATIVE') => void;
  onRegenerate?: () => void;
  onSelectPrompt?: (text: string) => void;
  onStartVoice?: () => void;
  onOpenCanvas?: () => void;
  onAttachFile?: () => void;
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isPinnedToBottomRef = useRef(true);
  const prefersReducedMotion = useReducedMotion();
  // Chat-thread ergonomics: jump-to-latest visibility + the single thread
  // toast slot. The toast lives here (in-flow, directly below the scroll
  // area and therefore above the composer) rather than inside a message row,
  // so it can never cover the input and never stacks: one slot, replaced.
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [threadToast, setThreadToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showThreadToast = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setThreadToast(message);
    toastTimerRef.current = setTimeout(() => setThreadToast(null), 2500);
  }, []);

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    [],
  );

  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]!.role === 'assistant') return messages[i]!.id;
    }
    return null;
  }, [messages]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    isPinnedToBottomRef.current = pinned;
    setIsScrolledUp(!pinned);
  }, []);

  const jumpToLatest = useCallback(() => {
    isPinnedToBottomRef.current = true;
    setIsScrolledUp(false);
    const end = messagesEndRef.current;
    if (end && typeof end.scrollIntoView === 'function') {
      end.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'end',
      });
    } else if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [prefersReducedMotion]);

  const handleFeedback = useCallback(
    (messageId: string, value: 'POSITIVE' | 'NEGATIVE') => {
      onFeedback?.(messageId, value);
      showThreadToast('Feedback submitted');
    },
    [onFeedback, showThreadToast],
  );

  const handleCopy = useCallback(() => {
    showThreadToast('Copied');
  }, [showThreadToast]);

  useEffect(() => {
    if (!isPinnedToBottomRef.current) return;
    messagesEndRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'end',
    });
  }, [messages, prefersReducedMotion]);

  if (messages.length === 0) {
    return (
      <HeroPromptBento
        onSelectPrompt={onSelectPrompt || (() => {})}
        onStartVoice={onStartVoice || (() => {})}
        onOpenCanvas={onOpenCanvas || (() => {})}
        onAttachFile={onAttachFile || (() => {})}
      />
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/*
       * role="log" + aria-live is the whole screen-reader channel for a streaming
       * answer, and it was missing: tokens arrived with no announcement at all.
       * aria-atomic="false" so only appended text is read rather than the entire
       * transcript on every delta, and aria-busy marks generation in progress.
       */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-atomic="false"
        aria-relevant="additions text"
        aria-busy={isStreaming}
        aria-label="Conversation"
        className="flex-1 overflow-y-auto px-4 py-6"
      >
      <div className="mx-auto max-w-3xl space-y-7">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', ...spring.snappy }}
              className={msg.role === 'user' ? 'flex justify-end' : 'flex flex-col'}
            >
              {/*
               * The 'U' / 'AI' letter circles are gone. They were the one thing
               * that made this read as a toy chat rather than a tool, and they
               * were also an accessibility defect: the letters are text content,
               * so a screen reader announced "U" before every user turn. Role is
               * now carried by position and a real label.
               */}
              {msg.role === 'user' ? (
                <div className="max-w-[80%] rounded-2xl bg-[var(--quant-surface-hover)] px-4 py-2.5">
                  <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-[var(--foreground)]">
                    {msg.content}
                  </p>
                </div>
              ) : (
                /*
                 * Assistant answers run full width on the canvas with no bubble,
                 * the way Claude and ChatGPT present them. A bubble caps line
                 * length and makes code blocks and tables — the things this
                 * surface exists to show — feel boxed in.
                 */
                <>
                  <span className="mb-1.5 select-none text-xs font-medium tracking-wide text-[var(--foreground-secondary)]">
                    Quanty
                  </span>
                  <div className="text-[0.9375rem] leading-relaxed text-[var(--foreground)]">
                    <MarkdownRenderer content={msg.content} />
                    {msg.isStreaming && <StreamingCursor />}
                  </div>
                </>
              )}

              {msg.role === 'assistant' && !msg.pending && (
                <div className="mt-2 flex items-center gap-1">
                  <CopyButton text={msg.content} onCopied={handleCopy} />
                  {onRegenerate && msg.id === lastAssistantId && !isStreaming && (
                    <button
                      type="button"
                      aria-label="Regenerate response"
                      onClick={onRegenerate}
                      className="text-xs px-1.5 py-0.5 rounded-md text-[var(--foreground-secondary)] hover:bg-[var(--quant-surface-hover)] transition-colors"
                    >
                      ↻
                    </button>
                  )}
                  {onFeedback && !msg.id.startsWith('tmp-') && (
                    <>
                      <button
                        type="button"
                        aria-label="Good response"
                        aria-pressed={msg.feedback === 'POSITIVE'}
                        onClick={() => handleFeedback(msg.id, 'POSITIVE')}
                        className={`text-xs px-1.5 py-0.5 rounded-md transition-colors ${
                          msg.feedback === 'POSITIVE'
                            ? 'bg-emerald-500/20 text-emerald-500'
                            : 'text-[var(--foreground-secondary)] hover:bg-[var(--quant-surface-hover)]'
                        }`}
                      >
                        👍
                      </button>
                      <button
                        type="button"
                        aria-label="Bad response"
                        aria-pressed={msg.feedback === 'NEGATIVE'}
                        onClick={() => handleFeedback(msg.id, 'NEGATIVE')}
                        className={`text-xs px-1.5 py-0.5 rounded-md transition-colors ${
                          msg.feedback === 'NEGATIVE'
                            ? 'bg-red-500/20 text-red-500'
                            : 'text-[var(--foreground-secondary)] hover:bg-[var(--quant-surface-hover)]'
                        }`}
                      >
                        👎
                      </button>
                    </>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {/*
         * Plain working-status line, derived only from isStreaming: generic
         * wording, no step names, no progress, no invented detail. It sits at
         * the end of the message list, next to the streaming content.
         */}
        {isStreaming && (
          <p role="status" className="text-xs text-[var(--foreground-secondary)]">
            Working…
          </p>
        )}
        <div ref={messagesEndRef} />
      </div>
      </div>
      {/*
       * Floating jump-to-latest: only while scrolled up (not pinned to
       * bottom). Right edge, above the toast row and the composer, in the
       * wrapper — never inside the scroll area, so it never scrolls away.
       */}
      {isScrolledUp && (
        <button
          type="button"
          aria-label="Jump to latest"
          onClick={jumpToLatest}
          className="absolute bottom-12 right-4 z-10 rounded-full border border-[var(--quant-border)] bg-[var(--quant-surface)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] shadow-lg transition-colors hover:bg-[var(--quant-surface-hover)]"
        >
          Jump to latest
        </button>
      )}
      {/*
       * Toast slot: in normal flow directly below the thread, so it sits
       * above the composer and can never cover the input. The fixed-height
       * row keeps the composer from jumping when a toast appears.
       */}
      <div className="flex min-h-9 items-center justify-center px-4">
        {threadToast && (
          <div
            role="status"
            className="rounded-full border border-[var(--quant-border)] bg-[var(--quant-surface)] px-3 py-1 text-xs text-[var(--foreground)] shadow-lg"
          >
            {threadToast}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============ Copy Button ============ */

function CopyButton({ text, onCopied }: { text: string; onCopied?: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      // Only a successful clipboard write reports a copy — a failed write
      // shows no toast, so "Copied" can never appear without a copy.
      onCopied?.();
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — ignore silently.
    }
  }, [text, onCopied]);

  return (
    <button
      type="button"
      aria-label={copied ? 'Copied' : 'Copy message'}
      onClick={handleCopy}
      className={`text-xs px-1.5 py-0.5 rounded-md transition-colors ${
        copied
          ? 'bg-emerald-500/20 text-emerald-500'
          : 'text-[var(--foreground-secondary)] hover:bg-[var(--quant-surface-hover)]'
      }`}
    >
      {copied ? '✓' : '⧉'}
    </button>
  );
}

/* ============ Streaming Cursor ============ */

function StreamingCursor() {
  const prefersReducedMotion = useReducedMotion();

  // `ease: 'steps(2)'` was not a value framer-motion accepts, so the blink
  // silently fell back to its default easing — a soft fade rather than the
  // terminal-style tick it was written to be. `steps(2, 'start')` is the real
  // spelling. Under reduced motion the caret is shown solid instead of removed,
  // because it is the only signal that an answer is still arriving.
  if (prefersReducedMotion) {
    return (
      <span
        className="ml-0.5 inline-block h-[1.05em] w-0.5 translate-y-[0.15em] bg-[var(--quant-accent)]"
        aria-hidden="true"
      />
    );
  }

  return (
    <motion.span
      className="ml-0.5 inline-block h-[1.05em] w-0.5 translate-y-[0.15em] bg-[var(--quant-accent)]"
      animate={{ opacity: [1, 1, 0, 0] }}
      transition={{ duration: 1.06, repeat: Infinity, ease: 'linear', times: [0, 0.5, 0.5, 1] }}
      aria-hidden="true"
    />
  );
}

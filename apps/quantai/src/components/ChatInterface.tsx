'use client';

// ============================================================================
// QuantAI - Chat Interface Component
// AI chat with multi-modal input, tool calls display, framer-motion animations
// ============================================================================

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import type { ConversationMessage } from '../types';

interface ChatInterfaceProps {
  messages: ConversationMessage[];
  isProcessing: boolean;
  onSend: (message: string) => void;
  onAttach: (type: string) => void;
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-2" aria-label="AI is typing">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-2 h-2 bg-[var(--brand-app-color)] rounded-full"
          animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
          transition={{
            type: 'spring',
            ...spring.bouncy,
            repeat: Infinity,
            repeatDelay: 0.2,
            delay: i * 0.15,
          }}
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', ...spring.gentle }}
        className="mb-6"
      >
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--brand-app-color)]/10 flex items-center justify-center">
          <motion.span
            className="text-3xl"
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            🤖
          </motion.span>
        </div>
        <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">
          Start a conversation with QuantAI
        </h3>
        <p className="text-sm text-[var(--foreground-secondary)] max-w-sm">
          Ask questions, automate tasks, control your devices, or explore creative ideas.
        </p>
      </motion.div>
    </div>
  );
}

export function ChatInterface({ messages, isProcessing, onSend, onAttach }: ChatInterfaceProps) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setInputValue('');
    inputRef.current?.focus();
  }, [inputValue, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div
      className="flex flex-col h-full bg-[var(--surface)] rounded-xl border border-[var(--quant-border)]"
      aria-label="Chat interface"
    >
      {/* Message List */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-4"
        role="log"
        aria-live="polite"
        aria-label="Message history"
      >
        {messages.length === 0 && !isProcessing && <EmptyState />}

        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring', ...spring.snappy }}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Avatar */}
              <div
                className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  msg.role === 'user'
                    ? 'bg-[var(--brand-primary)] text-white'
                    : 'bg-[var(--brand-app-color)] text-white'
                }`}
                aria-hidden="true"
              >
                {msg.role === 'user' ? 'U' : 'AI'}
              </div>

              {/* Message Body */}
              <div
                className={`max-w-[75%] rounded-lg px-4 py-2 ${
                  msg.role === 'user'
                    ? 'bg-[var(--brand-primary)] text-white'
                    : 'bg-[var(--surface-elevated)] text-[var(--foreground)]'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>

                {/* Tool Call Chips */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2" aria-label="Tool calls">
                    {msg.toolCalls.map((tc) => (
                      <span
                        key={tc.id}
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          tc.status === 'completed'
                            ? 'bg-green-900/50 text-green-300'
                            : tc.status === 'failed'
                              ? 'bg-red-900/50 text-red-300'
                              : tc.status === 'running'
                                ? 'bg-yellow-900/50 text-yellow-300'
                                : 'bg-[var(--quant-muted)] text-[var(--quant-muted-foreground)]'
                        }`}
                      >
                        {tc.name} ({tc.status})
                      </span>
                    ))}
                  </div>
                )}

                {/* Attachment Chips */}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2" aria-label="Attachments">
                    {msg.attachments.map((a) => (
                      <span
                        key={a.url}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-[var(--quant-muted)] text-[var(--quant-muted-foreground)]"
                      >
                        {a.name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Metadata */}
                <span className="block mt-1 text-xs text-[var(--foreground-secondary)]">
                  {msg.metadata.tokens} tokens | {msg.metadata.latency}ms
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing Indicator */}
        {isProcessing && <TypingIndicator />}
      </div>

      {/* Input Bar */}
      <div
        className="flex items-center gap-2 p-3 border-t border-[var(--quant-border)]"
        role="toolbar"
        aria-label="Message input"
      >
        <button
          type="button"
          onClick={() => onAttach('file')}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-[var(--surface-elevated)] text-[var(--foreground-secondary)] hover:bg-[var(--surface-hover)] transition-colors"
          aria-label="Attach file"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => onAttach('image')}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-[var(--surface-elevated)] text-[var(--foreground-secondary)] hover:bg-[var(--surface-hover)] transition-colors"
          aria-label="Attach image"
        >
          Img
        </button>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask QuantAI anything..."
          className="flex-1 min-h-[44px] px-4 rounded-lg bg-[var(--surface-elevated)] text-[var(--foreground)] placeholder-[var(--foreground-secondary)] border border-[var(--quant-border)] focus:border-[var(--brand-app-color)] focus:outline-none transition-colors"
          aria-label="Message input"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!inputValue.trim()}
          className="min-w-[44px] min-h-[44px] px-4 rounded-lg bg-[var(--brand-app-color)] text-white font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Send message"
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default ChatInterface;

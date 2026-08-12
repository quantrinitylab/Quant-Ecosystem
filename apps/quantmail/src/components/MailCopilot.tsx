'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuantSidekick } from '@quant/shared-ui';
import { quantAiBrandLockup } from '../brand/identity';
import { QuantrinityMark } from './QuantrinityMark';

const STATUS_COPY = {
  idle: 'Ready',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Responding',
  acting: 'Working',
} as const;

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type ScreenContext = {
  app: string;
  route?: string;
  view?: string;
  subject?: string;
  from?: string;
  selection?: string;
  screenText?: string;
};

const STARTERS = [
  'Summarise what is on my screen',
  'Draft a reply to this message',
  'What needs my attention in the inbox?',
];

function clamp(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/** Reads the current screen so QuantAI can answer about what the user sees. */
function readScreenContext(): ScreenContext {
  const context: ScreenContext = { app: 'QuantMail' };
  if (typeof window === 'undefined') return context;

  context.route = window.location.pathname + window.location.search;

  const heading = document.querySelector('h1');
  if (heading?.textContent) context.view = clamp(heading.textContent, 100);

  const subject = document.querySelector('[data-quant-subject], .email-subject, h2');
  if (subject?.textContent) context.subject = clamp(subject.textContent, 300);

  const sender = document.querySelector('[data-quant-sender], .email-from');
  if (sender?.textContent) context.from = clamp(sender.textContent, 200);

  const selection = window.getSelection()?.toString();
  if (selection && selection.trim().length > 2) context.selection = clamp(selection, 3000);

  const main = document.querySelector('main') ?? document.body;
  const text = main.innerText ?? '';
  if (text) context.screenText = clamp(text, 5000);

  return context;
}

/** QuantMail-specific presentation for the shared QuantAI sidekick state. */
export function MailCopilot() {
  const router = useRouter();
  const { status, suggestions, isOpen, toggle, close } = useQuantSidekick();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const liveStatus = isSending ? 'Thinking' : STATUS_COPY[status];

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isSending]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || isSending) return;

      const nextMessages: ChatMessage[] = [
        ...messages,
        { id: crypto.randomUUID(), role: 'user', content: text },
      ];
      setMessages(nextMessages);
      setInput('');
      setError(null);
      setIsSending(true);

      try {
        const response = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            messages: nextMessages.slice(-12).map(({ role, content }) => ({ role, content })),
            context: readScreenContext(),
          }),
        });

        const payload = (await response.json().catch(() => null)) as
          | { success?: boolean; data?: { message?: string }; error?: { message?: string } }
          | null;

        if (!response.ok || !payload?.success || !payload.data?.message) {
          throw new Error(payload?.error?.message ?? 'QuantAI could not answer right now.');
        }

        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: 'assistant', content: payload.data!.message! },
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'QuantAI could not answer right now.');
      } finally {
        setIsSending(false);
        inputRef.current?.focus();
      }
    },
    [isSending, messages],
  );

  const suggestionChips = useMemo(
    () =>
      suggestions.length > 0
        ? suggestions.map((item) => ({ id: item.id, label: item.label, prompt: item.label }))
        : STARTERS.map((label) => ({ id: label, label, prompt: label })),
    [suggestions],
  );

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');

  return (
    <aside
      className={`mail-copilot is-${status}`}
      data-state={status}
      aria-label="QuantAI mail copilot"
    >
      {isOpen && (
        <section className="mail-copilot-panel" role="dialog" aria-label="Ask QuantAI">
          <header>
            <div className="mail-copilot-lockup">
              <QuantrinityMark compact label={quantAiBrandLockup.accessibleName} />
              <div>
                <strong>{quantAiBrandLockup.productName}</strong>
                <span>
                  <i /> {liveStatus}
                </span>
              </div>
            </div>
            <div className="mail-copilot-header-actions">
              {messages.length > 0 && (
                <button
                  type="button"
                  className="mail-copilot-reset"
                  onClick={() => {
                    setMessages([]);
                    setError(null);
                    inputRef.current?.focus();
                  }}
                >
                  New chat
                </button>
              )}
              <button
                type="button"
                className="mail-copilot-close"
                onClick={close}
                aria-label="Close QuantAI"
              >
                ×
              </button>
            </div>
          </header>

          <div className="mail-copilot-thread" ref={scrollRef} aria-live="polite">
            {messages.length === 0 ? (
              <div className="mail-copilot-body">
                <p className="mail-copilot-eyebrow">Signal copilot</p>
                <h2>Ask about anything on this screen.</h2>
                <p className="mail-copilot-description">
                  QuantAI reads the page you are on — the open thread, subject, sender and any text
                  you have selected — then answers, drafts or triages from there.
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <div key={message.id} className={`mail-copilot-msg is-${message.role}`}>
                  {message.role === 'assistant' && (
                    <span className="mail-copilot-msg-author">{quantAiBrandLockup.productName}</span>
                  )}
                  <p>{message.content}</p>
                </div>
              ))
            )}

            {isSending && <div className="mail-copilot-typing" aria-label="QuantAI is thinking">Thinking…</div>}

            {error && (
              <p className="mail-copilot-error" role="alert">
                {error}
              </p>
            )}
          </div>

          {(messages.length === 0 || lastAssistant) && (
            <div className="mail-copilot-chips" aria-label="QuantAI suggestions">
              {lastAssistant ? (
                <button
                  type="button"
                  onClick={() => {
                    const body = encodeURIComponent(lastAssistant.content);
                    close();
                    router.push(`/compose?body=${body}`);
                  }}
                >
                  Use as email draft
                </button>
              ) : (
                suggestionChips.map((chip) => (
                  <button key={chip.id} type="button" onClick={() => void send(chip.prompt)}>
                    {chip.label}
                  </button>
                ))
              )}
            </div>
          )}

          <form
            className="mail-copilot-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              rows={2}
              placeholder="Ask QuantAI about this screen…"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send(input);
                }
              }}
            />
            <button type="submit" disabled={isSending || input.trim().length === 0}>
              Send
            </button>
          </form>

          <footer>
            <span>Screen-aware answers</span>
            <span>Ctrl / Cmd + K opens all commands</span>
          </footer>
        </section>
      )}

      <button
        type="button"
        className="mail-copilot-trigger"
        onClick={toggle}
        aria-label={isOpen ? 'Close QuantAI mail copilot' : 'Open QuantAI mail copilot'}
        aria-expanded={isOpen}
      >
        <QuantrinityMark compact label={quantAiBrandLockup.productName} />
        <span>
          <strong>Ask {quantAiBrandLockup.productName}</strong>
          <small>{liveStatus}</small>
        </span>
        <i className="mail-copilot-signal" aria-hidden="true" />
      </button>
    </aside>
  );
}

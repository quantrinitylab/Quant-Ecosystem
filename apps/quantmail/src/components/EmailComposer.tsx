'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContactAutocomplete, type ContactSuggestion } from './ContactAutocomplete';
import { EmailTemplates, type EmailTemplate } from './EmailTemplates';
import { showToast } from './InboxToast';
import { Quanty, type QuantyExpression } from './Quanty';
import { browserAuthSession } from '../services/browser-auth-session';
import type { EmailAddress, EmailPriority } from '../types';

export interface ComposerMessageData {
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  subject: string;
  bodyText: string;
  bodyHtml: string;
  priority: EmailPriority;
  scheduledAt?: string;
}

export interface EmailComposerProps {
  initialTo?: EmailAddress[];
  initialSubject?: string;
  initialBody?: string;
  inReplyTo?: string;
  onSend: (data: ComposerMessageData) => Promise<void>;
  onSaveDraft: (data: ComposerMessageData) => Promise<void>;
  onDiscard: () => void;
  onAIAssist: (
    action: 'compose' | 'improve' | 'shorten' | 'formalize',
    text: string,
  ) => Promise<string>;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
}

type AITone = 'professional' | 'friendly' | 'concise' | 'expand';
type LiveMessage = { kind: 'status' | 'error'; text: string } | null;
type LocalAttachment = { id: string; name: string; size: number; type: string };
type WriterMessage = { id: string; role: 'user' | 'assistant'; content: string };

const AI_TONES: Array<{
  key: AITone;
  label: string;
  action: 'compose' | 'improve' | 'shorten' | 'formalize';
}> = [
  { key: 'professional', label: 'Professional', action: 'formalize' },
  { key: 'friendly', label: 'Friendly', action: 'improve' },
  { key: 'concise', label: 'Concise', action: 'shorten' },
  { key: 'expand', label: 'Expand', action: 'compose' },
];

const SCHEDULE_OPTIONS = [
  { label: 'In 1 hour', hours: 1 },
  { label: 'In 2 hours', hours: 2 },
  { label: 'Tomorrow morning, 9:00 AM', hours: 0, preset: 'tomorrow_9am' },
  { label: 'Tomorrow afternoon, 2:00 PM', hours: 0, preset: 'tomorrow_2pm' },
  { label: 'Monday morning, 9:00 AM', hours: 0, preset: 'monday_9am' },
] as const;

// Gmail-style undo send (msg#30 P07): the composer closes INSTANTLY on Send,
// an “Undo” toast appears, and the message actually leaves after this delay.
// The timer lives at module scope so it survives the composer unmounting.
const UNDO_SEND_DELAY_MS = 5_200;
const UNDO_DRAFT_KEY = 'qm-undo-draft';
const UNDO_RESTORE_KEY = 'qm-undo-restore';
let pendingSendTimer: number | null = null;

function getScheduledDate(option: (typeof SCHEDULE_OPTIONS)[number]): Date {
  const now = new Date();
  if (option.hours > 0) return new Date(now.getTime() + option.hours * 60 * 60 * 1000);

  const result = new Date(now);
  if ('preset' in option && option.preset === 'tomorrow_9am') {
    result.setDate(result.getDate() + 1);
    result.setHours(9, 0, 0, 0);
  } else if ('preset' in option && option.preset === 'tomorrow_2pm') {
    result.setDate(result.getDate() + 1);
    result.setHours(14, 0, 0, 0);
  } else {
    const dayOfWeek = result.getDay();
    result.setDate(result.getDate() + (dayOfWeek === 0 ? 1 : 8 - dayOfWeek));
    result.setHours(9, 0, 0, 0);
  }
  return result;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parseEmails(value: string): EmailAddress[] {
  return value
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean)
    .map((email) => ({ email }));
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function askQuantyWriter(
  history: WriterMessage[],
  subject: string,
  body: string,
): Promise<string> {
  const response = await browserAuthSession.authenticatedFetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: history.slice(-8).map(({ role, content }) => ({ role, content })),
      context: {
        app: 'QuantMail',
        route: '/compose',
        view: 'Compose — Quanty email writer. Write the email the user asks for and reply with ONLY the email body text (no preamble, no quotes). If key details are missing, ask ONE short clarifying question and offer 2-3 quick options the user can pick from, or they can write their own.',
        subject: subject || undefined,
        screenText: body.trim() ? `Current draft:\n${body.slice(0, 2000)}` : undefined,
      },
    }),
  });
  const payload = (await response.json().catch(() => null)) as {
    success?: boolean;
    data?: { message?: string };
    error?: { message?: string };
  } | null;
  if (response.ok && payload?.success && payload.data?.message) return payload.data.message;
  throw new Error(
    payload?.error?.message ?? `Quanty could not answer (${response.status}). Retry in a moment.`,
  );
}

export function EmailComposer({
  initialTo,
  initialSubject,
  initialBody,
  onSend,
  onSaveDraft,
  onDiscard,
  onAIAssist,
  isMinimized,
  onToggleMinimize,
}: EmailComposerProps): React.ReactElement {
  const fieldId = useId();
  const router = useRouter();
  const [to, setTo] = useState(initialTo?.map((address) => address.email).join(', ') ?? '');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(initialSubject ?? '');
  const [body, setBody] = useState(initialBody ?? '');
  const [priority, setPriority] = useState<EmailPriority>('normal');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [showScheduleMenu, setShowScheduleMenu] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ to?: string; subject?: string }>({});
  const [liveMessage, setLiveMessage] = useState<LiveMessage>(null);
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [contacts] = useState<ContactSuggestion[]>([
    // Pre-seeded contacts for autocomplete — in production these come from the contacts API
    { email: 'team@quantrinity.in', name: 'Quantrinity Team', frequency: 10 },
    { email: 'kundan@quantmail.in', name: 'Kundan', frequency: 8 },
    { email: 'support@quantrinity.in', name: 'Support', frequency: 5 },
  ]);
  // Quanty writer chat (msg#30 P08) — replaces the old “Writing assistant”.
  const [quantyOpen, setQuantyOpen] = useState(false);
  const [writerMessages, setWriterMessages] = useState<WriterMessage[]>([]);
  const [writerInput, setWriterInput] = useState('');
  const [writerSending, setWriterSending] = useState(false);
  const [writerError, setWriterError] = useState<string | null>(null);
  const writerThreadRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scheduleButtonRef = useRef<HTMLButtonElement>(null);
  const scheduleMenuRef = useRef<HTMLDivElement>(null);
  const firstScheduleOptionRef = useRef<HTMLButtonElement>(null);
  const busy = isSending || isSaving;
  const hasRecipients = to.trim().length > 0;
  const hasSubject = subject.trim().length > 0;
  const hasMessageBody = body.trim().length > 0;
  const draftStatusLabel = isSaving
    ? 'Saving draft…'
    : lastDraftSavedAt
      ? `Saved at ${lastDraftSavedAt}`
      : 'Not saved yet';

  // Undo-restore (msg#30 P07): if the user pressed Undo, reopen their message
  // exactly as it was.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(UNDO_RESTORE_KEY) !== '1') return;
      const raw = window.localStorage.getItem(UNDO_DRAFT_KEY);
      window.localStorage.removeItem(UNDO_RESTORE_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as ComposerMessageData;
      setTo(draft.to.map((a) => a.email).join(', '));
      setCc(draft.cc.map((a) => a.email).join(', '));
      setBcc(draft.bcc.map((a) => a.email).join(', '));
      if (draft.cc.length > 0 || draft.bcc.length > 0) setShowCcBcc(true);
      setSubject(draft.subject);
      setBody(draft.bodyText);
      setPriority(draft.priority);
      setLiveMessage({ kind: 'status', text: 'Send undone — keep editing your message.' });
      window.localStorage.removeItem(UNDO_DRAFT_KEY);
    } catch {
      /* restore is best-effort */
    }
  }, []);

  useEffect(() => {
    writerThreadRef.current?.scrollTo({
      top: writerThreadRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [writerMessages, writerSending]);

  useEffect(() => {
    if (!showScheduleMenu) return;

    firstScheduleOptionRef.current?.focus();

    const handleScheduleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setShowScheduleMenu(false);
      scheduleButtonRef.current?.focus();
    };

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        scheduleMenuRef.current?.contains(target) ||
        scheduleButtonRef.current?.contains(target)
      ) {
        return;
      }
      setShowScheduleMenu(false);
    };

    document.addEventListener('keydown', handleScheduleKeyDown);
    document.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => {
      document.removeEventListener('keydown', handleScheduleKeyDown);
      document.removeEventListener('pointerdown', handleOutsidePointerDown);
    };
  }, [showScheduleMenu]);

  const buildMessage = useCallback(
    (scheduledAt?: string): ComposerMessageData => ({
      to: parseEmails(to),
      cc: parseEmails(cc),
      bcc: parseEmails(bcc),
      subject: subject.trim(),
      bodyText: body,
      bodyHtml: `<div>${escapeHtml(body).replace(/\r?\n/g, '<br />')}</div>`,
      priority,
      ...(scheduledAt ? { scheduledAt } : {}),
    }),
    [to, cc, bcc, subject, body, priority],
  );

  const validateRequired = useCallback((): boolean => {
    const nextErrors: { to?: string; subject?: string } = {};
    if (!to.trim()) nextErrors.to = 'Add at least one recipient.';
    if (!subject.trim()) nextErrors.subject = 'Add a subject before sending.';
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setLiveMessage({ kind: 'error', text: 'Add a recipient and subject before sending.' });
      return false;
    }
    return true;
  }, [subject, to]);

  /**
   * Gmail-style send (msg#30 P07): the composer closes immediately, a toast
   * with “Undo” appears, and the message actually goes out after ~5s unless
   * the user taps Undo — in which case the compose screen reopens with the
   * full draft so they can rewrite it.
   */
  const handleSend = useCallback(() => {
    if (!validateRequired()) return;
    setShowScheduleMenu(false);
    const payload = buildMessage();

    try {
      window.localStorage.setItem(UNDO_DRAFT_KEY, JSON.stringify(payload));
      window.localStorage.removeItem(UNDO_RESTORE_KEY);
    } catch {
      /* storage unavailable — undo will simply not restore */
    }

    if (pendingSendTimer !== null) window.clearTimeout(pendingSendTimer);
    pendingSendTimer = window.setTimeout(() => {
      pendingSendTimer = null;
      void onSend(payload)
        .then(() => {
          try {
            window.localStorage.removeItem(UNDO_DRAFT_KEY);
          } catch {
            /* ignore */
          }
        })
        .catch(() => {
          showToast({
            text: 'Message could not be sent. It is kept in your draft.',
            type: 'error',
          });
        });
    }, UNDO_SEND_DELAY_MS);

    showToast({
      text: 'Message sent',
      type: 'success',
      undoAction: () => {
        if (pendingSendTimer !== null) {
          window.clearTimeout(pendingSendTimer);
          pendingSendTimer = null;
        }
        try {
          window.localStorage.setItem(UNDO_RESTORE_KEY, '1');
        } catch {
          /* ignore */
        }
        router.push('/compose');
      },
    });

    onDiscard();
  }, [buildMessage, onDiscard, onSend, router, validateRequired]);

  const handleScheduleSend = useCallback(
    async (option: (typeof SCHEDULE_OPTIONS)[number]) => {
      if (!validateRequired()) return;
      const scheduledAt = getScheduledDate(option).toISOString();
      setShowScheduleMenu(false);
      scheduleButtonRef.current?.focus();
      setIsSending(true);
      setLiveMessage({ kind: 'status', text: 'Saving scheduled draft…' });
      try {
        await onSend(buildMessage(scheduledAt));
        setLastDraftSavedAt(
          new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        );
        setLiveMessage({
          kind: 'status',
          text: `Scheduled draft saved for ${new Date(scheduledAt).toLocaleString()}. It is not queued for delivery.`,
        });
      } catch (error) {
        setLiveMessage({
          kind: 'error',
          text: errorMessage(error, 'Scheduled draft could not be saved.'),
        });
      } finally {
        setIsSending(false);
      }
    },
    [buildMessage, onSend, validateRequired],
  );

  const handleSaveDraft = useCallback(async () => {
    setIsSaving(true);
    setLiveMessage({ kind: 'status', text: 'Saving draft…' });
    try {
      await onSaveDraft(buildMessage());
      setLastDraftSavedAt(
        new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      );
      setLiveMessage({ kind: 'status', text: 'Draft saved.' });
    } catch (error) {
      setLiveMessage({ kind: 'error', text: errorMessage(error, 'Draft could not be saved.') });
    } finally {
      setIsSaving(false);
    }
  }, [buildMessage, onSaveDraft]);

  const handleAITone = useCallback(
    async (tone: AITone) => {
      const toneConfig = AI_TONES.find((item) => item.key === tone);
      if (!toneConfig) return;
      setAiLoading(true);
      setLiveMessage({ kind: 'status', text: `${toneConfig.label} rewrite is working…` });
      try {
        const result = await onAIAssist(toneConfig.action, body);
        setBody(result);
        setLiveMessage({ kind: 'status', text: `${toneConfig.label} suggestion applied.` });
      } catch (error) {
        setLiveMessage({ kind: 'error', text: errorMessage(error, 'AI assist failed.') });
      } finally {
        setAiLoading(false);
      }
    },
    [body, onAIAssist],
  );

  const sendToWriter = useCallback(async () => {
    const text = writerInput.trim();
    if (!text || writerSending) return;
    setWriterError(null);
    const next: WriterMessage[] = [
      ...writerMessages,
      { id: crypto.randomUUID(), role: 'user', content: text },
    ];
    setWriterMessages(next);
    setWriterInput('');
    setWriterSending(true);
    try {
      const reply = await askQuantyWriter(next, subject, body);
      setWriterMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: reply },
      ]);
    } catch (error) {
      setWriterError(errorMessage(error, 'Quanty could not answer. Retry in a moment.'));
    } finally {
      setWriterSending(false);
    }
  }, [writerInput, writerSending, writerMessages, subject, body]);

  const reportFiles = useCallback((files: File[]) => {
    if (files.length === 0) return;
    setAttachments((current) => [
      ...current,
      ...files.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        name: file.name,
        size: file.size,
        type: file.type || 'Unknown type',
      })),
    ]);
    setLiveMessage({
      kind: 'status',
      text: `${files.length} local ${files.length === 1 ? 'file' : 'files'} selected. Files are not uploaded or sent.`,
    });
  }, []);

  // Shortcuts still WORK (Ctrl/Cmd+Enter to send, Ctrl/Cmd+S to save) — the
  // visible hints moved to Settings → Keyboard shortcuts (msg#30 P09).
  const handleKeyboardShortcut = useCallback(
    (event: React.KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        handleSend();
      } else if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        void handleSaveDraft();
      }
    },
    [handleSaveDraft, handleSend],
  );

  if (isMinimized) {
    return (
      <div className="composer-minimized">
        <button
          type="button"
          className="composer-minimized-trigger"
          onClick={onToggleMinimize}
          aria-label={`Expand composer: ${subject || 'New message'}`}
        >
          <span className="composer-minimized-title">
            {subject || 'New message'} <span aria-hidden="true">·</span> {to || 'No recipients'}
          </span>
        </button>
        <button type="button" className="btn-icon" aria-label="Discard message" onClick={onDiscard}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
    );
  }

  const toId = `${fieldId}-to`;
  const ccId = `${fieldId}-cc`;
  const bccId = `${fieldId}-bcc`;
  const subjectId = `${fieldId}-subject`;
  const bodyId = `${fieldId}-body`;
  const priorityId = `${fieldId}-priority`;
  const fileId = `${fieldId}-files`;

  const writerExpression: QuantyExpression = writerSending
    ? 'thinking'
    : writerError
      ? 'sad'
      : writerMessages.some((m) => m.role === 'assistant')
        ? 'happy'
        : quantyOpen
          ? 'wink'
          : 'idle';

  return (
    <main className="email-composer" onKeyDown={handleKeyboardShortcut}>
      <section className="composer-surface" aria-labelledby={`${fieldId}-title`}>
        <header className="composer-header">
          <div>
            <p className="composer-eyebrow">Compose</p>
            <h1 id={`${fieldId}-title`} className="composer-title">
              New message
            </h1>
          </div>
          <div className="composer-header-actions">
            {onToggleMinimize && (
              <button
                type="button"
                className="btn-icon"
                onClick={onToggleMinimize}
                aria-label="Minimize composer"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12h14" />
                </svg>
              </button>
            )}
            <button
              type="button"
              className="btn-icon"
              onClick={onDiscard}
              aria-label="Discard message"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        </header>

        <div
          className={`composer-live-message ${liveMessage?.kind === 'error' ? 'is-error' : ''}`}
          role={liveMessage?.kind === 'error' ? 'alert' : 'status'}
          aria-live={liveMessage?.kind === 'error' ? 'assertive' : 'polite'}
          aria-atomic="true"
        >
          {liveMessage?.text ??
            'Build the message first, then choose whether to send now or save a draft.'}
        </div>

        <section
          aria-label="Compose readiness"
          className="mx-5 mt-4 rounded-[0.95rem] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-4 py-3"
        >
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${
                hasRecipients
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] text-[var(--quant-muted-foreground)]'
              }`}
            >
              {hasRecipients ? '✓' : '•'} Recipients {hasRecipients ? 'ready' : 'needed'}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${
                hasSubject
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] text-[var(--quant-muted-foreground)]'
              }`}
            >
              {hasSubject ? '✓' : '•'} Subject {hasSubject ? 'ready' : 'needed'}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${
                hasMessageBody
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] text-[var(--quant-muted-foreground)]'
              }`}
            >
              {hasMessageBody ? '✓' : '•'} Message {hasMessageBody ? 'started' : 'empty'}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] px-2.5 py-1 text-[var(--quant-muted-foreground)]">
              {attachments.length > 0 ? '↗' : '•'}{' '}
              {attachments.length > 0
                ? `${attachments.length} local file${attachments.length === 1 ? '' : 's'}`
                : 'No local files'}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] px-2.5 py-1 text-[var(--quant-muted-foreground)]">
              Draft status: {draftStatusLabel}
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-[var(--quant-muted-foreground)]">
            Send goes out instantly with a short Undo window. Schedule saves a draft only, and local
            file selection stays on this device until upload is connected.
          </p>
        </section>

        <div className="composer-fields">
          <div className={`composer-field ${fieldErrors.to ? 'has-error' : ''}`}>
            <ContactAutocomplete
              id={toId}
              label="To"
              value={to}
              onChange={(value) => {
                setTo(value);
                if (fieldErrors.to) setFieldErrors((errors) => ({ ...errors, to: undefined }));
              }}
              contacts={contacts}
              placeholder="name@example.com"
            />
            <button
              type="button"
              className="btn-link"
              aria-expanded={showCcBcc}
              onClick={() => setShowCcBcc((visible) => !visible)}
            >
              {showCcBcc ? 'Hide Cc/Bcc' : 'Cc/Bcc'}
            </button>
          </div>
          {fieldErrors.to && (
            <p id={`${toId}-error`} className="field-error">
              {fieldErrors.to}
            </p>
          )}

          {showCcBcc && (
            <div className="composer-secondary-fields">
              <div className="composer-field">
                <ContactAutocomplete
                  id={ccId}
                  label="Cc"
                  value={cc}
                  onChange={setCc}
                  contacts={contacts}
                  placeholder="Add Cc recipients"
                />
              </div>
              <div className="composer-field">
                <ContactAutocomplete
                  id={bccId}
                  label="Bcc"
                  value={bcc}
                  onChange={setBcc}
                  contacts={contacts}
                  placeholder="Add Bcc recipients"
                />
              </div>
            </div>
          )}

          <div
            className={`composer-field composer-subject-field ${fieldErrors.subject ? 'has-error' : ''}`}
          >
            <label htmlFor={subjectId}>
              Subject <span aria-hidden="true">*</span>
            </label>
            <input
              id={subjectId}
              type="text"
              value={subject}
              required
              aria-invalid={Boolean(fieldErrors.subject)}
              aria-describedby={fieldErrors.subject ? `${subjectId}-error` : undefined}
              placeholder="A clear subject"
              onChange={(event) => {
                setSubject(event.target.value);
                if (fieldErrors.subject) {
                  setFieldErrors((errors) => ({ ...errors, subject: undefined }));
                }
              }}
            />
          </div>
          {fieldErrors.subject && (
            <p id={`${subjectId}-error`} className="field-error">
              {fieldErrors.subject}
            </p>
          )}
        </div>

        {/* Quanty writer (msg#30 P08) — the robot sits centre-stage; click him
            to chat. “Write a follow-up to the invoice mail” → he drafts it and
            one tap drops it into the message. Worker AI answers in the back. */}
        <section className="composer-quanty" aria-label="Quanty — ask him to write this mail">
          <button
            type="button"
            className="composer-quanty-face"
            onClick={() => setQuantyOpen((open) => !open)}
            aria-expanded={quantyOpen}
            title={quantyOpen ? 'Close Quanty' : 'Ask Quanty to write this mail'}
          >
            <Quanty expression={writerExpression} size={64} bob title="Quanty" />
            <span className="composer-quanty-hint">
              {quantyOpen ? 'Close Quanty' : 'Tell Quanty what to write'}
            </span>
          </button>

          {quantyOpen && (
            <div className="composer-quanty-chat">
              <div className="composer-quanty-thread" ref={writerThreadRef} aria-live="polite">
                {writerMessages.length === 0 && !writerSending && (
                  <p className="composer-quanty-empty">
                    Say something like “write a polite follow-up about the pending invoice, 3 lines”
                    — Quanty drafts it, you apply it with one tap. He will ask a quick question if
                    he needs details.
                  </p>
                )}
                {writerMessages.map((message) => (
                  <div key={message.id} className={`composer-quanty-msg is-${message.role}`}>
                    {message.role === 'assistant' && <span className="msg-author">Quanty</span>}
                    <p>{message.content}</p>
                    {message.role === 'assistant' && (
                      <button
                        type="button"
                        className="composer-quanty-apply"
                        onClick={() => {
                          setBody(message.content);
                          setLiveMessage({
                            kind: 'status',
                            text: 'Quanty’s draft applied to the message.',
                          });
                        }}
                      >
                        Use in message
                      </button>
                    )}
                  </div>
                ))}
                {writerSending && (
                  <div className="composer-quanty-msg is-assistant is-typing">
                    <Quanty expression="thinking" size={20} /> Writing…
                  </div>
                )}
                {writerError && (
                  <div className="composer-quanty-msg is-error" role="alert">
                    {writerError}
                  </div>
                )}
              </div>
              <div
                className="composer-quanty-tones"
                aria-label="Quick rewrites of the current message"
              >
                {AI_TONES.map((tone) => (
                  <button
                    key={tone.key}
                    type="button"
                    onClick={() => void handleAITone(tone.key)}
                    disabled={aiLoading || busy}
                  >
                    {aiLoading ? 'Working…' : tone.label}
                  </button>
                ))}
              </div>
              <form
                className="composer-quanty-input"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendToWriter();
                }}
              >
                <input
                  type="text"
                  value={writerInput}
                  onChange={(event) => setWriterInput(event.target.value)}
                  placeholder="Tell Quanty what this mail should say…"
                  aria-label="Tell Quanty what this mail should say"
                />
                <button type="submit" disabled={writerSending || writerInput.trim().length === 0}>
                  Send
                </button>
              </form>
            </div>
          )}
        </section>

        <div
          className={`composer-writing-area ${isDragOver ? 'is-dragging' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragOver(false);
            reportFiles(Array.from(event.dataTransfer.files));
          }}
        >
          {isDragOver && (
            <div className="composer-drop-message">Release to select files locally</div>
          )}
          <label className="composer-body-label" htmlFor={bodyId}>
            Message
          </label>
          <textarea
            id={bodyId}
            className="composer-body"
            ref={undefined}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write with clarity. Keep only what matters."
            rows={14}
          />
        </div>

        {attachments.length > 0 && (
          <section className="local-attachments" aria-labelledby={`${fieldId}-attachments-title`}>
            <div className="local-attachments-heading">
              <h2 id={`${fieldId}-attachments-title`}>Local file selection</h2>
              <span>Not uploaded or included when sent</span>
            </div>
            <ul>
              {attachments.map((file) => (
                <li key={file.id}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8 12.5 14.5 6a3 3 0 0 1 4.2 4.2l-8.1 8.1a5 5 0 0 1-7.1-7.1l8-8" />
                  </svg>
                  <span>
                    <strong>{file.name}</strong>
                    <small>
                      {formatFileSize(file.size)} · {file.type}
                    </small>
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name} from local selection`}
                    onClick={() =>
                      setAttachments((files) => files.filter((item) => item.id !== file.id))
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="composer-action-bar">
          <div className="composer-tools">
            <input
              ref={fileInputRef}
              id={fileId}
              className="visually-hidden-file"
              type="file"
              multiple
              onChange={(event) => {
                reportFiles(Array.from(event.target.files ?? []));
                event.target.value = '';
              }}
            />
            <button
              type="button"
              className="tool-action"
              onClick={() => fileInputRef.current?.click()}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 12.5 14.5 6a3 3 0 0 1 4.2 4.2l-8.1 8.1a5 5 0 0 1-7.1-7.1l8-8" />
              </svg>
              Select local files
            </button>
            <button type="button" className="tool-action" onClick={() => setShowTemplates(true)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" />
              </svg>
              Templates
            </button>
            <span className="attachment-caveat">Upload is not available</span>
          </div>
          <div className="priority-control">
            <label htmlFor={priorityId}>Priority</label>
            <select
              id={priorityId}
              value={priority}
              onChange={(event) => setPriority(event.target.value as EmailPriority)}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        <footer className="composer-footer">
          <div className="composer-send-group">
            <button type="button" className="btn btn-primary" onClick={handleSend} disabled={busy}>
              {isSending ? 'Sending…' : 'Send'}
            </button>
            <div className="schedule-control">
              <button
                ref={scheduleButtonRef}
                type="button"
                className="btn btn-schedule"
                aria-haspopup="menu"
                aria-controls={`${fieldId}-schedule-menu`}
                aria-expanded={showScheduleMenu}
                onClick={() => setShowScheduleMenu((visible) => !visible)}
                disabled={busy}
              >
                Schedule draft
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m8 10 4 4 4-4" />
                </svg>
              </button>
              {showScheduleMenu && (
                <div
                  ref={scheduleMenuRef}
                  id={`${fieldId}-schedule-menu`}
                  className="schedule-menu"
                  role="menu"
                  aria-label="Save as scheduled draft"
                >
                  <p>Save a scheduled draft</p>
                  <small>Delivery scheduling is not connected yet.</small>
                  {SCHEDULE_OPTIONS.map((option, index) => (
                    <button
                      ref={index === 0 ? firstScheduleOptionRef : undefined}
                      key={option.label}
                      type="button"
                      role="menuitem"
                      onClick={() => void handleScheduleSend(option)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="composer-secondary-actions">
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => void handleSaveDraft()}
              disabled={busy}
            >
              {isSaving ? 'Saving…' : 'Save draft'}
            </button>
            <button type="button" className="btn btn-quiet discard-action" onClick={onDiscard}>
              Discard
            </button>
          </div>
        </footer>
      </section>

      <EmailTemplates
        isOpen={showTemplates}
        onClose={() => setShowTemplates(false)}
        onSelectTemplate={(template: EmailTemplate) => {
          if (template.subject) setSubject(template.subject);
          if (template.body) setBody(template.body);
        }}
      />
    </main>
  );
}

export default EmailComposer;

// ============================================================================
// QuantMail - Email Composer Component
// Rich text editor with AI suggestions, schedule send, and undo send
// ============================================================================

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import { toastSlideUpVariants } from '../lib/motion-variants';
import type { EmailAddress, EmailPriority } from '../types';

export interface EmailComposerProps {
  initialTo?: EmailAddress[];
  initialSubject?: string;
  initialBody?: string;
  inReplyTo?: string;
  onSend: (data: {
    to: EmailAddress[];
    cc: EmailAddress[];
    bcc: EmailAddress[];
    subject: string;
    bodyText: string;
    bodyHtml: string;
    priority: EmailPriority;
    scheduledAt?: string;
  }) => Promise<void>;
  onSaveDraft: () => void;
  onDiscard: () => void;
  onAIAssist: (
    action: 'compose' | 'improve' | 'shorten' | 'formalize',
    text: string,
  ) => Promise<string>;
  onAttach: (file: { name: string; size: number; type: string }) => void;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
}

type AITone = 'professional' | 'friendly' | 'concise' | 'expand';

const AI_TONES: {
  key: AITone;
  label: string;
  action: 'compose' | 'improve' | 'shorten' | 'formalize';
}[] = [
  { key: 'professional', label: 'Professional', action: 'formalize' },
  { key: 'friendly', label: 'Friendly', action: 'improve' },
  { key: 'concise', label: 'Concise', action: 'shorten' },
  { key: 'expand', label: 'Expand', action: 'compose' },
];

const SCHEDULE_OPTIONS = [
  { label: 'In 1 hour', hours: 1 },
  { label: 'In 2 hours', hours: 2 },
  { label: 'Tomorrow morning (9 AM)', hours: 0, preset: 'tomorrow_9am' },
  { label: 'Tomorrow afternoon (2 PM)', hours: 0, preset: 'tomorrow_2pm' },
  { label: 'Monday morning (9 AM)', hours: 0, preset: 'monday_9am' },
];

function getScheduledDate(option: (typeof SCHEDULE_OPTIONS)[number]): Date {
  const now = new Date();
  if (option.hours > 0) {
    return new Date(now.getTime() + option.hours * 60 * 60 * 1000);
  }
  const result = new Date(now);
  if (option.preset === 'tomorrow_9am') {
    result.setDate(result.getDate() + 1);
    result.setHours(9, 0, 0, 0);
  } else if (option.preset === 'tomorrow_2pm') {
    result.setDate(result.getDate() + 1);
    result.setHours(14, 0, 0, 0);
  } else if (option.preset === 'monday_9am') {
    const dayOfWeek = result.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    result.setDate(result.getDate() + daysUntilMonday);
    result.setHours(9, 0, 0, 0);
  }
  return result;
}

export function EmailComposer(props: EmailComposerProps): React.ReactElement {
  const {
    initialTo,
    initialSubject,
    initialBody,
    onSend,
    onSaveDraft,
    onDiscard,
    onAIAssist,
    onAttach,
    isMinimized,
    onToggleMinimize,
  } = props;

  const [to, setTo] = useState(initialTo?.map((a) => a.email).join(', ') || '');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(initialSubject || '');
  const [body, setBody] = useState(initialBody || '');
  const [priority, setPriority] = useState<EmailPriority>('normal');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [formatting, setFormatting] = useState({
    bold: false,
    italic: false,
    underline: false,
    orderedList: false,
    unorderedList: false,
    link: false,
    code: false,
  });
  const [aiLoading, setAiLoading] = useState(false);
  const [showScheduleMenu, setShowScheduleMenu] = useState(false);
  const [undoSendState, setUndoSendState] = useState<{
    countdown: number;
    timer: ReturnType<typeof setInterval> | null;
  } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const parseEmails = (str: string): EmailAddress[] => {
    return str
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s)
      .map((email) => ({ email }));
  };

  const handleSend = useCallback(
    async (scheduledAt?: string) => {
      if (!to.trim() || !subject.trim()) return;
      setShowScheduleMenu(false);

      // Start undo-send countdown
      setUndoSendState({ countdown: 5, timer: null });
    },
    [to, subject],
  );

  // Undo send countdown effect
  useEffect(() => {
    if (!undoSendState) return;

    if (undoSendState.countdown <= 0) {
      // Actually send
      setUndoSendState(null);
      setIsSending(true);
      onSend({
        to: parseEmails(to),
        cc: parseEmails(cc),
        bcc: parseEmails(bcc),
        subject,
        bodyText: body,
        bodyHtml: `<div>${body.replace(/\n/g, '<br>')}</div>`,
        priority,
      }).finally(() => setIsSending(false));
      return;
    }

    const timer = setTimeout(() => {
      setUndoSendState((prev) => (prev ? { ...prev, countdown: prev.countdown - 1 } : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [undoSendState, to, cc, bcc, subject, body, priority, onSend]);

  const handleUndoSend = useCallback(() => {
    setUndoSendState(null);
  }, []);

  const handleScheduleSend = useCallback(
    (option: (typeof SCHEDULE_OPTIONS)[number]) => {
      if (!to.trim() || !subject.trim()) return;
      setShowScheduleMenu(false);
      const scheduledDate = getScheduledDate(option);
      setIsSending(true);
      onSend({
        to: parseEmails(to),
        cc: parseEmails(cc),
        bcc: parseEmails(bcc),
        subject,
        bodyText: body,
        bodyHtml: `<div>${body.replace(/\n/g, '<br>')}</div>`,
        priority,
        scheduledAt: scheduledDate.toISOString(),
      }).finally(() => setIsSending(false));
    },
    [to, cc, bcc, subject, body, priority, onSend],
  );

  const handleAITone = useCallback(
    async (tone: AITone) => {
      const toneConfig = AI_TONES.find((t) => t.key === tone);
      if (!toneConfig) return;
      setAiLoading(true);
      try {
        const result = await onAIAssist(toneConfig.action, body);
        setBody(result);
      } finally {
        setAiLoading(false);
      }
    },
    [body, onAIAssist],
  );

  const handleKeyboardShortcut = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey) {
      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          handleSend();
          break;
        case 'b':
          e.preventDefault();
          setFormatting((f) => ({ ...f, bold: !f.bold }));
          break;
        case 'i':
          e.preventDefault();
          setFormatting((f) => ({ ...f, italic: !f.italic }));
          break;
        case 'u':
          e.preventDefault();
          setFormatting((f) => ({ ...f, underline: !f.underline }));
          break;
        case 's':
          e.preventDefault();
          onSaveDraft();
          break;
      }
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        onAttach({ name: file.name, size: file.size, type: file.type });
      }
    },
    [onAttach],
  );

  if (isMinimized) {
    return (
      <div className="composer-minimized" onClick={onToggleMinimize}>
        <span className="composer-minimized-title">
          {subject || 'New Message'} - {to || 'No recipients'}
        </span>
        <button
          className="btn-icon min-h-[44px] min-w-[44px]"
          onClick={(e) => {
            e.stopPropagation();
            onDiscard();
          }}
        >
          X
        </button>
      </div>
    );
  }

  return (
    <div className="email-composer" onKeyDown={handleKeyboardShortcut}>
      {/* Header */}
      <div className="composer-header">
        <span className="composer-title">New Message</span>
        <div className="composer-header-actions">
          {onToggleMinimize && (
            <button
              className="btn-icon min-h-[44px] min-w-[44px]"
              onClick={onToggleMinimize}
              title="Minimize"
            >
              _
            </button>
          )}
          <button
            className="btn-icon min-h-[44px] min-w-[44px]"
            onClick={onDiscard}
            title="Discard"
          >
            X
          </button>
        </div>
      </div>

      {/* Recipients */}
      <div className="composer-fields">
        <div className="composer-field">
          <label>To</label>
          <input
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="Recipients"
          />
          <button className="btn-link min-h-[44px]" onClick={() => setShowCcBcc(!showCcBcc)}>
            {showCcBcc ? 'Hide Cc/Bcc' : 'Cc Bcc'}
          </button>
        </div>
        {showCcBcc && (
          <>
            <div className="composer-field">
              <label>Cc</label>
              <input type="text" value={cc} onChange={(e) => setCc(e.target.value)} />
            </div>
            <div className="composer-field">
              <label>Bcc</label>
              <input type="text" value={bcc} onChange={(e) => setBcc(e.target.value)} />
            </div>
          </>
        )}
        <div className="composer-field">
          <label>Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
          />
        </div>
      </div>

      {/* Formatting Toolbar */}
      <div className="composer-toolbar">
        <button
          className={`toolbar-btn min-h-[44px] min-w-[44px] ${formatting.bold ? 'active' : ''}`}
          onClick={() => setFormatting((f) => ({ ...f, bold: !f.bold }))}
          title="Bold (Cmd+B)"
        >
          <strong>B</strong>
        </button>
        <button
          className={`toolbar-btn min-h-[44px] min-w-[44px] ${formatting.italic ? 'active' : ''}`}
          onClick={() => setFormatting((f) => ({ ...f, italic: !f.italic }))}
          title="Italic (Cmd+I)"
        >
          <em>I</em>
        </button>
        <button
          className={`toolbar-btn min-h-[44px] min-w-[44px] ${formatting.underline ? 'active' : ''}`}
          onClick={() => setFormatting((f) => ({ ...f, underline: !f.underline }))}
          title="Underline (Cmd+U)"
        >
          <u>U</u>
        </button>
        <span className="toolbar-divider" />
        <button
          className={`toolbar-btn min-h-[44px] min-w-[44px] ${formatting.orderedList ? 'active' : ''}`}
          onClick={() => setFormatting((f) => ({ ...f, orderedList: !f.orderedList }))}
          title="Numbered list"
        >
          1.
        </button>
        <button
          className={`toolbar-btn min-h-[44px] min-w-[44px] ${formatting.unorderedList ? 'active' : ''}`}
          onClick={() => setFormatting((f) => ({ ...f, unorderedList: !f.unorderedList }))}
          title="Bullet list"
        >
          &#8226;
        </button>
        <button
          className={`toolbar-btn min-h-[44px] min-w-[44px] ${formatting.link ? 'active' : ''}`}
          onClick={() => setFormatting((f) => ({ ...f, link: !f.link }))}
          title="Insert link"
        >
          Link
        </button>
        <button
          className={`toolbar-btn min-h-[44px] min-w-[44px] ${formatting.code ? 'active' : ''}`}
          onClick={() => setFormatting((f) => ({ ...f, code: !f.code }))}
          title="Code"
        >
          &lt;/&gt;
        </button>
        <span className="toolbar-divider" />
        <button
          className="toolbar-btn min-h-[44px] min-w-[44px]"
          onClick={() => onAttach({ name: 'file.pdf', size: 0, type: 'application/pdf' })}
          title="Attach file"
        >
          Attach
        </button>
        <div className="toolbar-right">
          <select
            className="priority-select min-h-[44px]"
            value={priority}
            onChange={(e) => setPriority(e.target.value as EmailPriority)}
          >
            <option value="low">Low priority</option>
            <option value="normal">Normal</option>
            <option value="high">High priority</option>
          </select>
        </div>
      </div>

      {/* AI Tone Buttons */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--quant-border)] bg-[var(--quant-muted)] overflow-x-auto">
        <span className="text-xs font-medium text-[var(--quant-muted-foreground)] whitespace-nowrap">
          AI Tone:
        </span>
        {AI_TONES.map((tone) => (
          <button
            key={tone.key}
            className="px-3 py-1.5 min-h-[44px] text-xs rounded-full border border-[var(--quant-border)] hover:bg-[var(--quant-primary)] hover:text-white transition-colors whitespace-nowrap"
            onClick={() => handleAITone(tone.key)}
            disabled={aiLoading}
          >
            {aiLoading ? '...' : tone.label}
          </button>
        ))}
      </div>

      {/* Body with drag-drop zone */}
      <div
        className={`relative flex-1 ${isDragOver ? 'ring-2 ring-[var(--quant-primary)] ring-inset bg-[var(--quant-primary)]/5' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--quant-muted)]/80 z-10 pointer-events-none">
            <p className="text-sm font-medium text-[var(--quant-primary)]">Drop files to attach</p>
          </div>
        )}
        <textarea
          ref={textareaRef}
          className="composer-body w-full h-full min-h-[200px]"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Compose your email..."
          rows={12}
        />
      </div>

      {/* Footer */}
      <div className="composer-footer">
        <button
          className="btn btn-primary min-h-[44px]"
          onClick={() => handleSend()}
          disabled={isSending || !to.trim()}
        >
          {isSending ? 'Sending...' : 'Send'} <span className="shortcut">Cmd+Enter</span>
        </button>
        {/* Schedule Send */}
        <div className="relative">
          <button
            className="btn btn-outline min-h-[44px]"
            onClick={() => setShowScheduleMenu(!showScheduleMenu)}
            disabled={isSending || !to.trim()}
          >
            Schedule Send
          </button>
          {showScheduleMenu && (
            <div className="absolute bottom-full left-0 mb-2 w-64 bg-[var(--quant-background)] border border-[var(--quant-border)] rounded-lg shadow-lg z-20 py-1">
              {SCHEDULE_OPTIONS.map((option) => (
                <button
                  key={option.label}
                  className="w-full text-left px-4 py-2 min-h-[44px] text-sm hover:bg-[var(--quant-muted)] transition-colors"
                  onClick={() => handleScheduleSend(option)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="btn btn-outline min-h-[44px]" onClick={onSaveDraft}>
          Save draft
        </button>
        <button
          className="btn btn-outline btn-icon min-h-[44px]"
          onClick={onDiscard}
          title="Discard"
        >
          Discard
        </button>
      </div>

      {/* Undo Send Toast */}
      <AnimatePresence>
        {undoSendState && (
          <motion.div
            variants={toastSlideUpVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 px-6 py-3 bg-[var(--quant-foreground)] text-[var(--quant-background)] rounded-lg shadow-xl"
          >
            <span className="text-sm font-medium">Sending in {undoSendState.countdown}s...</span>
            <div className="w-8 h-8 rounded-full border-2 border-[var(--quant-background)] flex items-center justify-center text-xs font-bold">
              {undoSendState.countdown}
            </div>
            <button
              className="px-4 py-1.5 min-h-[44px] text-sm font-semibold bg-[var(--quant-destructive)] text-white rounded-md hover:opacity-90 transition-opacity"
              onClick={handleUndoSend}
            >
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default EmailComposer;

'use client';

import React, { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ContactAutocomplete, type ContactSuggestion } from './ContactAutocomplete';
import { EmailTemplates, type EmailTemplate } from './EmailTemplates';
import { showToast } from './InboxToast';
import { Quanty } from './Quanty';
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
  attachments?: LocalAttachment[];
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

export type LocalAttachment = {
  id: string;
  name: string;
  filename?: string;
  size: number;
  type: string;
  mimeType?: string;
  url?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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

export function EmailComposer({
  initialTo,
  initialSubject,
  initialBody,
  onSend,
  onSaveDraft,
  onDiscard,
  onAIAssist,
}: EmailComposerProps): React.ReactElement {
  const [to, setTo] = useState(initialTo?.map((address) => address.email).join(', ') ?? '');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(initialSubject?.replace(/^(Re:\s*)+/i, '').trim() ?? '');

  // Structured Corporate Email Sections
  const [greeting, setGreeting] = useState('Dear Sir/Madam,');
  const [opening, setOpening] = useState('');
  const [mainBody, setMainBody] = useState(initialBody ?? '');
  const [closing, setClosing] = useState('Thank you for your time.');
  const [signoff, setSignoff] = useState('Best regards,');
  const [senderName, setSenderName] = useState('Kundan Kumar');
  const [customDetails, setCustomDetails] = useState<string[]>(['Quantrinity Lab']);

  const [priority, setPriority] = useState<EmailPriority>('normal');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);

  // Quanty AI assistant modal state
  const [isQuantyModalOpen, setIsQuantyModalOpen] = useState(false);
  const [quantyPrompt, setQuantyPrompt] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [contacts] = useState<ContactSuggestion[]>([
    { email: 'team@quantrinity.in', name: 'Quantrinity Team', frequency: 10 },
    { email: 'kundan@quantmail.in', name: 'Kundan', frequency: 8 },
    { email: 'support@quantrinity.in', name: 'Support', frequency: 5 },
  ]);

  const busy = isSending || isSaving || aiLoading;

  const buildMessage = useCallback(
    (scheduledAt?: string): ComposerMessageData => {
      // Assemble structured corporate email parts
      const parts: string[] = [];

      if (greeting.trim()) {
        parts.push(greeting.trim());
      }

      if (opening.trim()) {
        parts.push(opening.trim());
      }

      if (mainBody.trim()) {
        parts.push(mainBody.trim());
      }

      if (closing.trim()) {
        parts.push(closing.trim());
      }

      const signoffLines: string[] = [];
      if (signoff.trim()) signoffLines.push(signoff.trim());
      if (senderName.trim()) signoffLines.push(senderName.trim());
      customDetails.forEach((line) => {
        if (line.trim()) signoffLines.push(line.trim());
      });

      if (signoffLines.length > 0) {
        parts.push(signoffLines.join('\n'));
      }

      const finalBodyText = parts.join('\n\n');
      const finalBodyHtml = parts
        .map(
          (p) =>
            `<p style="margin: 0 0 16px 0; line-height: 1.6;">${escapeHtml(p).replace(/\r?\n/g, '<br />')}</p>`,
        )
        .join('');

      return {
        to: parseEmails(to),
        cc: parseEmails(cc),
        bcc: parseEmails(bcc),
        subject: subject.trim() || '(No Subject)',
        bodyText: finalBodyText,
        bodyHtml: finalBodyHtml,
        priority,
        scheduledAt,
        attachments: attachments.length > 0 ? attachments : undefined,
      };
    },
    [
      to,
      cc,
      bcc,
      subject,
      greeting,
      opening,
      mainBody,
      closing,
      signoff,
      senderName,
      customDetails,
      priority,
      attachments,
    ],
  );

  const handleSend = async () => {
    if (!to.trim()) {
      showToast({ text: 'Please enter at least one recipient', type: 'error' });
      return;
    }
    if (!subject.trim()) {
      showToast({ text: 'Please enter an email subject', type: 'error' });
      return;
    }
    if (!mainBody.trim() && !opening.trim()) {
      showToast({ text: 'Please enter the message details in the main body', type: 'error' });
      return;
    }
    setIsSending(true);
    try {
      await onSend(buildMessage());
      showToast({ text: 'Message sent successfully', type: 'success' });
    } catch {
      showToast({ text: 'Failed to send message', type: 'error' });
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);
    try {
      await onSaveDraft(buildMessage());
      showToast({ text: 'Draft saved', type: 'info' });
    } catch {
      showToast({ text: 'Failed to save draft', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddDetailLine = () => {
    setCustomDetails((prev) => [...prev, '']);
  };

  const handleUpdateDetailLine = (index: number, val: string) => {
    setCustomDetails((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  };

  const handleRemoveDetailLine = (index: number) => {
    setCustomDetails((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSelectTemplate = (template: EmailTemplate) => {
    setSubject(template.subject);
    setMainBody(template.body);
    setShowTemplates(false);
    showToast({ text: `Template "${template.name}" applied`, type: 'info' });
  };

  const handleQuantyGenerate = async () => {
    if (!quantyPrompt.trim() || aiLoading) return;
    setAiLoading(true);
    try {
      const generated = await onAIAssist('compose', quantyPrompt);
      if (generated) {
        setMainBody(generated);
        if (!subject.trim()) {
          setSubject(quantyPrompt.slice(0, 50));
        }
        setIsQuantyModalOpen(false);
        setQuantyPrompt('');
        showToast({ text: 'Quanty crafted your email body', type: 'success' });
      }
    } catch {
      showToast({ text: 'Quanty could not generate the draft', type: 'error' });
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="w-full min-h-[calc(100vh-3.5rem)] md:min-h-full flex flex-col bg-[#090A0C] text-zinc-100 p-2 sm:p-5">
      {/* Header Bar */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDiscard}
            className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Discard & Go Back"
          >
            <svg
              className="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">New Message</h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowTemplates(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-zinc-300 hover:text-amber-300 bg-zinc-900 border border-zinc-800 hover:border-amber-500/40 transition-all"
          >
            <span>📑</span>
            <span className="hidden sm:inline">Templates</span>
          </button>
          <button
            type="button"
            onClick={() => setIsQuantyModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition-all"
          >
            <Quanty size={16} expression="happy" bob={false} />
            <span className="hidden sm:inline">Quanty AI</span>
          </button>
        </div>
      </div>

      {/* Main Composer Card Container */}
      <div className="flex-1 w-full max-w-4xl mx-auto rounded-2xl border border-zinc-800 bg-[#0e1017] p-4 sm:p-6 space-y-4 shadow-2xl">
        {/* 1. Recipient (To) and Cc/Bcc Toggle */}
        <div className="space-y-2">
          <div className="flex items-center gap-3 pb-2 border-b border-zinc-800/80">
            <span className="w-16 sm:w-20 text-xs font-mono font-bold text-amber-400">To:</span>
            <div className="flex-1 min-w-0">
              <ContactAutocomplete
                value={to}
                onChange={setTo}
                contacts={contacts}
                placeholder="name@example.com (or enter recipient email)"
                aria-label="To"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowCcBcc(!showCcBcc)}
              className="text-xs text-zinc-400 hover:text-amber-300 font-mono shrink-0 px-2 py-1 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              {showCcBcc ? 'Hide Cc' : 'Cc / Bcc'}
            </button>
          </div>

          {/* Expandable Cc and Bcc */}
          {showCcBcc && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2 pt-1"
            >
              <div className="flex items-center gap-3 pb-2 border-b border-zinc-800/80">
                <span className="w-16 sm:w-20 text-xs font-mono font-bold text-amber-400">Cc:</span>
                <div className="flex-1 min-w-0">
                  <ContactAutocomplete
                    value={cc}
                    onChange={setCc}
                    contacts={contacts}
                    placeholder="Cc recipients"
                    aria-label="Cc"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 pb-2 border-b border-zinc-800/80">
                <span className="w-16 sm:w-20 text-xs font-mono font-bold text-amber-400">
                  Bcc:
                </span>
                <div className="flex-1 min-w-0">
                  <ContactAutocomplete
                    value={bcc}
                    onChange={setBcc}
                    contacts={contacts}
                    placeholder="Bcc recipients"
                    aria-label="Bcc"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* 2. Subject Field (Clean, no Re:) */}
        <div className="flex items-center gap-3 pb-2.5 border-b border-zinc-800/80">
          <span className="w-16 sm:w-20 text-xs font-mono font-bold text-amber-400">Subject:</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Enter email subject (e.g. Project Update / Meeting Request)"
            className="flex-1 bg-transparent text-sm sm:text-base text-white placeholder-zinc-500 focus:outline-none font-medium"
          />
        </div>

        {/* 3. Guided Corporate Email Sections */}
        <div className="space-y-4 pt-2">
          {/* Section: Greeting */}
          <div className="space-y-1.5 p-3 rounded-xl bg-[#121520] border border-zinc-800/80">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-semibold uppercase text-zinc-400 flex items-center gap-1.5">
                <span>🤝</span> Greeting (Optional)
              </span>
              <div className="flex items-center gap-1 overflow-x-auto">
                {['Dear Sir/Madam,', 'Hi [Name],', 'Hello Team,'].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setGreeting(chip)}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-800 hover:bg-amber-500/20 text-zinc-300 hover:text-amber-300 transition-colors shrink-0"
                  >
                    {chip}
                  </button>
                ))}
                {greeting && (
                  <button
                    type="button"
                    onClick={() => setGreeting('')}
                    className="text-[10px] px-1.5 py-0.5 rounded-md bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-rose-400 transition-colors shrink-0"
                    title="Clear Greeting"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            <input
              type="text"
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              placeholder="e.g. Dear Sir/Madam, or Hi Team,"
              className="w-full bg-transparent text-xs sm:text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none font-sans"
            />
          </div>

          {/* Section: Opening Statement */}
          <div className="space-y-1.5 p-3 rounded-xl bg-[#121520] border border-zinc-800/80">
            <span className="text-[11px] font-mono font-semibold uppercase text-zinc-400 flex items-center gap-1.5">
              <span>🎯</span> Opening / Purpose (Optional)
            </span>
            <input
              type="text"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
              placeholder="e.g. I am writing to share a brief update regarding our upcoming milestone..."
              className="w-full bg-transparent text-xs sm:text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none font-sans"
            />
          </div>

          {/* Section: Main Body Canvas */}
          <div className="space-y-1.5 p-3 rounded-xl bg-[#121520] border border-zinc-800/80">
            <span className="text-[11px] font-mono font-semibold uppercase text-amber-400/90 flex items-center gap-1.5">
              <span>📝</span> Main Body - Details & Request (Required)
            </span>
            <textarea
              value={mainBody}
              onChange={(e) => setMainBody(e.target.value)}
              placeholder="Write the core message details, action items, requests, or bullet points here..."
              rows={8}
              className="w-full bg-transparent text-xs sm:text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none leading-relaxed resize-none font-sans min-h-[160px]"
            />
          </div>

          {/* Section: Closing */}
          <div className="space-y-1.5 p-3 rounded-xl bg-[#121520] border border-zinc-800/80">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-semibold uppercase text-zinc-400 flex items-center gap-1.5">
                <span>🙏</span> Closing (Optional)
              </span>
              <div className="flex items-center gap-1 overflow-x-auto">
                {[
                  'Thank you for your time.',
                  'Looking forward to your response.',
                  'Please let me know if you have questions.',
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setClosing(chip)}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-800 hover:bg-amber-500/20 text-zinc-300 hover:text-amber-300 transition-colors shrink-0"
                  >
                    {chip}
                  </button>
                ))}
                {closing && (
                  <button
                    type="button"
                    onClick={() => setClosing('')}
                    className="text-[10px] px-1.5 py-0.5 rounded-md bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-rose-400 transition-colors shrink-0"
                    title="Clear Closing"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            <input
              type="text"
              value={closing}
              onChange={(e) => setClosing(e.target.value)}
              placeholder="e.g. Thank you for your time and consideration."
              className="w-full bg-transparent text-xs sm:text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none font-sans"
            />
          </div>

          {/* Section: Sign-off & Dynamic Details (+ Add detail button) */}
          <div className="space-y-2.5 p-3.5 rounded-xl bg-[#121520] border border-zinc-800/80">
            <span className="text-[11px] font-mono font-semibold uppercase text-zinc-400 flex items-center gap-1.5">
              <span>✍️</span> Sign-off & Sender Signature
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-mono text-zinc-500">Sign-off:</label>
                <input
                  type="text"
                  value={signoff}
                  onChange={(e) => setSignoff(e.target.value)}
                  placeholder="e.g. Best regards,"
                  className="w-full bg-[#0e1017] border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500/50"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-zinc-500">Sender Name:</label>
                <input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="Your Name"
                  className="w-full bg-[#0e1017] border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500/50 font-semibold"
                />
              </div>
            </div>

            {/* Dynamic Custom Lines (Job Title, Company, Phone, etc.) */}
            {customDetails.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <label className="text-[10px] font-mono text-zinc-500">
                  Additional Details / Title / Company:
                </label>
                {customDetails.map((line, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={line}
                      onChange={(e) => handleUpdateDetailLine(idx, e.target.value)}
                      placeholder="e.g. Founder & CEO / Quantrinity Lab / +91 ..."
                      className="flex-1 bg-[#0e1017] border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-amber-500/50"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveDetailLine(idx)}
                      className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-rose-400 transition-colors"
                      title="Remove line"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Plus Button to Add More Detail Lines */}
            <button
              type="button"
              onClick={handleAddDetailLine}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition-all"
            >
              <svg
                className="size-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>Add detail / line</span>
            </button>
          </div>
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const selected = Array.from(event.target.files ?? []);
            if (selected.length === 0) return;
            for (const file of selected) {
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = typeof reader.result === 'string' ? reader.result : '';
                setAttachments((prev) => [
                  ...prev,
                  {
                    id: `att_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                    name: file.name,
                    filename: file.name,
                    size: file.size,
                    type: file.type || 'application/octet-stream',
                    mimeType: file.type || 'application/octet-stream',
                    url: dataUrl,
                  },
                ]);
              };
              reader.readAsDataURL(file);
            }
            event.target.value = '';
          }}
        />

        {/* Attached Files List */}
        {attachments.length > 0 && (
          <div className="p-3 rounded-xl border border-zinc-800 bg-[#121622] space-y-2">
            <span className="text-xs font-semibold text-zinc-400">Attached files:</span>
            <div className="flex flex-wrap gap-2">
              {attachments.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white"
                >
                  <span className="truncate max-w-[140px]">{file.name}</span>
                  <span className="text-[10px] text-zinc-500">({formatFileSize(file.size)})</span>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== file.id))}
                    className="text-zinc-500 hover:text-rose-400 font-bold"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bottom Unified Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-800/80">
          <div className="flex items-center gap-2">
            {/* Primary Send Button */}
            <button
              type="button"
              onClick={handleSend}
              disabled={busy || !to.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#FF7A00] to-[#ea580c] hover:from-[#e06c00] hover:to-[#d04e06] text-white text-xs sm:text-sm font-bold transition-all shadow-lg active:scale-95 disabled:opacity-40"
            >
              {isSending ? (
                <span>Sending…</span>
              ) : (
                <>
                  <span>Send message</span>
                  <svg
                    className="size-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </>
              )}
            </button>

            {/* Attach File Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition-all text-xs font-semibold"
              title="Attach Files"
            >
              <svg
                className="size-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={busy}
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-xs font-medium transition-all"
            >
              {isSaving ? 'Saving…' : 'Save draft'}
            </button>
            <button
              type="button"
              onClick={onDiscard}
              className="px-3 py-2 rounded-xl text-zinc-400 hover:text-rose-400 text-xs font-medium transition-all hover:bg-zinc-900"
            >
              Discard
            </button>
          </div>
        </div>
      </div>

      {/* Quanty AI Assistant Modal */}
      <AnimatePresence>
        {isQuantyModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsQuantyModalOpen(false)}
              className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-x-4 top-[20%] sm:max-w-lg sm:mx-auto z-50 rounded-2xl border border-amber-500/30 bg-[#121622] p-5 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Quanty size={28} expression={aiLoading ? 'thinking' : 'happy'} bob={false} />
                  <h3 className="text-sm font-bold text-amber-300">Quanty Email Copilot</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsQuantyModalOpen(false)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
                >
                  ✕
                </button>
              </div>

              <textarea
                value={quantyPrompt}
                onChange={(e) => setQuantyPrompt(e.target.value)}
                placeholder="What would you like Quanty to write? (e.g. Write an update on Q3 project deliverables...)"
                rows={3}
                className="w-full rounded-xl bg-zinc-900 border border-zinc-800 p-3 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 resize-none"
              />

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsQuantyModalOpen(false)}
                  className="px-3 py-1.5 rounded-xl text-xs text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleQuantyGenerate}
                  disabled={aiLoading || !quantyPrompt.trim()}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF7A00] to-[#ea580c] text-white text-xs font-bold shadow-md disabled:opacity-40"
                >
                  {aiLoading ? 'Generating…' : 'Generate Draft'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Template Modal */}
      <EmailTemplates
        isOpen={showTemplates}
        onClose={() => setShowTemplates(false)}
        onSelectTemplate={handleSelectTemplate}
      />
    </div>
  );
}

export default EmailComposer;

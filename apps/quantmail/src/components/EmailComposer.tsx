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

type LocalAttachment = { id: string; name: string; size: number; type: string };

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
  const [subject, setSubject] = useState(initialSubject ?? '');
  const [body, setBody] = useState(initialBody ?? '');
  const [priority, setPriority] = useState<EmailPriority>('normal');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);

  // Quanty AI autonomous assistant modal state
  const [isQuantyModalOpen, setIsQuantyModalOpen] = useState(false);
  const [quantyPrompt, setQuantyPrompt] = useState('');
  const [quantyProposedAction, setQuantyProposedAction] = useState<{
    to?: string;
    subject?: string;
    body?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [contacts] = useState<ContactSuggestion[]>([
    { email: 'team@quantrinity.in', name: 'Quantrinity Team', frequency: 10 },
    { email: 'kundan@quantmail.in', name: 'Kundan', frequency: 8 },
    { email: 'support@quantrinity.in', name: 'Support', frequency: 5 },
  ]);

  const busy = isSending || isSaving || aiLoading;

  const buildMessage = useCallback(
    (scheduledAt?: string): ComposerMessageData => {
      const finalBodyText = body;
      const finalBodyHtml = `<div>${escapeHtml(body).replace(/\r?\n/g, '<br />')}</div>`;

      return {
        to: parseEmails(to),
        cc: parseEmails(cc),
        bcc: parseEmails(bcc),
        subject: subject.trim() || '(No Subject)',
        bodyText: finalBodyText,
        bodyHtml: finalBodyHtml,
        priority,
        scheduledAt,
      };
    },
    [to, cc, bcc, subject, body, priority],
  );

  const handleSend = async () => {
    if (!to.trim()) {
      showToast({ text: 'Please enter at least one recipient', type: 'error' });
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

  // Quanty AI generation with autonomous permission
  const handleQuantyProcess = async () => {
    if (!quantyPrompt.trim() || aiLoading) return;
    setAiLoading(true);
    try {
      // Prompt AI to generate subject and body
      const generated = await onAIAssist('compose', quantyPrompt);

      // Simple heuristic extraction if user specified email or subject in prompt
      let extractedTo = to;
      let extractedSubject = subject;
      let extractedBody = generated;

      const emailMatch = quantyPrompt.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
      if (emailMatch && !to) {
        extractedTo = emailMatch[0];
      }

      if (!subject) {
        const lines = generated.split('\n').filter(Boolean);
        if (lines[0] && lines[0].toLowerCase().startsWith('subject:')) {
          extractedSubject = lines[0].replace(/^subject:\s*/i, '').trim();
          extractedBody = lines.slice(1).join('\n').trim();
        } else {
          extractedSubject = quantyPrompt.slice(0, 45);
        }
      }

      setQuantyProposedAction({
        to: extractedTo,
        subject: extractedSubject,
        body: extractedBody,
      });
    } catch {
      showToast({ text: 'Quanty could not process the prompt', type: 'error' });
    } finally {
      setAiLoading(false);
    }
  };

  const handleApproveQuanty = (action: 'apply' | 'send') => {
    if (!quantyProposedAction) return;

    if (quantyProposedAction.to) setTo(quantyProposedAction.to);
    if (quantyProposedAction.subject) setSubject(quantyProposedAction.subject);
    if (quantyProposedAction.body) setBody(quantyProposedAction.body);

    const readyToSend =
      action === 'send' && (quantyProposedAction.to || to) && quantyProposedAction.body;

    setIsQuantyModalOpen(false);
    setQuantyProposedAction(null);
    setQuantyPrompt('');

    if (readyToSend) {
      setTimeout(() => {
        void handleSend();
      }, 100);
    } else {
      showToast({ text: 'Quanty draft applied to message', type: 'success' });
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0d14] max-w-4xl mx-auto w-full">
      {/* Top Header / Navigation Tab */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-zinc-800/90 bg-[#0c1017]/95 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onDiscard}
            className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Discard message"
          >
            <svg
              className="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
          <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">New message</h2>
        </div>

        {/* Header Actions: Quanty AI Robot + Attach + Send */}
        <div className="flex items-center gap-2.5">
          {/* Quanty AI Assistant Trigger (No blue box, standalone robot) */}
          <button
            type="button"
            onClick={() => setIsQuantyModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-amber-300 hover:bg-amber-500/10 transition-all cursor-pointer"
            title="Ask Quanty AI to write, address or send this email"
          >
            <Quanty size={24} expression="happy" bob={false} />
            <span className="hidden sm:inline text-xs font-bold text-amber-300">Quanty AI</span>
          </button>

          {/* Templates Trigger */}
          <button
            type="button"
            onClick={() => setShowTemplates(true)}
            className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 font-medium transition-all"
            title="Templates"
          >
            <span>📑</span>
            <span>Templates</span>
          </button>

          {/* Attach Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-xl text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 transition-colors"
            title="Attach file"
          >
            <svg
              className="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>

          {/* Primary Send Button (Vibrant Orange/Amber) */}
          <button
            type="button"
            onClick={handleSend}
            disabled={busy || !to.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF7A00] to-[#ea580c] hover:from-[#e06c00] hover:to-[#d04e06] text-white text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-40"
          >
            {isSending ? (
              <span>Sending…</span>
            ) : (
              <>
                <span>Send</span>
                <svg
                  className="size-3.5"
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
        </div>
      </header>

      {/* Main Single-Sheet Luxury Letterhead Area */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-4">
        {/* Single Complete Luxury Letter Page with Header, Stamp & Canvas */}
        <div className="relative rounded-3xl border border-zinc-800/90 bg-gradient-to-b from-[#141722] via-[#0f121a] to-[#0b0e14] shadow-2xl p-4 sm:p-7 space-y-4">
          {/* Top of Letter: Brand + Official Circular Stamp */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span
                  className="text-base sm:text-lg font-serif font-black tracking-wider uppercase text-amber-300"
                  style={{ fontFamily: '"Cinzel", "Georgia", serif' }}
                >
                  QuantMail
                </span>
                <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase">
                  · Official Transmission Letterhead ·
                </span>
              </div>
            </div>

            {/* Official Stamp & Cursive Signature Seal */}
            <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
              <div className="text-right hidden sm:block">
                <div
                  className="text-xs sm:text-sm text-amber-200/90 font-serif italic tracking-wide"
                  style={{ fontFamily: '"Caveat", "Brush Script MT", cursive' }}
                >
                  Verified Electronic Transmission
                </div>
                <div className="text-[8.5px] font-mono text-zinc-500 uppercase tracking-wider">
                  Quantrinity Network
                </div>
              </div>

              <div className="relative size-14 sm:size-16 rounded-full border-2 border-amber-500/60 flex flex-col items-center justify-center text-amber-400 p-1 select-none shadow-[0_0_15px_rgba(245,158,11,0.18)] bg-amber-500/5 transform -rotate-6 shrink-0">
                <div className="absolute inset-1 rounded-full border border-dashed border-amber-500/40" />
                <span
                  className="text-[6.5px] font-serif font-black tracking-wider text-amber-300 uppercase"
                  style={{ fontFamily: '"Cinzel", serif' }}
                >
                  quantmail.in
                </span>
                <div className="my-0.5 h-px w-6 bg-amber-500/40" />
                <span className="text-[5px] font-mono tracking-widest uppercase text-amber-400/80">
                  by
                </span>
                <span className="text-[6px] font-mono font-black tracking-widest uppercase text-amber-300">
                  QUANTRINITY
                </span>
              </div>
            </div>
          </div>

          {/* Integrated Letterhead Fields: To, Subject, and optional Cc/Bcc */}
          <div className="space-y-2 pb-3 border-b border-zinc-800/60 text-xs">
            {/* 1. To Field */}
            <div className="flex items-center gap-3">
              <span className="w-16 font-mono font-bold text-amber-400/90">To:</span>
              <div className="flex-1">
                <ContactAutocomplete
                  value={to}
                  onChange={setTo}
                  contacts={contacts}
                  placeholder="name@example.com (or external email)"
                  aria-label="To"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowCcBcc(!showCcBcc)}
                className="text-[11px] text-zinc-400 hover:text-amber-300 font-mono"
              >
                {showCcBcc ? 'Hide Cc' : 'Cc/Bcc'}
              </button>
            </div>

            {/* 2. Subject Field */}
            <div className="flex items-center gap-3 pt-1 border-t border-zinc-800/40">
              <span className="w-16 font-mono font-bold text-amber-400/90">Subject:</span>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter email subject"
                className="flex-1 bg-transparent text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none font-medium"
              />
            </div>

            {/* 3. Optional Cc/Bcc Fields */}
            {showCcBcc && (
              <>
                <div className="flex items-center gap-3 pt-1 border-t border-zinc-800/40">
                  <span className="w-16 font-mono font-bold text-amber-400/90">Cc:</span>
                  <div className="flex-1">
                    <ContactAutocomplete
                      value={cc}
                      onChange={setCc}
                      contacts={contacts}
                      placeholder="Cc recipients"
                      aria-label="Cc"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-1 border-t border-zinc-800/40">
                  <span className="w-16 font-mono font-bold text-amber-400/90">Bcc:</span>
                  <div className="flex-1">
                    <ContactAutocomplete
                      value={bcc}
                      onChange={setBcc}
                      contacts={contacts}
                      placeholder="Bcc recipients"
                      aria-label="Bcc"
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Main Letter Content Writing Canvas */}
          <textarea
            className="w-full bg-transparent text-sm sm:text-base text-zinc-100 placeholder-zinc-600 focus:outline-none leading-relaxed resize-none font-sans min-h-[260px]"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your email here with clarity and elegance..."
            rows={10}
          />

          {/* Bottom Signoff Block */}
          <div className="pt-3 border-t border-zinc-800/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
            <div className="space-y-0.5">
              <p className="text-zinc-500 italic font-serif">Yours faithfully,</p>
              <p className="font-bold text-zinc-200">Verified QuantMail Sender</p>
            </div>
            <div className="text-[10px] font-mono text-zinc-500">256-bit TLS · E2EE Signed</div>
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
            setAttachments((prev) => [
              ...prev,
              ...selected.map((f) => ({
                id: Math.random().toString(),
                name: f.name,
                size: f.size,
                type: f.type,
              })),
            ]);
            event.target.value = '';
          }}
        />

        {/* Attachments List */}
        {attachments.length > 0 && (
          <div className="p-3 rounded-2xl border border-zinc-800 bg-[#121622] space-y-2">
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
                    className="text-zinc-500 hover:text-rose-400 ml-1"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Footer Action Controls */}
      <footer className="sticky bottom-0 z-20 flex items-center justify-between gap-3 px-4 sm:px-6 py-2.5 border-t border-zinc-800/90 bg-[#0c1017]/95 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={busy}
            className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-zinc-300 transition-all"
          >
            {isSaving ? 'Saving…' : 'Save draft'}
          </button>

          <button
            type="button"
            onClick={onDiscard}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-rose-400 transition-all"
          >
            Discard
          </button>
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={busy || !to.trim()}
          className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#FF7A00] to-[#ea580c] hover:from-[#e06c00] hover:to-[#d04e06] text-white text-xs font-bold transition-all shadow-lg active:scale-95 disabled:opacity-40"
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
      </footer>

      {/* Quanty Autonomous AI Assistant Modal with Approve / Deny Permission Flow */}
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
              className="fixed inset-x-4 top-[15%] sm:max-w-lg sm:mx-auto z-50 rounded-3xl border border-amber-500/30 bg-[#121622] p-5 sm:p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Quanty size={32} expression={aiLoading ? 'thinking' : 'happy'} bob={false} />
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-amber-300">
                      Quanty Autonomous Email Assistant
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      I can auto-draft, address recipient, or send email with your permission.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsQuantyModalOpen(false)}
                  className="p-1 rounded-full text-zinc-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              {!quantyProposedAction ? (
                <div className="space-y-3">
                  <textarea
                    value={quantyPrompt}
                    onChange={(e) => setQuantyPrompt(e.target.value)}
                    placeholder="Tell Quanty what to write (e.g. 'Invite team@quantrinity.in for project review tomorrow at 4 PM')"
                    rows={4}
                    className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 p-3.5 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF7A00] resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsQuantyModalOpen(false)}
                      className="px-3.5 py-2 rounded-xl bg-zinc-800 text-xs text-zinc-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleQuantyProcess}
                      disabled={!quantyPrompt.trim() || aiLoading}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF7A00] to-[#ea580c] text-white text-xs font-bold disabled:opacity-40"
                    >
                      {aiLoading ? 'Thinking & Drafting…' : 'Generate & Review ✨'}
                    </button>
                  </div>
                </div>
              ) : (
                /* Approve / Deny Permission Review Step */
                <div className="space-y-3 pt-1">
                  <div className="p-3.5 rounded-2xl bg-zinc-950 border border-amber-500/30 space-y-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-amber-400">To:</span>
                      <span className="text-zinc-200">
                        {quantyProposedAction.to || '(keep current)'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-amber-400">Subject:</span>
                      <span className="text-zinc-200">
                        {quantyProposedAction.subject || '(no subject)'}
                      </span>
                    </div>
                    <div className="pt-1.5 border-t border-zinc-800">
                      <span className="font-mono font-bold text-amber-400 block mb-1">
                        Body Preview:
                      </span>
                      <p className="text-zinc-300 max-h-36 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                        {quantyProposedAction.body}
                      </p>
                    </div>
                  </div>

                  <p className="text-[11px] text-amber-300/80 font-medium">
                    Do you approve applying this draft or sending it now?
                  </p>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setQuantyProposedAction(null)}
                      className="px-3.5 py-2 rounded-xl bg-zinc-800 text-xs text-rose-400 hover:bg-zinc-700 font-semibold"
                    >
                      Deny & Re-edit
                    </button>

                    <button
                      type="button"
                      onClick={() => handleApproveQuanty('apply')}
                      className="px-3.5 py-2 rounded-xl bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40 text-xs font-bold"
                    >
                      Approve & Insert
                    </button>

                    <button
                      type="button"
                      onClick={() => handleApproveQuanty('send')}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF7A00] to-[#ea580c] text-white text-xs font-bold shadow-md"
                    >
                      Approve & Send Now 🚀
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Template Modal */}
      <EmailTemplates
        isOpen={showTemplates}
        onClose={() => setShowTemplates(false)}
        onSelectTemplate={(template: EmailTemplate) => {
          if (template.subject) setSubject(template.subject);
          if (template.body) setBody(template.body);
        }}
      />
    </div>
  );
}

export default EmailComposer;

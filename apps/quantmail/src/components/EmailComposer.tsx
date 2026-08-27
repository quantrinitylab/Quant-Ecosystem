'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Quanty } from './Quanty';
import { QuantyCopilotDrawer, type QuantyEmailAction } from './QuantyCopilotDrawer';
import { QuantDrivePickerModal } from './QuantDrivePickerModal';
import { InsertLinkModal } from './InsertLinkModal';
import { ScheduleSendModal } from './ScheduleSendModal';
import { showToast } from './InboxToast';
import { useAuth } from '../providers/auth-provider';
import { RecipientChipInput, type RecipientOption } from './RecipientChipInput';
import { useContacts } from '../hooks/useContacts';

export interface Attachment {
  id: string;
  name: string;
  filename: string;
  size: number;
  type: string;
  mimeType: string;
  url: string;
}

export interface ComposerMessageData {
  to: string | Array<{ email: string }>;
  cc?: string;
  bcc?: string;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  body?: string;
  priority?: 'low' | 'normal' | 'high';
  scheduledAt?: string;
  attachments?: Attachment[];
}

export interface EmailComposerProps {
  initialTo?: string | Array<{ email: string }>;
  initialSubject?: string;
  initialBody?: string;
  initialReplyToId?: string;
  inReplyTo?: string;
  onSend?: (data: any) => Promise<void>;
  onSaveDraft?: (data: any) => Promise<void>;
  onDiscard?: () => void;
  onAIAssist?: (
    action: 'compose' | 'improve' | 'shorten' | 'formalize',
    text: string,
  ) => Promise<string>;
  fullScreen?: boolean;
}

const FONT_FAMILIES = [
  { id: 'sans', name: 'Sans Serif', css: 'font-sans' },
  { id: 'serif', name: 'Serif', css: 'font-serif' },
  { id: 'mono', name: 'Monospace / Fixed Width', css: 'font-mono' },
  { id: 'garamond', name: 'Garamond', css: 'font-[Garamond,serif]' },
  { id: 'georgia', name: 'Georgia', css: 'font-[Georgia,serif]' },
  { id: 'verdana', name: 'Verdana', css: 'font-[Verdana,sans-serif]' },
  { id: 'comic', name: 'Comic Sans MS', css: 'font-["Comic_Sans_MS",cursive]' },
];

const FONT_SIZES = [
  { id: 'sm', name: 'Small', css: 'text-xs' },
  { id: 'base', name: 'Normal', css: 'text-sm' },
  { id: 'lg', name: 'Large', css: 'text-base' },
  { id: 'xl', name: 'Huge', css: 'text-lg' },
];

const TEXT_COLORS = [
  { id: 'default', color: '#f4f4f5', label: 'Default' },
  { id: 'amber', color: '#f59e0b', label: 'Amber' },
  { id: 'orange', color: '#f97316', label: 'Orange' },
  { id: 'emerald', color: '#10b981', label: 'Emerald' },
  { id: 'sky', color: '#0ea5e9', label: 'Sky' },
  { id: 'rose', color: '#f43f5e', label: 'Rose' },
  { id: 'zinc', color: '#a1a1aa', label: 'Muted' },
];

const SMART_PREDICTIONS: Array<{ regex: RegExp; suggestion: string }> = [
  { regex: /\bhow\s*$/i, suggestion: ' are you doing?' },
  { regex: /\bhow are\s*$/i, suggestion: ' you doing today?' },
  { regex: /\bhope this\s*$/i, suggestion: ' email finds you well.' },
  { regex: /\bhope all\s*$/i, suggestion: ' is well with you.' },
  { regex: /\bthank you\s*$/i, suggestion: ' for your time and assistance.' },
  { regex: /\bthanks for\s*$/i, suggestion: ' reaching out.' },
  { regex: /\bplease find\s*$/i, suggestion: ' attached the required details.' },
  { regex: /\bplease let\s*$/i, suggestion: ' me know if you have any questions.' },
  { regex: /\blet me\s*$/i, suggestion: ' know if you have any questions.' },
  { regex: /\blooking forward\s*$/i, suggestion: ' to hearing from you soon.' },
  { regex: /\bcould you\s*$/i, suggestion: ' please provide an update on this?' },
  { regex: /\bsorry for\s*$/i, suggestion: ' the delay in getting back to you.' },
  { regex: /\bi would like\s*$/i, suggestion: ' to follow up regarding our discussion.' },
  { regex: /\bi am writing\s*$/i, suggestion: ' to inquire about the current status.' },
  { regex: /\bas discussed\s*$/i, suggestion: ', please find the updated document below.' },
  { regex: /\bfeel free to\s*$/i, suggestion: ' reach out if you have any questions.' },
  { regex: /\bhave a great\s*$/i, suggestion: ' day ahead.' },
  { regex: /\bhave a wonderful\s*$/i, suggestion: ' weekend.' },
];

function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function EmailComposer({
  initialTo = '',
  initialSubject = '',
  initialBody = '',
  initialReplyToId,
  inReplyTo,
  onSend,
  onSaveDraft,
  onDiscard,
}: EmailComposerProps) {
  const router = useRouter();

  // Auth User context for sender signature / print
  let authUser: any = null;
  try {
    const auth = useAuth();
    authUser = auth?.user || null;
  } catch {
    authUser = null;
  }

  // Back Navigation Helper (Back exactly 1 page in history)
  const handleBack = () => {
    if (onDiscard) {
      onDiscard();
    } else if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  const { data: contacts } = useContacts();

  // Core Fields
  const [toRecipients, setToRecipients] = useState<RecipientOption[]>(() => {
    if (Array.isArray(initialTo)) {
      return initialTo.map((t) => ({ email: t.email, name: (t as any).name }));
    }
    if (typeof initialTo === 'string' && initialTo.trim()) {
      return initialTo
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((email) => ({ email }));
    }
    return [];
  });
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [ccRecipients, setCcRecipients] = useState<RecipientOption[]>([]);
  const [bccRecipients, setBccRecipients] = useState<RecipientOption[]>([]);
  const [subject, setSubject] = useState(initialSubject);

  const to = toRecipients.map((r) => r.email).join(', ');
  const cc = ccRecipients.map((r) => r.email).join(', ');
  const bcc = bccRecipients.map((r) => r.email).join(', ');

  // Structured Corporate Sections
  const [greeting, setGreeting] = useState('Dear Sir/Madam,');
  const [opening, setOpening] = useState('');
  const [body, setBody] = useState(initialBody);
  const [closing, setClosing] = useState('Thank you for your time.');
  const [signoff, setSignoff] = useState('Best regards,');
  const [senderName, setSenderName] = useState(authUser?.displayName || 'Kundan Kumar');
  const [customDetails, setCustomDetails] = useState<string[]>([]);

  // Smart Compose Prediction Logic
  const activePrediction = useMemo(() => {
    if (!body || body.length < 2) return '';
    const trimmed = body.trimEnd();
    for (const item of SMART_PREDICTIONS) {
      if (item.regex.test(trimmed)) {
        return item.suggestion;
      }
    }
    return '';
  }, [body]);

  const acceptPrediction = useCallback(() => {
    if (!activePrediction) return;
    setBody((prev) => prev.trimEnd() + activePrediction + ' ');
  }, [activePrediction]);

  const handleBodyKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab' && activePrediction) {
      e.preventDefault();
      acceptPrediction();
    }
  };

  // Attachments
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Formatting state
  const [showFormattingBar, setShowFormattingBar] = useState(false);
  const [selectedFont, setSelectedFont] = useState(FONT_FAMILIES[0]);
  const [selectedSize, setSelectedSize] = useState(FONT_SIZES[1]);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [textColor, setTextColor] = useState(TEXT_COLORS[0]);
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('left');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [showSizePicker, setShowSizePicker] = useState(false);

  // Modals & Drawers
  const [isQuantyDrawerOpen, setIsQuantyDrawerOpen] = useState(false);
  const [isDrivePickerOpen, setIsDrivePickerOpen] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [showThreeDotsMenu, setShowThreeDotsMenu] = useState(false);
  const [showSendOptionsDropdown, setShowSendOptionsDropdown] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // Template / Structured Mode Toggle (default: false for fluid modern email composer)
  const [isTemplateMode, setIsTemplateMode] = useState(false);

  // Loading & Execution
  const [isSending, setIsSending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus body if initialTo or subject already provided
  useEffect(() => {
    if (initialTo && initialSubject) {
      setTimeout(() => bodyTextareaRef.current?.focus(), 150);
    }
  }, [initialTo, initialSubject]);

  // Dynamic Add Signature detail
  const handleAddDetail = () => {
    setCustomDetails((prev) => [...prev, '']);
  };

  const handleUpdateDetail = (index: number, val: string) => {
    setCustomDetails((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  };

  const handleRemoveDetail = (index: number) => {
    setCustomDetails((prev) => prev.filter((_, i) => i !== index));
  };

  // Compile Final Email Message
  const buildFinalMessage = (): string => {
    if (!isTemplateMode) {
      return body.trim();
    }
    const parts: string[] = [];

    if (greeting.trim()) {
      parts.push(greeting.trim());
    }

    if (opening.trim()) {
      parts.push(opening.trim());
    }

    if (body.trim()) {
      parts.push(body.trim());
    }

    if (closing.trim()) {
      parts.push(closing.trim());
    }

    // Signature Block
    const sigParts: string[] = [];
    if (signoff.trim()) sigParts.push(signoff.trim());
    if (senderName.trim()) sigParts.push(senderName.trim());
    customDetails.forEach((line) => {
      if (line.trim()) sigParts.push(line.trim());
    });

    if (sigParts.length > 0) {
      parts.push(sigParts.join('\n'));
    }

    return parts.join('\n\n');
  };

  // Send Handler
  const handleSend = async (scheduledAt?: string) => {
    if (!to.trim()) {
      showToast({ text: 'Please specify at least one recipient (To:)', type: 'error' });
      return;
    }
    if (!subject.trim()) {
      showToast({ text: 'Please enter an email subject', type: 'error' });
      return;
    }
    if (!body.trim()) {
      showToast({ text: 'Please enter your message body', type: 'error' });
      return;
    }

    const compiledBody = buildFinalMessage();
    setIsSending(true);

    const toList = to
      .split(/[,;\s]+/)
      .filter(Boolean)
      .map((email) => ({ email }));
    const ccList = cc
      ? cc
          .split(/[,;\s]+/)
          .filter(Boolean)
          .map((email) => ({ email }))
      : undefined;
    const bccList = bcc
      ? bcc
          .split(/[,;\s]+/)
          .filter(Boolean)
          .map((email) => ({ email }))
      : undefined;

    try {
      if (onSend) {
        await onSend({
          to: toList,
          cc: ccList,
          bcc: bccList,
          subject: subject.trim(),
          body: compiledBody,
          bodyText: compiledBody,
          bodyHtml: compiledBody,
          attachments,
          scheduledAt,
          inReplyTo: inReplyTo || initialReplyToId,
        });
      } else {
        const res = await fetch('/api/emails/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: to.trim(),
            cc: cc.trim() || undefined,
            bcc: bcc.trim() || undefined,
            subject: subject.trim(),
            body: compiledBody,
            replyToId: inReplyTo || initialReplyToId,
            attachments,
            scheduledAt,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error || 'Failed to send email');
        }
      }

      showToast({
        text: scheduledAt ? 'Email scheduled successfully 🕒' : 'Email sent successfully 🚀',
        type: 'success',
      });

      handleBack();
    } catch (err: any) {
      showToast({ text: err.message || 'Failed to send message', type: 'error' });
    } finally {
      setIsSending(false);
      setShowSendOptionsDropdown(false);
    }
  };

  // Save Draft Handler
  const handleSaveDraft = async () => {
    const compiledBody = buildFinalMessage();
    const toList = to
      .split(/[,;\s]+/)
      .filter(Boolean)
      .map((email) => ({ email }));
    const ccList = cc
      ? cc
          .split(/[,;\s]+/)
          .filter(Boolean)
          .map((email) => ({ email }))
      : undefined;
    const bccList = bcc
      ? bcc
          .split(/[,;\s]+/)
          .filter(Boolean)
          .map((email) => ({ email }))
      : undefined;

    setIsSaving(true);
    try {
      if (onSaveDraft) {
        await onSaveDraft({
          to: toList,
          cc: ccList,
          bcc: bccList,
          subject: subject.trim(),
          body: compiledBody,
          bodyText: compiledBody,
          bodyHtml: compiledBody,
          attachments,
          inReplyTo: inReplyTo || initialReplyToId,
        });
      } else {
        await fetch('/api/emails/drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: to.trim(),
            cc: cc.trim() || undefined,
            bcc: bcc.trim() || undefined,
            subject: subject.trim(),
            body: compiledBody,
            attachments,
          }),
        });
      }
      showToast({ text: 'Draft saved', type: 'success' });
    } catch {
      showToast({ text: 'Failed to save draft', type: 'error' });
    } finally {
      setIsSaving(false);
      setShowSendOptionsDropdown(false);
    }
  };

  // Autonomous Quanty Action Applier
  const handleApplyQuantyAction = (action: QuantyEmailAction) => {
    if (action.to) {
      const parts = action.to
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      setToRecipients(parts.map((email) => ({ email })));
    }
    if (action.subject) setSubject(action.subject);
    if (action.greeting) setGreeting(action.greeting);
    if (action.opening) setOpening(action.opening);
    if (action.body) setBody(action.body);
    if (action.closing) setClosing(action.closing);
    if (action.signoff) setSignoff(action.signoff);
    if (action.senderName) setSenderName(action.senderName);
  };

  // Insert Link to Body
  const handleInsertLink = (displayText: string, url: string) => {
    setBody((prev) => `${prev} [${displayText}](${url}) `);
  };

  // Attach from QuantDrive
  const handleAttachFromDrive = (driveAttachments: Attachment[]) => {
    setAttachments((prev) => [...prev, ...driveAttachments]);
    showToast({
      text: `Attached ${driveAttachments.length} file(s) from QuantDrive`,
      type: 'success',
    });
  };

  const busy = isSending || isSaving;

  return (
    <div className="flex flex-col h-[100dvh] max-h-[100dvh] w-full max-w-full bg-[#0d1017] text-white select-text overflow-hidden box-border print:h-auto print:max-h-none print:bg-white print:text-black print:overflow-visible">
      {/* Top Header Bar (Hidden during Print) */}
      <div className="print:hidden flex items-center justify-between px-3 sm:px-5 py-3 border-b border-[#282C35]/80 bg-[#121622] shrink-0 w-full max-w-full box-border">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="p-1.5 rounded-xl text-[#A1A4AC] hover:text-white hover:bg-[#282C35] transition-all"
            title="Back (1 page)"
          >
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white tracking-wide">Compose</span>
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-[#282C35] border border-[#3A404D] text-[10px] text-[#A1A4AC] font-mono">
              C
            </kbd>
          </div>
        </div>

        {/* Header Right Group: Mobile Quanty Robot, Three-Dots Menu, Close */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Mobile Quanty Robot (Shown only on mobile screens) */}
          <button
            type="button"
            onClick={() => setIsQuantyDrawerOpen(true)}
            className="flex sm:hidden p-1.5 rounded-xl hover:bg-[#282C35] text-[#FF8C42] hover:text-[#FFB875] transition-all items-center gap-1.5"
            title="Open Quanty AI Copilot"
          >
            <Quanty size={24} expression="happy" bob={false} />
          </button>

          {/* Three-Dots Menu Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowThreeDotsMenu((prev) => !prev)}
              className="p-1.5 rounded-xl text-[#A1A4AC] hover:text-white hover:bg-[#282C35] transition-all"
              title="More options"
            >
              <svg
                className="size-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="1" />
                <circle cx="12" cy="5" r="1" />
                <circle cx="12" cy="19" r="1" />
              </svg>
            </button>

            {showThreeDotsMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowThreeDotsMenu(false)} />
                <div className="absolute right-0 top-full mt-1.5 w-52 rounded-2xl border border-[#282C35] bg-[#121622] py-2 shadow-2xl z-50 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setShowFormattingBar((prev) => !prev);
                      setShowThreeDotsMenu(false);
                    }}
                    className="flex items-center gap-2.5 w-full px-3.5 py-2 text-left text-[#F5F5F5] hover:bg-[#282C35]"
                  >
                    <span className="font-bold font-serif text-[#FF8C42]">Aa</span>
                    <span>
                      {showFormattingBar ? 'Hide formatting bar' : 'Plain / Rich formatting'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowScheduleModal(true);
                      setShowThreeDotsMenu(false);
                    }}
                    className="flex items-center gap-2.5 w-full px-3.5 py-2 text-left text-[#F5F5F5] hover:bg-[#282C35]"
                  >
                    <svg
                      className="size-3.5 text-[#FF8C42]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span>Schedule send</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowThreeDotsMenu(false);
                      setTimeout(() => {
                        window.print();
                      }, 50);
                    }}
                    className="flex items-center gap-2.5 w-full px-3.5 py-2 text-left text-[#F5F5F5] hover:bg-[#282C35]"
                  >
                    <svg
                      className="size-3.5 text-[#A1A4AC]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="6 9 6 2 18 2 18 9" />
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                      <rect width="12" height="8" x="6" y="14" />
                    </svg>
                    <span>Print draft</span>
                  </button>

                  <div className="my-1 border-t border-[#282C35]" />

                  <button
                    type="button"
                    onClick={() => {
                      handleBack();
                      setShowThreeDotsMenu(false);
                    }}
                    className="flex items-center gap-2.5 w-full px-3.5 py-2 text-left text-rose-400 hover:bg-rose-500/10"
                  >
                    <svg
                      className="size-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    <span>Discard message</span>
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={handleBack}
            className="p-1.5 rounded-xl text-[#A1A4AC] hover:text-white hover:bg-[#282C35] transition-all"
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Main Composer Scrollable Body (Hidden during Print) */}
      <div className="print:hidden flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 sm:px-6 py-3 space-y-3 w-full max-w-full box-border">
        {/* Recipient Rows (To, Cc, Bcc) */}
        <div className="border-b border-[#282C35]/80 pb-2 space-y-2 w-full max-w-full">
          {/* To: Row */}
          <RecipientChipInput
            id="composer-to"
            name="to"
            label="To"
            required
            recipients={toRecipients}
            onChange={setToRecipients}
            contacts={contacts}
            placeholder="Add recipients (name or email)…"
            rightAction={
              <div className="flex items-center gap-1 shrink-0 text-xs">
                {!showCc && (
                  <button
                    type="button"
                    onClick={() => setShowCc(true)}
                    className="text-[#6B6E76] hover:text-[#FF8C42] font-medium px-1.5 py-0.5 rounded hover:bg-[#282C35] transition-colors"
                  >
                    Cc
                  </button>
                )}
                {!showBcc && (
                  <button
                    type="button"
                    onClick={() => setShowBcc(true)}
                    className="text-[#6B6E76] hover:text-[#FF8C42] font-medium px-1.5 py-0.5 rounded hover:bg-[#282C35] transition-colors"
                  >
                    Bcc
                  </button>
                )}
              </div>
            }
          />

          {/* Cc: Row */}
          {showCc && (
            <div className="pt-1 border-t border-[#111318] w-full max-w-full">
              <RecipientChipInput
                id="composer-cc"
                name="cc"
                label="Cc"
                recipients={ccRecipients}
                onChange={setCcRecipients}
                contacts={contacts}
                placeholder="Add Cc recipients…"
                rightAction={
                  <button
                    type="button"
                    onClick={() => {
                      setShowCc(false);
                      setCcRecipients([]);
                    }}
                    className="text-[#6B6E76] hover:text-rose-400 text-xs px-1.5 py-0.5 rounded hover:bg-[#282C35] transition-colors"
                    title="Remove Cc"
                  >
                    ✕
                  </button>
                }
              />
            </div>
          )}

          {/* Bcc: Row */}
          {showBcc && (
            <div className="pt-1 border-t border-[#111318] w-full max-w-full">
              <RecipientChipInput
                id="composer-bcc"
                name="bcc"
                label="Bcc"
                recipients={bccRecipients}
                onChange={setBccRecipients}
                contacts={contacts}
                placeholder="Add Bcc recipients…"
                rightAction={
                  <button
                    type="button"
                    onClick={() => {
                      setShowBcc(false);
                      setBccRecipients([]);
                    }}
                    className="text-[#6B6E76] hover:text-rose-400 text-xs px-1.5 py-0.5 rounded hover:bg-[#282C35] transition-colors"
                    title="Remove Bcc"
                  >
                    ✕
                  </button>
                }
              />
            </div>
          )}
        </div>

        {/* Subject Row */}
        <div className="flex items-center gap-2 sm:gap-3 border-b border-[#282C35]/80 pb-2 w-full max-w-full">
          <label
            htmlFor="composer-subject"
            className="text-xs font-semibold text-[#A1A4AC] w-16 sm:w-16 shrink-0"
          >
            Subject <span className="text-rose-500">*</span>:
          </label>
          <input
            id="composer-subject"
            name="subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject of the email"
            className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm font-semibold text-white placeholder-[#6B6E76] focus:outline-none"
          />
        </div>

        {/* Mode Bar: Fluid Composer / Corporate Template Toggle */}
        <div className="flex items-center justify-between pt-1 pb-1">
          <button
            type="button"
            onClick={() => setIsTemplateMode((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              isTemplateMode
                ? 'bg-[#FF8C42]/20 text-[#FFB875] border border-[#FF8C42]/40'
                : 'bg-[#111318] text-[#A1A4AC] hover:text-[#F5F5F5] border border-[#282C35]'
            }`}
          >
            <span>
              {isTemplateMode ? '📋 Guided Corporate Mode: ON' : '✨ Structured Template Mode'}
            </span>
          </button>
          <span className="text-[10px] text-[#6B6E76] font-mono">
            {selectedFont.name} · {selectedSize.name}
          </span>
        </div>

        {/* Guided Structured Corporate Email Fields (When Template Mode is ON) */}
        {isTemplateMode && (
          <div className="space-y-3 p-3.5 rounded-2xl bg-[#111318]/40 border border-[#282C35]/80">
            {/* Greeting Row */}
            <div className="flex items-center gap-2 sm:gap-3 border-b border-[#282C35] pb-2 w-full max-w-full">
              <span className="text-xs font-medium text-[#A1A4AC] w-14 sm:w-16 shrink-0">
                Greeting:
              </span>
              <input
                type="text"
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
                placeholder="Dear Sir/Madam,"
                className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm text-[#F5F5F5] placeholder-[#6B6E76] focus:outline-none"
              />
            </div>

            {/* Opening / Purpose Row */}
            <div className="flex items-center gap-2 sm:gap-3 border-b border-[#282C35] pb-2 w-full max-w-full">
              <span className="text-xs font-medium text-[#A1A4AC] w-14 sm:w-16 shrink-0">
                Opening:
              </span>
              <input
                type="text"
                value={opening}
                onChange={(e) => setOpening(e.target.value)}
                placeholder="Reason for writing / brief opening statement..."
                className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm text-[#F5F5F5] placeholder-[#6B6E76] focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Main Fluid Body Canvas */}
        <div className="space-y-1.5 w-full max-w-full box-border flex-1 min-h-[220px]">
          <textarea
            id="composer-body"
            name="body"
            ref={bodyTextareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleBodyKeyDown}
            placeholder={
              isTemplateMode
                ? 'Write your core message, details, deliverables, action items, or bullet points here...'
                : 'Write your message here... Type freely, use Markdown, drag and drop files, or ask Quanty AI Copilot.'
            }
            rows={isTemplateMode ? 8 : 12}
            style={{
              color: textColor.color,
              textAlign: textAlign,
              fontWeight: isBold ? 'bold' : 'normal',
              fontStyle: isItalic ? 'italic' : 'normal',
              textDecoration:
                `${isUnderline ? 'underline ' : ''}${isStrikethrough ? 'line-through' : ''}`.trim() ||
                'none',
            }}
            className={`w-full max-w-full box-border bg-[#090A0C]/40 border border-[#282C35]/80 rounded-2xl p-4 text-xs sm:text-sm ${selectedFont.css} ${selectedSize.css} placeholder-[#6B6E76] focus:outline-none focus:border-[#FF8C42]/50 resize-y leading-relaxed shadow-inner min-h-[200px]`}
          />

          {/* Smart Compose Predictive Autocomplete Chip */}
          {activePrediction && (
            <div
              onClick={acceptPrediction}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#FF8C42]/10 border border-[#FF8C42]/30 text-[#FFB875] text-xs shadow-md cursor-pointer hover:bg-[#FF8C42]/20 transition-all select-none"
            >
              <span className="text-[10px] font-black uppercase text-[#FF8C42] bg-[#FF8C42]/20 border border-[#FF8C42]/40 px-1.5 py-0.5 rounded-md">
                Tab ⇥
              </span>
              <span className="text-[#A1A4AC] text-xs">
                Next word suggestion:{' '}
                <strong className="text-[#FFB875] font-semibold">{activePrediction}</strong>
              </span>
              <span className="ml-auto text-[10px] text-[#FF8C42] font-medium underline">
                Tap to apply
              </span>
            </div>
          )}
        </div>

        {/* Guided Structured Corporate Closing & Sign-off (When Template Mode is ON) */}
        {isTemplateMode && (
          <div className="space-y-3 p-3.5 rounded-2xl bg-[#111318]/40 border border-[#282C35]/80">
            {/* Closing Row */}
            <div className="flex items-center gap-2 sm:gap-3 border-b border-[#282C35] pb-2 w-full max-w-full">
              <span className="text-xs font-medium text-[#A1A4AC] w-14 sm:w-16 shrink-0">
                Closing:
              </span>
              <input
                type="text"
                value={closing}
                onChange={(e) => setClosing(e.target.value)}
                placeholder="Thank you for your time."
                className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm text-[#F5F5F5] placeholder-[#6B6E76] focus:outline-none"
              />
            </div>

            {/* Sign-off & Sender Details */}
            <div className="space-y-2 pt-1 w-full max-w-full box-border">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 w-full max-w-full">
                <span className="text-xs font-medium text-[#A1A4AC] w-14 sm:w-16 shrink-0">
                  Sign-off:
                </span>
                <div className="flex items-center gap-2 flex-1 min-w-0 w-full">
                  <input
                    type="text"
                    value={signoff}
                    onChange={(e) => setSignoff(e.target.value)}
                    placeholder="Best regards,"
                    className="w-28 sm:w-36 shrink-0 bg-transparent text-xs sm:text-sm text-[#F5F5F5] placeholder-[#6B6E76] focus:outline-none border-b border-[#282C35] pb-0.5"
                  />
                  <input
                    type="text"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="Your Name"
                    className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm text-[#F5F5F5] placeholder-[#6B6E76] focus:outline-none border-b border-[#282C35] pb-0.5"
                  />
                </div>
              </div>

              {/* Custom Detail Lines */}
              {customDetails.map((detail, idx) => (
                <div key={idx} className="flex items-center gap-2 pl-0 sm:pl-16 min-w-0 w-full">
                  <input
                    type="text"
                    value={detail}
                    onChange={(e) => handleUpdateDetail(idx, e.target.value)}
                    placeholder="Designation / Company / Contact..."
                    className="flex-1 min-w-0 bg-transparent text-xs text-[#A1A4AC] placeholder-[#6B6E76] focus:outline-none border-b border-[#282C35]/80 pb-0.5"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveDetail(idx)}
                    className="text-[#6B6E76] hover:text-rose-400 text-xs px-1 shrink-0"
                  >
                    ✕
                  </button>
                </div>
              ))}

              <div className="pl-0 sm:pl-16 pt-0.5">
                <button
                  type="button"
                  onClick={handleAddDetail}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#FF8C42] hover:text-[#FFB875] transition-all"
                >
                  <span>+ Add detail / line</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Hidden File Input for Device Attachments */}
        <input
          id="composer-file-input"
          name="attachments"
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = event.target.files;
            if (!files || files.length === 0) return;
            for (let i = 0; i < files.length; i++) {
              const file = files[i];
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = reader.result as string;
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
          <div className="p-3 rounded-2xl border border-[#282C35]/80 bg-[#121622] space-y-2 w-full max-w-full box-border">
            <span className="text-xs font-semibold text-[#A1A4AC]">
              Attached files ({attachments.length}):
            </span>
            <div className="flex flex-wrap gap-2">
              {attachments.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#111318] border border-[#282C35] text-xs text-white shadow-sm"
                >
                  <span className="truncate max-w-[140px]">{file.name}</span>
                  <span className="text-[10px] text-[#6B6E76]">({formatFileSize(file.size)})</span>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== file.id))}
                    className="text-[#6B6E76] hover:text-rose-400 font-bold"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Formatting Bar (Hidden during Print) */}
      <AnimatePresence>
        {showFormattingBar && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="print:hidden border-t border-[#282C35]/80 bg-[#141824] px-3 sm:px-5 py-2 flex flex-wrap items-center gap-1.5 text-xs select-none w-full max-w-full box-border shrink-0"
          >
            {/* Font Family Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowFontPicker((prev) => !prev)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#111318] border border-[#282C35] text-[#F5F5F5] hover:text-white"
              >
                <span>{selectedFont.name}</span>
                <span className="text-[9px]">▼</span>
              </button>
              {showFontPicker && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowFontPicker(false)} />
                  <div className="absolute left-0 bottom-full mb-1.5 w-44 rounded-xl border border-[#282C35] bg-[#121622] py-1 shadow-2xl z-40">
                    {FONT_FAMILIES.map((font) => (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() => {
                          setSelectedFont(font);
                          setShowFontPicker(false);
                        }}
                        className={`w-full px-3 py-1.5 text-left text-xs ${font.css} hover:bg-[#282C35] ${
                          selectedFont.id === font.id
                            ? 'text-[#FF8C42] font-bold'
                            : 'text-[#A1A4AC]'
                        }`}
                      >
                        {font.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Font Size Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSizePicker((prev) => !prev)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#111318] border border-[#282C35] text-[#F5F5F5] hover:text-white"
              >
                <span>{selectedSize.name}</span>
                <span className="text-[9px]">▼</span>
              </button>
              {showSizePicker && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowSizePicker(false)} />
                  <div className="absolute left-0 bottom-full mb-1.5 w-28 rounded-xl border border-[#282C35] bg-[#121622] py-1 shadow-2xl z-40">
                    {FONT_SIZES.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSelectedSize(s);
                          setShowSizePicker(false);
                        }}
                        className={`w-full px-3 py-1.5 text-left text-xs hover:bg-[#282C35] ${
                          selectedSize.id === s.id ? 'text-[#FF8C42] font-bold' : 'text-[#A1A4AC]'
                        }`}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="h-4 w-px bg-[#282C35] mx-1" />

            {/* Bold */}
            <button
              type="button"
              onClick={() => setIsBold((prev) => !prev)}
              className={`p-1.5 rounded-lg font-bold text-xs ${
                isBold
                  ? 'bg-[#FF8C42]/20 text-[#FFB875] border border-[#FF8C42]/40'
                  : 'text-[#A1A4AC] hover:text-white hover:bg-[#111318]'
              }`}
              title="Bold"
            >
              B
            </button>

            {/* Italic */}
            <button
              type="button"
              onClick={() => setIsItalic((prev) => !prev)}
              className={`p-1.5 rounded-lg italic text-xs font-serif ${
                isItalic
                  ? 'bg-[#FF8C42]/20 text-[#FFB875] border border-[#FF8C42]/40'
                  : 'text-[#A1A4AC] hover:text-white hover:bg-[#111318]'
              }`}
              title="Italic"
            >
              I
            </button>

            {/* Underline */}
            <button
              type="button"
              onClick={() => setIsUnderline((prev) => !prev)}
              className={`p-1.5 rounded-lg underline text-xs ${
                isUnderline
                  ? 'bg-[#FF8C42]/20 text-[#FFB875] border border-[#FF8C42]/40'
                  : 'text-[#A1A4AC] hover:text-white hover:bg-[#111318]'
              }`}
              title="Underline"
            >
              U
            </button>

            {/* Strikethrough */}
            <button
              type="button"
              onClick={() => setIsStrikethrough((prev) => !prev)}
              className={`p-1.5 rounded-lg line-through text-xs ${
                isStrikethrough
                  ? 'bg-[#FF8C42]/20 text-[#FFB875] border border-[#FF8C42]/40'
                  : 'text-[#A1A4AC] hover:text-white hover:bg-[#111318]'
              }`}
              title="Strikethrough"
            >
              S
            </button>

            {/* Color Picker Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowColorPicker((prev) => !prev)}
                className="flex items-center gap-1 p-1.5 rounded-lg text-[#A1A4AC] hover:text-white hover:bg-[#111318]"
                title="Text Color"
              >
                <span className="font-bold underline" style={{ color: textColor.color }}>
                  A
                </span>
              </button>
              {showColorPicker && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowColorPicker(false)} />
                  <div className="absolute left-0 bottom-full mb-1.5 p-2 rounded-xl border border-[#282C35] bg-[#121622] shadow-2xl z-40 flex gap-1.5">
                    {TEXT_COLORS.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setTextColor(c);
                          setShowColorPicker(false);
                        }}
                        style={{ backgroundColor: c.color }}
                        className="size-5 rounded-full ring-1 ring-[#3A404D] hover:scale-110 transition-all"
                        title={c.label}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="h-4 w-px bg-[#282C35] mx-1" />

            {/* Alignments */}
            <button
              type="button"
              onClick={() => setTextAlign('left')}
              className={`p-1.5 rounded-lg ${
                textAlign === 'left'
                  ? 'bg-[#FF8C42]/20 text-[#FFB875]'
                  : 'text-[#A1A4AC] hover:text-white'
              }`}
              title="Align Left"
            >
              <svg
                className="size-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="21" x2="3" y1="6" y2="6" />
                <line x1="15" x2="3" y1="12" y2="12" />
                <line x1="17" x2="3" y1="18" y2="18" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => setTextAlign('center')}
              className={`p-1.5 rounded-lg ${
                textAlign === 'center'
                  ? 'bg-[#FF8C42]/20 text-[#FFB875]'
                  : 'text-[#A1A4AC] hover:text-white'
              }`}
              title="Align Center"
            >
              <svg
                className="size-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="21" x2="3" y1="6" y2="6" />
                <line x1="19" x2="5" y1="12" y2="12" />
                <line x1="21" x2="3" y1="18" y2="18" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => setTextAlign('right')}
              className={`p-1.5 rounded-lg ${
                textAlign === 'right'
                  ? 'bg-[#FF8C42]/20 text-[#FFB875]'
                  : 'text-[#A1A4AC] hover:text-white'
              }`}
              title="Align Right"
            >
              <svg
                className="size-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="21" x2="3" y1="6" y2="6" />
                <line x1="21" x2="7" y1="18" y2="18" />
              </svg>
            </button>

            {/* Reset / Clear Formatting */}
            <button
              type="button"
              onClick={() => {
                setSelectedFont(FONT_FAMILIES[0]);
                setSelectedSize(FONT_SIZES[1]);
                setIsBold(false);
                setIsItalic(false);
                setIsUnderline(false);
                setIsStrikethrough(false);
                setTextColor(TEXT_COLORS[0]);
                setTextAlign('left');
              }}
              className="ml-auto p-1.5 rounded-lg text-[#6B6E76] hover:text-[#A1A4AC] text-xs"
              title="Clear formatting"
            >
              T<span className="text-[10px]">x</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Unified Action Toolbar (Hidden during Print) */}
      <div className="print:hidden flex items-center justify-between px-3 sm:px-5 py-2.5 border-t border-[#282C35]/80 bg-[#121622] shrink-0 w-full max-w-full box-border">
        {/* Left Toolbar Group: Send + Dropup, Formatting, Attach, Link, Drive, Discard, Desktop Quanty */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Primary Send Button with Dropup Menu for Save draft & Schedule send */}
          <div className="relative flex items-center rounded-xl bg-[#FF8C42] hover:bg-[#FF9B5A] text-[#111111] font-semibold shadow-sm transition-colors">
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={busy || !to.trim()}
              className="flex items-center gap-2 px-3.5 sm:px-4 py-2 text-[#111111] text-xs sm:text-sm font-semibold hover:brightness-105 active:scale-95 disabled:opacity-40 transition-all"
            >
              {isSending ? (
                <span>Sending…</span>
              ) : (
                <>
                  <span>Send</span>
                  <svg
                    className="size-3.5 sm:size-4 text-[#111111]"
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

            <button
              type="button"
              onClick={() => setShowSendOptionsDropdown((prev) => !prev)}
              disabled={busy}
              className="px-2 py-2 border-l border-[#111111]/20 text-[#111111] hover:bg-black/10 text-xs"
              title="Send options (Save draft / Schedule send)"
            >
              ▲
            </button>

            {/* Dropup Menu for Send Options */}
            {showSendOptionsDropdown && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowSendOptionsDropdown(false)}
                />
                <div className="absolute left-0 bottom-full mb-2 w-48 rounded-2xl border border-[#282C35] bg-[#121622] py-2 shadow-2xl z-50 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setShowScheduleModal(true);
                      setShowSendOptionsDropdown(false);
                    }}
                    className="flex items-center gap-2.5 w-full px-3.5 py-2 text-left text-[#F5F5F5] hover:bg-[#282C35] transition-all"
                  >
                    <svg
                      className="size-3.5 text-[#FF8C42]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span>Schedule send</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      void handleSaveDraft();
                    }}
                    className="flex items-center gap-2.5 w-full px-3.5 py-2 text-left text-[#F5F5F5] hover:bg-[#282C35] transition-all"
                  >
                    <svg
                      className="size-3.5 text-[#A1A4AC]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                      <polyline points="17 21 17 13 7 13 7 21" />
                      <polyline points="7 3 7 8 15 8" />
                    </svg>
                    <span>{isSaving ? 'Saving draft…' : 'Save draft'}</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Aa Formatting Options Toggle */}
          <button
            type="button"
            onClick={() => setShowFormattingBar((prev) => !prev)}
            className={`p-2 rounded-xl text-xs font-serif font-bold transition-all ${
              showFormattingBar
                ? 'bg-[#FF8C42]/20 text-[#FFB875] border border-[#FF8C42]/40'
                : 'text-[#A1A4AC] hover:text-white hover:bg-[#282C35]'
            }`}
            title="Formatting options (Aa)"
          >
            Aa
          </button>

          {/* Attach Local Device File (📎) */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-xl text-[#A1A4AC] hover:text-white hover:bg-[#282C35] transition-all"
            title="Attach files from device"
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

          {/* Insert Link (🔗) */}
          <button
            type="button"
            onClick={() => setIsLinkModalOpen(true)}
            className="p-2 rounded-xl text-[#A1A4AC] hover:text-white hover:bg-[#282C35] transition-all"
            title="Insert Link"
          >
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </button>

          {/* Insert from QuantDrive (📁) */}
          <button
            type="button"
            onClick={() => setIsDrivePickerOpen(true)}
            className="p-2 rounded-xl text-[#FF8C42] hover:text-[#FFB875] hover:bg-[#FF8C42]/10 transition-all"
            title="Insert files using QuantDrive"
          >
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
            </svg>
          </button>

          {/* Discard Draft Trash Button (Right next to QuantDrive) */}
          <button
            type="button"
            onClick={handleBack}
            className="p-2 rounded-xl text-[#A1A4AC] hover:text-rose-400 hover:bg-[#111318] transition-all"
            title="Discard draft"
          >
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>

          {/* Desktop Quanty Copilot Robot (Shown next to Discard on desktop - Icon only) */}
          <button
            type="button"
            onClick={() => setIsQuantyDrawerOpen(true)}
            className="hidden sm:flex p-2 rounded-xl text-[#FF8C42] hover:text-[#FFB875] hover:bg-[#FF8C42]/10 transition-all ml-0.5 items-center justify-center"
            title="Open Quanty AI Copilot"
          >
            <Quanty size={20} expression="happy" bob={false} />
          </button>
        </div>
      </div>

      {/* Clean Gmail-Grade Print Document (Visible ONLY during print) */}
      <div className="hidden print:block bg-white text-black p-4 sm:p-8 font-sans w-full min-h-screen">
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @media print {
                @page {
                  margin: 12mm 15mm 12mm 15mm;
                  size: auto;
                }
                body, html {
                  background-color: #ffffff !important;
                  color: #000000 !important;
                  height: auto !important;
                  overflow: visible !important;
                }
              }
            `,
          }}
        />

        {/* Top Header: QuantMail Logo & Brand */}
        <div className="flex items-center justify-between border-b-2 border-[#111318] pb-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-gradient-to-br from-[#FF8C42] to-[#ea580c] flex items-center justify-center text-white font-bold text-base shadow-sm">
              M
            </div>
            <span className="text-xl font-bold tracking-tight text-black">QuantMail</span>
          </div>
          <div className="text-xs text-[#6B6E76] font-medium">
            {senderName || authUser?.displayName || 'Kundan Kumar'} &lt;
            {authUser?.email || 'kundan@quantmail.in'}&gt;
          </div>
        </div>

        {/* Subject */}
        <div className="text-xl font-bold text-[#111318] mb-3">{subject || '(no subject)'}</div>

        {/* Meta Info Bar: Sender, Draft To, Date */}
        <div className="flex items-start justify-between text-xs text-[#3A404D] border-b border-[#A1A4AC] pb-3 mb-6">
          <div className="space-y-1">
            <div>
              <strong className="text-black">
                {senderName || authUser?.displayName || 'Kundan Kumar'}
              </strong>{' '}
              &lt;{authUser?.email || 'kundan@quantmail.in'}&gt;
            </div>
            <div>
              <span className="text-[#6B6E76]">Draft To: </span>
              <span className="font-medium text-black">{to || '(no recipients)'}</span>
            </div>
            {cc && (
              <div>
                <span className="text-[#6B6E76]">Cc: </span>
                <span className="text-black">{cc}</span>
              </div>
            )}
            {bcc && (
              <div>
                <span className="text-[#6B6E76]">Bcc: </span>
                <span className="text-black">{bcc}</span>
              </div>
            )}
          </div>
          <div className="text-right text-[#6B6E76] text-xs shrink-0">
            {new Date().toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}{' '}
            at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        {/* Clean Message Content Body */}
        <div className="text-sm text-black whitespace-pre-wrap leading-relaxed space-y-4 font-normal">
          {buildFinalMessage() || '(empty message)'}
        </div>

        {/* Attachments Footer if any */}
        {attachments.length > 0 && (
          <div className="mt-8 pt-4 border-t border-[#F5F5F5] text-xs text-[#6B6E76]">
            <strong className="text-black">Attachments ({attachments.length}): </strong>
            <span>{attachments.map((a) => a.name).join(', ')}</span>
          </div>
        )}
      </div>

      {/* Schedule Send Modal (Hidden during Print) */}
      <ScheduleSendModal
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        onSchedule={(scheduledAt) => {
          void handleSend(scheduledAt);
        }}
      />

      {/* QuantDrive File Picker Modal (Hidden during Print) */}
      <QuantDrivePickerModal
        isOpen={isDrivePickerOpen}
        onClose={() => setIsDrivePickerOpen(false)}
        onSelectFiles={handleAttachFromDrive}
      />

      {/* Insert Link Modal (Hidden during Print) */}
      <InsertLinkModal
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        onInsert={handleInsertLink}
      />

      {/* Quanty Copilot Drawer (Hidden during Print) */}
      <QuantyCopilotDrawer
        isOpen={isQuantyDrawerOpen}
        onClose={() => setIsQuantyDrawerOpen(false)}
        isComposeContext={true}
        onApplyAction={handleApplyQuantyAction}
      />
    </div>
  );
}

export default EmailComposer;

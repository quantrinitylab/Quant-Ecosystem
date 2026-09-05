'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { nextRovingIndex, rovingTabIndex } from '@quant/shared-ui';
import { Quanty } from './Quanty';
import { quantyReact, useQuantyMood } from '../lib/quanty/reactions';
import { type QuantyEmailAction } from './QuantyCopilotDrawer';
import { InsertLinkModal } from './InsertLinkModal';
import { showToast } from './InboxToast';
import { formatBytes } from '../lib/format-bytes';
import { composeMessageBodies, htmlToPlainText } from '../lib/email-body';
import { loadDefaultSignatureHtml } from '../lib/email-signature-preference';
import { useSafeEmailHtml } from '../lib/safe-html';
import { useAuth } from '../providers/auth-provider';
import { useDeferredMount } from '../hooks/useDeferredMount';
import { RecipientChipInput, parseEmailString, type RecipientOption } from './RecipientChipInput';
import {
  IconArrowRight,
  IconChevronDown,
  IconChevronUp,
  IconClipboard,
  IconClock,
  IconFileText,
  IconFolder,
  IconLink,
  IconPaperclip,
  IconPlus,
  IconSparkle,
  IconTrash,
  IconX,
} from './icons';
import { useContacts } from '../hooks/useContacts';

/**
 * The composer's three heavy overlays, split out of its chunk.
 *
 * Between them they are ~1,530 lines — the Quanty drawer (662), the schedule-send
 * date/time picker (554) and the Drive file browser (315) — and each sits behind
 * an explicit toolbar action. Writing a mail touches none of them, so none of them
 * belongs in the code you download to start typing.
 *
 * `InsertLinkModal` is deliberately left as a static import: at 129 lines it is
 * smaller than the round trip needed to fetch it would cost, and a link dialog
 * that stutters on open is a worse trade than the bytes.
 */
const QuantyCopilotDrawer = dynamic(() => import('./QuantyCopilotDrawer'), { ssr: false });
const ScheduleSendModal = dynamic(
  () => import('./ScheduleSendModal').then((m) => m.ScheduleSendModal),
  { ssr: false },
);
const QuantDrivePickerModal = dynamic(
  () => import('./QuantDrivePickerModal').then((m) => m.QuantDrivePickerModal),
  { ssr: false },
);

/**
 * What the composer will accept from the local file picker.
 *
 * There was no ceiling here at all: the `onChange` below reads every selected file with
 * `readAsDataURL`, so the bytes land in React state as base64 and are then posted whole.
 * Base64 costs 4/3, and SESv2 rejects a raw message over 40 MB — so a single 40 MB video
 * became a ~53 MB payload that the browser held in memory, the request carried, and the
 * transport refused. The failure arrived as a network error minutes later, after the
 * upload, with nothing on screen to say the file was the problem.
 *
 * 25 MB total is the number every mail client has trained users to expect, and it leaves
 * ~33 MB of base64 plus headers under the 40 MB hard limit. The per-file cap is lower than
 * the total on purpose: one 24 MB attachment passes and then a 2 MB signature image fails,
 * which is a confusing pair of messages — the per-file line makes the common case fail
 * early and by itself.
 */
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_ATTACHMENTS_TOTAL_BYTES = 25 * 1024 * 1024;

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
  initialTo?: string | Array<{ email: string; name?: string }>;
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

/**
 * One chip per address, whichever shape the caller passed.
 *
 * Neither shape guarantees one address per slot. `?to=` arrives as a string, and
 * the inbox's "write to this group" chip puts a whole group in it — five members
 * joined by commas. A saved draft arrives as an array, and its `to[0]` can hold
 * the same joined string if it was stored from one. Splitting both through
 * `parseEmailString` is what stops that becoming a single chip reading
 * `a@x.com,b@y.com`, which looks correct and sends to nobody.
 *
 * A name already separated from its address is kept as-is rather than re-parsed:
 * `{ name: 'Ada, Countess', email: 'ada@x.com' }` would otherwise split on the
 * comma in the name.
 */
function parseInitialRecipients(initial: EmailComposerProps['initialTo']): RecipientOption[] {
  if (typeof initial === 'string') return parseEmailString(initial);
  if (!Array.isArray(initial)) return [];

  return initial.flatMap((entry) => {
    const parsed = parseEmailString(entry.email ?? '');
    if (parsed.length === 1) return [{ ...parsed[0], name: entry.name ?? parsed[0].name }];
    return parsed;
  });
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

/**
 * The alignment trio as data, so it can be one control instead of three.
 *
 * It was three hand-inlined buttons whose only state channel was an accent
 * background and whose only name was a `title` — a one-of set with none of the
 * things a one-of set owes a reader. As a list it becomes a `radiogroup` with a
 * roving cursor, and the arithmetic has somewhere to index.
 *
 * `lines` is the glyph: three strokes at y = 6 / 12 / 18, each `[x1, x2]`. Right
 * align is the exact mirror of left — it used to be drawn with two strokes and no
 * middle one, which read as a different icon standing next to its own family.
 */
const TEXT_ALIGNMENTS: Array<{
  value: 'left' | 'center' | 'right';
  label: string;
  lines: Array<[number, number]>;
}> = [
  {
    value: 'left',
    label: 'Align left',
    lines: [
      [21, 3],
      [15, 3],
      [17, 3],
    ],
  },
  {
    value: 'center',
    label: 'Align centre',
    lines: [
      [21, 3],
      [19, 5],
      [21, 3],
    ],
  },
  {
    value: 'right',
    label: 'Align right',
    lines: [
      [21, 3],
      [21, 9],
      [21, 7],
    ],
  },
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
  const [toRecipients, setToRecipients] = useState<RecipientOption[]>(() =>
    parseInitialRecipients(initialTo),
  );
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

  /**
   * One tab stop for the alignment trio, so `radiogroup` is not a lie.
   *
   * The three buttons are a one-of set, and a `radiogroup` promises Left/Right
   * traversal. `rovingTabIndex` keeps exactly the selected one in the tab
   * sequence and these refs are what the arrows move focus to.
   */
  const alignButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeAlignIndex = TEXT_ALIGNMENTS.findIndex((a) => a.value === textAlign);
  const onAlignKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      const next = nextRovingIndex(event.key, index, TEXT_ALIGNMENTS.length);
      if (next === null) return;
      // Selection follows focus here, as it does for radios: there is nothing to
      // confirm and no cost to being wrong for a keystroke.
      event.preventDefault();
      const alignment = TEXT_ALIGNMENTS[next];
      if (!alignment) return;
      setTextAlign(alignment.value);
      alignButtonRefs.current[next]?.focus();
    },
    [],
  );

  // Modals & Drawers
  const [isQuantyDrawerOpen, setIsQuantyDrawerOpen] = useState(false);
  const [isDrivePickerOpen, setIsDrivePickerOpen] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [showThreeDotsMenu, setShowThreeDotsMenu] = useState(false);
  const [showSendOptionsDropdown, setShowSendOptionsDropdown] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  /*
    Trigger refs for the four disclosure popovers in the header and formatting
    bar. Each panel had exactly one way out — clicking the invisible backdrop —
    which is a pointer gesture, so a keyboard user who opened one could not
    close it. That was survivable while the panels were invisible to a reader;
    it stops being survivable now that the triggers report `aria-expanded` and
    point at the panel, because that is an invitation to go in.
  */
  const threeDotsTriggerRef = useRef<HTMLButtonElement>(null);
  const fontTriggerRef = useRef<HTMLButtonElement>(null);
  const sizeTriggerRef = useRef<HTMLButtonElement>(null);
  const colorTriggerRef = useRef<HTMLButtonElement>(null);

  /**
   * Escape closes whichever composer popover is open, and hands focus back.
   *
   * The focus hand-back is the part that is easy to skip and expensive to omit:
   * closing a panel unmounts whatever inside it had focus, and focus then falls
   * to `<body>`, which drops a keyboard user out of the composer entirely. An
   * outside *click* deliberately does not do this — the pointer has already
   * moved on, and yanking focus back would fight it.
   *
   * Capture phase, because the textarea and the inputs below sit in the same
   * subtree and a bubbling listener would race them.
   */
  useEffect(() => {
    const anyOpen = showThreeDotsMenu || showFontPicker || showSizePicker || showColorPicker;
    if (!anyOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      if (showThreeDotsMenu) {
        setShowThreeDotsMenu(false);
        threeDotsTriggerRef.current?.focus();
      }
      if (showFontPicker) {
        setShowFontPicker(false);
        fontTriggerRef.current?.focus();
      }
      if (showSizePicker) {
        setShowSizePicker(false);
        sizeTriggerRef.current?.focus();
      }
      if (showColorPicker) {
        setShowColorPicker(false);
        colorTriggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [showThreeDotsMenu, showFontPicker, showSizePicker, showColorPicker]);

  // Latched so the lazy chunks above are fetched on first open, not on mount —
  // and so each overlay keeps its state once it has been opened.
  const showQuantyDrawer = useDeferredMount(isQuantyDrawerOpen);
  const showDrivePicker = useDeferredMount(isDrivePickerOpen);
  const showSchedule = useDeferredMount(showScheduleModal);

  // Template / Structured Mode Toggle (default: false for fluid modern email composer)
  const [isTemplateMode, setIsTemplateMode] = useState(false);

  /**
   * The account signature saved in Settings → General.
   *
   * Loaded once per session through `lib/email-signature-preference`, not held in
   * `body` state: the sender edits their message, not their signature, and a
   * signature prefilled into the textarea would be re-saved into every draft and
   * then appended again on the next open.
   *
   * `includeSignature` is per message and starts on, which is what "Appended to
   * messages you send" has to mean to be true. Turning it off is one click, and
   * the block below the body shows exactly what will be attached — the point of
   * appending client-side rather than on the server is that it is visible before
   * Send, not discovered afterwards in the Sent folder.
   */
  const [signatureHtml, setSignatureHtml] = useState('');
  const [includeSignature, setIncludeSignature] = useState(true);
  const safeSignatureHtml = useSafeEmailHtml(signatureHtml);

  useEffect(() => {
    let active = true;
    void loadDefaultSignatureHtml().then((html) => {
      if (active) setSignatureHtml(html);
    });
    return () => {
      active = false;
    };
  }, []);

  /** '' when there is nothing to append, which `composeMessageBodies` treats as absent. */
  const activeSignatureHtml = includeSignature && !isTemplateMode ? signatureHtml : '';

  /**
   * Template mode suppresses the account signature, and the toggle below says so
   * rather than silently doing it.
   *
   * That mode already ends the message with a sign-off block the sender typed
   * themselves — `signoff`, `senderName` and each line of `customDetails`.
   * Appending the saved signature under it would put two signatures on one mail,
   * which is the failure a server-side append would have produced everywhere.
   */
  const signatureSuppressedByTemplate = isTemplateMode && Boolean(signatureHtml);

  // Loading & Execution
  const [isSending, setIsSending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);

  /*
   * The face on both copilot triggers — the mobile one in the header strip and the desktop
   * one in the footer. One hook for two mounts because they are one mascot at two
   * breakpoints; exactly one of them is ever visible.
   *
   * Three channels, which is the case `reactions.ts` documents by name: a composer has no
   * business going `confused` because a search three panes away came back empty, but it
   * absolutely should show the send it is running, the attachment it is reading and the
   * connection it just lost. `isSending` stays authoritative over the top — a local spinner
   * that disagrees with the mascot beside it is worse than either alone.
   *
   * Both mounts used to pass `expression="happy"`, and `happy` is the `arch` eye: a ∩
   * stroked rather than filled, which at 20–24px is indistinguishable from a shut lid.
   */
  const composerMood = useQuantyMood({ channels: ['mail', 'file', 'sys'] });
  const quantyFace = isSending ? 'working' : composerMood;

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

  /**
   * The two bodies a send or a draft-save actually carries.
   *
   * Both handlers used to set `body`, `bodyText` and `bodyHtml` to one plain-text
   * string. `EmailLetterCard` renders `bodyHtml` through `dangerouslySetInnerHTML`
   * as soon as it is non-empty, and that branch has no `whitespace-pre-wrap` — so
   * every paragraph break the sender typed was lost in the reader, including in
   * their own Sent folder. `composeMessageBodies` is the one place that conversion
   * happens now, and it appends the signature to both halves at the same time so
   * the HTML and plain-text versions of a message cannot say different things.
   */
  const buildOutgoingBodies = () => composeMessageBodies(buildFinalMessage(), activeSignatureHtml);

  // Send Handler
  //
  // Every exit announces itself to Quanty as well as to the toast rail, and the two are not
  // redundant: a toast is a sentence that appears and leaves, the mascot is a face that is
  // already on screen and holds. `mail:noRecipients` deliberately is not an error event — an
  // unfinished draft is `worried`, not `error`, because the user has not done anything wrong yet.
  const handleSend = async (scheduledAt?: string) => {
    if (!to.trim()) {
      quantyReact('mail:noRecipients');
      showToast({ text: 'Please specify at least one recipient (To:)', type: 'error' });
      return;
    }
    if (!subject.trim()) {
      quantyReact('mail:noRecipients');
      showToast({ text: 'Please enter an email subject', type: 'error' });
      return;
    }
    if (!body.trim()) {
      quantyReact('mail:noRecipients');
      showToast({ text: 'Please enter your message body', type: 'error' });
      return;
    }

    const { bodyText, bodyHtml } = buildOutgoingBodies();
    setIsSending(true);
    // A latch, cleared by whichever outcome arrives below — and capped at 20s inside the
    // reaction table, so a request that never resolves cannot leave the mascot working forever.
    quantyReact('mail:sending');

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
          // `body` is the legacy field `compose/page.tsx` falls back to when the
          // two real halves are absent. It carries the plain text, never the HTML.
          body: bodyText,
          bodyText,
          bodyHtml,
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
            body: bodyText,
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

      quantyReact(scheduledAt ? 'mail:scheduled' : 'mail:sent');
      showToast({
        text: scheduledAt ? 'Email scheduled' : 'Email sent',
        type: 'success',
      });

      handleBack();
    } catch (err: any) {
      quantyReact('mail:sendFailed');
      showToast({ text: err.message || 'Failed to send message', type: 'error' });
    } finally {
      setIsSending(false);
      setShowSendOptionsDropdown(false);
    }
  };

  // Save Draft Handler
  const handleSaveDraft = async () => {
    const { bodyText, bodyHtml } = buildOutgoingBodies();
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
          body: bodyText,
          bodyText,
          bodyHtml,
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
            body: bodyText,
            attachments,
          }),
        });
      }
      // `mail:draftSaved` is the sheet's quietest reaction on purpose — `calm`, at ambient
      // priority for 1.2s. A draft save happens on a timer and on every close; announcing it
      // as loudly as a send would make the mascot a flicker instead of a signal.
      quantyReact('mail:draftSaved');
      showToast({ text: 'Draft saved', type: 'success' });
    } catch {
      quantyReact('sys:error');
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
    // The file channel, not the mail channel: an attachment arriving is a Drive outcome, and a
    // composer mount that listened only to `mail` should still be allowed to miss it.
    quantyReact('file:uploaded');
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
            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-1.5 rounded-xl text-[#A1A4AC] hover:text-white hover:bg-[#282C35] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
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
            className="flex sm:hidden min-h-[44px] min-w-[44px] p-1.5 rounded-xl hover:bg-[#282C35] text-[#FF8C42] hover:text-[#FFB875] transition-all items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
            title="Open Quanty AI Copilot"
          >
            <Quanty size={24} expression={quantyFace} bob={false} />
          </button>

          {/* Three-Dots Menu Dropdown */}
          <div className="relative">
            <button
              type="button"
              ref={threeDotsTriggerRef}
              onClick={() => setShowThreeDotsMenu((prev) => !prev)}
              /*
                A disclosure, not a menu. `aria-haspopup` is not a generic "there
                is a popover here" flag — in ARIA `true` is exactly synonymous
                with `menu`, and none of these panels carries `role="menu"`, so a
                reader told "has popup menu" would arrive expecting `menuitem`
                children and arrow-key traversal and find plain buttons.
                `aria-expanded` plus a gated `aria-controls` is the pattern that
                matches what this actually is, and it is the one the inbox filter
                already uses.
              */
              aria-expanded={showThreeDotsMenu}
              aria-controls={showThreeDotsMenu ? 'composer-more-menu' : undefined}
              aria-label="More composer options"
              className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-1.5 rounded-xl text-[#A1A4AC] hover:text-white hover:bg-[#282C35] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
              title="More options"
            >
              <svg
                className="size-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="1" />
                <circle cx="12" cy="5" r="1" />
                <circle cx="12" cy="19" r="1" />
              </svg>
            </button>

            {showThreeDotsMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowThreeDotsMenu(false)} />
                {/*
                  A named group, not a bare box: without a role the panel is four
                  loose buttons that appeared next to the header, with nothing
                  saying they are one surface or where it ends.
                */}
                <div
                  id="composer-more-menu"
                  role="group"
                  aria-label="More composer options"
                  className="absolute right-0 top-full mt-1.5 w-52 rounded-2xl border border-[#282C35] bg-[#121622] py-2 shadow-2xl z-50 text-xs"
                >
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
            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl text-[#A1A4AC] hover:text-white hover:bg-[#282C35] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
            title="Close"
            aria-label="Close composer"
          >
            <IconX size={16} />
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
                    className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 text-[#A1A4AC] hover:text-[#FF8C42] font-medium px-1.5 py-0.5 rounded hover:bg-[#282C35] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                  >
                    Cc
                  </button>
                )}
                {!showBcc && (
                  <button
                    type="button"
                    onClick={() => setShowBcc(true)}
                    className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 text-[#A1A4AC] hover:text-[#FF8C42] font-medium px-1.5 py-0.5 rounded hover:bg-[#282C35] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
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
                    className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] text-[#6B6E76] hover:text-rose-400 rounded hover:bg-[#282C35] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                    title="Remove Cc"
                    aria-label="Remove Cc field"
                  >
                    <IconX size={13} />
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
                    className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] text-[#6B6E76] hover:text-rose-400 rounded hover:bg-[#282C35] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                    title="Remove Bcc"
                    aria-label="Remove Bcc field"
                  >
                    <IconX size={13} />
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
            className="flex-1 min-w-0 min-h-[44px] sm:min-h-0 bg-transparent text-xs sm:text-sm font-semibold text-white placeholder-[#A1A4AC] focus:outline-none"
          />
        </div>

        {/* Mode Bar: Fluid Composer / Corporate Template Toggle */}
        <div className="flex items-center justify-between pt-1 pb-1">
          <button
            type="button"
            onClick={() => setIsTemplateMode((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-1 min-h-[44px] sm:min-h-0 rounded-full text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
              isTemplateMode
                ? 'bg-[#FF8C42]/20 text-[#FFB875] border border-[#FF8C42]/40'
                : 'bg-[#111318] text-[#A1A4AC] hover:text-[#F5F5F5] border border-[#282C35]'
            }`}
            aria-pressed={isTemplateMode}
          >
            {isTemplateMode ? <IconClipboard size={13} /> : <IconSparkle size={13} />}
            <span>{isTemplateMode ? 'Guided Corporate Mode: ON' : 'Structured Template Mode'}</span>
          </button>
          <span className="text-[10px] text-[#A1A4AC] font-mono">
            {selectedFont.name} · {selectedSize.name}
          </span>
        </div>

        {/* Guided Structured Corporate Email Fields (When Template Mode is ON) */}
        {isTemplateMode && (
          <div className="space-y-3 p-3.5 rounded-2xl bg-[#111318]/40 border border-[#282C35]/80">
            {/*
              Real labels, matching the Subject row above. These five template
              fields were titled by styled `<span>`s with no `id` and no
              `htmlFor`, so by HTML-AAM the accessible name fell all the way
              through to the placeholder: the Greeting field was called "Dear
              Sir/Madam," — a sample value presented as the field's name, which
              also vanishes the moment anyone types.
            */}
            {/* Greeting Row */}
            <div className="flex items-center gap-2 sm:gap-3 border-b border-[#282C35] pb-2 w-full max-w-full">
              <label
                htmlFor="composer-greeting"
                className="text-xs font-medium text-[#A1A4AC] w-14 sm:w-16 shrink-0"
              >
                Greeting:
              </label>
              <input
                id="composer-greeting"
                type="text"
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
                placeholder="Dear Sir/Madam,"
                className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm text-[#F5F5F5] placeholder-[#A1A4AC] focus:outline-none"
              />
            </div>

            {/* Opening / Purpose Row */}
            <div className="flex items-center gap-2 sm:gap-3 border-b border-[#282C35] pb-2 w-full max-w-full">
              <label
                htmlFor="composer-opening"
                className="text-xs font-medium text-[#A1A4AC] w-14 sm:w-16 shrink-0"
              >
                Opening:
              </label>
              <input
                id="composer-opening"
                type="text"
                value={opening}
                onChange={(e) => setOpening(e.target.value)}
                placeholder="Reason for writing / brief opening statement..."
                className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm text-[#F5F5F5] placeholder-[#A1A4AC] focus:outline-none"
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
            className={`w-full max-w-full box-border bg-[#090A0C]/40 border border-[#282C35]/80 rounded-2xl p-4 text-xs sm:text-sm ${selectedFont.css} ${selectedSize.css} placeholder-[#A1A4AC] focus:outline-none focus:border-[#FF8C42]/50 resize-y leading-relaxed shadow-inner min-h-[200px]`}
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

        {/*
          The account signature, shown because it is about to be sent.

          Settings described this row as "Appended to messages you send" from the
          day it shipped, while `getDefaultEmailSignature()` had exactly one caller
          — the settings page itself. Appending it on the server would have made
          that sentence true and the behaviour invisible; this block makes it true
          and checkable in the second before Send, which is why the settings copy
          now says "above Send, where you can leave it off for one message".
        */}
        {(signatureHtml || signatureSuppressedByTemplate) && (
          <div className="w-full max-w-full box-border rounded-2xl border border-[#282C35]/80 bg-[#111318]/40">
            <div className="flex min-h-[44px] items-center justify-between gap-3 px-3.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#6B6E76]">
                Signature
              </span>
              {signatureSuppressedByTemplate ? (
                <span className="text-[11px] text-[#A1A4AC]">
                  Not appended — the sign-off below is this message&rsquo;s signature
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setIncludeSignature((prev) => !prev)}
                  /*
                    A checkbox, because that is what it is drawn as: a 16px square
                    that fills with the accent and shows a tick. `aria-pressed`
                    announced "toggle button, pressed" beside it, leaving the eye
                    and the ear describing two different controls — the same
                    defect the inbox filters already named and fixed.

                    The `aria-label` is the other half. The box is `aria-hidden`,
                    so the visible words were the whole accessible name, and they
                    are the *state* — the name flipped between "Included" and
                    "Not included" on every press and never once said what was
                    being included. Now the name is stable and the words are the
                    value display they read as.
                  */
                  role="checkbox"
                  aria-checked={includeSignature}
                  aria-label="Include signature"
                  // `min-h-touch`, not the 32px a text button wants to be: this is
                  // the only control in the card, and a 12px shortfall on the one
                  // thing a thumb has to hit is the whole 44px floor being missed.
                  className="inline-flex min-h-touch items-center gap-2 rounded-lg px-2 text-xs font-medium text-[#A1A4AC] transition-colors hover:text-[#F5F5F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                      includeSignature
                        ? 'border-[#FF8C42] bg-[#FF8C42] text-[#090A0C]'
                        : 'border-[#3A404D] bg-transparent text-transparent'
                    }`}
                  >
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path
                        d="M2.5 6.2 4.7 8.4 9.5 3.6"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  {includeSignature ? 'Included' : 'Not included'}
                </button>
              )}
            </div>

            {includeSignature && !signatureSuppressedByTemplate && (
              <div className="border-t border-[#282C35]/80 px-3.5 py-3">
                {safeSignatureHtml ? (
                  <div
                    className="email-html-content prose prose-invert max-w-none break-words text-xs leading-6 text-[#A1A4AC]"
                    dangerouslySetInnerHTML={{ __html: safeSignatureHtml }}
                  />
                ) : (
                  // `useSafeEmailHtml` yields '' before the browser has a DOM, and
                  // a signature is text before it is markup — so show the text
                  // rather than an empty box that reads as "nothing will be sent".
                  <div className="whitespace-pre-wrap break-words text-xs leading-6 text-[#A1A4AC]">
                    {htmlToPlainText(signatureHtml)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Guided Structured Corporate Closing & Sign-off (When Template Mode is ON) */}
        {isTemplateMode && (
          <div className="space-y-3 p-3.5 rounded-2xl bg-[#111318]/40 border border-[#282C35]/80">
            {/* Closing Row */}
            <div className="flex items-center gap-2 sm:gap-3 border-b border-[#282C35] pb-2 w-full max-w-full">
              <label
                htmlFor="composer-closing"
                className="text-xs font-medium text-[#A1A4AC] w-14 sm:w-16 shrink-0"
              >
                Closing:
              </label>
              <input
                id="composer-closing"
                type="text"
                value={closing}
                onChange={(e) => setClosing(e.target.value)}
                placeholder="Thank you for your time."
                className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm text-[#F5F5F5] placeholder-[#A1A4AC] focus:outline-none"
              />
            </div>

            {/* Sign-off & Sender Details */}
            <div className="space-y-2 pt-1 w-full max-w-full box-border">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 w-full max-w-full">
                {/*
                  One visible label over two fields, so it stays a `<span>` with
                  an `id` and the pair becomes a named `group` — a `<label>` can
                  only point at one control, and picking either field would leave
                  the other unlabelled. Each field then carries its own name,
                  because "Sign-off" alone does not tell you which box takes the
                  phrase and which takes the person.
                */}
                <span
                  id="composer-signoff-label"
                  className="text-xs font-medium text-[#A1A4AC] w-14 sm:w-16 shrink-0"
                >
                  Sign-off:
                </span>
                <div
                  role="group"
                  aria-labelledby="composer-signoff-label"
                  className="flex items-center gap-2 flex-1 min-w-0 w-full"
                >
                  <input
                    id="composer-signoff"
                    type="text"
                    aria-label="Sign-off phrase"
                    value={signoff}
                    onChange={(e) => setSignoff(e.target.value)}
                    placeholder="Best regards,"
                    className="w-28 sm:w-36 shrink-0 bg-transparent text-xs sm:text-sm text-[#F5F5F5] placeholder-[#A1A4AC] focus:outline-none border-b border-[#282C35] pb-0.5"
                  />
                  <input
                    id="composer-sender-name"
                    type="text"
                    aria-label="Sender name"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="Your Name"
                    className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm text-[#F5F5F5] placeholder-[#A1A4AC] focus:outline-none border-b border-[#282C35] pb-0.5"
                  />
                </div>
              </div>

              {/* Custom Detail Lines */}
              {customDetails.map((detail, idx) => (
                <div key={idx} className="flex items-center gap-2 pl-0 sm:pl-16 min-w-0 w-full">
                  <input
                    type="text"
                    // Numbered to match its own remove button below, which has
                    // said `Remove detail line 2` since it shipped while the
                    // field beside it was called "Designation / Company /
                    // Contact..." — the placeholder, read as a name.
                    aria-label={`Detail line ${idx + 1}`}
                    value={detail}
                    onChange={(e) => handleUpdateDetail(idx, e.target.value)}
                    placeholder="Designation / Company / Contact..."
                    className="flex-1 min-w-0 bg-transparent text-xs text-[#F5F5F5] placeholder-[#A1A4AC] focus:outline-none border-b border-[#282C35]/80 pb-0.5"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveDetail(idx)}
                    className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] shrink-0 rounded text-[#6B6E76] hover:text-rose-400 hover:bg-[#282C35] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                    aria-label={`Remove detail line ${idx + 1}`}
                  >
                    <IconX size={12} />
                  </button>
                </div>
              ))}

              <div className="pl-0 sm:pl-16 pt-0.5">
                <button
                  type="button"
                  onClick={handleAddDetail}
                  className="inline-flex items-center gap-1 min-h-[44px] sm:min-h-0 text-[11px] font-semibold text-[#FF8C42] hover:text-[#FFB875] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] rounded"
                >
                  <IconPlus size={12} />
                  <span>Add detail / line</span>
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

            /*
             * A budget, not just a per-file test. `used` starts at what is already on the
             * draft, so the tenth 3 MB image is refused for the right reason instead of
             * sailing past because it happens to be small on its own.
             */
            let used = attachments.reduce((sum, item) => sum + item.size, 0);
            const accepted: File[] = [];
            let refused = 0;

            for (let i = 0; i < files.length; i++) {
              const file = files[i];
              if (!file) continue;
              const tooBig = file.size > MAX_ATTACHMENT_BYTES;
              const overBudget = used + file.size > MAX_ATTACHMENTS_TOTAL_BYTES;
              if (tooBig || overBudget) {
                refused += 1;
                continue;
              }
              used += file.size;
              accepted.push(file);
            }
            // Cleared here rather than after the reads, so re-picking the same file works.
            event.target.value = '';

            if (refused > 0) {
              quantyReact('file:tooLarge');
              showToast({
                text: `${refused} file(s) too large — ${formatBytes(MAX_ATTACHMENT_BYTES)} each, ${formatBytes(MAX_ATTACHMENTS_TOTAL_BYTES)} total`,
                type: 'error',
              });
            }
            if (accepted.length === 0) return;
            // One latch for the whole selection, cleared when the last reader settles.
            // `file:uploading` caps itself at 30s in the reaction table, so a file that
            // never finishes reading cannot leave the mascot working forever.
            quantyReact('file:uploading');
            let pending = accepted.length;
            const settle = () => {
              pending -= 1;
              if (pending === 0) quantyReact('file:uploaded');
            };

            for (const file of accepted) {
              const reader = new FileReader();
              reader.onload = () => {
                setAttachments((prev) => [
                  ...prev,
                  {
                    id: `att_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                    name: file.name,
                    filename: file.name,
                    size: file.size,
                    type: file.type || 'application/octet-stream',
                    mimeType: file.type || 'application/octet-stream',
                    url: reader.result as string,
                  },
                ]);
                settle();
              };
              reader.onerror = () => {
                showToast({ text: `Could not read ${file.name}`, type: 'error' });
                settle();
              };
              reader.readAsDataURL(file);
            }
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
                  <span className="text-[10px] text-[#A1A4AC]">({formatBytes(file.size)})</span>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== file.id))}
                    className="relative inline-flex items-center justify-center size-4 shrink-0 rounded text-[#6B6E76] hover:text-rose-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] after:absolute after:-inset-y-[13px] after:-inset-x-[10px] after:content-['']"
                    aria-label={`Remove attachment ${file.name}`}
                  >
                    <IconX size={11} />
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
                ref={fontTriggerRef}
                onClick={() => setShowFontPicker((prev) => !prev)}
                className="flex items-center gap-1 px-2.5 py-1 min-h-[44px] sm:min-h-0 rounded-lg bg-[#111318] border border-[#282C35] text-[#F5F5F5] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                aria-expanded={showFontPicker}
                aria-controls={showFontPicker ? 'composer-font-panel' : undefined}
                aria-label={`Font family: ${selectedFont.name}`}
              >
                <span>{selectedFont.name}</span>
                <IconChevronDown size={10} />
              </button>
              {showFontPicker && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowFontPicker(false)} />
                  <div
                    id="composer-font-panel"
                    role="group"
                    aria-label="Font family"
                    className="absolute left-0 bottom-full mb-1.5 w-44 rounded-xl border border-[#282C35] bg-[#121622] py-1 shadow-2xl z-40"
                  >
                    {FONT_FAMILIES.map((font) => (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() => {
                          setSelectedFont(font);
                          setShowFontPicker(false);
                        }}
                        className={`flex items-center w-full px-3 py-1.5 min-h-[44px] text-left text-xs ${font.css} hover:bg-[#282C35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF8C42] ${
                          selectedFont.id === font.id
                            ? 'text-[#FF8C42] font-bold'
                            : 'text-[#A1A4AC]'
                        }`}
                        aria-pressed={selectedFont.id === font.id}
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
                ref={sizeTriggerRef}
                onClick={() => setShowSizePicker((prev) => !prev)}
                className="flex items-center gap-1 px-2 py-1 min-h-[44px] sm:min-h-0 rounded-lg bg-[#111318] border border-[#282C35] text-[#F5F5F5] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                aria-expanded={showSizePicker}
                aria-controls={showSizePicker ? 'composer-size-panel' : undefined}
                aria-label={`Font size: ${selectedSize.name}`}
              >
                <span>{selectedSize.name}</span>
                <IconChevronDown size={10} />
              </button>
              {showSizePicker && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowSizePicker(false)} />
                  <div
                    id="composer-size-panel"
                    role="group"
                    aria-label="Font size"
                    className="absolute left-0 bottom-full mb-1.5 w-28 rounded-xl border border-[#282C35] bg-[#121622] py-1 shadow-2xl z-40"
                  >
                    {FONT_SIZES.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSelectedSize(s);
                          setShowSizePicker(false);
                        }}
                        className={`flex items-center w-full px-3 py-1.5 min-h-[44px] text-left text-xs hover:bg-[#282C35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF8C42] ${
                          selectedSize.id === s.id ? 'text-[#FF8C42] font-bold' : 'text-[#A1A4AC]'
                        }`}
                        aria-pressed={selectedSize.id === s.id}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="h-4 w-px bg-[#282C35] mx-1" />

            {/*
              The four character toggles. Two things were missing and they
              compound: `aria-pressed`, so on/off was carried by the accent
              background alone; and a real name, because for a `<button>` the
              accessible name comes from its contents before its `title` — so
              these announced as "B", "I", "U", "S" and the words "Bold",
              "Italic" and the rest never reached a reader at all. `title` stays
              for the pointer tooltip; `aria-label` is what is spoken.
            */}
            {/* Bold */}
            <button
              type="button"
              onClick={() => setIsBold((prev) => !prev)}
              aria-pressed={isBold}
              aria-label="Bold"
              className={`inline-flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-1.5 rounded-lg font-bold text-xs ${
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
              aria-pressed={isItalic}
              aria-label="Italic"
              className={`inline-flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-1.5 rounded-lg italic text-xs font-serif ${
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
              aria-pressed={isUnderline}
              aria-label="Underline"
              className={`inline-flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-1.5 rounded-lg underline text-xs ${
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
              aria-pressed={isStrikethrough}
              aria-label="Strikethrough"
              className={`inline-flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-1.5 rounded-lg line-through text-xs ${
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
                ref={colorTriggerRef}
                onClick={() => setShowColorPicker((prev) => !prev)}
                aria-expanded={showColorPicker}
                aria-controls={showColorPicker ? 'composer-color-panel' : undefined}
                aria-label={`Text colour: ${textColor.label}`}
                className="inline-flex items-center justify-center gap-1 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-1.5 rounded-lg text-[#A1A4AC] hover:text-white hover:bg-[#111318] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                title="Text colour"
              >
                <span
                  aria-hidden="true"
                  className="font-bold underline"
                  style={{ color: textColor.color }}
                >
                  A
                </span>
              </button>
              {showColorPicker && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowColorPicker(false)} />
                  <div
                    id="composer-color-panel"
                    role="group"
                    aria-label="Text colour"
                    className="absolute left-0 bottom-full mb-1.5 p-2 rounded-xl border border-[#282C35] bg-[#121622] shadow-2xl z-40 flex gap-1.5"
                  >
                    {TEXT_COLORS.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setTextColor(c);
                          setShowColorPicker(false);
                        }}
                        // A swatch is a colour and nothing else: no text, so the
                        // name has to be given, and no state channel at all
                        // until now — the chosen colour was legible only from
                        // the letter A back on the trigger.
                        aria-pressed={textColor.id === c.id}
                        aria-label={c.label}
                        style={{ backgroundColor: c.color }}
                        className="size-5 rounded-full ring-1 ring-[#3A404D] hover:scale-110 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                        title={c.label}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="h-4 w-px bg-[#282C35] mx-1" />

            {/* Alignments */}
            <div
              role="radiogroup"
              aria-label="Text alignment"
              className="flex items-center gap-1.5"
            >
              {TEXT_ALIGNMENTS.map((alignment, index) => {
                const isOn = textAlign === alignment.value;
                return (
                  <button
                    key={alignment.value}
                    type="button"
                    ref={(node) => {
                      alignButtonRefs.current[index] = node;
                    }}
                    role="radio"
                    aria-checked={isOn}
                    aria-label={alignment.label}
                    tabIndex={rovingTabIndex(index, activeAlignIndex)}
                    onClick={() => setTextAlign(alignment.value)}
                    onKeyDown={(event) => onAlignKeyDown(event, index)}
                    className={`inline-flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-1.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                      isOn ? 'bg-[#FF8C42]/20 text-[#FFB875]' : 'text-[#A1A4AC] hover:text-white'
                    }`}
                    title={alignment.label}
                  >
                    <svg
                      className="size-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      {alignment.lines.map(([x1, x2], row) => (
                        <line key={row} x1={x1} x2={x2} y1={6 + row * 6} y2={6 + row * 6} />
                      ))}
                    </svg>
                  </button>
                );
              })}
            </div>

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
              className="ml-auto inline-flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-1.5 rounded-lg text-[#A1A4AC] hover:text-[#F5F5F5] text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
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
              className="flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2 min-h-[44px] sm:min-h-0 text-[#111111] text-xs sm:text-sm font-semibold hover:brightness-105 active:scale-95 disabled:opacity-40 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#111111]"
            >
              {isSending ? (
                <span>Sending…</span>
              ) : (
                <>
                  <span>Send</span>
                  <IconArrowRight className="size-3.5 sm:size-4 text-[#111111]" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowSendOptionsDropdown((prev) => !prev)}
              disabled={busy}
              className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 px-2 py-2 border-l border-[#111111]/20 text-[#111111] hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#111111]"
              title="Send options (Save draft / Schedule send)"
              aria-expanded={showSendOptionsDropdown}
              aria-label="Send options"
            >
              <IconChevronUp size={14} />
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
                    className="flex items-center gap-2.5 w-full px-3.5 py-2 min-h-[44px] text-left text-[#F5F5F5] hover:bg-[#282C35] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF8C42]"
                  >
                    <IconClock className="size-3.5 text-[#FF8C42]" />
                    <span>Schedule send</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      void handleSaveDraft();
                    }}
                    className="flex items-center gap-2.5 w-full px-3.5 py-2 min-h-[44px] text-left text-[#F5F5F5] hover:bg-[#282C35] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF8C42]"
                  >
                    <IconFileText className="size-3.5 text-[#A1A4AC]" />
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
            className={`inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-xl text-xs font-serif font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
              showFormattingBar
                ? 'bg-[#FF8C42]/20 text-[#FFB875] border border-[#FF8C42]/40'
                : 'text-[#A1A4AC] hover:text-white hover:bg-[#282C35]'
            }`}
            title="Formatting options (Aa)"
            aria-pressed={showFormattingBar}
            aria-label="Formatting options"
          >
            Aa
          </button>

          {/* Attach Local Device File */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-xl text-[#A1A4AC] hover:text-white hover:bg-[#282C35] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
            title="Attach files from device"
            aria-label="Attach files from device"
          >
            <IconPaperclip className="size-4" />
          </button>

          {/* Insert Link */}
          <button
            type="button"
            onClick={() => setIsLinkModalOpen(true)}
            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-xl text-[#A1A4AC] hover:text-white hover:bg-[#282C35] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
            title="Insert Link"
            aria-label="Insert link"
          >
            <IconLink className="size-4" />
          </button>

          {/* Insert from QuantDrive */}
          <button
            type="button"
            onClick={() => setIsDrivePickerOpen(true)}
            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-xl text-[#FF8C42] hover:text-[#FFB875] hover:bg-[#FF8C42]/10 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
            title="Insert files using QuantDrive"
            aria-label="Insert files from QuantDrive"
          >
            <IconFolder className="size-4" />
          </button>

          {/* Discard Draft Trash Button (Right next to QuantDrive) */}
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-xl text-[#A1A4AC] hover:text-rose-400 hover:bg-[#111318] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
            title="Discard draft"
            aria-label="Discard draft"
          >
            <IconTrash className="size-4" />
          </button>

          {/* Desktop Quanty Copilot Robot (Shown next to Discard on desktop - Icon only) */}
          <button
            type="button"
            onClick={() => setIsQuantyDrawerOpen(true)}
            className="hidden sm:flex p-2 rounded-xl text-[#FF8C42] hover:text-[#FFB875] hover:bg-[#FF8C42]/10 transition-all ml-0.5 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
            title="Open Quanty AI Copilot"
            aria-label="Open Quanty AI Copilot"
          >
            <Quanty size={20} expression={quantyFace} bob={false} />
          </button>
        </div>
      </div>

      {/*
       * Clean Gmail-Grade Print Document (Visible ONLY during print).
       *
       * Everything below sits on white paper, so the app's dark-canvas type
       * ramp is inverted here and none of it applies: #A1A4AC is 2.49:1 on
       * white and #F5F5F5 is invisible. Secondary copy on this sheet is
       * #3A404D (10.4:1) and hairline rules are #A1A4AC. A colour sweep that
       * assumes the dark canvas must skip this subtree.
       */}
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
          <div className="text-xs text-[#3A404D] font-medium">
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
              <span className="text-[#3A404D]">Draft To: </span>
              <span className="font-medium text-black">{to || '(no recipients)'}</span>
            </div>
            {cc && (
              <div>
                <span className="text-[#3A404D]">Cc: </span>
                <span className="text-black">{cc}</span>
              </div>
            )}
            {bcc && (
              <div>
                <span className="text-[#3A404D]">Bcc: </span>
                <span className="text-black">{bcc}</span>
              </div>
            )}
          </div>
          <div className="text-right text-[#3A404D] text-xs shrink-0">
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
          <div className="mt-8 pt-4 border-t border-[#A1A4AC] text-xs text-[#3A404D]">
            <strong className="text-black">Attachments ({attachments.length}): </strong>
            <span>{attachments.map((a) => a.name).join(', ')}</span>
          </div>
        )}
      </div>

      {/* Schedule Send Modal (Hidden during Print) */}
      {showSchedule && (
        <ScheduleSendModal
          isOpen={showScheduleModal}
          onClose={() => setShowScheduleModal(false)}
          onSchedule={(scheduledAt) => {
            void handleSend(scheduledAt);
          }}
        />
      )}

      {/* QuantDrive File Picker Modal (Hidden during Print) */}
      {showDrivePicker && (
        <QuantDrivePickerModal
          isOpen={isDrivePickerOpen}
          onClose={() => setIsDrivePickerOpen(false)}
          onSelectFiles={handleAttachFromDrive}
        />
      )}

      {/* Insert Link Modal (Hidden during Print) */}
      <InsertLinkModal
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        onInsert={handleInsertLink}
      />

      {/* Quanty Copilot Drawer (Hidden during Print) */}
      {showQuantyDrawer && (
        <QuantyCopilotDrawer
          isOpen={isQuantyDrawerOpen}
          onClose={() => setIsQuantyDrawerOpen(false)}
          isComposeContext={true}
          onApplyAction={handleApplyQuantyAction}
        />
      )}
    </div>
  );
}

export default EmailComposer;

'use client';

/**
 * Sender hovercard — the Gmail hovercard analogue for QuantMail (fix/qm-contacts-sender-hovercard).
 *
 * Before this, every sender name in the thread view was plain text: the
 * collapsed strip rendered `IdentityAvatar + name` inside the expand button
 * and the expanded header rendered avatar + name as spans, with no card, no
 * quick actions and no contact preview anywhere (grep "hovercard" found only
 * a QuantGit settings toggle).
 *
 * The card is rendered through a portal to `document.body`, not as a child
 * of the trigger: the collapsed strip IS a button, and a card full of its own
 * buttons nested inside that button would be invalid HTML and would toggle
 * the message open/closed when an action was clicked. Portaled, the card is
 * a sibling in the DOM, so its clicks never reach the expand button.
 *
 * Honesty contract (QuantMail-only scope):
 * - The saved-contact preview comes from a real lookup: `GET /contacts/search`
 *   matched on the exact email address (case-insensitive). Nothing is
 *   invented — an unmatched sender is shown as "Not in your contacts".
 * - Email, Schedule event and Add/Edit Contact are wired to real QuantMail
 *   surfaces (/compose, /calendar prefilled draft via `onSchedule`, and
 *   /contacts?contact=<id>). Chat and video call have no QuantMail surface
 *   to land on, so they render disabled and labelled "Not wired yet" rather
 *   than pretending to work. QuantChat code is deliberately untouched.
 * - Pure black card, no divider lines (space, not borders, separates rows),
 *   Contacts-amber accent for the contact action — per the QuantMail UI rules.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiClient } from '../services/api-client';
import type { Contact } from '../types';
import { IdentityAvatar } from './IdentityAvatar';

export type HovercardContactState = 'idle' | 'loading' | 'loaded' | 'error';

/** Exact-email match against a search result page — never a fuzzy guess. */
export function matchSavedContact(
  contacts: Contact[] | null | undefined,
  email: string,
): Contact | null {
  const needle = email.trim().toLowerCase();
  if (!needle || !contacts) return null;
  return contacts.find((c) => c.email?.trim().toLowerCase() === needle) ?? null;
}

/** Compose URL for "Email this sender" — Re: the thread subject when known. */
export function senderEmailHref(email: string, threadSubject?: string): string {
  const subject = threadSubject?.trim()
    ? threadSubject.startsWith('Re:')
      ? threadSubject
      : `Re: ${threadSubject}`
    : '';
  const params = new URLSearchParams({ to: email });
  if (subject) params.set('subject', subject);
  return `/compose?${params.toString()}`;
}

/** Contacts deep link used by "Edit contact" (the page honours ?contact=<id>). */
export function senderContactHref(contactId: string): string {
  return `/contacts?contact=${encodeURIComponent(contactId)}`;
}

export interface SenderHovercardCardProps {
  name: string;
  email: string;
  threadSubject?: string;
  contact: Contact | null;
  contactState: HovercardContactState;
  /** Prefilled-draft schedule handler from the thread view; without it the action links to /calendar. */
  onSchedule?: () => void;
  onAddContact?: () => void;
  addingContact?: boolean;
  addError?: string | null;
}

/**
 * The card itself, kept presentational so it renders under
 * `renderToStaticMarkup` (the portal wrapper cannot, by design — it needs a
 * mounted DOM). All copy here is either real data or an honest "not wired yet".
 */
export function SenderHovercardCard({
  name,
  email,
  threadSubject,
  contact,
  contactState,
  onSchedule,
  onAddContact,
  addingContact,
  addError,
}: SenderHovercardCardProps) {
  // No useRouter here on purpose: the card renders under renderToStaticMarkup
  // in tests, where the App Router context does not exist. Navigation is
  // plain anchors, which work identically in the browser.
  const displayName = name && name !== 'Sender' ? name : email.split('@')[0] || 'Sender';
  const actionClass =
    'flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-3 text-left text-[13px] font-medium text-white transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div
      role="dialog"
      aria-label={`Contact card for ${displayName}`}
      className="w-[320px] max-w-[calc(100vw-16px)] rounded-2xl bg-black p-3 shadow-2xl ring-1 ring-white/15"
    >
      <div className="flex items-start gap-3 px-1 pb-1 pt-1">
        <IdentityAvatar name={displayName} size="md" className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{displayName}</p>
          {email ? (
            <p className="truncate text-xs text-white/60">{email}</p>
          ) : (
            <p className="text-xs text-white/60">No email address on this message</p>
          )}
          {contactState === 'loading' && (
            <p className="mt-1 text-xs text-white/50">Checking your contacts…</p>
          )}
          {contactState === 'error' && (
            <p className="mt-1 text-xs text-rose-400">
              Couldn’t check contacts — actions below still work.
            </p>
          )}
          {contactState === 'loaded' &&
            (contact ? (
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                In your contacts
                {contact.company ? ` · ${contact.company}` : ''}
              </span>
            ) : (
              <p className="mt-1 text-xs text-white/50">Not in your contacts</p>
            ))}
          {contact?.phone && (
            <p className="mt-1 truncate text-xs text-white/60">{contact.phone}</p>
          )}
          {contact?.tags && contact.tags.length > 0 && (
            <p className="mt-1 truncate text-xs text-white/50">{contact.tags.join(' · ')}</p>
          )}
        </div>
      </div>

      <div className="mt-1 flex flex-col gap-0.5">
        {email ? (
          <a href={senderEmailHref(email, threadSubject)} className={actionClass}>
            <span aria-hidden="true">✉️</span> Email
          </a>
        ) : (
          <button type="button" disabled className={actionClass} title="No email address on this message">
            <span aria-hidden="true">✉️</span> Email
          </button>
        )}
        {onSchedule ? (
          <button type="button" onClick={onSchedule} className={actionClass}>
            <span aria-hidden="true">📅</span> Schedule event
          </button>
        ) : (
          <a href="/calendar" className={actionClass}>
            <span aria-hidden="true">📅</span> Schedule event
          </a>
        )}
        {contact ? (
          <a href={senderContactHref(contact.id)} className={actionClass}>
            <span aria-hidden="true">👤</span> Edit contact
          </a>
        ) : (
          <button
            type="button"
            onClick={onAddContact}
            disabled={addingContact || !email}
            className={actionClass}
            title={!email ? 'No email address on this message' : undefined}
          >
            <span aria-hidden="true">➕</span>
            {addingContact ? 'Adding…' : 'Add to Contacts'}
          </button>
        )}
        {addError && <p className="px-3 py-1 text-xs text-rose-400">{addError}</p>}
        <button
          type="button"
          disabled
          className={actionClass}
          title="Chat is not wired yet in QuantMail"
        >
          <span aria-hidden="true">💬</span> Chat <span className="text-[11px] text-white/40">· not wired yet</span>
        </button>
        <button
          type="button"
          disabled
          className={actionClass}
          title="Video call is not wired yet in QuantMail"
        >
          <span aria-hidden="true">📹</span> Video call <span className="text-[11px] text-white/40">· not wired yet</span>
        </button>
        {contact && (
          <a href={senderContactHref(contact.id)} className={actionClass}>
            <span aria-hidden="true">↗</span> Open in Contacts
          </a>
        )}
      </div>
    </div>
  );
}

export interface SenderHovercardProps {
  name: string;
  email: string;
  threadSubject?: string;
  onSchedule?: () => void;
  /** False inside the collapsed expand-button strip: a focusable span inside a button is poor a11y; hover still opens the card there. */
  keyboardFocusable?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function SenderHovercard({
  name,
  email,
  threadSubject,
  onSchedule,
  keyboardFocusable = true,
  className,
  children,
}: SenderHovercardProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [contact, setContact] = useState<Contact | null>(null);
  const [contactState, setContactState] = useState<HovercardContactState>('idle');
  const [addingContact, setAddingContact] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchedForRef = useRef<string>('');

  useEffect(() => {
    setMounted(true);
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const placeCard = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cardWidth = 320;
    const gap = 8;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - cardWidth - 8));
    const below = rect.bottom + gap;
    // Card height is ~340px; flip above the trigger when there is no room below.
    const top = below + 340 <= window.innerHeight ? below : Math.max(8, rect.top - gap - 340);
    setPosition({ top, left });
  }, []);

  const openCard = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    placeCard();
    setOpen(true);
    const key = email.trim().toLowerCase();
    if (key && fetchedForRef.current !== key) {
      fetchedForRef.current = key;
      setContactState('loading');
      void apiClient
        .searchContacts(email)
        .then((res) => {
          setContact(matchSavedContact(res.data, email));
          setContactState('loaded');
        })
        .catch(() => setContactState('error'));
    }
  }, [email, placeCard]);

  const scheduleClose = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => setOpen(false), 150);
  }, []);

  const handleAddContact = useCallback(() => {
    if (!email || addingContact) return;
    setAddingContact(true);
    setAddError(null);
    void apiClient
      .createContact({ name: name && name !== 'Sender' ? name : email.split('@')[0], email })
      .then((res) => {
        if (res.success && res.data) {
          // Card flips to "In your contacts" with Edit/Open actions; the user
          // chooses the next step instead of being yanked to /contacts.
          setContact(res.data);
          setContactState('loaded');
        } else {
          setAddError(res.error?.message || 'Couldn’t add this contact.');
        }
      })
      .catch((err: unknown) => {
        setAddError(err instanceof Error ? err.message : 'Couldn’t add this contact.');
      })
      .finally(() => setAddingContact(false));
  }, [email, name, addingContact]);

  return (
    <>
      <span
        ref={triggerRef}
        tabIndex={keyboardFocusable ? 0 : undefined}
        onMouseEnter={openCard}
        onMouseLeave={scheduleClose}
        onFocus={openCard}
        onBlur={scheduleClose}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        className={className}
        aria-label={email ? `Contact card for ${name || email}` : undefined}
      >
        {children}
      </span>
      {mounted &&
        open &&
        createPortal(
          <div
            style={{ position: 'fixed', top: position.top, left: position.left, zIndex: 100 }}
            onMouseEnter={() => {
              if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
            }}
            onMouseLeave={scheduleClose}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
            }}
          >
            <SenderHovercardCard
              name={name}
              email={email}
              threadSubject={threadSubject}
              contact={contact}
              contactState={contactState}
              onSchedule={onSchedule}
              onAddContact={handleAddContact}
              addingContact={addingContact}
              addError={addError}
            />
          </div>,
          document.body,
        )}
    </>
  );
}

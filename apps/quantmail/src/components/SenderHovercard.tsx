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

export interface HovercardPlacement {
  triggerLeft: number;
  triggerTop: number;
  triggerBottom: number;
  viewportWidth: number;
  viewportHeight: number;
  cardWidth?: number;
  cardHeight?: number;
}

/**
 * Pure viewport clamp for the portal position — unit-tested, no DOM needed.
 * The card is never placed left of 8px or right of viewport-8px, and never
 * placed so its top runs past the bottom: when there is no room below, it
 * flips above the trigger, and when the viewport is shorter than the card
 * itself it pins to 8px and the portal wrapper scrolls (maxHeight
 * calc(100vh - 16px)) instead of painting off-screen. That last case is the
 * small-phone case: a 300px-tall viewport with a ~340px card.
 */
export function clampHovercardPosition({
  triggerLeft,
  triggerTop,
  triggerBottom,
  viewportWidth,
  viewportHeight,
  cardWidth = 320,
  cardHeight = 340,
}: HovercardPlacement): { top: number; left: number } {
  const margin = 8;
  const left = Math.max(margin, Math.min(triggerLeft, viewportWidth - cardWidth - margin));
  const below = triggerBottom + margin;
  const topBelow = below + cardHeight <= viewportHeight ? below : Math.max(margin, triggerTop - margin - cardHeight);
  const top = Math.min(topBelow, Math.max(margin, viewportHeight - cardHeight - margin));
  return { top, left };
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
  /** Retry the failed contact lookup — rendered only in the error state. Without it there is no honest retry path. */
  onRetry?: () => void;
  /** Close control — a real button, so touch users have a dismiss target that is not "tap somewhere else". */
  onClose?: () => void;
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
  onRetry,
  onClose,
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
            <>
              <p className="mt-1 text-xs text-rose-400">
                Couldn’t check contacts — actions below still work.
              </p>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-1.5 min-h-[44px] rounded-lg bg-amber-400/15 px-3 text-xs font-semibold text-amber-300 hover:bg-amber-400/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                >
                  Retry
                </button>
              )}
            </>
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
          {/* Phone/tags are preview data: they render only for a successful
              lookup. A stale contact prop handed in with an error/loading
              state must never paint — that is how a failed lookup would
              masquerade as the previous sender's card. */}
          {contactState === 'loaded' && contact?.phone && (
            <p className="mt-1 truncate text-xs text-white/60">{contact.phone}</p>
          )}
          {contactState === 'loaded' && contact?.tags && contact.tags.length > 0 && (
            <p className="mt-1 truncate text-xs text-white/50">{contact.tags.join(' · ')}</p>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close contact card"
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-base text-white/60 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <span aria-hidden="true">✕</span>
          </button>
        )}
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
        {contactState === 'loaded' && contact ? (
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
        {contactState === 'loaded' && contact && (
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

/**
 * Mobile / keyboard / retry contract (the pre-fix gaps, fixed here):
 *
 * MOBILE — the card must work with no hover at all. A tap (click) on the
 * trigger opens it; the click is stopped at the trigger, so inside the
 * collapsed strip — which IS a button — a tap opens the card instead of
 * toggling the message (the portal separation alone does not stop the
 * bubbling click; stopPropagation does). A tap-opened card gets a
 * full-screen transparent backdrop (tap-outside dismisses) plus a real
 * close button, and the portal position is viewport-clamped with a
 * scrolling wrapper so the card never paints off-screen on a small phone.
 *
 * KEYBOARD — the trigger is a focusable span with button semantics
 * (role/aria-expanded/aria-haspopup) when it is not nested in the collapsed
 * button; focus opens, Enter/Space open explicitly (a span has no native
 * key activation, and Space would otherwise scroll the page), Tab into
 * the card cancels the blur-close timer (focus inside the card cancels it
 * too, so relatedTarget quirks cannot close the card mid-Tab), Escape
 * closes AND returns focus to the trigger (a focus-return flag suppresses
 * the one focus-open that returning focus would otherwise re-trigger),
 * and every action is a real anchor/button in DOM order.
 *
 * RETRY — a failed lookup renders error + a real Retry button that
 * re-fetches (the old code set fetchedFor before the fetch, so reopening
 * after an error could never retry, and there was no retry control at
 * all). Every fetch clears the previous contact first and carries a
 * request id: a completion whose id is stale, or whose sender no longer
 * matches the mounted sender, is ignored — a sender switch mid-flight
 * never paints the previous sender's preview, and an error never claims
 * "not saved". A failed Add shows the real error, never a fake success,
 * and the button returns to "Add to Contacts" instead of sticking.
 */
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
  const [openSource, setOpenSource] = useState<'hover' | 'focus' | 'tap' | null>(null);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [contact, setContact] = useState<Contact | null>(null);
  const [contactState, setContactState] = useState<HovercardContactState>('idle');
  const [addingContact, setAddingContact] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchedForRef = useRef<string>('');
  const requestIdRef = useRef(0);
  const openRef = useRef(false);
  const returningFocusRef = useRef(false);

  const emailKey = email.trim().toLowerCase();

  useEffect(() => {
    setMounted(true);
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const placeCard = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition(
      clampHovercardPosition({
        triggerLeft: rect.left,
        triggerTop: rect.top,
        triggerBottom: rect.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }),
    );
  }, []);

  // Re-place while open (rotation, scroll, resize): a position computed
  // once at open time drifts off-viewport on a phone otherwise.
  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', placeCard);
    window.addEventListener('scroll', placeCard, true);
    return () => {
      window.removeEventListener('resize', placeCard);
      window.removeEventListener('scroll', placeCard, true);
    };
  }, [open, placeCard]);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const scheduleClose = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      openRef.current = false;
      setOpenSource(null);
      setOpen(false);
    }, 150);
  }, []);

  // Mirror of the current sender key, so in-flight completions can tell a
  // stale sender from the current one without re-creating fetchContact.
  const emailKeyRef = useRef(emailKey);

  /** One lookup, guarded against stale completions and stale senders. */
  const fetchContact = useCallback(
    (lookupEmail: string) => {
      const key = lookupEmail.trim().toLowerCase();
      if (!key) return;
      const requestId = ++requestIdRef.current;
      fetchedForRef.current = key;
      // Clear first: the previous sender's preview must not linger while
      // this lookup is in flight, and an error must not inherit it either.
      setContact(null);
      setContactState('loading');
      void apiClient
        .searchContacts(lookupEmail)
        .then((res) => {
          if (requestId !== requestIdRef.current) return;
          if (key !== emailKeyRef.current) return;
          setContact(matchSavedContact(res.data, lookupEmail));
          setContactState('loaded');
        })
        .catch(() => {
          if (requestId !== requestIdRef.current) return;
          if (key !== emailKeyRef.current) return;
          setContact(null);
          setContactState('error');
        });
    },
    // emailKeyRef is a ref mirror, so the callback itself stays stable.
    [],
  );

  useEffect(() => {
    const previousKey = emailKeyRef.current;
    emailKeyRef.current = emailKey;
    if (previousKey !== emailKey) {
      // Sender switched under a mounted card: drop the old preview and,
      // if the card is open, look the new sender up right away. (The old
      // code had no effect here at all, so a switch mid-flight painted
      // the previous sender and never fetched the new one.)
      fetchedForRef.current = '';
      setContact(null);
      setContactState('idle');
      setAddError(null);
      if (openRef.current) fetchContact(email);
    }
  }, [emailKey, email, fetchContact]);

  const openCard = useCallback(
    (source: 'hover' | 'focus' | 'tap') => {
      cancelClose();
      placeCard();
      openRef.current = true;
      setOpenSource(source);
      setOpen(true);
      // Re-fetch when the sender changed OR the previous lookup failed:
      // an error state is retryable by reopening, not just by the Retry
      // button, and fetchedFor must not pin a failed lookup forever.
      if (emailKey && (fetchedForRef.current !== emailKey || contactState === 'error')) {
        fetchContact(email);
      }
    },
    [email, emailKey, placeCard, cancelClose, fetchContact, contactState],
  );

  const closeCard = useCallback(
    (returnFocus: boolean) => {
      cancelClose();
      openRef.current = false;
      setOpenSource(null);
      setOpen(false);
      if (returnFocus && triggerRef.current) {
        // Returning focus fires the trigger's onFocus; suppress that one
        // open, or Escape/close would instantly reopen the card.
        returningFocusRef.current = true;
        triggerRef.current.focus();
      }
    },
    [cancelClose],
  );

  const handleRetry = useCallback(() => {
    fetchedForRef.current = '';
    fetchContact(email);
  }, [email, fetchContact]);

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

  const focusInsideCard = (target: EventTarget | null) =>
    target instanceof Node && cardRef.current?.contains(target);
  const focusOnTrigger = (target: EventTarget | null) => target === triggerRef.current;

  return (
    <>
      <span
        ref={triggerRef}
        tabIndex={keyboardFocusable ? 0 : undefined}
        role={keyboardFocusable ? 'button' : undefined}
        aria-expanded={keyboardFocusable ? open : undefined}
        aria-haspopup={keyboardFocusable ? 'dialog' : undefined}
        onMouseEnter={() => openCard('hover')}
        onMouseLeave={scheduleClose}
        onFocus={() => {
          if (returningFocusRef.current) {
            returningFocusRef.current = false;
            return;
          }
          openCard('focus');
        }}
        onBlur={(e) => {
          // Tabbing from the trigger into the card must not schedule a
          // close at all; any other blur gets the delayed close, which
          // card focus cancels (belt and braces for relatedTarget gaps).
          if (focusInsideCard(e.relatedTarget)) return;
          scheduleClose();
        }}
        onClick={(e) => {
          // Tap path, and the collapsed-strip guard: this span sits inside
          // the message expand <button>, so without stopPropagation a tap
          // would toggle the message instead of opening the card. If the
          // card is already open (hover), the tap is a no-op, not a toggle.
          e.preventDefault();
          e.stopPropagation();
          if (!openRef.current) openCard('tap');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            closeCard(false);
          } else if (e.key === 'Enter' || e.key === ' ') {
            // A span has no native key activation; without this, Enter
            // does nothing and Space scrolls the page.
            e.preventDefault();
            openCard('focus');
          }
        }}
        className={className}
        aria-label={email ? `Contact card for ${name || email}` : undefined}
      >
        {children}
      </span>
      {mounted && open && openSource === 'tap' &&
        createPortal(
          <button
            type="button"
            tabIndex={-1}
            aria-label="Dismiss contact card"
            onClick={() => closeCard(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 99,
              background: 'transparent',
              border: 0,
              padding: 0,
              cursor: 'default',
            }}
          />,
          document.body,
        )}
      {mounted &&
        open &&
        createPortal(
          <div
            ref={cardRef}
            style={{
              position: 'fixed',
              top: position.top,
              left: position.left,
              zIndex: 100,
              maxWidth: 'calc(100vw - 16px)',
              maxHeight: 'calc(100vh - 16px)',
              overflowY: 'auto',
            }}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            onFocus={cancelClose}
            onBlur={(e) => {
              // Focus leaving the card entirely closes it at once (Tab
              // past the last action, or a click outside); focus moving
              // within the card or back to the trigger keeps it open.
              if (focusInsideCard(e.relatedTarget) || focusOnTrigger(e.relatedTarget)) {
                cancelClose();
                return;
              }
              closeCard(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeCard(true);
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
              onRetry={handleRetry}
              onClose={() => closeCard(true)}
            />
          </div>,
          document.body,
        )}
    </>
  );
}

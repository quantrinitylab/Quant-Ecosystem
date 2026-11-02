'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Avatar } from '@quant/shared-ui';
import { useContactDirectory, useCreateContact } from '../hooks/useContacts';
import { showToast } from '../lib/toast-bus';

/**
 * Hover contact card (Gmail/Superhuman analogue) for the mail reader.
 *
 * Hovering (desktop) or tapping (touch) a sender's name pops a small card
 * with the person's photo, name and email plus a one-tap "Add to contacts"
 * action when they are not in the address book yet. Previously a non-contact
 * sender could only become a contact via the Contacts tab's "Suggested from
 * your mail" section.
 *
 * Contract:
 * - The trigger renders its children unchanged; the card opens after a short
 *   hover delay, toggles on click/tap (touch has no hover), and closes on
 *   Escape, click-outside, scroll, resize, or leaving both trigger and card.
 * - The card renders in a portal with fixed positioning: reader surfaces
 *   routinely sit under `overflow: hidden` / `truncate` ancestors (the
 *   message card, the header subtitle line), which would clip an absolutely
 *   positioned popover. Fixed + portal escapes all of that.
 * - Membership comes from the real address book (`useContactDirectory`,
 *   backed by GET /contacts/directory) — never guessed.
 * - Adding goes through the same `useCreateContact` mutation the contacts
 *   page uses (POST /contacts); success and failure both surface as honest
 *   toasts. No invented names: the address is the display name when mail
 *   carried no name.
 * - When `email` is empty there is no person to identify, so the children
 *   render bare with no card.
 */

/** Honest display identity: the known name, else the bare address — never invented. */
export function displayNameForCard(email: string, name?: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : email;
}

export interface ContactCardBodyProps {
  email: string;
  name?: string | null;
  /**
   * Address-book membership. `null` means "not known yet" (the directory is
   * still loading) — the card says so instead of guessing.
   */
  isKnown: boolean | null;
  /** The directory fetch failed; the card says so instead of hiding the action. */
  directoryError: boolean;
  /** An add mutation is in flight; the button is disabled and says "Adding…". */
  isAdding: boolean;
  onAdd: () => void;
  onCardEnter: () => void;
  onCardLeave: () => void;
  onCardFocus: () => void;
  onCardBlur: () => void;
  cardRef: React.RefObject<HTMLDivElement | null>;
}

/** Pure presentational card body — renders from props so it stays testable. */
export function ContactCardBody({
  email,
  name,
  isKnown,
  directoryError,
  isAdding,
  onAdd,
  onCardEnter,
  onCardLeave,
  onCardFocus,
  onCardBlur,
  cardRef,
}: ContactCardBodyProps) {
  const displayName = displayNameForCard(email, name);
  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-label={`Contact card for ${displayName}`}
      className="w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-[var(--quant-surface-elevated)] bg-black p-3 shadow-[0_8px_32px_rgba(0,0,0,0.8)]"
      onMouseEnter={onCardEnter}
      onMouseLeave={onCardLeave}
      onFocus={onCardFocus}
      onBlur={onCardBlur}
    >
      <div className="flex items-center gap-2.5">
        <Avatar name={displayName} size="md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{displayName}</p>
          <p
            className="truncate font-mono text-[11px] text-[var(--quant-muted-foreground)]"
            title={email}
          >
            {email}
          </p>
        </div>
      </div>
      <div className="mt-2.5">
        {directoryError ? (
          <p className="text-[11px] text-rose-400">Couldn&apos;t check contacts</p>
        ) : isKnown === null ? (
          <p className="text-[11px] text-[var(--quant-muted-foreground)]">Checking contacts…</p>
        ) : isKnown ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--app-accent)]/15 px-2.5 py-1.5 text-xs font-bold text-[var(--app-accent)]">
            <svg
              className="size-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
            In contacts
          </span>
        ) : (
          <button
            type="button"
            disabled={isAdding}
            onClick={(e) => {
              e.stopPropagation();
              onAdd();
            }}
            aria-label={`Add ${displayName} to contacts`}
            className="inline-flex min-h-touch items-center gap-1.5 rounded-lg bg-[var(--app-accent)] px-3 py-1.5 text-xs font-bold text-black transition-all hover:bg-[var(--app-accent-hover)] disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
          >
            <svg
              className="size-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
            {isAdding ? 'Adding…' : 'Add to contacts'}
          </button>
        )}
      </div>
    </div>
  );
}

export interface ContactHoverCardProps {
  /** The person's email address; empty means "no identifiable person", no card. */
  email?: string | null;
  name?: string | null;
  /** The visible trigger (sender name, avatar, or both). */
  children: React.ReactNode;
  /** Extra classes on the trigger wrapper. */
  className?: string;
}

/** Hover delay before the card opens (ms); short enough to feel instant, long enough to ignore fly-bys. */
const OPEN_DELAY_MS = 350;
/** Grace period after leaving trigger/card before the card closes (ms). */
const CLOSE_DELAY_MS = 200;
/** Must match the card's `w-64` so it never runs off the right edge. */
const CARD_WIDTH_PX = 256;

export function ContactHoverCard({ email, name, children, className }: ContactHoverCardProps) {
  const [open, setOpen] = useState(false);
  const [cardPos, setCardPos] = useState<{ left: number; top: number } | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: directory, isPending: directoryPending, isError: directoryError } =
    useContactDirectory();
  const createContact = useCreateContact();

  const clearTimers = useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const scheduleOpen = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (!open && !openTimer.current) {
      openTimer.current = setTimeout(() => {
        openTimer.current = null;
        setOpen(true);
      }, OPEN_DELAY_MS);
    }
  }, [open]);

  const scheduleClose = useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (open && !closeTimer.current) {
      closeTimer.current = setTimeout(() => {
        closeTimer.current = null;
        setOpen(false);
      }, CLOSE_DELAY_MS);
    }
  }, [open]);

  const closeNow = useCallback(() => {
    clearTimers();
    setOpen(false);
  }, [clearTimers]);

  const toggle = useCallback(() => {
    clearTimers();
    setOpen((prev) => !prev);
  }, [clearTimers]);

  // Position the portal card under the trigger, clamped into the viewport.
  // Runs on open and on every scroll/resize while open would be jittery, so
  // instead the card closes on scroll/resize — the same trade-off Gmail's
  // web card makes when the page moves underneath it.
  useEffect(() => {
    if (!open) {
      setCardPos(null);
      return;
    }
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) {
      setCardPos(null);
      return;
    }
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - CARD_WIDTH_PX - 8);
    setCardPos({ left, top: rect.bottom + 8 });
    window.addEventListener('scroll', closeNow, true);
    window.addEventListener('resize', closeNow);
    return () => {
      window.removeEventListener('scroll', closeNow, true);
      window.removeEventListener('resize', closeNow);
    };
  }, [open, closeNow]);

  // Escape closes; a mousedown outside both trigger and card closes too.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeNow();
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        wrapRef.current &&
        !wrapRef.current.contains(target) &&
        cardRef.current &&
        !cardRef.current.contains(target)
      ) {
        closeNow();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, closeNow]);

  const trimmedEmail = email?.trim() ?? '';
  if (!trimmedEmail) {
    // No identifiable person — render the trigger bare, never a card.
    return <>{children}</>;
  }

  const displayName = displayNameForCard(trimmedEmail, name);
  const isKnown: boolean | null = directoryPending
    ? null
    : directoryError || !directory
      ? null
      : directory.has(trimmedEmail.toLowerCase());

  const handleAdd = () => {
    if (createContact.isPending) return;
    // No known name: store the address as the display name — the same
    // fallback the send path uses when it auto-creates a contact. The row
    // renders the address itself, never an invented name.
    createContact.mutate(
      { name: displayName, email: trimmedEmail },
      {
        onSuccess: () => {
          showToast({ text: `Added ${displayName} to contacts`, type: 'success' });
        },
        onError: (err) => {
          showToast({
            text: err instanceof Error ? err.message : 'Could not add contact',
            type: 'error',
          });
        },
      },
    );
  };

  return (
    <span
      ref={wrapRef}
      className={`relative inline-flex items-center ${className ?? ''}`}
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
      onFocus={scheduleOpen}
      onBlur={scheduleClose}
      // Touch devices have no hover: a tap toggles the card. stopPropagation
      // matters because readers nest the sender name inside a header bar whose
      // own click collapses the message — the tap must open the card, not
      // close the message out from under it.
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') closeNow();
      }}
      tabIndex={0}
      role="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={`Contact card for ${displayName}`}
    >
      {children}
      {open &&
        cardPos &&
        createPortal(
          <div
            className="fixed z-50"
            style={{ left: cardPos.left, top: cardPos.top }}
            // The trigger's click toggles the card; a click that starts on the
            // card must not bubble up to any ancestor click handler (the
            // reader's collapse bar) through the portal.
            onClick={(e) => e.stopPropagation()}
          >
            <ContactCardBody
              email={trimmedEmail}
              name={name}
              isKnown={isKnown}
              directoryError={directoryError}
              isAdding={createContact.isPending}
              onAdd={handleAdd}
              onCardEnter={scheduleOpen}
              onCardLeave={scheduleClose}
              onCardFocus={scheduleOpen}
              onCardBlur={scheduleClose}
              cardRef={cardRef}
            />
          </div>,
          document.body,
        )}
    </span>
  );
}

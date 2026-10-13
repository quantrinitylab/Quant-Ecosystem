import React from 'react';
import type { BookingLinkLoadStatus } from './booking-utils';
import { IconBan } from '../../../../components/icons';

// Same primary-button styling as the old 'Try again' retry so every link-load
// failure state stays visually consistent (Calendar accent blue via
// --app-accent on this surface).
const PRIMARY_ACTION_CLASS =
  'px-5 py-2.5 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--quant-background)] font-bold text-xs shadow-lg shadow-[color-mix(in_srgb,var(--app-accent)_20%,transparent)] transition-all';

/**
 * True when window.history.back() is a real destination (the guest arrived
 * from somewhere in this tab). When false, the panel falls back to '/' so
 * "Go back" never silently does nothing. Exported for unit tests.
 */
export function shouldUseHistoryBack(historyLength: number): boolean {
  return historyLength > 1;
}

/**
 * Honest dead-link panel for /calendar/booking/[slug] — rendered whenever the
 * link record can't be loaded ('not-found' | 'inactive' | 'error').
 *
 * No dead ends: every state carries at least one action.
 *  - 'error'/'inactive': "Try again" re-fetches the link (host may have
 *    re-enabled a paused link; a connection may have recovered).
 *  - 'not-found': a retry can't fix a mistyped URL, so "Go back" returns to
 *    the previous page (or QuantMail home when there is no history) and
 *    "Open QuantMail" gives an always-valid destination.
 */
export function BookingLinkDeadPanel({
  status,
  message,
  onRetry,
  onGoBack,
}: {
  status: BookingLinkLoadStatus;
  message: string | null;
  onRetry: () => void;
  onGoBack: () => void;
}) {
  return (
    <div className="w-full max-w-md rounded-3xl bg-[var(--quant-surface-subtle)] border border-[var(--quant-surface-elevated)] shadow-2xl shadow-black/80 p-8 text-center space-y-4">
      <div className="size-14 rounded-2xl bg-[color-mix(in_srgb,var(--app-accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--app-accent)_25%,transparent)] text-[var(--app-accent)] mx-auto flex items-center justify-center">
        <IconBan size={26} />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-lg font-black tracking-tight text-white">
          {status === 'not-found'
            ? 'Booking link not found'
            : status === 'inactive'
              ? 'This booking link is inactive'
              : "Couldn't load this booking link"}
        </h1>
        <p className="text-xs text-[var(--quant-muted-foreground)] leading-relaxed">
          {message || 'This booking link could not be loaded.'}
        </p>
        <p className="text-[11px] text-[#5E6472] leading-relaxed">
          {status === 'not-found'
            ? 'Double-check the URL — the link may have been deleted. Ask the host for a fresh one.'
            : status === 'inactive'
              ? 'The host has paused or disabled this link. Ask them for a new one.'
              : 'Nothing was booked — your details were never sent. Check your connection and try again.'}
        </p>
      </div>
      {status === 'not-found' ? (
        <div className="flex flex-col items-center gap-3 pt-1">
          <button type="button" onClick={onGoBack} className={PRIMARY_ACTION_CLASS}>
            Go back
          </button>
          <a
            href="/"
            className="text-xs text-[var(--quant-muted-foreground)] hover:text-white underline transition-colors"
          >
            Open QuantMail
          </a>
        </div>
      ) : (
        <button type="button" onClick={onRetry} className={PRIMARY_ACTION_CLASS}>
          Try again
        </button>
      )}
    </div>
  );
}

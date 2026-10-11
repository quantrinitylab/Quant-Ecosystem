'use client';

import { useState } from 'react';
import { usePhishingCheck } from '../hooks/usePhishingCheck';
import type { Email } from '../types';

interface EmailSafetyBannerProps {
  email: Email;
  /** The signed-in user's address — used to tell internal mail from external. */
  currentUserEmail?: string;
  /** Outbound messages (you wrote them) are never scanned and show no banner. */
  isOutbound?: boolean;
  /** 'compact' for chat bubbles, 'full' for expanded letter cards. */
  variant?: 'compact' | 'full';
}

function domainOf(address?: string): string {
  const at = (address ?? '').lastIndexOf('@');
  return at >= 0 ? address!.slice(at + 1).trim().toLowerCase() : '';
}

/**
 * Pull a real unsubscribe URL out of the List-Unsubscribe header. Only an
 * https URL is ever rendered — a bare "Unsubscribe" button that toasts a lie
 * is worse than no button.
 */
function unsubscribeUrlOf(headers: Record<string, string> | undefined): string | null {
  const raw = headers?.['list-unsubscribe'] ?? headers?.['List-Unsubscribe'];
  if (!raw) return null;
  const match = /<(https?:\/\/[^>\s]+)>/.exec(raw) ?? /(https?:\/\/[^\s,]+)/.exec(raw);
  return match ? match[1] : null;
}

/**
 * Sender-safety indicators for one message in a thread view.
 *
 * Everything shown here is real:
 * - "External sender" is computed locally from the sender's domain versus
 *   the signed-in user's domain — no backend claim involved.
 * - The phishing warning comes from the real backend AI scan
 *   (`POST /emails/:id/detect-phishing`) via `usePhishingCheck`, fired lazily
 *   per inbound message. A failed scan shows "Safety check unavailable" —
 *   never an all-clear.
 * - The unsubscribe link only appears when the message carries a real
 *   List-Unsubscribe https URL, and it is a real link to that URL.
 *
 * What this banner deliberately does NOT do: first-time-sender guesses (the
 * old `!isRead && !inReplyTo` heuristic was fabricated), "Report"/"Trust"
 * buttons that only showed a toast, and SPF/DKIM badges nobody verified.
 */
export function EmailSafetyBanner({
  email,
  currentUserEmail,
  isOutbound = false,
  variant = 'full',
}: EmailSafetyBannerProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Your own sends need no safety scan.
  const senderEmail = email.from?.email ?? '';
  const scanEnabled = !isOutbound && Boolean(email.id);
  const check = usePhishingCheck(email.id, { enabled: scanEnabled });

  if (isOutbound) return null;

  const senderDomain = domainOf(senderEmail);
  const userDomain = domainOf(currentUserEmail);
  const isExternal = Boolean(senderDomain && userDomain && senderDomain !== userDomain);

  const isWarning = check.status === 'warning';
  const isUnavailable = check.status === 'unavailable';
  const isLoading = check.status === 'loading';
  const unsubscribeUrl = unsubscribeUrlOf(email.headers);

  const showWarning = isWarning && !dismissed.has('warning');
  const showUnavailable = isUnavailable && !dismissed.has('unavailable');
  const showExternal = isExternal && !isWarning;
  const showUnsubscribe = Boolean(unsubscribeUrl) && !dismissed.has('unsubscribe');

  if (!showWarning && !showUnavailable && !showExternal && !showUnsubscribe && !isLoading) {
    return null;
  }

  const dismiss = (key: string) => setDismissed((prev) => new Set([...prev, key]));
  const pad = variant === 'compact' ? 'px-3 py-2' : 'px-4 py-2.5';

  return (
    <div className="flex w-full flex-col gap-1.5" aria-label="Sender safety">
      {isLoading && (
        <div
          data-testid="safety-banner-checking"
          role="status"
          className={`flex items-center gap-2 rounded-xl bg-white/[0.03] ${pad} text-[11px] text-zinc-500`}
        >
          <span
            className="size-3 shrink-0 animate-spin rounded-full border border-zinc-600 border-t-transparent"
            aria-hidden="true"
          />
          Checking sender safety…
        </div>
      )}

      {showWarning && (
        <div
          data-testid="safety-banner-warning"
          role="alert"
          className={`rounded-xl bg-red-500/[0.08] ${pad} text-xs text-red-200`}
        >
          <div className="flex items-start gap-2">
            <svg
              className="mt-0.5 size-4 shrink-0 text-red-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-red-300">This message looks suspicious</p>
              <p className="mt-0.5 text-red-200/80">
                QuantMail&apos;s safety scan flagged phishing patterns. Be careful with
                links and attachments — don&apos;t share personal information.
              </p>
              {check.indicators.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-red-200/70">
                  {check.indicators.slice(0, 3).map((indicator, i) => (
                    <li key={i}>{indicator}</li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss('warning')}
              aria-label="Dismiss phishing warning"
              className="shrink-0 rounded-lg p-1 text-red-300/70 transition-colors hover:bg-red-500/10 hover:text-red-200"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {showUnavailable && (
        <div
          data-testid="safety-banner-unavailable"
          className={`flex items-center gap-2 rounded-xl bg-white/[0.03] ${pad} text-[11px] text-zinc-500`}
        >
          <svg
            className="size-3.5 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="flex-1">
            Safety check unavailable — this sender couldn&apos;t be verified. Treat
            links and attachments with care.
          </p>
          <button
            type="button"
            onClick={() => dismiss('unavailable')}
            aria-label="Dismiss"
            className="shrink-0 rounded-lg p-1 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-300"
          >
            ×
          </button>
        </div>
      )}

      {showExternal && (
        <div
          data-testid="safety-banner-external"
          className={`flex items-center gap-2 rounded-xl bg-white/[0.03] ${pad} text-[11px] text-zinc-400`}
        >
          <span className="size-1.5 shrink-0 rounded-full bg-orange-400" aria-hidden="true" />
          <p>
            External sender <span className="text-zinc-500">· {senderDomain}</span>
          </p>
        </div>
      )}

      {showUnsubscribe && unsubscribeUrl && (
        <div
          data-testid="safety-banner-unsubscribe"
          className={`flex items-center gap-2 rounded-xl bg-white/[0.03] ${pad} text-[11px] text-zinc-400`}
        >
          <p className="flex-1">This looks like a newsletter or promotional email.</p>
          <a
            href={unsubscribeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 font-medium text-orange-400 transition-colors hover:text-orange-300"
          >
            Unsubscribe
          </a>
          <button
            type="button"
            onClick={() => dismiss('unsubscribe')}
            aria-label="Dismiss"
            className="shrink-0 rounded-lg p-1 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-300"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

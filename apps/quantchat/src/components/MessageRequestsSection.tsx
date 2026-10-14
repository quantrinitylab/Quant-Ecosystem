'use client';

// ============================================================================
// QuantChat — Message Requests section (QC-F-321)
// ============================================================================
// Pending first-contact requests on the chat list. Presentational by
// contract: the page fetches (useMessageRequests) and owns the actions;
// this component only renders what it is given, so it can be tested with
// canned props. Honesty rules:
//   - zero requests and no error -> renders NOTHING (no empty section,
//     no fabricated badge, no "0 requests" strip);
//   - a load error renders an honest "couldn't load" strip with Retry —
//     an error is never disguised as an empty inbox;
//   - Decline and Block are two-step (inline confirm): a single stray tap
//     never makes the terminal decision;
//   - Block runs FIRST and only on its success is Decline also called —
//     if the block fails, the row shows the error and NO decline is sent
//     (the user must never believe a block happened when only a decline
//     did).

import { useState } from 'react';
import type { MessageRequestInboxView } from '../types';

export interface MessageRequestsSectionProps {
  requests: MessageRequestInboxView[];
  isLoading: boolean;
  error: Error | null;
  onAccept: (id: string) => void | Promise<void>;
  onDecline: (id: string) => void | Promise<void>;
  onBlock: (senderId: string) => void | Promise<void>;
  onRetry: () => void;
  acceptingId: string | null;
  decliningId: string | null;
}

function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  if (diffSec < 30) return 'just now';
  if (diffMin < 1) return `${diffSec}s`;
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHour < 24) return `${diffHour}h`;
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

type ConfirmKind = 'decline' | 'block' | null;

export default function MessageRequestsSection(props: MessageRequestsSectionProps) {
  const { requests, error, onAccept, onDecline, onBlock, onRetry, acceptingId, decliningId } =
    props;
  const [confirmFor, setConfirmFor] = useState<{ id: string; kind: ConfirmKind }>({
    id: '',
    kind: null,
  });
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [blockingId, setBlockingId] = useState<string | null>(null);

  if (error) {
    return (
      <section aria-label="Message requests" className="px-3 py-2">
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-700">
            Message requests couldn&rsquo;t load
          </p>
          <button
            onClick={onRetry}
            className="mt-1 text-sm font-medium text-red-700 underline"
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  if (requests.length === 0) return null;

  const handleBlockConfirm = async (request: MessageRequestInboxView) => {
    setBlockingId(request.id);
    setRowError(null);
    try {
      await onBlock(request.sender.id);
    } catch {
      setRowError({ id: request.id, message: 'Could not block this user. Try again.' });
      setBlockingId(null);
      setConfirmFor({ id: '', kind: null });
      return;
    }
    setBlockingId(null);
    setConfirmFor({ id: '', kind: null });
    // Block succeeded — only now also decline, so the request leaves the
    // inbox and the pair is terminally closed.
    await onDecline(request.id);
  };

  const handleDeclineConfirm = async (request: MessageRequestInboxView) => {
    setConfirmFor({ id: '', kind: null });
    await onDecline(request.id);
  };

  return (
    <section aria-label="Message requests" className="px-3 py-2">
      <h2 className="px-1 pb-2 text-sm font-semibold text-[var(--quant-foreground)]">
        Message requests
      </h2>
      <div className="space-y-2">
        {requests.map((request) => {
          const name = request.sender.displayName || request.sender.username || 'Unknown contact';
          const isConfirming = confirmFor.id === request.id && confirmFor.kind !== null;
          const busy =
            acceptingId === request.id || decliningId === request.id || blockingId === request.id;
          return (
            <div
              key={request.id}
              className="rounded-2xl border border-gray-200 bg-white px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div
                  aria-hidden
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-sm font-semibold text-white"
                >
                  {name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-[var(--quant-foreground)]">{name}</p>
                  <p className="text-xs text-gray-500">
                    @{request.sender.username} · {formatRelativeTime(request.createdAt)}
                  </p>
                </div>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-gray-700">{request.firstMessage}</p>

              {rowError?.id === request.id && (
                <p role="alert" className="mt-2 text-sm text-red-600">
                  {rowError.message}
                </p>
              )}

              {isConfirming ? (
                <div className="mt-3">
                  <p className="text-sm text-gray-700">
                    {confirmFor.kind === 'decline'
                      ? "Decline this request? They won't be able to send another."
                      : 'Block this user? They will no longer be able to contact you, and this request will be declined.'}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      disabled={busy}
                      onClick={() =>
                        void (confirmFor.kind === 'block'
                          ? handleBlockConfirm(request)
                          : handleDeclineConfirm(request))
                      }
                      className="rounded-full bg-red-500 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {confirmFor.kind === 'decline' ? 'Confirm decline' : 'Confirm block'}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => setConfirmFor({ id: '', kind: null })}
                      className="rounded-full bg-gray-100 px-4 py-1.5 text-sm font-medium text-gray-700 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <button
                    disabled={busy}
                    onClick={() => void onAccept(request.id)}
                    className="rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => setConfirmFor({ id: request.id, kind: 'decline' })}
                    className="rounded-full bg-gray-100 px-4 py-1.5 text-sm font-medium text-gray-700 disabled:opacity-50"
                  >
                    Decline
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => setConfirmFor({ id: request.id, kind: 'block' })}
                    className="rounded-full bg-gray-100 px-4 py-1.5 text-sm font-medium text-red-600 disabled:opacity-50"
                  >
                    Block
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

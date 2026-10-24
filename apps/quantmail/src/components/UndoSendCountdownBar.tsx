'use client';

import React, {
  createContext,
  useContext,
  useRef,
  useEffect,
  useCallback,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

export const UNDO_SEND_COUNTDOWN_SEC = 10;
export const MESSAGE_SENT_DISPLAY_MS = 2000;

export interface QueueSendOptions {
  emailId?: string;
  to: string;
  subject?: string;
  body?: string;
  /**
   * ISO timestamp of a scheduled send — carried into POST /emails/:id/send
   * as `{ sendAt }` (the backend 400s past times; the ScheduleSendModal
   * rejects them client-side as PR #908's convention).
   *
   * Recall-window interplay (explicit decision): a scheduled send goes
   * through the SAME 10-second recall window as a regular send — it does
   * NOT bypass it. During the window nothing has been delivered (the API
   * call only exists inside the caller's `onSendNow`), so Undo genuinely
   * cancels the schedule before it exists server-side. A scheduled send
   * therefore can neither be silently cancelled (undo shows a toast and
   * restores the draft visibly) nor double-sent (flush/sendNow fire the
   * queued item exactly once; the duplicate guard below dedupes identical
   * queueSends, and the countdown expiry flushes exactly once).
   */
  scheduledAt?: string;
  /**
   * Honest success copy for the bar's 'sent' state. Defaults to
   * "Message sent!" — a scheduled send passes "Email scheduled!" so the
   * bar never claims a delivery that is really a future schedule.
   */
  successLabel?: string;
  /**
   * Runs the real send once the recall window closes (countdown expiry or
   * Send Now). MUST resolve only after the send truly completed — the bar
   * claims "Message sent!" only on resolve. Reject (or throw) on failure so
   * the bar never celebrates a send that never happened (silent-loss fix).
   */
  onSendNow?: () => Promise<void>;
  /**
   * Optional failure hook, called when `onSendNow` rejects: show an honest
   * error and hand the words back. When absent the manager falls back to
   * `onUndo`, which restores the caller's draft by contract.
   */
  onSendFailed?: (error: unknown) => void | Promise<void>;
  onUndo?: () => void | Promise<void>;
}

export interface PendingSendItem extends QueueSendOptions {
  id: string;
  queuedAt: number;
}

/**
 * 'sending' = the recall window closed and the real send is in flight. The
 * bar keeps its countdown look (no Undo button — there is nothing left to
 * recall) until the promise settles into 'sent' or the failure path.
 */
export type UndoSendStatus = 'idle' | 'counting' | 'sending' | 'sent';

export interface UndoSendState {
  pendingItem: PendingSendItem | null;
  remainingSeconds: number;
  progressPercent: number;
  status: UndoSendStatus;
}

export interface UndoSendContextValue extends UndoSendState {
  queueSend: (options: QueueSendOptions) => void;
  undoSend: () => void;
  sendNow: () => void;
}

/**
 * Headless Manager for the 10-Second Undo-Send lifecycle.
 * Manages timing precision, countdown intervals, auto-flush, and keyboard shortcuts.
 */
export class UndoSendManager {
  private state: UndoSendState;
  private listeners: Set<() => void> = new Set();
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private sentTimer: ReturnType<typeof setTimeout> | null = null;
  private countdownDurationSec: number;
  private sentDisplayDurationMs: number;

  constructor(options?: { countdownDurationSec?: number; sentDisplayDurationMs?: number }) {
    this.countdownDurationSec = options?.countdownDurationSec ?? UNDO_SEND_COUNTDOWN_SEC;
    this.sentDisplayDurationMs = options?.sentDisplayDurationMs ?? MESSAGE_SENT_DISPLAY_MS;

    this.state = {
      pendingItem: null,
      remainingSeconds: this.countdownDurationSec,
      progressPercent: 100,
      status: 'idle',
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.handleKeyDown);
    }
  }

  public getState = (): UndoSendState => {
    return this.state;
  };

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  private clearTimers() {
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.sentTimer !== null) {
      clearTimeout(this.sentTimer);
      this.sentTimer = null;
    }
  }

  public queueSend = (options: QueueSendOptions): void => {
    // Duplicate-send guard: if the recall window is still open for the exact
    // same content (same to/subject/body), a second Send press (double-click,
    // Cmd+Enter x2, or restore-badge -> Send) is a no-op. Returning here keeps
    // the existing countdown untouched — no flush, no requeue, no double
    // delivery. scheduledAt joins the identity: the same content scheduled
    // for a DIFFERENT time is a genuinely different send and must NOT dedupe.
    if (this.state.pendingItem && this.state.status === 'counting') {
      const pending = this.state.pendingItem;
      if (
        options.to === pending.to &&
        options.subject === pending.subject &&
        options.body === pending.body &&
        options.scheduledAt === pending.scheduledAt
      ) {
        return;
      }
    }

    // If a previous email was already in queue, flush it immediately before replacing.
    // A flushed send that FAILS must run the flushed item's failure hook
    // (onSendFailed, else its onUndo restore) — swallowing the rejection
    // here used to leave the caller's optimistic "Sending…" bubble lingering
    // forever and the words never restored to the box, because no other
    // path ever ran the hook for a replaced item. The hook runs WITHOUT
    // touching manager state: the new item owns the bar from here, and the
    // callers' restore paths are guarded against clobbering a newer draft
    // (ThreadComposer.restoreDraft only fills an empty box). This is
    // deliberately NOT handleSendFailure: that method early-returns when
    // the item is no longer the pending item, which is exactly the state
    // a flushed-then-replaced item is in.
    if (this.state.pendingItem && this.state.status === 'counting') {
      const previous = this.state.pendingItem;
      try {
        Promise.resolve(previous.onSendNow?.()).catch((error: unknown) => {
          void this.handleFlushedSendFailure(previous, error);
        });
      } catch (err) {
        // A synchronous throw from onSendNow is a send failure too — it
        // takes the same failure-hook path as an async rejection.
        void this.handleFlushedSendFailure(previous, err);
      }
    }

    this.clearTimers();

    const id = options.emailId || `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const startTime = Date.now();
    const totalDurationMs = this.countdownDurationSec * 1000;

    const item: PendingSendItem = {
      ...options,
      id,
      queuedAt: startTime,
    };

    this.state = {
      pendingItem: item,
      remainingSeconds: this.countdownDurationSec,
      progressPercent: 100,
      status: 'counting',
    };
    this.notify();

    const intervalTickMs = 50;
    this.countdownTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remainingMs = Math.max(0, totalDurationMs - elapsed);
      const nextSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
      const nextPercent = Math.max(0, (remainingMs / totalDurationMs) * 100);

      this.state = {
        ...this.state,
        remainingSeconds: nextSeconds,
        progressPercent: nextPercent,
      };
      this.notify();

      if (remainingMs <= 0) {
        this.clearTimers();

        // The recall window closed — run the real send. 'sent' is claimed
        // only when its promise resolves; a rejection takes the honest
        // failure path instead (never "Message sent!" for a lost send).
        const currentItem = this.state.pendingItem;
        if (currentItem) {
          this.flushSend(currentItem);
        }
      }
    }, intervalTickMs);
  };

  /**
   * Run the queued item's real send. The bar moves to 'sending' while the
   * promise is in flight and claims "sent" only on resolve. On reject the
   * bar never celebrates: the caller's failure hook (or its undo/restore
   * path) runs and the bar goes quiet.
   */
  private flushSend = (item: PendingSendItem): void => {
    // The recall window is closed from here — the send is committed. The bar
    // keeps its countdown look while the promise settles, minus the action
    // buttons (there is nothing left to recall or re-flush).
    this.state = {
      ...this.state,
      remainingSeconds: 0,
      progressPercent: 0,
      status: 'sending',
    };
    this.notify();

    let sendPromise: Promise<void>;
    try {
      // Invoked synchronously, exactly like the old fire-and-forget call —
      // only the *claim* of success is now gated on the returned promise.
      // Promise.resolve() also turns a synchronous throw into a rejection,
      // so sync and async failures share one honest path.
      sendPromise = Promise.resolve(item.onSendNow?.());
    } catch (err) {
      sendPromise = Promise.reject(err);
    }

    sendPromise.then(
      () => this.markSent(item),
      (error: unknown) => {
        void this.handleSendFailure(item, error);
      },
    );
  };

  private markSent = (item: PendingSendItem): void => {
    // Only celebrate the item still on screen — a newer queueSend (or an
    // undo) may have replaced it while the promise was in flight.
    if (this.state.pendingItem?.id !== item.id) return;

    this.state = {
      ...this.state,
      remainingSeconds: 0,
      progressPercent: 0,
      status: 'sent',
    };
    this.notify();

    this.sentTimer = setTimeout(() => {
      if (this.state.pendingItem?.id !== item.id) return;
      this.state = {
        pendingItem: null,
        remainingSeconds: this.countdownDurationSec,
        progressPercent: 100,
        status: 'idle',
      };
      this.notify();
    }, this.sentDisplayDurationMs);
  };

  /**
   * Failure path for a send flushed by a newer queueSend. Unlike
   * handleSendFailure this must NOT check (or mutate) manager state: the
   * flushed item is no longer pending — the new item is — so a state
   * guard would skip the hook entirely, which was the original bug. The
   * hook itself (withdraw the optimistic bubble, restore the words) is
   * the whole point; a restore-path error must never mask the original
   * send failure, so it is swallowed here, not the failure itself.
   */
  private handleFlushedSendFailure = async (
    item: PendingSendItem,
    error: unknown,
  ): Promise<void> => {
    try {
      if (item.onSendFailed) {
        await item.onSendFailed(error);
      } else {
        await item.onUndo?.();
      }
    } catch {
      // A restore-path error must never mask the original send failure.
    }
  };

  private handleSendFailure = async (item: PendingSendItem, error: unknown): Promise<void> => {
    // The send never completed — the bar must never claim "sent". Hand the
    // words back through the caller's failure hook, or its undo/restore
    // path when it has no dedicated hook, then go quiet.
    if (this.state.pendingItem?.id !== item.id) return;
    try {
      if (item.onSendFailed) {
        await item.onSendFailed(error);
      } else {
        await item.onUndo?.();
      }
    } catch {
      // A restore-path error must never mask the original send failure.
    }
    if (this.state.pendingItem?.id !== item.id) return;
    this.state = {
      pendingItem: null,
      remainingSeconds: this.countdownDurationSec,
      progressPercent: 100,
      status: 'idle',
    };
    this.notify();
  };

  public sendNow = (): void => {
    const currentItem = this.state.pendingItem;
    if (!currentItem) return;
    // Already flushing (or already celebrated) — never fire the send twice.
    if (this.state.status !== 'counting') return;

    this.clearTimers();
    this.flushSend(currentItem);
  };

  public undoSend = (): void => {
    const currentItem = this.state.pendingItem;
    if (!currentItem) return;
    // The recall window is the countdown only. Once it closes the send is
    // committed ('sending') — undoing then would hand the words back for a
    // message that already went out, inviting a duplicate re-send.
    if (this.state.status !== 'counting') return;

    this.clearTimers();

    try {
      currentItem.onUndo?.();
    } catch {
      // Silently ignore onUndo callback execution errors
    }

    this.state = {
      pendingItem: null,
      remainingSeconds: this.countdownDurationSec,
      progressPercent: 100,
      status: 'idle',
    };
    this.notify();
  };

  private handleKeyDown = (event: KeyboardEvent) => {
    if (this.state.status !== 'counting') return;

    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    ) {
      return;
    }

    if (event.key === 'z' || event.key === 'Z') {
      event.preventDefault?.();
      this.undoSend();
    }
  };

  public destroy(): void {
    this.clearTimers();
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.handleKeyDown);
    }
    this.listeners.clear();
  }
}

export const UndoSendContext = createContext<UndoSendContextValue | null>(null);

export function useUndoSend(): UndoSendContextValue {
  const context = useContext(UndoSendContext);
  if (!context) {
    throw new Error('useUndoSend must be used within an UndoSendProvider');
  }
  return context;
}

export interface UndoSendProviderProps {
  children: ReactNode;
  /** Optional custom UndoSendManager instance */
  manager?: UndoSendManager;
  /** Custom countdown duration in seconds (default 10s) */
  countdownDurationSec?: number;
  /** Custom sent confirmation display in ms (default 2000ms) */
  sentDisplayDurationMs?: number;
}

export function UndoSendProvider({
  children,
  manager: customManager,
  countdownDurationSec = UNDO_SEND_COUNTDOWN_SEC,
  sentDisplayDurationMs = MESSAGE_SENT_DISPLAY_MS,
}: UndoSendProviderProps) {
  const existingContext = useContext(UndoSendContext);
  if (existingContext && !customManager) {
    return <>{children}</>;
  }

  const managerRef = useRef<UndoSendManager | null>(null);
  if (!managerRef.current) {
    managerRef.current =
      customManager ||
      new UndoSendManager({
        countdownDurationSec,
        sentDisplayDurationMs,
      });
  }

  const manager = managerRef.current;
  const state = useSyncExternalStore(manager.subscribe, manager.getState, manager.getState);

  useEffect(() => {
    return () => {
      if (!customManager) {
        managerRef.current?.destroy();
      }
    };
  }, [customManager]);

  const value: UndoSendContextValue = {
    ...state,
    queueSend: manager.queueSend,
    undoSend: manager.undoSend,
    sendNow: manager.sendNow,
  };

  return (
    <UndoSendContext.Provider value={value}>
      {children}
      <UndoSendCountdownBar />
    </UndoSendContext.Provider>
  );
}

export interface UndoSendCountdownBarProps {
  /** Optional override if rendered standalone outside UndoSendProvider */
  pendingItem?: PendingSendItem | null;
  remainingSeconds?: number;
  progressPercent?: number;
  status?: UndoSendStatus;
  onUndo?: () => void;
  onSendNow?: () => void;
  className?: string;
}

export function UndoSendCountdownBar(props: UndoSendCountdownBarProps) {
  const context = useContext(UndoSendContext);

  const pendingItem =
    props.pendingItem !== undefined ? props.pendingItem : (context?.pendingItem ?? null);
  const remainingSeconds =
    props.remainingSeconds !== undefined
      ? props.remainingSeconds
      : (context?.remainingSeconds ?? 10);
  const progressPercent =
    props.progressPercent !== undefined ? props.progressPercent : (context?.progressPercent ?? 100);
  const status = props.status !== undefined ? props.status : (context?.status ?? 'idle');

  const handleUndo = useCallback(() => {
    if (props.onUndo) {
      props.onUndo();
    } else if (context) {
      context.undoSend();
    }
  }, [props, context]);

  const handleSendNow = useCallback(() => {
    if (props.onSendNow) {
      props.onSendNow();
    } else if (context) {
      context.sendNow();
    }
  }, [props, context]);

  // If status is idle or no pending item, return null
  if (status === 'idle' || !pendingItem) {
    return null;
  }

  // A scheduled send rides the same recall window — keep the copy honest at
  // every state: "Scheduling…" while it can still be undone, the caller's
  // successLabel (default "Message sent!") once the window closes.
  const actionWord = pendingItem.scheduledAt ? 'Scheduling' : 'Sending';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="undo-send-bar"
      className={`fixed bottom-[76px] sm:bottom-6 left-4 right-4 sm:left-auto sm:right-6 z-50 flex flex-col min-w-0 sm:min-w-[320px] max-w-[calc(100vw-3rem)] sm:max-w-md bg-[#18181B] border border-[#27272A] rounded-xl shadow-2xl shadow-black/70 p-3.5 text-white transition-all duration-200 select-none ${props.className || ''}`}
    >
      {status === 'counting' && (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <span className="flex h-2 w-2 relative shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--quant-primary)] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--quant-primary)]" />
              </span>
              <p
                data-testid="undo-send-text"
                className="text-xs sm:text-sm font-medium text-[#F4F4F5] truncate"
              >
                {actionWord} message to&nbsp;
                <span className="font-semibold text-white">{pendingItem.to}</span>
                {`... (${remainingSeconds}s)`}
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                data-testid="undo-button"
                onClick={handleUndo}
                className="px-2.5 py-1 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-xs font-semibold rounded-md bg-[var(--quant-primary)]/15 text-[var(--quant-primary)] hover:bg-[var(--quant-primary)]/25 border border-[var(--quant-primary)]/30 transition-colors focus:outline-none focus:ring-1 focus:ring-[var(--quant-primary)]"
                title="Undo send (Press Z)"
              >
                Undo (Z)
              </button>
              <button
                type="button"
                data-testid="send-now-button"
                onClick={handleSendNow}
                className="px-2.5 py-1 text-xs font-medium rounded-md bg-[#27272A] text-[#E4E4E7] hover:bg-[#3F3F46] hover:text-white transition-colors focus:outline-none focus:ring-1 focus:ring-zinc-400"
              >
                Send Now
              </button>
            </div>
          </div>

          {/* Animated Countdown Progress Bar Line (Shrinking from 100% to 0% over 10 seconds) */}
          <div
            role="progressbar"
            aria-valuenow={remainingSeconds}
            aria-valuemin={0}
            aria-valuemax={10}
            className="w-full h-1 bg-[#27272A] rounded-full overflow-hidden mt-2.5"
          >
            <div
              data-testid="undo-send-progress"
              className="h-full bg-gradient-to-r from-[var(--quant-primary)] to-[#FFA768] rounded-full transition-all duration-75 ease-linear"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </>
      )}

      {/* The recall window closed and the real send is in flight: same look,
          but no Undo / Send Now — there is nothing left to recall or flush.
          'sent' is claimed only when the send promise resolves. */}
      {status === 'sending' && (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <span className="flex h-2 w-2 relative shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--quant-primary)] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--quant-primary)]" />
              </span>
              <p
                data-testid="undo-send-text"
                className="text-xs sm:text-sm font-medium text-[#F4F4F5] truncate"
              >
                {actionWord} message to&nbsp;
                <span className="font-semibold text-white">{pendingItem.to}</span>
                ...
              </p>
            </div>
          </div>

          <div
            role="progressbar"
            aria-valuenow={0}
            aria-valuemin={0}
            aria-valuemax={10}
            className="w-full h-1 bg-[#27272A] rounded-full overflow-hidden mt-2.5"
          >
            <div
              data-testid="undo-send-progress"
              className="h-full bg-gradient-to-r from-[var(--quant-primary)] to-[#FFA768] rounded-full transition-all duration-75 ease-linear"
              style={{ width: '0%' }}
            />
          </div>
        </>
      )}

      {status === 'sent' && (
        <div data-testid="undo-send-sent" className="flex items-center gap-2.5 py-0.5">
          <svg
            className="size-4 text-emerald-400 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="text-xs sm:text-sm font-medium text-emerald-400">
            {pendingItem.successLabel ?? 'Message sent!'}
          </span>
        </div>
      )}
    </div>
  );
}

export default UndoSendCountdownBar;

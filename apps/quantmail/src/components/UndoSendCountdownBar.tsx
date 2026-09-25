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
  onSendNow?: () => void | Promise<void>;
  onUndo?: () => void | Promise<void>;
}

export interface PendingSendItem extends QueueSendOptions {
  id: string;
  queuedAt: number;
}

export type UndoSendStatus = 'idle' | 'counting' | 'sent';

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
    // If a previous email was already in queue, flush it immediately before replacing
    if (this.state.pendingItem && this.state.status === 'counting') {
      try {
        this.state.pendingItem.onSendNow?.();
      } catch (err) {
        console.error('[UndoSendManager] Error flushing previous message:', err);
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

        // Trigger onSendNow automatically
        const currentItem = this.state.pendingItem;
        try {
          currentItem?.onSendNow?.();
        } catch (err) {
          console.error('[UndoSendManager] Error in automatic onSendNow:', err);
        }

        this.state = {
          ...this.state,
          remainingSeconds: 0,
          progressPercent: 0,
          status: 'sent',
        };
        this.notify();

        this.sentTimer = setTimeout(() => {
          this.state = {
            pendingItem: null,
            remainingSeconds: this.countdownDurationSec,
            progressPercent: 100,
            status: 'idle',
          };
          this.notify();
        }, this.sentDisplayDurationMs);
      }
    }, intervalTickMs);
  };

  public sendNow = (): void => {
    const currentItem = this.state.pendingItem;
    if (!currentItem) return;

    this.clearTimers();

    try {
      currentItem.onSendNow?.();
    } catch (err) {
      console.error('[UndoSendManager] Error in onSendNow callback:', err);
    }

    this.state = {
      ...this.state,
      remainingSeconds: 0,
      progressPercent: 0,
      status: 'sent',
    };
    this.notify();

    this.sentTimer = setTimeout(() => {
      this.state = {
        pendingItem: null,
        remainingSeconds: this.countdownDurationSec,
        progressPercent: 100,
        status: 'idle',
      };
      this.notify();
    }, this.sentDisplayDurationMs);
  };

  public undoSend = (): void => {
    const currentItem = this.state.pendingItem;
    if (!currentItem) return;

    this.clearTimers();

    try {
      currentItem.onUndo?.();
    } catch (err) {
      console.error('[UndoSendManager] Error in onUndo callback:', err);
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

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="undo-send-bar"
      className={`fixed bottom-6 right-6 z-50 flex flex-col min-w-[320px] max-w-md bg-[#18181B] border border-[#27272A] rounded-xl shadow-2xl shadow-black/70 p-3.5 text-white transition-all duration-200 select-none ${props.className || ''}`}
    >
      {status === 'counting' && (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <span className="flex h-2 w-2 relative shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF8C42] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF8C42]" />
              </span>
              <p
                data-testid="undo-send-text"
                className="text-xs sm:text-sm font-medium text-[#F4F4F5] truncate"
              >
                Sending message to{' '}
                <span className="font-semibold text-white">{pendingItem.to}</span>... (
                {remainingSeconds}s)
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                data-testid="undo-button"
                onClick={handleUndo}
                className="px-2.5 py-1 text-xs font-semibold rounded-md bg-[#FF8C42]/15 text-[#FF8C42] hover:bg-[#FF8C42]/25 border border-[#FF8C42]/30 transition-colors focus:outline-none focus:ring-1 focus:ring-[#FF8C42]"
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
              className="h-full bg-gradient-to-r from-[#FF8C42] to-[#FFA768] rounded-full transition-all duration-75 ease-linear"
              style={{ width: `${progressPercent}%` }}
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
          <span className="text-xs sm:text-sm font-medium text-emerald-400">Message sent!</span>
        </div>
      )}
    </div>
  );
}

export default UndoSendCountdownBar;

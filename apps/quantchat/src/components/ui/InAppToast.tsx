'use client';

// ============================================================================
// QuantChat - In-App Toast + Foreground Suppression (Task 10.8)
//
// When the app is in the foreground (document.visibilityState === 'visible'),
// browser-level push notifications are suppressed and an in-app toast is shown
// instead (Req 9.10). This file provides:
//
//   - toastManager       : framework-agnostic pub/sub store of active toasts
//   - showInAppToast()   : imperatively push a toast
//   - shouldSuppressBrowserPush() : true when the document is visible
//   - handleForegroundPush(): suppress + toast when visible, else let push pass
//   - <InAppToastContainer/> : renders the active toasts (mount once near root)
//
// The toast manager is deliberately decoupled from React so non-component code
// (service-worker message handlers, push pipeline) can trigger toasts.
// ============================================================================

import React, { useEffect, useState } from 'react';
import { resolveDeepLink } from '../../lib/notification-deeplink';
import type { NotificationCategory } from '../../lib/notification-deeplink';

export interface InAppToast {
  id: string;
  title: string;
  body: string;
  category?: NotificationCategory | string;
  /** Route to navigate to when the toast is tapped. */
  deepLink?: string;
  /** Auto-dismiss after this many ms. Default 5000. 0 disables auto-dismiss. */
  durationMs?: number;
}

export interface ForegroundPushInput {
  title: string;
  body: string;
  category?: NotificationCategory | string;
  contentId?: string;
  deepLink?: string;
  durationMs?: number;
}

type ToastListener = (toasts: InAppToast[]) => void;

// ---------------------------------------------------------------------------
// Toast manager (singleton pub/sub store)
// ---------------------------------------------------------------------------
class ToastManager {
  private toasts: InAppToast[] = [];
  private listeners = new Set<ToastListener>();
  private counter = 0;

  subscribe(listener: ToastListener): () => void {
    this.listeners.add(listener);
    listener(this.toasts);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getToasts(): InAppToast[] {
    return this.toasts;
  }

  show(toast: Omit<InAppToast, 'id'> & { id?: string }): string {
    this.counter += 1;
    const id = toast.id ?? `toast-${Date.now()}-${this.counter}`;
    const next: InAppToast = { durationMs: 5000, ...toast, id };
    this.toasts = [...this.toasts, next];
    this.emit();
    return id;
  }

  dismiss(id: string): void {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.emit();
  }

  clear(): void {
    this.toasts = [];
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.toasts);
    }
  }
}

export const toastManager = new ToastManager();

/** Imperatively show an in-app toast. Returns the toast id. */
export function showInAppToast(toast: Omit<InAppToast, 'id'>): string {
  return toastManager.show(toast);
}

// ---------------------------------------------------------------------------
// Foreground suppression (Req 9.10)
// ---------------------------------------------------------------------------

/** True when the page is currently visible (foreground). */
export function shouldSuppressBrowserPush(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'visible';
}

/**
 * Decide how to surface an incoming push while the page is in the foreground.
 * When visible: suppress the browser notification and show an in-app toast,
 * returning { suppressed: true }. When hidden/SSR: return { suppressed: false }
 * so the caller lets the browser-level notification through.
 */
export function handleForegroundPush(input: ForegroundPushInput): {
  suppressed: boolean;
  toastId?: string;
} {
  if (!shouldSuppressBrowserPush()) {
    return { suppressed: false };
  }

  const deepLink = input.deepLink ?? resolveDeepLink(input.category ?? 'SYSTEM', input.contentId);

  const toastId = showInAppToast({
    title: input.title,
    body: input.body,
    category: input.category,
    deepLink,
    durationMs: input.durationMs,
  });

  return { suppressed: true, toastId };
}

// ---------------------------------------------------------------------------
// React rendering
// ---------------------------------------------------------------------------

/** A single toast card. Auto-dismisses after its duration. */
function ToastCard({
  toast,
  onDismiss,
  onActivate,
}: {
  toast: InAppToast;
  onDismiss: (id: string) => void;
  onActivate: (toast: InAppToast) => void;
}) {
  useEffect(() => {
    const duration = toast.durationMs ?? 5000;
    if (duration <= 0) return undefined;
    const handle = setTimeout(() => onDismiss(toast.id), duration);
    return () => clearTimeout(handle);
  }, [toast.id, toast.durationMs, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={() => onActivate(toast)}
      className="pointer-events-auto cursor-pointer rounded-xl border border-white/10 bg-zinc-900/95 px-4 py-3 text-white shadow-lg backdrop-blur-md transition-transform hover:scale-[1.02]"
      style={{
        minWidth: '260px',
        maxWidth: '360px',
        borderRadius: '0.75rem',
        background: 'rgba(24, 24, 27, 0.95)',
        color: '#fff',
        padding: '0.75rem 1rem',
        boxShadow: '0 10px 25px rgba(0,0,0,0.35)',
        cursor: 'pointer',
      }}
    >
      <div
        className="flex items-start justify-between gap-3"
        style={{ display: 'flex', gap: '0.75rem' }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            className="text-sm font-semibold"
            style={{ fontSize: '0.875rem', fontWeight: 600, margin: 0 }}
          >
            {toast.title}
          </p>
          <p
            className="mt-0.5 text-xs text-zinc-300"
            style={{ fontSize: '0.75rem', color: '#d4d4d8', margin: '0.125rem 0 0' }}
          >
            {toast.body}
          </p>
        </div>
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(toast.id);
          }}
          className="text-zinc-400 hover:text-white"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#a1a1aa',
            cursor: 'pointer',
            fontSize: '1rem',
            lineHeight: 1,
          }}
        >
          &times;
        </button>
      </div>
    </div>
  );
}

export interface InAppToastContainerProps {
  /** Called when a toast is tapped, with its deep-link route (if any). */
  onNavigate?: (deepLink: string) => void;
}

/**
 * Renders active in-app toasts in a fixed stack. Mount once near the app root.
 * Subscribes to the shared `toastManager`, so any code calling
 * `showInAppToast` / `handleForegroundPush` will surface here.
 */
export function InAppToastContainer({ onNavigate }: InAppToastContainerProps) {
  const [toasts, setToasts] = useState<InAppToast[]>(() => toastManager.getToasts());

  useEffect(() => toastManager.subscribe(setToasts), []);

  const handleActivate = (toast: InAppToast) => {
    if (toast.deepLink && onNavigate) {
      onNavigate(toast.deepLink);
    }
    toastManager.dismiss(toast.id);
  };

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed z-[10000] flex flex-col gap-2"
      style={{
        position: 'fixed',
        top: '1rem',
        right: '1rem',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => (
        <ToastCard
          key={toast.id}
          toast={toast}
          onDismiss={(id) => toastManager.dismiss(id)}
          onActivate={handleActivate}
        />
      ))}
    </div>
  );
}

export default InAppToastContainer;

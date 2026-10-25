'use client';

/**
 * Desktop notifications, and the permission they actually depend on.
 *
 * Settings › Notifications shipped four switches — Email, Desktop Browser,
 * Sound Alerts, Direct Mentions Only — and every one of them wrote a key into
 * `quant-notifications` that nothing in the monorepo read. The desktop row was
 * the worst of them: it said "Show instant push notifications when new emails
 * arrive", it never called `Notification.requestPermission()`, and a browser
 * that had blocked notifications still showed the box happily ticked.
 *
 * So there is one control now, and this is what stands behind it. A preference
 * is not permission: the checkbox is on only when the user asked for it AND the
 * browser granted it, which means unticking it in Chrome's site settings unticks
 * it here too. `Sound Alerts` is gone because the sound belongs to the OS
 * notification, not to us, and `Email Notifications` is gone because mailing
 * someone about their mail needs a backend job that does not exist.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'quant-notify-desktop';

/**
 * Same-tab broadcast for preference writes. A `storage` event only fires in
 * OTHER tabs, so a toggle in Settings would otherwise never reach the
 * AppShell watcher in this tab until AppShell remounted — the watcher kept
 * polling after disable and stayed dead after enable. Writers notify the
 * in-process listeners AND dispatch this event; subscribers listen to both,
 * plus the cross-tab `storage` event, so every surface reacts immediately.
 */
const DESKTOP_PREFERENCE_EVENT = 'quant-notify-desktop-changed';

type DesktopPreferenceListener = () => void;

const desktopPreferenceListeners = new Set<DesktopPreferenceListener>();

/**
 * Subscribe to preference writes made through this module (any component).
 * The returned function unsubscribes. A misbehaving listener must never
 * break the writer, so notification is exception-isolated.
 */
export function subscribeDesktopPreferenceChange(listener: DesktopPreferenceListener): () => void {
  desktopPreferenceListeners.add(listener);
  return () => {
    desktopPreferenceListeners.delete(listener);
  };
}

function notifyDesktopPreferenceChange(): void {
  for (const listener of [...desktopPreferenceListeners]) {
    try {
      listener();
    } catch {
      /* A subscriber's throw must not break the toggle that fired it. */
    }
  }
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent(DESKTOP_PREFERENCE_EVENT));
    } catch {
      /* Non-DOM runtimes (tests) have no CustomEvent; listeners above suffice. */
    }
  }
}

function readPreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writePreference(next: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  } catch {
    /* Private mode with storage denied: the preference lasts this session. */
    return;
  }
  notifyDesktopPreferenceChange();
}

/**
 * The gate every caller checks before it constructs a notification. Deliberately
 * a plain function rather than a hook, so the inbox can call it inside an effect
 * without subscribing to anything.
 */
export function desktopNotificationsAllowed(): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  return readPreference();
}

/**
 * The reactive form of `desktopNotificationsAllowed`, for long-lived
 * subscribers such as the AppShell desktop-alert watcher. The plain function
 * is only as fresh as the render that called it — AppShell does not re-render
 * when Settings toggles the preference, so a watcher built on a per-render
 * read stayed stale until navigation remounted the shell (enable path dead,
 * disable path still polling). This hook re-reads the gate whenever the
 * preference is written anywhere (same tab or another tab) and whenever the
 * tab regains focus (the browser permission may have changed in site
 * settings), so React Query's `enabled` flips in the same tick as the toggle.
 */
export function useDesktopNotificationsAllowed(): boolean {
  const subscribe = useCallback((onStoreChange: () => void) => {
    const unsubscribe = subscribeDesktopPreferenceChange(onStoreChange);
    const onWindowEvent = () => {
      onStoreChange();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onWindowEvent);
      window.addEventListener(DESKTOP_PREFERENCE_EVENT, onWindowEvent);
      window.addEventListener('focus', onWindowEvent);
    }
    return () => {
      unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', onWindowEvent);
        window.removeEventListener(DESKTOP_PREFERENCE_EVENT, onWindowEvent);
        window.removeEventListener('focus', onWindowEvent);
      }
    };
  }, []);
  return useSyncExternalStore(subscribe, desktopNotificationsAllowed, desktopNotificationsAllowed);
}

export interface DesktopNotificationInput {
  title: string;
  body: string;
  /**
   * Collapses repeats. One tag per conversation means a thread that gains three
   * messages replaces its own notification instead of stacking three.
   */
  tag: string;
  onActivate?: () => void;
}

/** Fires one notification, or returns null having done nothing. Never throws. */
export function showDesktopNotification(input: DesktopNotificationInput): Notification | null {
  if (!desktopNotificationsAllowed()) return null;
  try {
    const notification = new Notification(input.title, {
      body: input.body,
      tag: input.tag,
      icon: '/quanty-ghost.png',
    });
    if (input.onActivate) {
      notification.onclick = () => {
        window.focus();
        notification.close();
        input.onActivate?.();
      };
    }
    return notification;
  } catch {
    // Android Chrome throws here on purpose: it requires a service worker
    // registration to show one. There is no service worker yet, so on that
    // platform this feature is simply absent rather than broken.
    return null;
  }
}

export interface DesktopNotificationControl {
  /** The browser has the API at all. */
  supported: boolean;
  /** What the browser says right now, re-read on every window focus. */
  permission: NotificationPermission;
  /** Preference AND permission. This is what the checkbox renders. */
  enabled: boolean;
  /** Turning it on may open the browser's own permission prompt. */
  setEnabled: (next: boolean) => Promise<void>;
}

export function useDesktopNotifications(): DesktopNotificationControl {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [preference, setPreference] = useState(false);

  useEffect(() => {
    const available = typeof window !== 'undefined' && 'Notification' in window;
    setSupported(available);
    if (available) setPermission(Notification.permission);
    setPreference(readPreference());
    if (!available) return;

    /**
     * A permission revoked in the browser's own site settings fires no event
     * anywhere in the page, so a settings screen left open would keep claiming
     * the feature was on. Re-reading on focus is the cheapest way to be right:
     * changing that setting means leaving the tab and coming back.
     */
    const sync = () => {
      setPermission(Notification.permission);
      setPreference(readPreference());
    };
    // A toggle written anywhere else (another tab, or another component in
    // this tab) must move this checkbox too, not just the watcher.
    const unsubscribePreference = subscribeDesktopPreferenceChange(() =>
      setPreference(readPreference()),
    );
    const onStorage = () => setPreference(readPreference());
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('storage', onStorage);
    window.addEventListener(DESKTOP_PREFERENCE_EVENT, onStorage);
    return () => {
      unsubscribePreference();
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(DESKTOP_PREFERENCE_EVENT, onStorage);
    };
  }, []);

  const setEnabled = useCallback(async (next: boolean) => {
    if (!next) {
      writePreference(false);
      setPreference(false);
      return;
    }
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    let current = Notification.permission;
    if (current === 'default') {
      // Legacy Safari returns void and takes a callback. `Promise.resolve`
      // handles both without sniffing for `.then`.
      const asked = (await Promise.resolve(Notification.requestPermission())) as
        | NotificationPermission
        | undefined;
      current = asked ?? Notification.permission;
    }
    setPermission(current);

    // A denial leaves the preference off, so the box does not sit ticked over a
    // browser that will never deliver one.
    const granted = current === 'granted';
    writePreference(granted);
    setPreference(granted);
  }, []);

  return {
    supported,
    permission,
    enabled: supported && preference && permission === 'granted',
    setEnabled,
  };
}

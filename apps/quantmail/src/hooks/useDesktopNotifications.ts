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

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'quant-notify-desktop';

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
  }
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
      icon: '/quantmail-mascot.svg',
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
    const sync = () => setPermission(Notification.permission);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
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

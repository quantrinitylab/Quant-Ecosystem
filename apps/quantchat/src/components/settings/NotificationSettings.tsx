'use client';

// ============================================================================
// QuantChat - Notification Category Settings (Task 10.4)
//
// Renders an independent enable/disable toggle for each notification category
// (messages, calls, stories, streaks, reels, system). Each toggle flips ONLY
// its own category (Req 9.6 - category independence). Settings persist to
// localStorage immediately and are best-effort synced to the backend.
//
// Validates: Requirements 9.6 (Property 21 - category independence)
// ============================================================================

import React, { useEffect, useState } from 'react';
import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
} from '../../lib/notification-deeplink';

export type NotificationCategorySettings = Record<NotificationCategory, boolean>;

/** localStorage key the settings are persisted under. */
export const NOTIFICATION_SETTINGS_KEY = 'quantchat:notification-settings';

const SETTINGS_ENDPOINT = '/api/notifications/settings';

/** Human-readable labels + descriptions per category. */
const CATEGORY_META: Record<NotificationCategory, { label: string; description: string }> = {
  MESSAGES: { label: 'Messages', description: 'New direct and group messages' },
  CALLS: { label: 'Calls', description: 'Incoming voice and video calls' },
  STORIES: { label: 'Stories', description: 'When friends post new stories' },
  STREAKS: { label: 'Streaks', description: 'Streak reminders before they expire' },
  REELS: { label: 'Reels', description: 'Likes, comments and new reels' },
  SYSTEM: { label: 'System', description: 'Account and security alerts' },
};

/** Default: everything enabled. */
export function defaultNotificationSettings(): NotificationCategorySettings {
  return NOTIFICATION_CATEGORIES.reduce((acc, category) => {
    acc[category] = true;
    return acc;
  }, {} as NotificationCategorySettings);
}

/** Reads settings from localStorage, merging over defaults. Never throws. */
export function loadNotificationSettings(): NotificationCategorySettings {
  const defaults = defaultNotificationSettings();
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<NotificationCategorySettings>;
    return NOTIFICATION_CATEGORIES.reduce((acc, category) => {
      acc[category] =
        typeof parsed[category] === 'boolean' ? parsed[category]! : defaults[category];
      return acc;
    }, {} as NotificationCategorySettings);
  } catch {
    return defaults;
  }
}

/** Persists settings to localStorage and best-effort to the backend. */
export function saveNotificationSettings(settings: NotificationCategorySettings): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* storage may be unavailable (private mode) — ignore */
    }
  }
  // Fire-and-forget backend sync.
  void fetch(SETTINGS_ENDPOINT, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categories: settings }),
  }).catch(() => undefined);
}

export interface NotificationSettingsProps {
  /** Optional initial settings (otherwise loaded from storage). */
  initialSettings?: NotificationCategorySettings;
  /** Notified whenever settings change. */
  onChange?: (settings: NotificationCategorySettings) => void;
}

export function NotificationSettings({ initialSettings, onChange }: NotificationSettingsProps) {
  const [settings, setSettings] = useState<NotificationCategorySettings>(
    () => initialSettings ?? defaultNotificationSettings(),
  );

  // Hydrate from storage on mount (avoids SSR/client mismatch).
  useEffect(() => {
    if (!initialSettings) {
      setSettings(loadNotificationSettings());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (category: NotificationCategory) => {
    setSettings((prev) => {
      // Flip ONLY the targeted category — independence invariant (Req 9.6).
      const next: NotificationCategorySettings = {
        ...prev,
        [category]: !prev[category],
      };
      saveNotificationSettings(next);
      onChange?.(next);
      return next;
    });
  };

  return (
    <section
      aria-label="Notification settings"
      className="flex flex-col gap-1"
      style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
    >
      <h2
        className="mb-2 text-base font-semibold"
        style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}
      >
        Notifications
      </h2>

      {NOTIFICATION_CATEGORIES.map((category) => {
        const meta = CATEGORY_META[category];
        const enabled = settings[category];
        const switchId = `notif-toggle-${category.toLowerCase()}`;
        return (
          <div
            key={category}
            className="flex items-center justify-between border-b border-white/5 py-3"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.75rem 0',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <label htmlFor={switchId} style={{ cursor: 'pointer' }}>
              <span
                className="block text-sm font-medium"
                style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500 }}
              >
                {meta.label}
              </span>
              <span
                className="block text-xs text-zinc-400"
                style={{ display: 'block', fontSize: '0.75rem', color: '#a1a1aa' }}
              >
                {meta.description}
              </span>
            </label>

            <button
              id={switchId}
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label={`${meta.label} notifications`}
              onClick={() => toggle(category)}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
              style={{
                position: 'relative',
                display: 'inline-flex',
                height: '1.5rem',
                width: '2.75rem',
                alignItems: 'center',
                borderRadius: '9999px',
                border: 'none',
                cursor: 'pointer',
                transition: 'background-color 150ms',
                backgroundColor: enabled ? '#8b5cf6' : '#3f3f46',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  height: '1.125rem',
                  width: '1.125rem',
                  borderRadius: '9999px',
                  background: '#fff',
                  transform: enabled ? 'translateX(1.375rem)' : 'translateX(0.1875rem)',
                  transition: 'transform 150ms',
                }}
              />
            </button>
          </div>
        );
      })}
    </section>
  );
}

export default NotificationSettings;

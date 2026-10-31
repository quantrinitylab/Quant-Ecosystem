'use client';

/**
 * QuantMail quick-settings panel — the finding this file closes:
 * settings used to live only at the /settings page, seven tabs away from
 * the inbox, while Gmail's gear opens density / inbox type / themes /
 * reading pane one click from the inbox.
 *
 * What this panel actually changes (and nothing else):
 * - Theme — Obsidian / Daylight / Match system (`quant-theme`, painted the
 *   same three ways the pre-paint bootstrap does; see
 *   `lib/quick-settings-preferences.ts`).
 * - Density — Comfortable / Cozy / Compact (`quant-density` ->
 *   `data-density`, the attribute the row rules key on).
 * - Notifications — All / Important only / Nothing, server-backed through
 *   `useMailNotificationMode`, so it filters the bell, push and desktop
 *   alerts together exactly like the full settings page.
 *
 * What it honestly does NOT offer: inbox type and reading pane. QuantMail
 * has no such setting (no key, no reader, no API), so rendering those rows
 * would be a fake control. The panel says so in one line and links to the
 * full settings page instead of pretending.
 *
 * Mounted in three places, one component each (the trigger + panel travel
 * together, so no mount can show a gear with no panel behind it):
 * - DesktopAppRail (right rail, desktop) — one click from the inbox.
 * - QuantPillarTopBar (mobile pillar bar) — one tap from the inbox.
 * - AppSidebar footer (mobile drawer) — beside the Settings link.
 * Any other surface can open the mounted panel by dispatching
 * `QUICK_SETTINGS_OPEN_EVENT` (e.g. a future Command K entry); the panel
 * listens for it, so a second mount is never needed to add an opener.
 *
 * UI rules: pure-black panel, spacing instead of divider lines, 44px
 * minimum touch targets, radiogroups with one Tab stop and arrow-key
 * movement (the same focus model the settings page's AI radiogroup uses).
 * The panel never navigates away: changing a setting here keeps the user
 * on the inbox they were looking at.
 */

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import {
  applyQuickDensity,
  paintQuickTheme,
  QUICK_DENSITY_STORAGE_KEY,
  QUICK_SETTINGS_OPEN_EVENT,
  QUICK_THEME_STORAGE_KEY,
  readStoredQuickDensity,
  readStoredQuickTheme,
  resolveQuickTheme,
  type QuickDensity,
  type QuickTheme,
} from '../lib/quick-settings-preferences';
import {
  MAIL_NOTIFICATION_MODE_OPTIONS,
  type MailNotificationMode,
} from '../lib/mail-notification-mode';
import { useMailNotificationMode } from '../hooks/useMailNotificationMode';
import { showToast } from './InboxToast';

const THEME_OPTIONS: Array<{ value: QuickTheme; label: string; description: string }> = [
  { value: 'dark', label: 'Obsidian', description: 'The default. Near-black canvas.' },
  { value: 'light', label: 'Daylight', description: 'Warm paper canvas for a bright room.' },
  { value: 'system', label: 'Match system', description: 'Follows your OS, and keeps following it.' },
];

const DENSITY_OPTIONS: Array<{ value: QuickDensity; label: string; description: string }> = [
  { value: 'comfortable', label: 'Comfortable', description: 'Sender, subject and preview with room.' },
  { value: 'cozy', label: 'Cozy', description: 'A middle step — tighter rows, still easy to scan.' },
  { value: 'compact', label: 'Compact', description: 'Shorter rows — more conversations per screen.' },
];

function GearIcon() {
  return (
    <svg
      className="size-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </svg>
  );
}

interface ChoiceGroupProps<T extends string> {
  label: string;
  options: Array<{ value: T; label: string; description: string }>;
  value: T;
  onChange: (next: T) => void;
}

/**
 * One Tab stop, arrows to move, focus follows selection — the radiogroup
 * focus model. A group of three buttons as three Tab stops would make the
 * panel nine stops deep before the "See all settings" link.
 */
function ChoiceGroup<T extends string>({ label, options, value, onChange }: ChoiceGroupProps<T>) {
  const groupRef = useRef<HTMLDivElement>(null);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? 1
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? -1
          : 0;
    if (!delta) return;
    event.preventDefault();
    const next = options[(selectedIndex + delta + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    groupRef.current
      ?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)
      ?.focus();
  };

  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-semibold text-[var(--quant-foreground)]">{label}</legend>
      <div ref={groupRef} role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="space-y-2">
        {options.map((option, index) => {
          const isSelected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              data-value={option.value}
              tabIndex={index === selectedIndex ? 0 : -1}
              onClick={() => onChange(option.value)}
              className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)] ${
                isSelected
                  ? 'border-[var(--brand-soft-border)] bg-[var(--brand-soft)]'
                  : 'border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] hover:bg-[var(--quant-surface-hover)]'
              }`}
            >
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-[var(--quant-foreground)]">
                  {option.label}
                </span>
                <span className="block text-xs text-[var(--quant-muted-foreground)]">
                  {option.description}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={`grid size-5 flex-none place-items-center rounded-full border-2 ${
                  isSelected
                    ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]'
                    : 'border-[var(--quant-text-muted)] bg-transparent'
                }`}
              >
                {isSelected && <span className="size-2 rounded-full bg-[#111111]" />}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export interface QuickSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  /** Ref of the trigger that opened the panel, for focus return. */
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

export function QuickSettingsPanel({ open, onClose, triggerRef }: QuickSettingsPanelProps) {
  const panelId = useId();
  const [theme, setTheme] = useState<QuickTheme>(() =>
    typeof window === 'undefined' ? 'dark' : readStoredQuickTheme(window.localStorage),
  );
  const [density, setDensity] = useState<QuickDensity>(() =>
    typeof window === 'undefined' ? 'comfortable' : readStoredQuickDensity(window.localStorage),
  );
  const notificationMode = useMailNotificationMode();

  // Re-read stored values when the panel opens: the full settings page may
  // have changed them since this panel last rendered, and a panel showing a
  // stale selection over a canvas that already moved is a lie by omission.
  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    setTheme(readStoredQuickTheme(window.localStorage));
    setDensity(readStoredQuickDensity(window.localStorage));
  }, [open ]);

  // "Match system" keeps matching it, like the settings page: without this
  // the option is a one-shot copy taken at click time.
  useEffect(() => {
    if (!open || theme !== 'system' || typeof window === 'undefined') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => paintQuickTheme(query.matches ? 'dark' : 'light');
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, [open, theme]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // Focus returns to the gear that opened the panel, so closing does not
  // strand keyboard focus at the top of the document. Guarded on a
  // was-open transition: without it the effect also fires on mount (open
  // starts false) and every mount — rail, pillar bar, sidebar — steals
  // page-load focus to its own gear.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (wasOpenRef.current && !open) triggerRef?.current?.focus();
    wasOpenRef.current = open;
  }, [open, triggerRef]);

  const changeTheme = useCallback((next: QuickTheme) => {
    setTheme(next);
    try {
      window.localStorage.setItem(QUICK_THEME_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    paintQuickTheme(
      resolveQuickTheme(
        next,
        typeof window !== 'undefined' &&
          window.matchMedia('(prefers-color-scheme: dark)').matches,
      ),
    );
    const label = THEME_OPTIONS.find((option) => option.value === next)?.label ?? next;
    showToast({ text: `Theme set to ${label}`, type: 'info' });
  }, []);

  const changeDensity = useCallback((next: QuickDensity) => {
    setDensity(next);
    try {
      window.localStorage.setItem(QUICK_DENSITY_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    applyQuickDensity(next);
    showToast({
      text:
        next === 'compact'
          ? 'Rows are compact'
          : next === 'cozy'
            ? 'Rows are cozy'
            : 'Rows are comfortable',
      type: 'info',
    });
  }, []);

  const changeNotificationMode = useCallback(
    async (next: MailNotificationMode) => {
      const ok = await notificationMode.setMode(next);
      const label =
        MAIL_NOTIFICATION_MODE_OPTIONS.find((option) => option.value === next)?.label ?? next;
      showToast({
        text: ok ? `Notifications set to ${label}` : 'Could not save notification mode',
        type: ok ? 'info' : 'error',
      });
    },
    [notificationMode],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        aria-label="Close quick settings"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${panelId}-title`}
        className="absolute inset-x-3 bottom-3 max-h-[85dvh] overflow-y-auto rounded-2xl border border-[var(--quant-border)] bg-black p-4 shadow-2xl sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-4 sm:w-[340px]"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2
            id={`${panelId}-title`}
            className="text-sm font-semibold text-[var(--quant-foreground)]"
          >
            Quick settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close quick settings"
            className="flex size-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-surface-elevated)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)]"
          >
            <span aria-hidden="true" className="text-lg leading-none">×</span>
          </button>
        </div>
        <div className="space-y-5">
          <ChoiceGroup
            label="Theme"
            options={THEME_OPTIONS}
            value={theme}
            onChange={changeTheme}
          />
          <ChoiceGroup
            label="Density"
            options={DENSITY_OPTIONS}
            value={density}
            onChange={changeDensity}
          />
          <ChoiceGroup<MailNotificationMode>
            label="Notify me about"
            options={MAIL_NOTIFICATION_MODE_OPTIONS}
            value={notificationMode.mode}
            onChange={(next) => void changeNotificationMode(next)}
          />
          <p className="text-xs leading-relaxed text-[var(--quant-muted-foreground)]">
            Inbox type and reading pane are not settings QuantMail offers yet, so they are not
            listed here as controls. Everything above changes the inbox you are looking at,
            without leaving it.
          </p>
          <Link
            href="/settings"
            onClick={onClose}
            className="flex min-h-11 items-center justify-center rounded-xl border border-[var(--brand-soft-border)] bg-[var(--brand-soft)] px-3 text-[13px] font-semibold text-[var(--brand-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)]"
          >
            See all settings
          </Link>
        </div>
      </div>
    </div>
  );
}

export interface QuickSettingsButtonProps {
  className?: string;
  /** Accessible name override; default names the gear for what it opens. */
  label?: string;
  /** Optional visible text beside the gear (e.g. a footer text row). */
  children?: React.ReactNode;
}

/**
 * The gear trigger + its panel, travelling together. Render this, never a
 * bare gear: a trigger whose panel lives in another component is how a
 * mount ends up opening nothing after a refactor.
 */
/**
 * Single-open guard: the button mounts three times (rail, pillar bar,
 * sidebar), so a bare "open" event would open three identical stacked
 * dialogs and closing the top one would reveal another — reading as a
 * close button that does nothing. The first opener claims the flag
 * synchronously (state updates are async, so a count checked in an effect
 * would still race); every closer releases it.
 */
let quickSettingsPanelOpen = false;

export function QuickSettingsButton({ className, label, children }: QuickSettingsButtonProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const close = useCallback(() => {
    quickSettingsPanelOpen = false;
    setOpen(false);
  }, []);
  const openPanel = useCallback(() => {
    if (quickSettingsPanelOpen) return;
    quickSettingsPanelOpen = true;
    setOpen(true);
  }, []);

  useEffect(() => {
    window.addEventListener(QUICK_SETTINGS_OPEN_EVENT, openPanel);
    return () => window.removeEventListener(QUICK_SETTINGS_OPEN_EVENT, openPanel);
  }, [openPanel]);

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => {
          if (open) close();
          else openPanel();
        }}
        aria-label={label ?? 'Quick settings'}
        aria-expanded={open}
        title="Quick settings"
        data-testid="quick-settings-button"
        className={
          className ??
          'flex size-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] text-[var(--quant-muted-foreground)] transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)]'
        }
      >
        <GearIcon />
        {children}
      </button>
      <QuickSettingsPanel open={open} onClose={close} triggerRef={triggerRef} />
    </>
  );
}

'use client';

/**
 * Settings.
 *
 * The rule this page is being rebuilt against: **a control that does not change
 * the product is worse than a missing one**, because a missing control is an
 * obvious gap and a fake one is a lie the user acts on. Nine of the controls
 * here wrote a `localStorage` key that `git grep` proves nothing reads, and each
 * one toasted "saved" on the way out. They are gone, and every removal is
 * recorded below rather than quietly dropped:
 *
 * - **Accent Highlight** (five colour dots). Set `--brand-primary` inline and
 *   persisted `quant-accent` — but no boot script re-applies it, so the choice
 *   died on reload. Worse, only ~30 rules read that variable while the app
 *   carries ~3,157 hardcoded hex literals and `--quant-accent-soft`/`-border`
 *   are hardcoded orange rgba that do not derive from it. "Rose Red" recoloured
 *   a handful of borders and left the rest of the product orange.
 * - **Midnight Blue** theme. Pointed at `#0f172a`, a colour the palette does not
 *   contain and no stylesheet implements; the pre-paint bootstrap already fell
 *   through to `dark` for it, so the card sat selected over an Obsidian canvas.
 *   A stored `midnight` is migrated to `dark` on mount.
 * - **Composer & Delivery Rules** entire section — Undo Send Delay
 *   (`quant-undo-delay`, no reader), Default Reply Action (no persistence at
 *   all), Conversation Threading and Automatic Read Receipts (neither persisted
 *   nor read). The undo window is currently owned by the outbox, not by this.
 * - **"When something is slow or down"** entire section — the rerouting toggle
 *   (`quant-ai-failover`, no reader) and the three temperature pills
 *   (`quant-ai-creativity`, no reader) over a backend that hardcodes `0.7`.
 * - **Email / Sound / Direct-Mentions notification toggles**. `quant-notifications`
 *   has no reader, there is no digest job, no sound asset and no mention parser.
 *   One real channel survives, wired to the browser's own permission state.
 * - **The emerald "Active & Verified Identity" badge**, which asserted a
 *   verification this app never performs. Replaced by the real `@username`.
 * - **The hand-written 16-row shortcut table**, which documented `Ctrl+S`,
 *   `Escape` and a `C` compose key that are not bound, and said "selected email"
 *   for keys that act on the *focused* row. The tab now renders
 *   `INBOX_COMMAND_REFERENCE` through the same model the `?` sheet uses, so a key
 *   listed here cannot fail to exist. The `J / ↓` glyphs the old table spelled by
 *   hand come out of `chords.ts`'s `SYMBOL_LABELS` instead.
 * - **Phone verification on the General tab.** It is still here, once, under
 *   Security — where a recovery factor belongs. Two entry points to one control
 *   is the ambiguity this page has been shedding everywhere else.
 *
 * What is left either calls the API or paints the DOM. `handleSaveProfile` is a
 * real `PATCH`, `changeTheme` mirrors the boot script's three attributes, and
 * `changeDensity` applies `data-density` in the same tick.
 *
 * Cards, toggle rows and choice groups come from `./SettingsPrimitives` — ART
 * LAW 18. The AI engine-mode radiogroup below is deliberately NOT folded into
 * `SettingsChoice`: it is already a correct `role="radiogroup"` with per-option
 * copy and a layout of its own.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Button, FormField, Input, TextArea } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';
import { apiClient } from '../../services/api-client';
import { VacationResponderSettings } from './VacationResponderSettings';
import { PhoneVerificationCard } from '../../components/PhoneVerificationCard';
import { showToast } from '../../components/InboxToast';
import { ShortcutKeys } from '../../components/ShortcutKeys';
import { useDesktopNotifications } from '../../hooks/useDesktopNotifications';
import { buildHelpGroups, dimNoteFor, helpGroupHeading } from '../../lib/keyboard/help-model';
import { useCommandList } from '../../lib/keyboard/hooks';
import { useSafeEmailHtml } from '../../lib/safe-html';
import {
  SettingsChoice,
  SettingsSection,
  SettingsToggleRow,
  type SettingsChoiceOption,
} from './SettingsPrimitives';

type SettingsTab = 'general' | 'ai' | 'security' | 'notifications' | 'appearance' | 'keyboard';
type Theme = 'light' | 'dark' | 'system';
type Density = 'comfortable' | 'compact';

interface AIModelOption {
  id: string;
  name: string;
  description: string;
  bestFor: string;
  badge: string;
}

/**
 * The user-facing AI choices.
 *
 * These used to be six entries naming the vendor, the parameter count and a
 * latency figure — `'Meta Llama 3.3 (70B Instruct)'`, `'~380ms'`. Both were a
 * problem. The latencies were hardcoded literals that nothing measured, so the
 * page was quoting numbers it had invented. And exposing the vendor contradicts
 * the routing model itself: which model answers a prompt is the router's call,
 * it changes with load and health, and a user who has pinned "Llama 3.3" has
 * pinned something we may not be serving.
 *
 * What a user can actually reason about is how much thinking they want spent on
 * a request, so that is what the setting offers. `id` is the value persisted to
 * `quant-ai-model-mode` and handed to the router as an intent, not a model name.
 */
const AI_ENGINE_MODES: AIModelOption[] = [
  {
    id: 'auto-router',
    name: 'Automatic',
    description:
      'Reads each request and spends as much reasoning on it as it needs — a one-line reply stays instant, a long thread gets the slower pass. Falls back on its own if a route is unhealthy.',
    bestFor: 'Everything, unless you have a reason to override it',
    badge: 'Recommended',
  },
  {
    id: 'fast',
    name: 'Fast',
    description:
      'Answers immediately and keeps it short. Good for smart replies, autocomplete and one-line summaries where waiting is worse than a slightly plainer answer.',
    bestFor: 'Quick replies, autocomplete, categorising',
    badge: 'Lowest wait',
  },
  {
    id: 'balanced',
    name: 'Balanced',
    description:
      'The middle setting: enough reasoning for a full draft or a thread summary, without the pause the deep setting takes.',
    bestFor: 'Drafting mail, summarising a thread',
    badge: 'Default',
  },
  {
    id: 'deep',
    name: 'Deep',
    description:
      'Takes noticeably longer and thinks harder. Worth it for contracts, long documents, multi-step logic and code review, where a shallow answer costs more than the wait.',
    bestFor: 'Contracts, code, analysis, long documents',
    badge: 'Most thorough',
  },
];

const TABS: Array<{ key: SettingsTab; label: string }> = [
  { key: 'general', label: 'General' },
  { key: 'ai', label: 'AI & Models' },
  { key: 'security', label: 'Security & Encryption' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'appearance', label: 'Appearance' },
  { key: 'keyboard', label: 'Keyboard Shortcuts' },
];

/**
 * The swatches are the real canvases, not decorative approximations: `#090A0C`
 * is `--quant-background` under `:root[data-theme='dark']` and `#f4f2ed` is the
 * light one. The old card previewed light mode as `#F5F5F5`, a colour the light
 * theme uses for *text*, so the swatch was showing something the theme never
 * paints.
 */
const THEME_OPTIONS: readonly SettingsChoiceOption<Theme>[] = [
  {
    value: 'dark',
    label: 'Obsidian',
    description: 'The default. Near-black canvas, warm accent.',
    swatch: 'bg-[#090A0C]',
  },
  {
    value: 'light',
    label: 'Daylight',
    description: 'Warm paper canvas for a bright room.',
    swatch: 'bg-[#f4f2ed]',
  },
  {
    value: 'system',
    label: 'Match system',
    description: 'Follows your OS, and keeps following it.',
    swatch: 'bg-gradient-to-br from-[#090A0C] via-[#090A0C] to-[#f4f2ed]',
  },
];

const DENSITY_OPTIONS: readonly SettingsChoiceOption<Density>[] = [
  {
    value: 'comfortable',
    label: 'Comfortable',
    description: 'Sender, subject and preview with room around them.',
  },
  {
    value: 'compact',
    label: 'Compact',
    description: 'Shorter rows — roughly four more conversations per screen.',
  },
];

/**
 * Paint the resolved theme onto `<html>` the same three ways the pre-paint
 * bootstrap in `layout.tsx` does.
 *
 * This page used to toggle the `dark` class and nothing else, while the boot
 * script set `data-theme`, the class *and* `style.colorScheme`. `globals.css`
 * keys its entire light palette on `:root[data-theme='light']`, so choosing
 * "light" here changed a class no light rule reads: the canvas stayed black
 * until a reload, and the browser's own scrollbars and form controls stayed dark
 * even after one. One function, called by both the picker and the `system`
 * listener, so the two cannot drift apart again.
 */
function paintTheme(resolved: 'light' | 'dark') {
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
}

function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** A one-word reason a control is off, sitting beside its label. */
function StatusPill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--quant-muted-foreground)]">
      {children}
    </span>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [profile, setProfile] = useState({ displayName: '', email: '', username: '' });
  const [loadedProfile, setLoadedProfile] = useState({ displayName: '', email: '', username: '' });
  const [profileSaving, setProfileSaving] = useState(false);
  const [signature, setSignature] = useState('');
  const [loadedSignature, setLoadedSignature] = useState('');
  const [defaultSignatureId, setDefaultSignatureId] = useState<string | null>(null);
  const [signatureStatus, setSignatureStatus] = useState<
    'loading' | 'idle' | 'saving' | 'saved' | 'error'
  >('loading');
  const [theme, setTheme] = useState<Theme>('dark');
  const [density, setDensity] = useState<Density>('comfortable');
  const [selectedAIModel, setSelectedAIModel] = useState('auto-router');

  const desktopNotifications = useDesktopNotifications();
  const commands = useCommandList();
  const helpGroups = useMemo(() => buildHelpGroups(commands), [commands]);
  const helpNote = dimNoteFor(helpGroups, {
    elsewhere: ' Dimmed keys belong to the inbox and work there.',
    contextual: ' Dimmed keys need a focused conversation.',
  });

  const hasProfileChanges = profile.displayName.trim() !== loadedProfile.displayName;
  const hasSignatureChanges = signature !== loadedSignature;
  const signaturePreview = useSafeEmailHtml(signature);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('quant-theme');
      // A browser that used the app while `midnight` existed still holds it, and
      // it now matches no option — the picker would render with nothing selected
      // over a canvas the boot script had already resolved to `dark`. Migrate the
      // stored value rather than merely validating it, or the mismatch survives
      // every reload.
      const next: Theme =
        stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark';
      if (stored !== next) localStorage.setItem('quant-theme', next);
      setTheme(next);
      setDensity(localStorage.getItem('quant-density') === 'compact' ? 'compact' : 'comfortable');
      const savedModel = localStorage.getItem('quant-ai-model-mode');
      // Browsers that used the app before the vendor-named models were replaced
      // by intent tiers still hold an id like `@cf/meta/llama-3.3-70b-instruct`,
      // which now matches nothing and would render the list with no row selected.
      if (savedModel && AI_ENGINE_MODES.some((m) => m.id === savedModel)) {
        setSelectedAIModel(savedModel);
      }
    } catch {
      /* ignore */
    }
  }, []);

  /**
   * "Match system" has to keep matching it.
   *
   * Without this the option is a one-shot copy of the OS setting taken at page
   * load: the machine switching to light at sunset left the app dark until a
   * reload, which is precisely the behaviour a user picks this option to avoid.
   */
  useEffect(() => {
    if (theme !== 'system') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => paintTheme(query.matches ? 'dark' : 'light');
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, [theme]);

  useEffect(() => {
    void apiClient.getUserInfo().then((response) => {
      if (!response.success || !response.data) return;
      const next = {
        displayName: response.data.displayName || '',
        email: response.data.email || '',
        username: response.data.username || '',
      };
      setProfile(next);
      setLoadedProfile(next);
    });

    void apiClient.getDefaultEmailSignature().then((response) => {
      if (!response.success) {
        setSignatureStatus('error');
        return;
      }
      const next = response.data?.contentHtml ?? '';
      setSignature(next);
      setLoadedSignature(next);
      setDefaultSignatureId(response.data?.id ?? null);
      setSignatureStatus('idle');
    });
  }, []);

  /**
   * The one that was a lie.
   *
   * This used to write `quant-display-name` to `localStorage`, toast
   * "Profile display name updated", and stop. Nothing read that key, and the
   * `getUserInfo()` call above put the server's old name straight back on the
   * next mount — so the user watched their change succeed and then vanish. It is
   * a `PATCH /auth/profile` now, the toast waits for the response, and the field
   * is re-seeded from what the server actually stored rather than from what was
   * typed.
   */
  const handleSaveProfile = useCallback(async () => {
    const displayName = profile.displayName.trim();
    if (!displayName || profileSaving) return;
    setProfileSaving(true);
    const response = await apiClient.updateProfile(displayName);
    setProfileSaving(false);
    if (!response.success || !response.data) {
      showToast({
        text: response.error?.message || 'Display name could not be saved',
        type: 'error',
      });
      return;
    }
    const next = {
      displayName: response.data.displayName || '',
      email: response.data.email || '',
      username: response.data.username || '',
    };
    setProfile(next);
    setLoadedProfile(next);
    showToast({ text: 'Display name saved', type: 'success' });
  }, [profile.displayName, profileSaving]);

  const saveSignature = useCallback(async () => {
    const contentHtml = signature.trim();
    if (!contentHtml || !hasSignatureChanges) return;
    setSignatureStatus('saving');
    const response = defaultSignatureId
      ? await apiClient.updateEmailSignature(defaultSignatureId, { contentHtml })
      : await apiClient.createEmailSignature({
          name: 'QuantMail signature',
          contentHtml,
          isDefault: true,
        });
    if (!response.success || !response.data) {
      setSignatureStatus('error');
      showToast({ text: 'Failed to update signature', type: 'error' });
      return;
    }
    setDefaultSignatureId(response.data.id);
    setSignature(response.data.contentHtml);
    setLoadedSignature(response.data.contentHtml);
    setSignatureStatus('saved');
    showToast({ text: 'Email signature saved and active', type: 'success' });
  }, [defaultSignatureId, hasSignatureChanges, signature]);

  const handleSelectAIModel = (modelId: string) => {
    setSelectedAIModel(modelId);
    try {
      localStorage.setItem('quant-ai-model-mode', modelId);
    } catch {
      /* ignore */
    }
    const found = AI_ENGINE_MODES.find((m) => m.id === modelId);
    showToast({
      text: `Assistant set to ${found?.name || modelId}`,
      type: 'success',
    });
  };

  const changeTheme = useCallback((next: Theme) => {
    setTheme(next);
    try {
      localStorage.setItem('quant-theme', next);
    } catch {
      /* ignore */
    }
    paintTheme(resolveTheme(next));
    const label = THEME_OPTIONS.find((option) => option.value === next)?.label ?? next;
    showToast({ text: `Theme set to ${label}`, type: 'info' });
  }, []);

  /**
   * Density was persisted and never applied, so the choice took effect on the
   * next full reload — a preference that appears to do nothing is
   * indistinguishable from one that is broken. `globals.css` has the
   * `:root[data-density='compact']` rules; this sets the attribute they key on,
   * in the same tick as the click.
   */
  const changeDensity = useCallback((next: Density) => {
    setDensity(next);
    try {
      localStorage.setItem('quant-density', next);
    } catch {
      /* ignore */
    }
    document.documentElement.setAttribute('data-density', next);
    showToast({
      text: next === 'compact' ? 'Rows are compact' : 'Rows are comfortable',
      type: 'info',
    });
  }, []);

  const tabsId = useId();
  const tabListRef = useRef<HTMLDivElement>(null);
  const tabId = (key: SettingsTab) => `${tabsId}-tab-${key}`;
  const panelId = (key: SettingsTab) => `${tabsId}-panel-${key}`;

  /**
   * The AI mode list is a `role="radiogroup"`, and a radiogroup is one Tab stop
   * whose members move under the arrow keys. It was four Tab stops with no arrow
   * handling — the role announced a set that did not behave like one, so a
   * keyboard user tabbed through every option to reach the button after it. The
   * layout is untouched; only the focus model changed.
   */
  const aiGroupRef = useRef<HTMLDivElement>(null);
  const aiModeIndex = AI_ENGINE_MODES.findIndex((mode) => mode.id === selectedAIModel);
  const aiTabbableIndex = aiModeIndex >= 0 ? aiModeIndex : 0;

  const onAIModeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? 1
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? -1
          : 0;
    if (!delta) return;
    event.preventDefault();
    const next =
      AI_ENGINE_MODES[(aiTabbableIndex + delta + AI_ENGINE_MODES.length) % AI_ENGINE_MODES.length];
    if (!next) return;
    handleSelectAIModel(next.id);
    aiGroupRef.current?.querySelector<HTMLButtonElement>(`[data-mode="${next.id}"]`)?.focus();
  };

  /**
   * Six buttons wearing an orange pill were six Tab stops, and `aria-current="page"`
   * told a screen reader this was navigation to a different document. They are a
   * tablist: one stop, arrows to move, and the panel announced as belonging to
   * the tab that names it. Focus follows selection, which is what a tablist with
   * automatic activation does — the panel is already swapping on click, so
   * requiring a second keypress to activate would only differ by keyboard.
   */
  const moveTab = (to: number | 'first' | 'last') => {
    const current = TABS.findIndex((tab) => tab.key === activeTab);
    const index =
      to === 'first'
        ? 0
        : to === 'last'
          ? TABS.length - 1
          : (Math.max(current, 0) + to + TABS.length) % TABS.length;
    const next = TABS[index];
    if (!next) return;
    setActiveTab(next.key);
    tabListRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${next.key}"]`)?.focus();
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      moveTab(1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveTab(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      moveTab('first');
    } else if (event.key === 'End') {
      event.preventDefault();
      moveTab('last');
    }
  };

  const notificationStatus = !desktopNotifications.supported ? (
    <StatusPill>Not supported here</StatusPill>
  ) : desktopNotifications.permission === 'denied' ? (
    <StatusPill>Blocked in this browser</StatusPill>
  ) : null;

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <div className="workspace-page settings-workspace flex h-full flex-col overflow-hidden bg-[var(--quant-background)]">
        <header className="shrink-0 border-b border-[var(--quant-border)] bg-[var(--quant-card)] px-4 pb-3 pt-5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl border border-[var(--brand-soft-border)] bg-[var(--brand-soft)] text-[var(--brand-primary)]">
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
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight text-[var(--quant-foreground)] sm:text-xl">
                Settings
              </h1>
              <p className="truncate text-xs text-[var(--quant-muted-foreground)]">
                Your identity, your assistant, and how this workspace looks.
              </p>
            </div>
          </div>
        </header>

        <div
          ref={tabListRef}
          role="tablist"
          aria-label="Settings sections"
          aria-orientation="horizontal"
          onKeyDown={onTabKeyDown}
          className="no-scrollbar flex shrink-0 select-none items-center gap-2 overflow-x-auto border-b border-[var(--quant-border)] bg-[var(--quant-background)] px-4 py-3 sm:px-6"
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                id={tabId(tab.key)}
                type="button"
                role="tab"
                data-tab={tab.key}
                aria-selected={isActive}
                /* Only the live panel exists in the DOM, and `aria-controls`
                   must point at something real — an inactive tab naming an
                   unrendered id is a dangling reference, not a hint. */
                aria-controls={isActive ? panelId(tab.key) : undefined}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(tab.key)}
                className={`min-h-11 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)] ${
                  isActive
                    ? 'border-[var(--brand-soft-border)] bg-[var(--brand-soft)] font-semibold text-[var(--brand-primary)]'
                    : 'border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] font-medium text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-surface-hover)] hover:text-[var(--quant-foreground)]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/*
         * A `div`, not a second `<main>`: `AppShell` already renders the page's
         * landmark, and two `<main>` elements in one document is invalid and
         * leaves a screen reader picking between them. It is the tab panel for
         * the strip above, named by whichever tab is selected, so the region
         * announces what it belongs to without inventing a landmark.
         */}
        <div
          role="tabpanel"
          id={panelId(activeTab)}
          aria-labelledby={tabId(activeTab)}
          /*
           * `max-w-3xl`, and the horizontal padding, are the real numbers now.
           * A `.settings-workspace > div:last-child { padding }` rule and a
           * `.settings-workspace section { max-width: 48rem }` rule in
           * `globals.css` were silently supplying both — written for the old
           * hand-rolled markup, still matching enough of the new markup to win
           * against these utilities. They are scoped to `/security` now, which
           * is the page they were written for, so what renders is what is here.
           */
          className="mx-auto w-full max-w-3xl flex-1 space-y-6 overflow-y-auto px-4 py-6 sm:px-8"
        >
          {activeTab === 'general' && (
            <>
              <SettingsSection
                title="Profile"
                description="The name that goes out on your mail. Your address and username are set when the account is created."
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void handleSaveProfile()}
                    disabled={!hasProfileChanges || profileSaving || !profile.displayName.trim()}
                  >
                    {profileSaving
                      ? 'Saving…'
                      : hasProfileChanges
                        ? 'Save display name'
                        : 'Profile up to date'}
                  </Button>
                }
              >
                <div className="flex items-center gap-3">
                  <div
                    aria-hidden="true"
                    className="grid size-12 flex-none place-items-center rounded-xl border border-[var(--brand-soft-border)] bg-[var(--brand-soft)] text-base font-bold text-[var(--brand-primary)]"
                  >
                    {(loadedProfile.displayName || loadedProfile.email || '?')
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--quant-foreground)]">
                      {loadedProfile.displayName || 'Unnamed account'}
                    </p>
                    {/*
                     * Where the emerald "Active & Verified Identity" badge was.
                     * Nothing in this product verifies an identity, so the badge
                     * asserted a check that never ran. The handle underneath is
                     * a fact the server returned.
                     */}
                    <p className="truncate text-xs text-[var(--quant-muted-foreground)]">
                      {loadedProfile.username ? `@${loadedProfile.username}` : loadedProfile.email}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Display name" htmlFor="settings-display-name">
                    <Input
                      id="settings-display-name"
                      value={profile.displayName}
                      onChange={(event) =>
                        setProfile((prev) => ({ ...prev, displayName: event.target.value }))
                      }
                      placeholder="Kundan Kumar"
                      maxLength={80}
                      fullWidth
                    />
                  </FormField>
                  <FormField label="Username" htmlFor="settings-username">
                    <Input id="settings-username" value={profile.username} readOnly fullWidth />
                  </FormField>
                </div>
                <FormField label="Email address" htmlFor="settings-email">
                  <Input
                    id="settings-email"
                    type="email"
                    value={profile.email}
                    readOnly
                    fullWidth
                  />
                </FormField>
              </SettingsSection>

              <SettingsSection
                title="Email signature"
                description="Appended to messages you send. HTML is allowed."
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void saveSignature()}
                    disabled={
                      signatureStatus === 'saving' || !hasSignatureChanges || !signature.trim()
                    }
                  >
                    {signatureStatus === 'saving' ? 'Saving signature…' : 'Save signature'}
                  </Button>
                }
              >
                <TextArea
                  value={signature}
                  onChange={(event) => setSignature(event.target.value)}
                  rows={4}
                  aria-label="Email signature"
                  placeholder={'Best regards,\nKundan\nFounder @ Quantrinity'}
                />
                {signature.trim() && (
                  <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-background)] p-3">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--quant-text-muted)]">
                      Preview
                    </p>
                    {/*
                     * The old "Live Preview" printed the field's raw text, so an
                     * HTML signature previewed as `<b>Kundan</b>` — the one thing
                     * a preview exists to not do. It renders through the same
                     * sanitiser the message body uses; when that returns nothing
                     * (no DOM yet, or nothing survived sanitising) the raw text is
                     * the honest fallback rather than a blank box.
                     */}
                    {signaturePreview ? (
                      <div
                        className="signature-content"
                        dangerouslySetInnerHTML={{ __html: signaturePreview }}
                      />
                    ) : (
                      <div className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--quant-muted-foreground)]">
                        {signature}
                      </div>
                    )}
                  </div>
                )}
              </SettingsSection>

              <VacationResponderSettings />
            </>
          )}

          {activeTab === 'ai' && (
            <>
              <SettingsSection
                title="Quanty routes every request for you"
                description="You pick how much thinking a request deserves; Quanty picks what answers it. That choice shifts with load and health, so it is deliberately not something you pin to a named engine. Everything below is an intent, not a machine."
                action={
                  <span className="rounded-full border border-[var(--brand-soft-border)] bg-[var(--brand-soft)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--brand-primary)]">
                    Automatic
                  </span>
                }
              >
                <p className="text-xs leading-relaxed text-[var(--quant-text-muted)]">
                  Your choice is stored on this browser and sent with each request as an intent. No
                  engine name is pinned, so a route going unhealthy changes what answers you — not
                  whether you get an answer.
                </p>
              </SettingsSection>

              <SettingsSection
                title="How much thinking"
                description="Leave this on Automatic unless a particular kind of work needs a particular trade-off."
              >
                <div
                  ref={aiGroupRef}
                  className="space-y-3"
                  role="radiogroup"
                  aria-label="How much thinking"
                  onKeyDown={onAIModeKeyDown}
                >
                  {AI_ENGINE_MODES.map((model, index) => {
                    const isSelected = selectedAIModel === model.id;
                    return (
                      <button
                        key={model.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        data-mode={model.id}
                        tabIndex={index === aiTabbableIndex ? 0 : -1}
                        onClick={() => handleSelectAIModel(model.id)}
                        className={`flex min-h-11 w-full cursor-pointer select-none items-start justify-between gap-4 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)] ${
                          isSelected
                            ? 'border-[var(--brand-soft-border)] bg-[var(--brand-soft)]'
                            : 'border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] hover:border-[var(--quant-border-strong)] hover:bg-[var(--quant-surface-hover)]'
                        }`}
                      >
                        <span className="min-w-0 space-y-1.5">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-[var(--quant-foreground)]">
                              {model.name}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                isSelected
                                  ? 'bg-[var(--brand-primary)] text-[#111111]'
                                  : 'border border-[var(--quant-border-strong)] bg-[var(--quant-border)] text-[var(--quant-muted-foreground)]'
                              }`}
                            >
                              {model.badge}
                            </span>
                          </span>
                          <span className="block text-xs leading-relaxed text-[var(--quant-muted-foreground)]">
                            {model.description}
                          </span>
                          <span className="block pt-0.5 text-[11px] font-semibold text-[var(--brand-primary)]">
                            Best for: {model.bestFor}
                          </span>
                        </span>
                        <span
                          aria-hidden="true"
                          className={`mt-1 grid size-5 flex-none place-items-center rounded-full border-2 transition-colors ${
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
              </SettingsSection>
            </>
          )}

          {activeTab === 'security' && (
            <>
              {/*
                This card used to read "Zero-Knowledge E2EE Vault Active / AES-256-GCM + Ed25519"
                over an emerald background, and claimed payloads were encrypted on the device before
                transmission. None of that was true for mail: QuantMail sends through AWS SES, which
                by construction sees plaintext. The end-to-end relay under `backend/routes/e2ee.ts`
                is real but is a QuantMail-to-QuantMail seam that the composer does not use yet, and
                nothing on this screen generates a device key.

                A false green badge is worse than an amber honest one, so the card now states the
                two protections separately and says plainly where the boundary is.
              */}
              <SettingsSection
                title="Encrypted in transit and at rest"
                action={
                  <span className="rounded-md border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-2.5 py-0.5 text-[10px] text-[var(--quant-muted-foreground)]">
                    TLS 1.2+ · AES-256 at rest
                  </span>
                }
              >
                <p className="text-xs leading-relaxed text-[var(--quant-muted-foreground)]">
                  Mail is encrypted on the wire to and from our servers and encrypted on disk once
                  it arrives. Your session can read it, and so can the delivery pipeline that has to
                  hand it to the recipient&apos;s provider.
                </p>
                <p className="border-t border-[var(--quant-border)] pt-3 text-xs leading-relaxed text-[var(--quant-muted-foreground)]">
                  It is{' '}
                  <strong className="font-semibold text-[var(--quant-foreground)]">not</strong>{' '}
                  end-to-end encrypted. Ordinary email cannot be — SMTP requires a readable message
                  at the boundary. Anyone telling you otherwise about a normal mailbox is selling
                  you something. End-to-end encrypted QuantMail-to-QuantMail threads are in progress
                  and will say so explicitly on the thread itself when they land.
                </p>
              </SettingsSection>

              <SettingsSection
                title="Session & credentials"
                description="What this browser holds, and how outgoing mail is authorised."
              >
                {/*
                 * These were two boxes inside a box. The rows sit on the card's own
                 * surface with a divider between them instead — a nested panel at the
                 * same lightness reads as a rendering fault, not as structure.
                 *
                 * The DKIM row used to carry a green tick and the word "Passed",
                 * which nothing on this page checks: it is a deployment fact, not a
                 * live probe, and a status that cannot fail is not a status. It is
                 * stated as configuration now, in the neutral tier.
                 */}
                <div className="flex min-h-11 items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-[var(--quant-foreground)]">
                      Device signing key
                    </p>
                    <p className="text-xs text-[var(--quant-muted-foreground)]">
                      Not generated on this browser yet
                    </p>
                  </div>
                  <StatusPill>Not set up</StatusPill>
                </div>
                <div className="flex min-h-11 items-center justify-between gap-3 border-t border-[var(--quant-border)] py-2 pt-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-[var(--quant-foreground)]">
                      DKIM &amp; SPF
                    </p>
                    <p className="text-xs text-[var(--quant-muted-foreground)]">
                      Outgoing mail is signed for quantmail.in through AWS SES
                    </p>
                  </div>
                  <StatusPill>Configured</StatusPill>
                </div>
              </SettingsSection>

              <PhoneVerificationCard />
            </>
          )}

          {activeTab === 'notifications' && (
            <SettingsSection
              title="Notifications"
              description="One switch, because one of them is real. Email digests, sound alerts and a mentions-only filter each wrote a preference nothing read — there is no digest job, no sound asset and no mention parser — so they are gone rather than sitting here pretending."
            >
              <SettingsToggleRow
                label="Desktop notifications"
                description={
                  desktopNotifications.permission === 'denied'
                    ? 'Your browser is blocking notifications for this site. Allow them in the address-bar site settings, then switch this back on.'
                    : 'A system notification when new mail arrives while this tab is in the background.'
                }
                checked={desktopNotifications.enabled}
                disabled={
                  !desktopNotifications.supported || desktopNotifications.permission === 'denied'
                }
                onChange={(next) => void desktopNotifications.setEnabled(next)}
                status={notificationStatus}
              />
            </SettingsSection>
          )}

          {activeTab === 'appearance' && (
            <>
              <SettingsSection
                title="Theme"
                description="Applies the moment you pick it, and survives a reload."
              >
                <SettingsChoice<Theme>
                  legend="Canvas"
                  value={theme}
                  options={THEME_OPTIONS}
                  onChange={changeTheme}
                  columns={3}
                />
              </SettingsSection>

              <SettingsSection
                title="Density"
                description="How much vertical room a conversation row gets in the list."
              >
                <SettingsChoice<Density>
                  legend="Row height"
                  value={density}
                  options={DENSITY_OPTIONS}
                  onChange={changeDensity}
                  columns={2}
                />
              </SettingsSection>
            </>
          )}

          {activeTab === 'keyboard' && (
            <SettingsSection
              title="Keyboard shortcuts"
              description="Read from the same registry the keyboard engine matches against, so a key listed here is a key that is bound. The previous table was written by hand and had drifted: it documented Ctrl+S, a C for compose and an Escape that nothing listened for."
            >
              {helpGroups.map(({ group, items }) => (
                <div key={group}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--quant-text-muted)]">
                    {helpGroupHeading(group)}
                  </p>
                  <ul className="mt-2 list-none p-0">
                    {items.map((item) => (
                      <li
                        key={item.id}
                        className={`shortcut-row min-h-11${item.available ? '' : ' is-unavailable'}`}
                      >
                        <span className="shortcut-desc">{item.label}</span>
                        <span className="shortcut-keys">
                          <ShortcutKeys keys={item.keys} aliases />
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="border-t border-[var(--quant-border)] pt-3 text-xs leading-relaxed text-[var(--quant-muted-foreground)]">
                Press{' '}
                <span className="shortcut-keys inline-flex">
                  <kbd>?</kbd>
                </span>{' '}
                anywhere to see this as a sheet.{helpNote}
              </p>
            </SettingsSection>
          )}
        </div>
      </div>
    </AppShell>
  );
}

'use client';

/**
 * AccountsSettingsFlow — Mobile-first Settings Hub, Accounts List, Account Detail,
 * and deep reverse-engineered sub-sheets (Appearance Theme/Density, Sender Screening,
 * Editor Language & Proofing, Sync Settings) supporting both White (Light) and Black (Dark) themes.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiClient, type MailFilterRule, type SendAsIdentity } from '../../services/api-client';
import { browserAuthSession } from '../../services/browser-auth-session';
import { showToast } from '../../components/InboxToast';
import { invalidateDefaultSignature } from '../../lib/email-signature-preference';
import { MobileInboxFlowSuite } from '../../components/MobileInboxFlowSuite';

export type AccountsFlowStep =
  | 'overview'
  | 'accounts'
  | 'detail'
  | 'appearance'
  | 'screening'
  | 'editor_language'
  | 'sync_settings'
  | 'addins'
  | 'add_account'
  | 'mobile_inbox';

export interface WorkspaceAddInItem {
  id: string;
  name: string;
  publisher: string;
  badgeBg: string;
  badgeText: string;
  badgeIcon: 'xq' | 'yablo' | 'yoxel' | 'zoho-crm' | 'zoho-mail' | 'zoho-proj' | 'zoho-sign' | 'zoho-drive' | 'zoom';
}

export const WORKSPACE_ADDINS: readonly WorkspaceAddInItem[] = [
  { id: 'xq', name: 'XQ Secure Mail', publisher: 'XQ Message Inc', badgeBg: '#0078D4', badgeText: '#FFFFFF', badgeIcon: 'xq' },
  { id: 'yablo', name: 'Yablo', publisher: 'Tasks in a Box', badgeBg: '#68B684', badgeText: '#FFFFFF', badgeIcon: 'yablo' },
  { id: 'yoxel', name: 'Yoxel', publisher: 'Yoxel', badgeBg: '#E0F2FE', badgeText: '#0284C7', badgeIcon: 'yoxel' },
  { id: 'zoho-crm-conn', name: 'Zoho CRM Connector', publisher: 'iEnterprises', badgeBg: '#0369A1', badgeText: '#FFFFFF', badgeIcon: 'zoho-crm' },
  { id: 'zoho-crm-email', name: 'Zoho CRM for email', publisher: 'Zoho', badgeBg: '#EFF6FF', badgeText: '#0284C7', badgeIcon: 'zoho-mail' },
  { id: 'zoho-projects', name: 'Zoho Projects for email', publisher: 'Zoho Corporation Private Limited', badgeBg: '#FEF2F2', badgeText: '#DC2626', badgeIcon: 'zoho-proj' },
  { id: 'zoho-sign', name: 'Zoho Sign', publisher: 'Zoho', badgeBg: '#EFF6FF', badgeText: '#0284C7', badgeIcon: 'zoho-sign' },
  { id: 'zoho-workdrive', name: 'Zoho WorkDrive for Email', publisher: 'Zoho', badgeBg: '#EFF6FF', badgeText: '#0284C7', badgeIcon: 'zoho-drive' },
  { id: 'zoom', name: 'Zoom', publisher: 'Zoom Communications, Inc', badgeBg: '#2563EB', badgeText: '#FFFFFF', badgeIcon: 'zoom' },
];

export const INSTALLED_ADDINS_KEY = 'quant-installed-addins';

export type SettingsSectionTarget =
  | 'overview'
  | 'accounts'
  | 'general'
  | 'filters'
  | 'ai'
  | 'security'
  | 'notifications'
  | 'appearance'
  | 'keyboard';

export interface ShowAsColorOption {
  id: string;
  label: string;
  hex: string;
}

export const SHOW_AS_COLORS: readonly ShowAsColorOption[] = [
  { id: 'rose', label: 'Rose Pink', hex: '#EC4899' },
  { id: 'orange', label: 'Quant Orange', hex: '#FF7A00' },
  { id: 'blue', label: 'Quant Blue', hex: '#0078D4' },
  { id: 'emerald', label: 'Emerald', hex: '#10B981' },
  { id: 'violet', label: 'Violet', hex: '#8B5CF6' },
  { id: 'teal', label: 'Teal', hex: '#14B8A6' },
];

export const APPEARANCE_ACCENT_COLORS: readonly ShowAsColorOption[] = [
  { id: 'blue', label: 'Classic Blue', hex: '#0078D4' },
  { id: 'violet', label: 'Royal Violet', hex: '#8B5CF6' },
  { id: 'pink', label: 'Vibrant Pink', hex: '#EC4899' },
  { id: 'orange', label: 'Quant Orange', hex: '#FF5722' },
  { id: 'crimson', label: 'Crimson', hex: '#E11D48' },
  { id: 'emerald', label: 'Emerald', hex: '#10B981' },
];

export const APPEARANCE_HEADER_IMAGES = [
  { id: 'peaks', label: 'Alpine Peaks', gradient: 'linear-gradient(135deg, #60A5FA 0%, #1E3A8A 100%)', featured: true },
  { id: 'dunes', label: 'Sahara Dunes', gradient: 'linear-gradient(135deg, #FBBF24 0%, #92400E 100%)', featured: false },
  { id: 'mist', label: 'Nordic Mist', gradient: 'linear-gradient(135deg, #C7D2FE 0%, #4338CA 100%)', featured: false },
  { id: 'canyon', label: 'Red Canyon', gradient: 'linear-gradient(135deg, #FB923C 0%, #9A3412 100%)', featured: false },
  { id: 'botanical', label: 'Botanical', gradient: 'linear-gradient(135deg, #4ADE80 0%, #166534 100%)', featured: false },
  { id: 'sunset', label: 'Horizon Sunset', gradient: 'linear-gradient(135deg, #F472B6 0%, #831843 100%)', featured: false },
] as const;

export const EDITOR_LANGUAGES = [
  { id: 'default', label: 'Default' },
  { id: 'en-US', label: 'English (United States)' },
  { id: 'en-GB', label: 'English (United Kingdom)' },
  { id: 'en-IN', label: 'English (India)' },
  { id: 'hi-IN', label: 'Hindi (हिन्दी)' },
] as const;

export const ACCOUNT_DESCRIPTION_KEY = 'quant-account-description';
export const ACCOUNT_SHOW_AS_COLOR_KEY = 'quant-account-show-as-color';
export const BLOCK_EXTERNAL_IMAGES_KEY = 'quant-block-external-images';
export const QUANTY_EDITOR_ENABLED_KEY = 'quant-editor-enabled';
export const EDITOR_LANGUAGE_KEY = 'quant-editor-language';
export const REPORT_MESSAGES_MODE_KEY = 'quant-report-messages-mode';
export const BIOMETRIC_LOCK_ENABLED_KEY = 'quant-biometric-lock-enabled';
export const SYNC_DAYS_WINDOW_KEY = 'quant-sync-days-window';
export const SYNC_ATTACHMENTS_MODE_KEY = 'quant-sync-attachments-mode';
export const APPEARANCE_ACCENT_KEY = 'quant-appearance-accent';

export type ReportMessagesMode = 'always_ask' | 'always_report';
export type ThemeChoice = 'light' | 'dark' | 'system';
export type DensityChoice = 'comfortable' | 'cozy' | 'compact';

export function deriveInitials(displayName: string, email: string): string {
  const source = (displayName || email || 'QM').trim();
  const parts = source.split(/[\s._@-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function applyLiveTheme(next: ThemeChoice): void {
  if (typeof document === 'undefined') return;
  const prefersDark =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = next === 'system' ? (prefersDark ? 'dark' : 'light') : next;
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
  try {
    localStorage.setItem('quant-theme', next);
  } catch {
    /* ignore */
  }
}

export function applyLiveDensity(next: DensityChoice): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.density = next;
  try {
    localStorage.setItem('quant-density', next);
  } catch {
    /* ignore */
  }
}

export interface AccountsSettingsFlowProps {
  profile: { displayName: string; email: string; username: string };
  hasSignature: boolean;
  themeLabel: string;
  densityLabel: string;
  aiModeLabel: string;
  notificationModeLabel: string;
  initialStep?: AccountsFlowStep;
  onNavigateTab?: (tab: SettingsSectionTarget) => void;
  onProfileUpdated?: (next: { displayName: string; email: string; username: string }) => void;
  onResetAccountCache?: () => void;
}

function ChevronRight() {
  return (
    <svg
      className="size-4 flex-none text-[var(--quant-muted-foreground)]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg
      className="size-5 flex-none text-[var(--quant-foreground)]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function PillSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 flex-none cursor-pointer items-center rounded-full p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)] ${
        checked
          ? 'bg-[#0078D4]'
          : 'border border-[var(--quant-border)] bg-[var(--quant-surface)]'
      }`}
    >
      <span
        aria-hidden="true"
        className={`size-6 rounded-full bg-white shadow-md transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export function AccountsSettingsFlow({
  profile,
  initialStep = 'overview',
  onNavigateTab,
  onProfileUpdated,
  onResetAccountCache,
}: AccountsSettingsFlowProps) {
  const [step, setStep] = useState<AccountsFlowStep>(initialStep);
  const [searchQuery, setSearchQuery] = useState('');
  const [editMode, setEditMode] = useState(false);

  const [vacationEnabled, setVacationEnabled] = useState<boolean | null>(null);
  const [sendAsList, setSendAsList] = useState<SendAsIdentity[]>([]);
  const [filters, setFilters] = useState<MailFilterRule[]>([]);

  const [description, setDescription] = useState<string>('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [draftDescription, setDraftDescription] = useState('');
  const [savingDescription, setSavingDescription] = useState(false);

  const [showAsColor, setShowAsColor] = useState<string>(SHOW_AS_COLORS[0]!.hex);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const [blockExternalImages, setBlockExternalImages] = useState<boolean>(false);
  const [showBlockImagesHelp, setShowBlockImagesHelp] = useState<boolean>(false);
  const [quantyEditorEnabled, setQuantyEditorEnabled] = useState<boolean>(true);
  const [editorLanguage, setEditorLanguage] = useState<string>('Default');
  const [autoCapitalise, setAutoCapitalise] = useState<boolean>(true);
  const [spellCheck, setSpellCheck] = useState<boolean>(true);
  const [grammarSuggestions, setGrammarSuggestions] = useState<boolean>(true);

  const [reportMessagesMode, setReportMessagesMode] = useState<ReportMessagesMode>('always_ask');
  const [biometricLockEnabled, setBiometricLockEnabled] = useState<boolean>(false);

  // Appearance sub-sheet state (Flow #33 & #98)
  const [appearanceSubTab, setAppearanceSubTab] = useState<'theme' | 'density'>('theme');
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>('dark');
  const [densityChoice, setDensityChoice] = useState<DensityChoice>('comfortable');
  const [appearanceAccent, setAppearanceAccent] = useState<string>('#0078D4');
  const [selectedHeaderImage, setSelectedHeaderImage] = useState<string>('peaks');

  // Sender Screening sub-sheet state
  const [screeningEnabled, setScreeningEnabled] = useState<boolean>(false);
  const [newScreenedSender, setNewScreenedSender] = useState<string>('');

  // Sync Settings sub-sheet state
  const [syncDaysWindow, setSyncDaysWindow] = useState<string>('30 Days');
  const [syncAttachmentsMode, setSyncAttachmentsMode] = useState<string>('Wi-Fi Only');
  const [backgroundRefresh, setBackgroundRefresh] = useState<boolean>(true);

  // Add-ins sub-sheet state (Flow #9)
  const [installedAddins, setInstalledAddins] = useState<string[]>([]);
  const [installingAddinId, setInstallingAddinId] = useState<string | null>(null);

  // Add Account sub-sheet state (Flow #11)
  const [addAccountEmail, setAddAccountEmail] = useState<string>('');
  const [showQrModal, setShowQrModal] = useState<boolean>(false);

  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removingAccount, setRemovingAccount] = useState(false);

  useEffect(() => {
    setStep(initialStep);
  }, [initialStep]);

  useEffect(() => {
    try {
      const storedDesc = localStorage.getItem(ACCOUNT_DESCRIPTION_KEY);
      if (storedDesc !== null) setDescription(storedDesc);

      const storedColor = localStorage.getItem(ACCOUNT_SHOW_AS_COLOR_KEY);
      if (storedColor && SHOW_AS_COLORS.some((c) => c.hex === storedColor)) {
        setShowAsColor(storedColor);
      }

      const blockImg = localStorage.getItem(BLOCK_EXTERNAL_IMAGES_KEY);
      setBlockExternalImages(blockImg === 'true');

      const editorEnabled = localStorage.getItem(QUANTY_EDITOR_ENABLED_KEY);
      setQuantyEditorEnabled(editorEnabled === null ? true : editorEnabled === 'true');

      const storedLang = localStorage.getItem(EDITOR_LANGUAGE_KEY);
      if (storedLang) setEditorLanguage(storedLang);

      const reportStored = localStorage.getItem(REPORT_MESSAGES_MODE_KEY);
      if (reportStored === 'always_ask' || reportStored === 'always_report') {
        setReportMessagesMode(reportStored);
      }

      const bioStored = localStorage.getItem(BIOMETRIC_LOCK_ENABLED_KEY);
      setBiometricLockEnabled(bioStored === 'true');

      const storedTheme = localStorage.getItem('quant-theme');
      if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system') {
        setThemeChoice(storedTheme);
      } else if (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light') {
        setThemeChoice('light');
      }

      const storedDensity = localStorage.getItem('quant-density');
      if (storedDensity === 'comfortable' || storedDensity === 'cozy' || storedDensity === 'compact') {
        setDensityChoice(storedDensity);
      }

      const storedAccent = localStorage.getItem(APPEARANCE_ACCENT_KEY);
      if (storedAccent) setAppearanceAccent(storedAccent);

      const storedSyncDays = localStorage.getItem(SYNC_DAYS_WINDOW_KEY);
      if (storedSyncDays) setSyncDaysWindow(storedSyncDays);

      const storedSyncAtt = localStorage.getItem(SYNC_ATTACHMENTS_MODE_KEY);
      if (storedSyncAtt) setSyncAttachmentsMode(storedSyncAtt);
    } catch {
      /* ignore storage errors */
    }

    void apiClient.getVacationResponder().then((res) => {
      if (res.success && res.data) {
        setVacationEnabled(Boolean(res.data.enabled));
      }
    });

    void apiClient.getSendAsIdentities().then((res) => {
      if (res.success && Array.isArray(res.data)) {
        setSendAsList(res.data);
      }
    });

    void apiClient.getMailFilters().then((res) => {
      if (res.success && Array.isArray(res.data)) {
        setFilters(res.data);
        setScreeningEnabled(res.data.some((f) => f.enabled !== false));
      }
    });
  }, []);

  const initials = useMemo(
    () => deriveInitials(profile.displayName, profile.email),
    [profile.displayName, profile.email],
  );

  const effectiveDescription = description.trim() || profile.email || 'QuantMail Account';
  const activeFilterCount = useMemo(
    () => filters.filter((f) => f.enabled !== false).length,
    [filters],
  );

  const handleSaveDescription = useCallback(async () => {
    const trimmed = draftDescription.trim();
    setSavingDescription(true);
    try {
      localStorage.setItem(ACCOUNT_DESCRIPTION_KEY, trimmed);
      setDescription(trimmed);
    } catch {
      /* ignore */
    }
    if (trimmed && trimmed !== profile.displayName) {
      const response = await apiClient.updateProfile(trimmed);
      if (response.success && response.data && onProfileUpdated) {
        onProfileUpdated({
          displayName: response.data.displayName || trimmed,
          email: response.data.email || profile.email,
          username: response.data.username || profile.username,
        });
      }
    }
    setSavingDescription(false);
    setEditingDescription(false);
    showToast({ text: 'Account description updated', type: 'success' });
  }, [draftDescription, onProfileUpdated, profile.displayName, profile.email, profile.username]);

  const handleSelectColor = useCallback((hex: string) => {
    setShowAsColor(hex);
    try {
      localStorage.setItem(ACCOUNT_SHOW_AS_COLOR_KEY, hex);
    } catch {
      /* ignore */
    }
    setShowColorPicker(false);
    showToast({ text: 'Account avatar color updated', type: 'info' });
  }, []);

  const handleToggleBlockImages = useCallback((next: boolean) => {
    setBlockExternalImages(next);
    try {
      localStorage.setItem(BLOCK_EXTERNAL_IMAGES_KEY, String(next));
      window.dispatchEvent(
        new CustomEvent('quant:block-external-images-changed', { detail: { blocked: next } }),
      );
    } catch {
      /* ignore */
    }
    showToast({
      text: next ? 'External images blocked by default' : 'External images allowed',
      type: 'info',
    });
  }, []);

  const handleToggleQuantyEditor = useCallback((next: boolean) => {
    setQuantyEditorEnabled(next);
    try {
      localStorage.setItem(QUANTY_EDITOR_ENABLED_KEY, String(next));
    } catch {
      /* ignore */
    }
    showToast({
      text: next ? 'Quanty Editor enabled' : 'Quanty Editor disabled',
      type: 'info',
    });
  }, []);

  const handleToggleBiometric = useCallback((next: boolean) => {
    setBiometricLockEnabled(next);
    try {
      localStorage.setItem(BIOMETRIC_LOCK_ENABLED_KEY, String(next));
    } catch {
      /* ignore */
    }
    showToast({
      text: next ? 'Biometric / Passkey lock enabled' : 'Biometric / Passkey lock disabled',
      type: 'info',
    });
  }, []);

  const handleCycleReportMessages = useCallback(() => {
    const next: ReportMessagesMode =
      reportMessagesMode === 'always_ask' ? 'always_report' : 'always_ask';
    setReportMessagesMode(next);
    try {
      localStorage.setItem(REPORT_MESSAGES_MODE_KEY, next);
    } catch {
      /* ignore */
    }
    showToast({
      text:
        next === 'always_ask'
          ? 'Report Messages set to Always Ask'
          : 'Report Messages set to Always Report',
      type: 'info',
    });
  }, [reportMessagesMode]);

  const handleSetDefaultEmailApp = useCallback(() => {
    if (
      typeof window !== 'undefined' &&
      typeof window.navigator?.registerProtocolHandler === 'function'
    ) {
      try {
        window.navigator.registerProtocolHandler(
          'mailto',
          `${window.location.origin}/compose?to=%s`,
        );
        showToast({
          text: 'Browser prompted to set QuantMail as your default mail handler',
          type: 'success',
        });
        return;
      } catch {
        /* fall through */
      }
    }
    showToast({
      text: 'Your browser manages default mail handlers in system or browser settings',
      type: 'info',
    });
  }, []);

  const handleResetAccount = useCallback(() => {
    try {
      localStorage.removeItem('quant_custom_folders');
      localStorage.removeItem('quant_folder_filters');
      invalidateDefaultSignature();
    } catch {
      /* ignore */
    }
    onResetAccountCache?.();
    showToast({
      text: 'Account cache reset — fresh mailbox state synced',
      type: 'success',
    });
  }, [onResetAccountCache]);

  const handleRemoveAccount = useCallback(async () => {
    if (removingAccount) return;
    setRemovingAccount(true);
    try {
      await browserAuthSession.logout();
    } catch {
      /* continue cleanup */
    }
    try {
      localStorage.removeItem(ACCOUNT_DESCRIPTION_KEY);
      localStorage.removeItem('quant_custom_folders');
      localStorage.removeItem('quant_folder_filters');
    } catch {
      /* ignore */
    }
    setRemovingAccount(false);
    setConfirmingRemove(false);
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }, [removingAccount]);

  const handleSelectTheme = useCallback((next: ThemeChoice) => {
    setThemeChoice(next);
    applyLiveTheme(next);
    showToast({
      text: `Theme set to ${next === 'light' ? 'Light' : next === 'dark' ? 'Dark' : 'System'}`,
      type: 'info',
    });
  }, []);

  const handleSelectDensity = useCallback((next: DensityChoice) => {
    setDensityChoice(next);
    applyLiveDensity(next);
    showToast({
      text: `Density set to ${next === 'comfortable' ? 'Roomy' : next === 'cozy' ? 'Cozy' : 'Compact'}`,
      type: 'info',
    });
  }, []);

  const handleAddScreenedSender = useCallback(async () => {
    const sender = newScreenedSender.trim();
    if (!sender) return;
    try {
      const res = await apiClient.createMailFilter({
        name: `Screen ${sender}`,
        conditions: { from: sender },
        actions: { moveTo: 'trash', markRead: true },
        enabled: true,
      });
      if (res.success && res.data) {
        setFilters((prev) => [...prev, res.data!]);
      } else {
        setFilters((prev) => [
          ...prev,
          {
            id: `local_${Date.now()}`,
            name: `Screen ${sender}`,
            conditions: { from: sender },
            actions: { moveTo: 'trash', markRead: true },
            enabled: true,
          },
        ]);
      }
      setNewScreenedSender('');
      setScreeningEnabled(true);
      showToast({ text: `Screening enabled for ${sender}`, type: 'success' });
    } catch {
      /* ignore */
    }
  }, [newScreenedSender]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const matchesSearch = (label: string, keywords = '') => {
    if (!normalizedQuery) return true;
    return `${label} ${keywords}`.toLowerCase().includes(normalizedQuery);
  };

  // ─── SUB-SHEET: Appearance (Theme Light/Dark/System + Density Roomy/Cozy/Compact) ─
  if (step === 'appearance') {
    return (
      <div className="space-y-4" data-testid="settings-appearance-sheet">
        <div className="relative flex items-center justify-center border-b border-[var(--quant-border)] pb-3 pt-1">
          <button
            type="button"
            aria-label="Back to Settings"
            onClick={() => setStep('overview')}
            className="absolute left-0 inline-flex size-8 items-center justify-center rounded-lg text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]"
          >
            <ChevronLeft />
          </button>
          <h1 className="text-base font-semibold text-[var(--quant-foreground)]">Appearance</h1>
        </div>

        {/* 2-Segment Pill Toggle: Theme | Density */}
        <div
          role="tablist"
          aria-label="Appearance sections"
          className="grid grid-cols-2 rounded-full bg-[var(--quant-surface)] p-1 border border-[var(--quant-border)]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={appearanceSubTab === 'theme'}
            onClick={() => setAppearanceSubTab('theme')}
            className={`rounded-full py-2 text-sm font-medium transition-colors ${
              appearanceSubTab === 'theme'
                ? 'bg-[#0078D4] text-white shadow-sm'
                : 'text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]'
            }`}
          >
            Theme
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={appearanceSubTab === 'density'}
            onClick={() => setAppearanceSubTab('density')}
            className={`rounded-full py-2 text-sm font-medium transition-colors ${
              appearanceSubTab === 'density'
                ? 'bg-[#0078D4] text-white shadow-sm'
                : 'text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]'
            }`}
          >
            Density
          </button>
        </div>

        {appearanceSubTab === 'theme' ? (
          <>
            {/* Theme Card: Light, Dark, System miniature phone previews */}
            <div
              role="radiogroup"
              aria-label="Theme mode"
              className="grid grid-cols-3 gap-3 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-4"
            >
              {(
                [
                  { id: 'light', label: 'Light' },
                  { id: 'dark', label: 'Dark' },
                  { id: 'system', label: 'System' },
                ] as const
              ).map((item) => {
                const selected = themeChoice === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={item.label}
                    onClick={() => handleSelectTheme(item.id)}
                    className="flex flex-col items-center gap-2.5 text-center"
                  >
                    {/* Miniature Phone Preview */}
                    <div className="relative h-32 w-20 overflow-hidden rounded-xl border border-[var(--quant-border)] shadow-sm">
                      {item.id === 'light' && (
                        <div className="flex h-full flex-col bg-white">
                          <div className="h-5 bg-[#0078D4] px-1.5 pt-1">
                            <div className="size-2 rounded-full bg-white/60" />
                          </div>
                          <div className="flex-1 space-y-2 p-2">
                            <div className="h-1.5 w-full rounded bg-slate-200" />
                            <div className="h-1.5 w-5/6 rounded bg-slate-200" />
                            <div className="h-1.5 w-4/6 rounded bg-slate-200" />
                          </div>
                          <div className="absolute bottom-2 right-2 size-3 rounded-full bg-[#0078D4]" />
                        </div>
                      )}
                      {item.id === 'dark' && (
                        <div className="flex h-full flex-col bg-[#0B0C10]">
                          <div className="h-5 bg-[#1F2430] px-1.5 pt-1">
                            <div className="size-2 rounded-full bg-white/40" />
                          </div>
                          <div className="flex-1 space-y-2 p-2">
                            <div className="h-1.5 w-full rounded bg-slate-700" />
                            <div className="h-1.5 w-5/6 rounded bg-slate-700" />
                            <div className="h-1.5 w-4/6 rounded bg-slate-700" />
                          </div>
                          <div className="absolute bottom-2 right-2 size-3 rounded-full bg-[#0078D4]" />
                        </div>
                      )}
                      {item.id === 'system' && (
                        <div className="grid h-full grid-cols-2">
                          <div className="flex flex-col bg-white">
                            <div className="h-5 bg-[#0078D4]" />
                            <div className="space-y-2 p-1.5">
                              <div className="h-1.5 w-full rounded bg-slate-200" />
                              <div className="h-1.5 w-full rounded bg-slate-200" />
                            </div>
                          </div>
                          <div className="flex flex-col bg-[#0B0C10]">
                            <div className="h-5 bg-[#1F2430]" />
                            <div className="space-y-2 p-1.5">
                              <div className="h-1.5 w-full rounded bg-slate-700" />
                              <div className="h-1.5 w-full rounded bg-slate-700" />
                            </div>
                          </div>
                          <div className="absolute bottom-2 right-2 size-3 rounded-full bg-[#0078D4]" />
                        </div>
                      )}
                    </div>
                    <span className="text-xs font-medium text-[var(--quant-foreground)]">
                      {item.label}
                    </span>
                    <span
                      className={`grid size-5 place-items-center rounded-full border ${
                        selected
                          ? 'border-[#0078D4] bg-[#0078D4] text-white'
                          : 'border-[var(--quant-muted-foreground)] bg-transparent'
                      }`}
                    >
                      {selected ? (
                        <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Colours Card */}
            <div className="space-y-1.5">
              <h2 className="px-1 text-xs font-medium text-[var(--quant-muted-foreground)]">
                Colours
              </h2>
              <div className="flex items-center justify-between rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-4">
                {APPEARANCE_ACCENT_COLORS.map((swatch) => {
                  const selected = appearanceAccent === swatch.hex;
                  return (
                    <button
                      key={swatch.id}
                      type="button"
                      aria-label={swatch.label}
                      onClick={() => {
                        setAppearanceAccent(swatch.hex);
                        try {
                          localStorage.setItem(APPEARANCE_ACCENT_KEY, swatch.hex);
                        } catch {
                          /* ignore */
                        }
                      }}
                      style={{ backgroundColor: swatch.hex }}
                      className="grid size-10 place-items-center rounded-full text-white transition-transform hover:scale-105"
                    >
                      {selected ? (
                        <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Images Card */}
            <div className="space-y-1.5">
              <h2 className="px-1 text-xs font-medium text-[var(--quant-muted-foreground)]">
                Images
              </h2>
              <div className="flex items-center justify-between rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-4">
                {APPEARANCE_HEADER_IMAGES.map((img) => {
                  const selected = selectedHeaderImage === img.id;
                  return (
                    <button
                      key={img.id}
                      type="button"
                      aria-label={img.label}
                      onClick={() => setSelectedHeaderImage(img.id)}
                      style={{ backgroundImage: img.gradient }}
                      className={`relative size-10 rounded-full transition-transform hover:scale-105 ${
                        selected ? 'ring-2 ring-[#0078D4] ring-offset-2 ring-offset-[var(--quant-card)]' : ''
                      }`}
                    >
                      {img.featured && (
                        <span className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-white text-[9px] text-[#0078D4] shadow">
                          ★
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          /* Density Card: Roomy, Cozy, Compact */
          <div
            role="radiogroup"
            aria-label="List density"
            className="grid grid-cols-3 gap-3 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-4"
          >
            {(
              [
                { id: 'comfortable', label: 'Roomy' },
                { id: 'cozy', label: 'Cozy' },
                { id: 'compact', label: 'Compact' },
              ] as const
            ).map((item) => {
              const selected = densityChoice === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={item.label}
                  onClick={() => handleSelectDensity(item.id)}
                  className="flex flex-col items-center gap-2.5 text-center"
                >
                  <div className="flex h-32 w-20 flex-col justify-between rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-2">
                    {item.id === 'comfortable' && (
                      <div className="space-y-2">
                        <div className="h-2 w-full rounded bg-[var(--quant-muted-foreground)]/30" />
                        <div className="flex gap-1">
                          <span className="h-1.5 w-3 rounded-full bg-emerald-500" />
                          <span className="h-1.5 w-3 rounded-full bg-[#0078D4]" />
                          <span className="h-1.5 w-3 rounded-full bg-amber-500" />
                        </div>
                        <div className="h-2 w-full rounded bg-[var(--quant-muted-foreground)]/30" />
                        <div className="h-2 w-4/5 rounded bg-[var(--quant-muted-foreground)]/30" />
                      </div>
                    )}
                    {item.id === 'cozy' && (
                      <div className="space-y-2">
                        <div className="h-1.5 w-full rounded bg-[var(--quant-muted-foreground)]/30" />
                        <div className="h-1.5 w-4/5 rounded bg-[var(--quant-muted-foreground)]/30" />
                        <div className="h-1.5 w-full rounded bg-[#0078D4]/50" />
                        <div className="h-1.5 w-full rounded bg-[var(--quant-muted-foreground)]/30" />
                        <div className="h-1.5 w-3/4 rounded bg-[var(--quant-muted-foreground)]/30" />
                      </div>
                    )}
                    {item.id === 'compact' && (
                      <div className="space-y-1.5">
                        <div className="h-1 w-full rounded bg-[var(--quant-muted-foreground)]/30" />
                        <div className="h-1 w-full rounded bg-[var(--quant-muted-foreground)]/30" />
                        <div className="h-1 w-full rounded bg-[var(--quant-muted-foreground)]/30" />
                        <div className="h-1 w-full rounded bg-[var(--quant-muted-foreground)]/30" />
                        <div className="h-1 w-full rounded bg-[var(--quant-muted-foreground)]/30" />
                        <div className="h-1 w-full rounded bg-[var(--quant-muted-foreground)]/30" />
                      </div>
                    )}
                  </div>
                  <span className="text-xs font-medium text-[var(--quant-foreground)]">
                    {item.label}
                  </span>
                  <span
                    className={`grid size-5 place-items-center rounded-full border ${
                      selected
                        ? 'border-[#0078D4] bg-[#0078D4] text-white'
                        : 'border-[var(--quant-muted-foreground)] bg-transparent'
                    }`}
                  >
                    {selected ? (
                      <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ─── SUB-SHEET: Sender Screening ───────────────────────────────────────────
  if (step === 'screening') {
    return (
      <div className="space-y-4" data-testid="settings-screening-sheet">
        <div className="relative flex items-center justify-center border-b border-[var(--quant-border)] pb-3 pt-1">
          <button
            type="button"
            aria-label="Back to Account Detail"
            onClick={() => setStep('detail')}
            className="absolute left-0 inline-flex size-8 items-center justify-center rounded-lg text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]"
          >
            <ChevronLeft />
          </button>
          <h1 className="text-base font-semibold text-[var(--quant-foreground)]">
            Sender Screening
          </h1>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)]">
          <div className="flex min-h-12 items-center justify-between px-4 py-3">
            <div>
              <span className="block text-sm font-normal text-[var(--quant-foreground)]">
                Screen Unknown Senders
              </span>
              <span className="block text-xs text-[var(--quant-muted-foreground)]">
                Hold messages from first-time senders until approved
              </span>
            </div>
            <PillSwitch
              checked={screeningEnabled}
              onChange={(next) => {
                setScreeningEnabled(next);
                showToast({
                  text: next ? 'Sender Screening enabled' : 'Sender Screening turned off',
                  type: 'info',
                });
              }}
              label="Screen Unknown Senders"
            />
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="px-1 text-xs font-medium text-[var(--quant-muted-foreground)]">
            Blocked / Screened Senders ({filters.length})
          </h2>
          <div className="flex gap-2">
            <input
              type="email"
              value={newScreenedSender}
              onChange={(e) => setNewScreenedSender(e.target.value)}
              placeholder="sender@domain.com"
              className="flex-1 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] px-3.5 py-2 text-sm text-[var(--quant-foreground)] outline-none placeholder:text-[var(--quant-muted-foreground)]"
            />
            <button
              type="button"
              onClick={() => void handleAddScreenedSender()}
              className="rounded-xl bg-[#0078D4] px-4 py-2 text-xs font-semibold text-white"
            >
              Add Rule
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] divide-y divide-[var(--quant-border)]">
            {filters.length === 0 ? (
              <p className="px-4 py-3 text-xs text-[var(--quant-muted-foreground)]">
                No sender screening rules configured yet.
              </p>
            ) : (
              filters.map((rule) => (
                <div key={rule.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-normal text-[var(--quant-foreground)]">
                      {rule.name}
                    </p>
                    <p className="text-xs text-[var(--quant-muted-foreground)]">
                      From: {rule.conditions?.from || 'Any sender'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFilters((prev) => prev.filter((f) => f.id !== rule.id));
                      void apiClient.deleteMailFilter(rule.id);
                    }}
                    className="text-xs font-medium text-[#EF4444]"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── SUB-SHEET: Editor Language & Proofing ─────────────────────────────────
  if (step === 'editor_language') {
    return (
      <div className="space-y-4" data-testid="settings-editor-language-sheet">
        <div className="relative flex items-center justify-center border-b border-[var(--quant-border)] pb-3 pt-1">
          <button
            type="button"
            aria-label="Back to Account Detail"
            onClick={() => setStep('detail')}
            className="absolute left-0 inline-flex size-8 items-center justify-center rounded-lg text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]"
          >
            <ChevronLeft />
          </button>
          <h1 className="text-base font-semibold text-[var(--quant-foreground)]">
            Editor Language
          </h1>
        </div>

        <div className="space-y-1.5">
          <h2 className="px-1 text-xs font-medium text-[var(--quant-muted-foreground)]">
            Proofing Language
          </h2>
          <div className="overflow-hidden rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] divide-y divide-[var(--quant-border)]">
            {EDITOR_LANGUAGES.map((lang) => {
              const selected = editorLanguage === lang.label;
              return (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => {
                    setEditorLanguage(lang.label);
                    try {
                      localStorage.setItem(EDITOR_LANGUAGE_KEY, lang.label);
                    } catch {
                      /* ignore */
                    }
                    showToast({ text: `Editor language set to ${lang.label}`, type: 'info' });
                  }}
                  className="flex min-h-12 w-full items-center justify-between px-4 py-3 text-left text-sm text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]"
                >
                  <span>{lang.label}</span>
                  {selected && (
                    <svg className="size-5 text-[#0078D4]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <h2 className="px-1 text-xs font-medium text-[var(--quant-muted-foreground)]">
            Proofing &amp; Writing Assistance
          </h2>
          <div className="overflow-hidden rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] divide-y divide-[var(--quant-border)]">
            <div className="flex min-h-12 items-center justify-between px-4 py-3">
              <span className="text-sm text-[var(--quant-foreground)]">Auto-Capitalisation</span>
              <PillSwitch
                checked={autoCapitalise}
                onChange={setAutoCapitalise}
                label="Auto-Capitalisation"
              />
            </div>
            <div className="flex min-h-12 items-center justify-between px-4 py-3">
              <span className="text-sm text-[var(--quant-foreground)]">Spell Check</span>
              <PillSwitch checked={spellCheck} onChange={setSpellCheck} label="Spell Check" />
            </div>
            <div className="flex min-h-12 items-center justify-between px-4 py-3">
              <span className="text-sm text-[var(--quant-foreground)]">Grammar Suggestions</span>
              <PillSwitch
                checked={grammarSuggestions}
                onChange={setGrammarSuggestions}
                label="Grammar Suggestions"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── SUB-SHEET: Sync Settings ──────────────────────────────────────────────
  if (step === 'sync_settings') {
    return (
      <div className="space-y-4" data-testid="settings-sync-sheet">
        <div className="relative flex items-center justify-center border-b border-[var(--quant-border)] pb-3 pt-1">
          <button
            type="button"
            aria-label="Back to Account Detail"
            onClick={() => setStep('detail')}
            className="absolute left-0 inline-flex size-8 items-center justify-center rounded-lg text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]"
          >
            <ChevronLeft />
          </button>
          <h1 className="text-base font-semibold text-[var(--quant-foreground)]">Sync Settings</h1>
        </div>

        <div className="space-y-1.5">
          <h2 className="px-1 text-xs font-medium text-[var(--quant-muted-foreground)]">
            Days of Email to Sync
          </h2>
          <div className="overflow-hidden rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] divide-y divide-[var(--quant-border)]">
            {['7 Days', '30 Days', '90 Days', 'All Mail'].map((windowOpt) => (
              <button
                key={windowOpt}
                type="button"
                onClick={() => {
                  setSyncDaysWindow(windowOpt);
                  try {
                    localStorage.setItem(SYNC_DAYS_WINDOW_KEY, windowOpt);
                  } catch {
                    /* ignore */
                  }
                }}
                className="flex min-h-12 w-full items-center justify-between px-4 py-3 text-left text-sm text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]"
              >
                <span>{windowOpt}</span>
                {syncDaysWindow === windowOpt && (
                  <svg className="size-5 text-[#0078D4]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <h2 className="px-1 text-xs font-medium text-[var(--quant-muted-foreground)]">
            Download Attachments Automatically
          </h2>
          <div className="overflow-hidden rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] divide-y divide-[var(--quant-border)]">
            {['Wi-Fi Only', 'Wi-Fi & Cellular', 'Never'].map((attOpt) => (
              <button
                key={attOpt}
                type="button"
                onClick={() => {
                  setSyncAttachmentsMode(attOpt);
                  try {
                    localStorage.setItem(SYNC_ATTACHMENTS_MODE_KEY, attOpt);
                  } catch {
                    /* ignore */
                  }
                }}
                className="flex min-h-12 w-full items-center justify-between px-4 py-3 text-left text-sm text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]"
              >
                <span>{attOpt}</span>
                {syncAttachmentsMode === attOpt && (
                  <svg className="size-5 text-[#0078D4]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)]">
          <div className="flex min-h-12 items-center justify-between px-4 py-3">
            <span className="text-sm text-[var(--quant-foreground)]">Background App Refresh</span>
            <PillSwitch
              checked={backgroundRefresh}
              onChange={setBackgroundRefresh}
              label="Background App Refresh"
            />
          </div>
        </div>
      </div>
    );
  }

  // ─── SUB-SHEET: Add-ins (Flow #9 — Adding an add-in) ──────────────────────
  if (step === 'addins') {
    return (
      <div className="space-y-4" data-testid="settings-addins-sheet">
        <div className="relative flex flex-col items-center justify-center border-b border-[var(--quant-border)] pb-3 pt-1">
          <button
            type="button"
            aria-label="Close Add-ins"
            onClick={() => setStep('overview')}
            className="absolute left-0 top-1 inline-flex size-8 items-center justify-center rounded-lg text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-surface-hover)] hover:text-[var(--quant-foreground)]"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
          <h1 className="text-base font-semibold text-[var(--quant-foreground)]">Add-ins</h1>
          <span className="mt-0.5 flex items-center gap-1 text-xs text-[var(--quant-muted-foreground)]">
            <span>{profile.email || 'alexsmith@quantrinity.in'}</span>
            <span>⌄</span>
          </span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] divide-y divide-[var(--quant-border)]">
          {WORKSPACE_ADDINS.map((addin) => {
            const isInstalling = installingAddinId === addin.id;
            const isInstalled = installedAddins.includes(addin.id);
            return (
              <div
                key={addin.id}
                data-testid={`addin-row-${addin.id}`}
                className="flex min-h-16 items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3.5">
                  <span
                    style={{ backgroundColor: addin.badgeBg, color: addin.badgeText }}
                    className="grid size-9 flex-none place-items-center rounded-lg text-xs font-bold shadow-xs"
                  >
                    {addin.badgeIcon === 'zoom'
                      ? '📹'
                      : addin.badgeIcon === 'xq'
                        ? '✕'
                        : addin.badgeIcon === 'yablo'
                          ? '💬'
                          : addin.badgeIcon === 'yoxel'
                            ? '✳'
                            : addin.badgeIcon === 'zoho-proj'
                              ? '✓'
                              : addin.badgeIcon === 'zoho-sign'
                                ? '✎'
                                : addin.badgeIcon === 'zoho-drive'
                                  ? '📁'
                                  : '∞'}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--quant-foreground)]">
                      {addin.name}
                    </p>
                    <p className="truncate text-xs text-[var(--quant-muted-foreground)]">
                      {addin.publisher}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  data-testid={`addin-action-${addin.id}`}
                  aria-label={`${isInstalled ? 'Remove' : 'Add'} ${addin.name}`}
                  onClick={() => {
                    if (isInstalling) {
                      setInstallingAddinId(null);
                      setInstalledAddins((prev) => {
                        const next = prev.includes(addin.id) ? prev : [...prev, addin.id];
                        try {
                          localStorage.setItem(INSTALLED_ADDINS_KEY, JSON.stringify(next));
                        } catch {
                          /* ignore */
                        }
                        return next;
                      });
                      return;
                    }
                    if (isInstalled) {
                      setInstalledAddins((prev) => {
                        const next = prev.filter((id) => id !== addin.id);
                        try {
                          localStorage.setItem(INSTALLED_ADDINS_KEY, JSON.stringify(next));
                        } catch {
                          /* ignore */
                        }
                        return next;
                      });
                    } else {
                      setInstallingAddinId(addin.id);
                    }
                  }}
                  className={`inline-flex h-8 w-11 flex-none items-center justify-center rounded-lg border transition-colors ${
                    isInstalling || isInstalled
                      ? 'border-[#0078D4] bg-[#0078D4] text-white'
                      : 'border-[#0078D4]/50 bg-transparent text-[#0078D4] hover:bg-[#0078D4]/10'
                  }`}
                >
                  {isInstalling ? (
                    <svg
                      data-testid={`addin-spinner-${addin.id}`}
                      className="size-4 animate-spin text-white"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                    >
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                  ) : isInstalled ? (
                    <svg className="size-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  ) : (
                    <span className="text-lg font-light leading-none">+</span>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <div className="overflow-hidden rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)]">
          <Link
            href="/terms"
            className="flex min-h-12 w-full items-center justify-between px-4 py-3 text-sm font-normal text-[#0078D4] hover:bg-[var(--quant-surface-hover)]"
          >
            <span>Terms &amp; Support</span>
            <ChevronRight />
          </Link>
        </div>
      </div>
    );
  }

  // ─── SUB-SHEET: Add Account (Flow #11 — Adding another account) ───────────
  if (step === 'add_account') {
    const hasEmail = addAccountEmail.trim().length > 0;
    return (
      <div className="space-y-6" data-testid="settings-add-account-sheet">
        <div className="relative flex items-center justify-center border-b border-[var(--quant-border)] pb-3 pt-1">
          <button
            type="button"
            aria-label="Close Add Account"
            onClick={() => setStep('accounts')}
            className="absolute left-0 inline-flex size-8 items-center justify-center rounded-lg text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-surface-hover)] hover:text-[var(--quant-foreground)]"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
          <h1 className="text-base font-semibold text-[var(--quant-foreground)]">Add Account</h1>
        </div>

        <div className="mx-auto max-w-[320px] space-y-5 pt-4 text-center">
          <p className="text-sm text-[var(--quant-muted-foreground)]">
            Enter your work or personal email
          </p>

          <input
            type="email"
            data-testid="add-account-email-input"
            aria-label="Email Address"
            value={addAccountEmail}
            onChange={(e) => setAddAccountEmail(e.target.value)}
            placeholder="Email Address"
            className="w-full border-b border-[var(--quant-border)] bg-transparent pb-2.5 text-base text-[var(--quant-foreground)] placeholder-[var(--quant-muted-foreground)] focus:border-[#0078D4] focus:outline-none"
          />

          <div className="space-y-3 pt-2">
            <button
              type="button"
              data-testid="add-account-submit-btn"
              disabled={!hasEmail}
              onClick={() => {
                showToast({ text: `Connecting ${addAccountEmail.trim()}…`, type: 'info' });
                setAddAccountEmail('');
                setStep('accounts');
              }}
              className={`w-full rounded-xl py-3.5 text-sm font-medium transition-colors ${
                hasEmail
                  ? 'bg-[#0078D4] text-white hover:bg-[#006CBE]'
                  : 'bg-[var(--quant-muted-foreground)]/30 text-white/90'
              }`}
            >
              Add Account
            </button>

            <Link
              href="/register"
              className="block w-full rounded-xl border border-[#0078D4] py-3.5 text-center text-sm font-medium text-[#0078D4] transition-colors hover:bg-[#0078D4]/10"
            >
              Create New Account
            </Link>
          </div>

          <button
            type="button"
            data-testid="add-account-qr-btn"
            onClick={() => setShowQrModal((prev) => !prev)}
            className="inline-flex items-center justify-center gap-2 pt-2 text-xs font-medium text-[#0078D4] hover:underline"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect width="6" height="6" x="3" y="3" rx="1" />
              <rect width="6" height="6" x="15" y="3" rx="1" />
              <rect width="6" height="6" x="3" y="15" rx="1" />
              <path d="M15 15h2v2h-2zM19 19h2v2h-2zM15 19h2v2h-2zM19 15h2v2h-2z" />
            </svg>
            <span>Sign in using the QR code on your computer</span>
          </button>

          {showQrModal && (
            <div className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-4 text-xs text-[var(--quant-muted-foreground)]">
              Scan QR code from QuantWorkplace desktop settings to sign in instantly.
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── SUB-SHEET: Mobile Inbox Flow Suite (Flows #5, #8, #11, #12, #40, #48, #49)
  if (step === 'mobile_inbox') {
    return (
      <div className="-mx-4 -my-3">
        <MobileInboxFlowSuite />
      </div>
    );
  }

  // ─── SCREEN 0: Settings Sheet Overview ─────────────────────────────────────
  if (step === 'overview') {
    return (
      <div className="space-y-4" data-testid="settings-flow-overview">
        {/* Sheet Header: ✕ on left, Settings centered */}
        <div className="relative flex items-center justify-center border-b border-[var(--quant-border)] pb-3 pt-1">
          <Link
            href="/"
            aria-label="Close Settings"
            className="absolute left-0 inline-flex size-8 items-center justify-center rounded-lg text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-surface-hover)] hover:text-[var(--quant-foreground)]"
          >
            <svg
              className="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </Link>
          <h1 className="text-base font-semibold text-[var(--quant-foreground)]">Settings</h1>
        </div>

        {/* Search Input */}
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--quant-muted-foreground)]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            role="searchbox"
            aria-label="Search settings"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search"
            className="w-full rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] py-2.5 pl-10 pr-4 text-sm text-[var(--quant-foreground)] outline-none transition-colors placeholder:text-[var(--quant-muted-foreground)] focus:border-[var(--brand-primary)]"
          />
        </div>

        {/* Quick Settings */}
        <div className="space-y-1.5">
          <h2 className="px-1 text-xs font-medium text-[var(--quant-muted-foreground)]">
            Quick Settings
          </h2>
          <div className="overflow-hidden rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)]">
            {matchesSearch('Display & Appearance', 'theme dark light density') && (
              <button
                type="button"
                data-testid="settings-open-appearance-btn"
                onClick={() => setStep('appearance')}
                className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-[var(--quant-border)] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--quant-surface-hover)]"
              >
                <span className="flex items-center gap-3.5">
                  <svg
                    className="size-5 text-[var(--quant-muted-foreground)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path d="M18.37 2.63 14 7l-1.59-1.59a2 2 0 0 0-2.82 0L8 7l9 9 1.59-1.59a2 2 0 0 0 0-2.82L17 10l4.37-4.37a2.12 2.12 0 1 0-3-3Z" />
                    <path d="M9 8c-2 3-4 3.5-7 4l8 10c2-1 6-5 6-7" />
                  </svg>
                  <span className="text-sm font-normal text-[var(--quant-foreground)]">
                    Display &amp; Appearance
                  </span>
                </span>
                <ChevronRight />
              </button>
            )}

            {matchesSearch('Signature', 'email sign off html') && (
              <button
                type="button"
                onClick={() => onNavigateTab?.('general')}
                className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-[var(--quant-border)] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--quant-surface-hover)]"
              >
                <span className="flex items-center gap-3.5">
                  <svg
                    className="size-5 text-[var(--quant-muted-foreground)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                  <span className="text-sm font-normal text-[var(--quant-foreground)]">
                    Signature
                  </span>
                </span>
                <ChevronRight />
              </button>
            )}

            {matchesSearch('Automatic Replies', 'vacation out of office auto responder') && (
              <button
                type="button"
                onClick={() => onNavigateTab?.('general')}
                className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-[var(--quant-border)] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--quant-surface-hover)]"
              >
                <span className="flex items-center gap-3.5">
                  <svg
                    className="size-5 text-[var(--quant-muted-foreground)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                  <span className="text-sm font-normal text-[var(--quant-foreground)]">
                    Automatic Replies
                  </span>
                </span>
                <span className="flex items-center gap-2 text-sm text-[var(--quant-muted-foreground)]">
                  <span>{vacationEnabled ? 'On' : 'Off'}</span>
                  <ChevronRight />
                </span>
              </button>
            )}

            {matchesSearch('Notifications & Sounds', 'push desktop alerts') && (
              <button
                type="button"
                onClick={() => onNavigateTab?.('notifications')}
                className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--quant-surface-hover)]"
              >
                <span className="flex items-center gap-3.5">
                  <svg
                    className="size-5 text-[var(--quant-muted-foreground)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                  </svg>
                  <span className="text-sm font-normal text-[var(--quant-foreground)]">
                    Notifications &amp; Sounds
                  </span>
                </span>
                <ChevronRight />
              </button>
            )}
          </div>
        </div>

        {/* General */}
        <div className="space-y-1.5">
          <h2 className="px-1 text-xs font-medium text-[var(--quant-muted-foreground)]">General</h2>
          <div className="overflow-hidden rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)]">
            {matchesSearch('Accounts', 'email connected aliases import') && (
              <button
                type="button"
                data-testid="settings-open-accounts-btn"
                onClick={() => setStep('accounts')}
                className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-[var(--quant-border)] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--quant-surface-hover)]"
              >
                <span className="flex items-center gap-3.5">
                  <svg
                    className="size-5 text-[var(--quant-muted-foreground)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <rect width="8" height="6" x="14" y="13" rx="1" />
                  </svg>
                  <span className="text-sm font-normal text-[var(--quant-foreground)]">
                    Accounts
                  </span>
                </span>
                <ChevronRight />
              </button>
            )}

            {matchesSearch('Email', 'filters rules inbox screening categories') && (
              <button
                type="button"
                data-testid="settings-open-email-inbox-btn"
                onClick={() => setStep('mobile_inbox')}
                className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-[var(--quant-border)] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--quant-surface-hover)]"
              >
                <span className="flex items-center gap-3.5">
                  <svg
                    className="size-5 text-[var(--quant-muted-foreground)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                  <span className="text-sm font-normal text-[var(--quant-foreground)]">Email</span>
                </span>
                <ChevronRight />
              </button>
            )}

            {matchesSearch('Calendar', 'events schedule meetings') && (
              <Link
                href="/calendar"
                className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-[var(--quant-border)] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--quant-surface-hover)]"
              >
                <span className="flex items-center gap-3.5">
                  <svg
                    className="size-5 text-[var(--quant-muted-foreground)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <rect width="18" height="18" x="3" y="4" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                  <span className="text-sm font-normal text-[var(--quant-foreground)]">
                    Calendar
                  </span>
                </span>
                <ChevronRight />
              </Link>
            )}

            {matchesSearch('Contacts', 'people address book vcard directory') && (
              <Link
                href="/contacts"
                className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-[var(--quant-border)] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--quant-surface-hover)]"
              >
                <span className="flex items-center gap-3.5">
                  <svg
                    className="size-5 text-[var(--quant-muted-foreground)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                  </svg>
                  <span className="text-sm font-normal text-[var(--quant-foreground)]">
                    Contacts
                  </span>
                </span>
                <ChevronRight />
              </Link>
            )}

            {matchesSearch('Face ID', 'biometrics passkey security lock') && (
              <div className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-[var(--quant-border)] px-4 py-3">
                <span className="flex items-center gap-3.5">
                  <svg
                    className="size-5 text-[var(--quant-muted-foreground)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
                    <path d="M9 10h.01M15 10h.01M9.5 15a3.5 3.5 0 0 0 5 0" />
                  </svg>
                  <span className="text-sm font-normal text-[var(--quant-foreground)]">
                    Face ID / Passkey
                  </span>
                </span>
                <PillSwitch
                  checked={biometricLockEnabled}
                  onChange={handleToggleBiometric}
                  label="Face ID / Passkey"
                />
              </div>
            )}

            {matchesSearch('Privacy', 'data safety terms policy') && (
              <Link
                href="/privacy"
                className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--quant-surface-hover)]"
              >
                <span className="flex items-center gap-3.5">
                  <svg
                    className="size-5 text-[var(--quant-muted-foreground)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                  </svg>
                  <span className="text-sm font-normal text-[var(--quant-foreground)]">
                    Privacy
                  </span>
                </span>
                <ChevronRight />
              </Link>
            )}
          </div>
        </div>

        {/* Set Default Email App */}
        {matchesSearch('Set Default Email App', 'mailto handler browser') && (
          <div className="overflow-hidden rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)]">
            <button
              type="button"
              onClick={handleSetDefaultEmailApp}
              className="flex min-h-12 w-full items-center px-4 py-3 text-left text-sm font-normal text-[#0078D4] transition-colors hover:bg-[var(--quant-surface-hover)]"
            >
              <span>Set Default Email App</span>
            </button>
          </div>
        )}

        {/* Integrations & Add-Ins */}
        <div className="space-y-1.5">
          <h2 className="px-1 text-xs font-medium text-[var(--quant-muted-foreground)]">
            Integrations &amp; Add-Ins
          </h2>
          <div className="overflow-hidden rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)]">
            {matchesSearch('Add-ins', 'assistant integrations ai shortcuts') && (
              <button
                type="button"
                data-testid="settings-open-addins-btn"
                onClick={() => setStep('addins')}
                className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--quant-surface-hover)]"
              >
                <span className="text-sm font-normal text-[var(--quant-foreground)]">Add-ins</span>
                <ChevronRight />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── SCREEN 1: Accounts List ───────────────────────────────────────────────
  if (step === 'accounts') {
    return (
      <div className="space-y-4" data-testid="settings-accounts-list">
        {/* Top Header: < | Accounts | Edit */}
        <div className="relative flex items-center justify-between border-b border-[var(--quant-border)] pb-3 pt-1">
          <button
            type="button"
            aria-label="Back to Settings"
            onClick={() => setStep('overview')}
            className="inline-flex size-8 items-center justify-center rounded-lg text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]"
          >
            <ChevronLeft />
          </button>
          <h1 className="text-base font-semibold text-[var(--quant-foreground)]">Accounts</h1>
          <button
            type="button"
            onClick={() => setEditMode((prev) => !prev)}
            className="text-sm font-normal text-[#0078D4] hover:underline"
          >
            {editMode ? 'Done' : 'Edit'}
          </button>
        </div>

        {/* Connected Primary Account Card */}
        <div className="overflow-hidden rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)]">
          <button
            type="button"
            data-testid="settings-primary-account-row"
            onClick={() => setStep('detail')}
            className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--quant-surface-hover)]"
          >
            <span className="flex min-w-0 items-center gap-3.5">
              <span
                aria-hidden="true"
                style={{ backgroundColor: showAsColor }}
                className="grid size-9 flex-none place-items-center rounded-lg text-xs font-bold text-white shadow-sm"
              >
                {initials}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-[var(--quant-foreground)]">
                  QuantMail
                </span>
                <span className="block truncate text-xs text-[var(--quant-muted-foreground)]">
                  {profile.email || 'Primary QuantMail account'}
                </span>
              </span>
            </span>

            <span className="flex flex-none items-center gap-2.5">
              <span className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] px-3 py-1 text-xs font-medium text-[var(--quant-foreground)]">
                Manage
              </span>
              <ChevronRight />
            </span>
          </button>

          {sendAsList.map((identity) => (
            <div
              key={identity.id}
              className="flex min-h-12 items-center justify-between gap-3 border-t border-[var(--quant-border)] px-4 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-[var(--quant-foreground)]">
                  {identity.displayName || identity.email}
                </p>
                <p className="truncate text-[11px] text-[var(--quant-muted-foreground)]">
                  Send-as alias · {identity.email}
                </p>
              </div>
              <span className="rounded-full border border-[var(--quant-border)] bg-[var(--quant-surface)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--quant-muted-foreground)]">
                {identity.verified ? 'Verified' : 'Awaiting code'}
              </span>
            </div>
          ))}
        </div>

        {/* Add Account / Create New Account Card */}
        <div className="overflow-hidden rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)]">
          <button
            type="button"
            data-testid="accounts-add-account-btn"
            onClick={() => setStep('add_account')}
            className="flex min-h-12 w-full items-center justify-between border-b border-[var(--quant-border)] px-4 py-3.5 text-left text-sm font-normal text-[var(--quant-foreground)] transition-colors hover:bg-[var(--quant-surface-hover)]"
          >
            <span>Add Account</span>
            <ChevronRight />
          </button>
          <Link
            href="/register"
            className="flex min-h-12 w-full items-center justify-between px-4 py-3.5 text-left text-sm font-normal text-[var(--quant-foreground)] transition-colors hover:bg-[var(--quant-surface-hover)]"
          >
            <span>Create New Account</span>
            <ChevronRight />
          </Link>
        </div>
      </div>
    );
  }

  // ─── SCREEN 2 & 3: Account Detail ──────────────────────────────────────────
  return (
    <div className="space-y-4" data-testid="settings-account-detail">
      {/* Top Header: < | QuantMail */}
      <div className="relative flex items-center justify-center border-b border-[var(--quant-border)] pb-3 pt-1">
        <button
          type="button"
          aria-label="Back to Accounts"
          onClick={() => setStep('accounts')}
          className="absolute left-0 inline-flex size-8 items-center justify-center rounded-lg text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]"
        >
          <ChevronLeft />
        </button>
        <h1 className="text-base font-semibold text-[var(--quant-foreground)]">QuantMail</h1>
      </div>

      {/* Hero Centered Avatar + Name + Email */}
      <div className="flex flex-col items-center py-3 text-center">
        <div
          aria-hidden="true"
          style={{ backgroundColor: showAsColor }}
          className="grid size-[72px] place-items-center rounded-full text-2xl font-normal text-white shadow-md"
        >
          {initials}
        </div>
        <h2 className="mt-3 text-base font-medium text-[var(--quant-foreground)]">
          {profile.displayName || 'QuantMail User'}
        </h2>
        <p className="mt-0.5 text-xs text-[var(--quant-muted-foreground)]">
          {profile.email || 'Account connected'}
        </p>
      </div>

      {/* Card 1: Description & Show As */}
      <div className="overflow-hidden rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)]">
        <div className="border-b border-[var(--quant-border)] px-4 py-3">
          {!editingDescription ? (
            <button
              type="button"
              onClick={() => {
                setDraftDescription(description || profile.displayName || profile.email);
                setEditingDescription(true);
              }}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div className="min-w-0">
                <span className="block text-sm font-normal text-[var(--quant-foreground)]">
                  Description
                </span>
                <span className="block truncate text-xs text-[var(--quant-muted-foreground)]">
                  {effectiveDescription}
                </span>
              </div>
              <ChevronRight />
            </button>
          ) : (
            <div className="space-y-2">
              <label
                htmlFor="account-description-input"
                className="block text-xs font-semibold text-[var(--quant-foreground)]"
              >
                Description
              </label>
              <input
                id="account-description-input"
                type="text"
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
                maxLength={80}
                className="w-full rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] px-3 py-2 text-sm text-[var(--quant-foreground)] outline-none focus:border-[var(--brand-primary)]"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={savingDescription}
                  onClick={() => void handleSaveDescription()}
                  className="rounded-lg bg-[#0078D4] px-3 py-1.5 text-xs font-semibold text-white"
                >
                  {savingDescription ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingDescription(false)}
                  className="rounded-lg border border-[var(--quant-border)] px-3 py-1.5 text-xs font-medium text-[var(--quant-muted-foreground)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3">
          <button
            type="button"
            onClick={() => setShowColorPicker((prev) => !prev)}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <span className="flex items-center gap-3">
              <span
                aria-hidden="true"
                style={{ backgroundColor: showAsColor }}
                className="grid size-6 place-items-center rounded-full text-[10px] font-semibold text-white"
              >
                {initials}
              </span>
              <span className="text-sm font-normal text-[var(--quant-foreground)]">Show As</span>
            </span>
            <ChevronRight />
          </button>

          {showColorPicker && (
            <div
              role="radiogroup"
              aria-label="Choose account avatar color"
              className="mt-3 flex flex-wrap gap-2.5 pt-1"
            >
              {SHOW_AS_COLORS.map((c) => {
                const selected = showAsColor === c.hex;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={c.label}
                    onClick={() => handleSelectColor(c.hex)}
                    style={{ backgroundColor: c.hex }}
                    className={`grid size-8 place-items-center rounded-full text-xs font-bold text-white transition-transform ${
                      selected
                        ? 'ring-2 ring-[#0078D4] ring-offset-2 ring-offset-[var(--quant-card)] scale-105'
                        : 'opacity-85 hover:opacity-100'
                    }`}
                  >
                    {selected ? '✓' : ''}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Card 2: Plan, Storage, Get Quant Pro */}
      <div className="overflow-hidden rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)]">
        <div className="flex min-h-12 items-center justify-between border-b border-[var(--quant-border)] px-4 py-3">
          <div>
            <span className="block text-sm font-normal text-[var(--quant-foreground)]">Plan</span>
            <span className="block text-xs text-[var(--quant-muted-foreground)]">Free</span>
          </div>
          <ChevronRight />
        </div>
        <Link
          href="/drive"
          className="flex min-h-12 items-center justify-between border-b border-[var(--quant-border)] px-4 py-3.5 text-sm font-normal text-[var(--quant-foreground)] transition-colors hover:bg-[var(--quant-surface-hover)]"
        >
          <span>Storage</span>
          <ChevronRight />
        </Link>
        <Link
          href="/drive"
          className="flex min-h-12 items-center px-4 py-3.5 text-sm font-normal text-[#B45309] dark:text-[#CA8A04] transition-colors hover:bg-[var(--quant-surface-hover)]"
        >
          <span>Get Quant Workspace Pro</span>
        </Link>
      </div>

      {/* Section: Email & Calendar (Screen 2 & 3) */}
      <div className="space-y-1.5">
        <h3 className="px-1 text-xs font-medium text-[var(--quant-muted-foreground)]">
          Email &amp; Calendar
        </h3>
        <div className="overflow-hidden rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)]">
          <button
            type="button"
            onClick={() => setStep('screening')}
            className="flex min-h-12 w-full items-center justify-between border-b border-[var(--quant-border)] px-4 py-3.5 text-left transition-colors hover:bg-[var(--quant-surface-hover)]"
          >
            <span className="text-sm font-normal text-[var(--quant-foreground)]">
              Sender Screening
            </span>
            <span className="flex items-center gap-2 text-sm text-[var(--quant-muted-foreground)]">
              <span>{activeFilterCount > 0 ? `${activeFilterCount} Active` : 'Off'}</span>
              <ChevronRight />
            </span>
          </button>

          <div className="border-b border-[var(--quant-border)] px-4 py-3">
            <div className="flex min-h-6 items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-normal text-[var(--quant-foreground)]">
                <span>Block External Images</span>
                <button
                  type="button"
                  aria-label="About blocking external images"
                  onClick={() => setShowBlockImagesHelp((prev) => !prev)}
                  className="inline-flex size-4 items-center justify-center rounded-full border border-[var(--quant-muted-foreground)] text-[10px] text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]"
                >
                  ?
                </button>
              </span>
              <PillSwitch
                checked={blockExternalImages}
                onChange={handleToggleBlockImages}
                label="Block External Images"
              />
            </div>
            {showBlockImagesHelp && (
              <p className="mt-2 text-xs leading-relaxed text-[var(--quant-muted-foreground)]">
                Blocking external images protects your privacy by preventing tracking pixels from
                notifying senders when or where you open an email.
              </p>
            )}
          </div>

          <div className="flex min-h-12 items-center justify-between border-b border-[var(--quant-border)] px-4 py-3">
            <span className="text-sm font-normal text-[var(--quant-foreground)]">
              Quanty Editor
            </span>
            <PillSwitch
              checked={quantyEditorEnabled}
              onChange={handleToggleQuantyEditor}
              label="Quanty Editor"
            />
          </div>

          <button
            type="button"
            onClick={() => setStep('editor_language')}
            className="flex min-h-12 w-full items-center justify-between border-b border-[var(--quant-border)] px-4 py-3.5 text-left transition-colors hover:bg-[var(--quant-surface-hover)]"
          >
            <span className="text-sm font-normal text-[var(--quant-foreground)]">
              Editor Language
            </span>
            <span className="flex items-center gap-2 text-sm text-[var(--quant-muted-foreground)]">
              <span>{editorLanguage}</span>
              <ChevronRight />
            </span>
          </button>

          <button
            type="button"
            onClick={handleCycleReportMessages}
            className="flex min-h-12 w-full items-center justify-between px-4 py-3.5 text-left transition-colors hover:bg-[var(--quant-surface-hover)]"
          >
            <span className="text-sm font-normal text-[var(--quant-foreground)]">
              Report Messages
            </span>
            <span className="flex items-center gap-2 text-sm text-[var(--quant-muted-foreground)]">
              <span>{reportMessagesMode === 'always_ask' ? 'Always Ask' : 'Always Report'}</span>
              <ChevronRight />
            </span>
          </button>
        </div>
      </div>

      {/* Section: Data Storage (Screen 3) */}
      <div className="space-y-1.5">
        <h3 className="px-1 text-xs font-medium text-[var(--quant-muted-foreground)]">
          Data Storage
        </h3>
        <div className="overflow-hidden rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)]">
          <button
            type="button"
            onClick={() => setStep('sync_settings')}
            className="flex min-h-12 w-full items-center justify-between px-4 py-3.5 text-sm font-normal text-[var(--quant-foreground)] transition-colors hover:bg-[var(--quant-surface-hover)]"
          >
            <span>Sync Settings</span>
            <ChevronRight />
          </button>
        </div>
        <p className="px-1 text-xs leading-relaxed text-[var(--quant-muted-foreground)]">
          Automatically sync and download your emails and attachments.
        </p>
      </div>

      {/* Reset Account Card (Screen 3) */}
      <div className="space-y-1.5">
        <div className="overflow-hidden rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)]">
          <button
            type="button"
            onClick={handleResetAccount}
            className="flex min-h-12 w-full items-center px-4 py-3.5 text-left text-sm font-normal text-[#0078D4] transition-colors hover:bg-[var(--quant-surface-hover)]"
          >
            Reset Account
          </button>
        </div>
        <p className="px-1 text-xs leading-relaxed text-[var(--quant-muted-foreground)]">
          Try resetting the account if you have sync issues.
        </p>
      </div>

      {/* Remove Account Card (Screen 3) */}
      <div className="space-y-1.5">
        <div className="overflow-hidden rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)]">
          {!confirmingRemove ? (
            <button
              type="button"
              onClick={() => setConfirmingRemove(true)}
              className="flex min-h-12 w-full items-center px-4 py-3.5 text-left text-sm font-normal text-[#EF4444] transition-colors hover:bg-[var(--quant-surface-hover)]"
            >
              Remove Account
            </button>
          ) : (
            <div className="space-y-3 p-4">
              <p className="text-xs leading-relaxed text-[var(--quant-foreground)]">
                Remove this account from this device? Any locally cached mail data will be cleared
                and your session will sign out.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={removingAccount}
                  onClick={() => void handleRemoveAccount()}
                  className="rounded-lg bg-[#EF4444] px-3 py-1.5 text-xs font-semibold text-white"
                >
                  {removingAccount ? 'Removing…' : 'Confirm Remove Account'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingRemove(false)}
                  className="rounded-lg border border-[var(--quant-border)] px-3 py-1.5 text-xs font-medium text-[var(--quant-muted-foreground)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
        <p className="px-1 text-xs leading-relaxed text-[var(--quant-muted-foreground)]">
          Removing this account from the app will delete any local data stored in the app.
        </p>
      </div>
    </div>
  );
}

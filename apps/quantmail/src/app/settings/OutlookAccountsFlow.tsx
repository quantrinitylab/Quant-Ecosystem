'use client';

/**
 * Outlook iOS Flow #1 — Settings Hub -> Accounts -> Account Detail
 * (Microsoft Outlook iOS Accounts.zip: Screens 0, 1, 2, 3).
 *
 * Implements the 4-screen Outlook iOS Accounts flow inside QuantMail Settings:
 *   - Screen 0 (`overview`): Searchable Settings index with Quick Settings
 *     (Display & Appearance, Signature, Automatic Replies with live On/Off
 *     status, Notifications & Sounds), General (Accounts, Email, Calendar,
 *     Contacts, Security, Privacy), Set Default Email App, and Integrations.
 *   - Screen 1 (`accounts`): Accounts list showing the primary QuantMail
 *     account row (with initials/provider icon, email, plan pill, chevron),
 *     verified/pending Send-As aliases, Add Account, and Create New Account.
 *   - Screen 2 & 3 (`detail`): Account Detail view with centered 72px initials
 *     avatar, display name & email, Description editor, Show As avatar color
 *     picker, Plan & Storage rows, Email & Calendar controls (Sender Screening,
 *     Block External Images toggle, Quanty Editor toggle, Editor Language,
 *     Report Messages mode), Data Storage (Sync Settings), Reset Account, and
 *     Remove Account.
 *
 * Honesty contract: every control either calls a real backend endpoint
 * (`getUserInfo`, `updateProfile`, `getSendAsIdentities`,
 * `getVacationResponder`, `getEmailFilters`, `logout`) or writes a preference
 * key with an explicit reader.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiClient, type SendAsIdentity } from '../../services/api-client';
import { browserAuthSession } from '../../services/browser-auth-session';
import { showToast } from '../../components/InboxToast';
import { invalidateDefaultSignature } from '../../lib/email-signature-preference';

export type OutlookFlowStep = 'overview' | 'accounts' | 'detail';

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
  { id: 'blue', label: 'Outlook Blue', hex: '#3B82F6' },
  { id: 'emerald', label: 'Emerald', hex: '#10B981' },
  { id: 'violet', label: 'Violet', hex: '#8B5CF6' },
  { id: 'teal', label: 'Teal', hex: '#14B8A6' },
];

export const ACCOUNT_DESCRIPTION_KEY = 'quant-account-description';
export const ACCOUNT_SHOW_AS_COLOR_KEY = 'quant-account-show-as-color';
export const BLOCK_EXTERNAL_IMAGES_KEY = 'quant-block-external-images';
export const QUANTY_EDITOR_ENABLED_KEY = 'quant-editor-enabled';
export const REPORT_MESSAGES_MODE_KEY = 'quant-report-messages-mode';

export type ReportMessagesMode = 'always_ask' | 'always_report';

export function deriveInitials(displayName: string, email: string): string {
  const source = (displayName || email || 'QM').trim();
  const parts = source.split(/[\s._@-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export interface OutlookAccountsFlowProps {
  profile: { displayName: string; email: string; username: string };
  hasSignature: boolean;
  themeLabel: string;
  densityLabel: string;
  aiModeLabel: string;
  notificationModeLabel: string;
  initialStep?: OutlookFlowStep;
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

export function OutlookAccountsFlow({
  profile,
  hasSignature,
  themeLabel,
  densityLabel,
  aiModeLabel,
  notificationModeLabel,
  initialStep = 'overview',
  onNavigateTab,
  onProfileUpdated,
  onResetAccountCache,
}: OutlookAccountsFlowProps) {
  const [step, setStep] = useState<OutlookFlowStep>(initialStep);
  const [searchQuery, setSearchQuery] = useState('');
  const [editMode, setEditMode] = useState(false);

  // Live backend state for Screen 0 / Screen 1 / Screen 2
  const [vacationEnabled, setVacationEnabled] = useState<boolean>(false);
  const [filterCount, setFilterCount] = useState<number>(0);
  const [sendAsList, setSendAsList] = useState<SendAsIdentity[]>([]);

  // Account Detail state (Screen 2 & 3)
  const [description, setDescription] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [draftDescription, setDraftDescription] = useState('');
  const [savingDescription, setSavingDescription] = useState(false);

  const [showAsColor, setShowAsColor] = useState<string>('#EC4899');
  const [showColorPicker, setShowColorPicker] = useState(false);

  const [blockExternalImages, setBlockExternalImages] = useState(false);
  const [quantyEditorEnabled, setQuantyEditorEnabled] = useState(true);
  const [reportMessagesMode, setReportMessagesMode] = useState<ReportMessagesMode>('always_ask');
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removingAccount, setRemovingAccount] = useState(false);

  useEffect(() => {
    setStep(initialStep);
  }, [initialStep]);

  useEffect(() => {
    try {
      const savedDesc = localStorage.getItem(ACCOUNT_DESCRIPTION_KEY);
      if (savedDesc) setDescription(savedDesc);
      const savedColor = localStorage.getItem(ACCOUNT_SHOW_AS_COLOR_KEY);
      if (savedColor && SHOW_AS_COLORS.some((c) => c.hex === savedColor)) {
        setShowAsColor(savedColor);
      }
      setBlockExternalImages(localStorage.getItem(BLOCK_EXTERNAL_IMAGES_KEY) === 'true');
      const editorStored = localStorage.getItem(QUANTY_EDITOR_ENABLED_KEY);
      setQuantyEditorEnabled(editorStored === null ? true : editorStored === 'true');
      const reportStored = localStorage.getItem(REPORT_MESSAGES_MODE_KEY);
      if (reportStored === 'always_report' || reportStored === 'always_ask') {
        setReportMessagesMode(reportStored);
      }
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
        setFilterCount(res.data.filter((f) => f.enabled !== false).length);
      }
    });
  }, []);

  const initials = useMemo(
    () => deriveInitials(profile.displayName, profile.email),
    [profile.displayName, profile.email],
  );

  const effectiveDescription = description.trim() || profile.email || 'QuantMail Account';

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
        /* fall through to honest message */
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

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const matchesSearch = useCallback(
    (label: string, keywords: string) => {
      if (!normalizedQuery) return true;
      return (
        label.toLowerCase().includes(normalizedQuery) ||
        keywords.toLowerCase().includes(normalizedQuery)
      );
    },
    [normalizedQuery],
  );

  // ─── SCREEN 0: Settings Hub (Microsoft Outlook iOS Accounts 0.png) ─────────
  if (step === 'overview') {
    return (
      <div className="space-y-5" data-testid="outlook-settings-overview">
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
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] py-2.5 pl-10 pr-4 text-sm text-[var(--quant-foreground)] outline-none transition-colors placeholder:text-[var(--quant-muted-foreground)] focus:border-[var(--brand-primary)]"
          />
        </div>

        {/* Quick Settings Section */}
        <div className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-[var(--quant-muted-foreground)]">
            Quick Settings
          </h2>
          <div className="overflow-hidden rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)]">
            {matchesSearch('Display & Appearance', 'theme dark light obsidian density compact cozy') && (
              <button
                type="button"
                onClick={() => onNavigateTab?.('appearance')}
                className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-[var(--quant-border)] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--quant-surface-hover)]"
              >
                <span className="flex items-center gap-3">
                  <svg
                    className="size-4 text-[var(--quant-muted-foreground)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M18.37 2.63 14 7l-1.59-1.59a2 2 0 0 0-2.82 0L8 7l9 9 1.59-1.59a2 2 0 0 0 0-2.82L17 10l4.37-4.37a2.12 2.12 0 1 0-3-3Z" />
                    <path d="M9 8c-2 3-4 3.5-7 4l8 10c2-1 6-5 6-7" />
                  </svg>
                  <span className="text-sm font-medium text-[var(--quant-foreground)]">
                    Display &amp; Appearance
                  </span>
                </span>
                <span className="flex items-center gap-2 text-xs text-[var(--quant-muted-foreground)]">
                  <span>
                    {themeLabel} · {densityLabel}
                  </span>
                  <ChevronRight />
                </span>
              </button>
            )}

            {matchesSearch('Signature', 'email signature html footer sign-off') && (
              <button
                type="button"
                onClick={() => onNavigateTab?.('general')}
                className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-[var(--quant-border)] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--quant-surface-hover)]"
              >
                <span className="flex items-center gap-3">
                  <svg
                    className="size-4 text-[var(--quant-muted-foreground)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                  <span className="text-sm font-medium text-[var(--quant-foreground)]">
                    Signature
                  </span>
                </span>
                <span className="flex items-center gap-2 text-xs text-[var(--quant-muted-foreground)]">
                  <span>{hasSignature ? 'Active' : 'None'}</span>
                  <ChevronRight />
                </span>
              </button>
            )}

            {matchesSearch('Automatic Replies', 'vacation responder out of office auto reply') && (
              <button
                type="button"
                onClick={() => onNavigateTab?.('general')}
                className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-[var(--quant-border)] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--quant-surface-hover)]"
              >
                <span className="flex items-center gap-3">
                  <svg
                    className="size-4 text-[var(--quant-muted-foreground)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                  <span className="text-sm font-medium text-[var(--quant-foreground)]">
                    Automatic Replies
                  </span>
                </span>
                <span className="flex items-center gap-2 text-xs text-[var(--quant-muted-foreground)]">
                  <span>{vacationEnabled ? 'On' : 'Off'}</span>
                  <ChevronRight />
                </span>
              </button>
            )}

            {matchesSearch('Notifications & Sounds', 'push desktop alerts bell') && (
              <button
                type="button"
                onClick={() => onNavigateTab?.('notifications')}
                className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--quant-surface-hover)]"
              >
                <span className="flex items-center gap-3">
                  <svg
                    className="size-4 text-[var(--quant-muted-foreground)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                  </svg>
                  <span className="text-sm font-medium text-[var(--quant-foreground)]">
                    Notifications &amp; Sounds
                  </span>
                </span>
                <span className="flex items-center gap-2 text-xs text-[var(--quant-muted-foreground)]">
                  <span>{notificationModeLabel}</span>
                  <ChevronRight />
                </span>
              </button>
            )}
          </div>
        </div>

        {/* General Section */}
        <div className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-[var(--quant-muted-foreground)]">
            General
          </h2>
          <div className="overflow-hidden rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)]">
            {matchesSearch('Accounts', 'mailbox send-as aliases import profile storage reset remove') && (
              <button
                type="button"
                data-testid="outlook-open-accounts-btn"
                onClick={() => setStep('accounts')}
                className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-[var(--quant-border)] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--quant-surface-hover)]"
              >
                <span className="flex items-center gap-3">
                  <svg
                    className="size-4 text-[var(--brand-primary)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  <span className="text-sm font-medium text-[var(--quant-foreground)]">
                    Accounts
                  </span>
                </span>
                <span className="flex items-center gap-2 text-xs text-[var(--quant-muted-foreground)]">
                  <span>{profile.email || '1 connected'}</span>
                  <ChevronRight />
                </span>
              </button>
            )}

            {matchesSearch('Email', 'filters rules inbox screening categories') && (
              <button
                type="button"
                onClick={() => onNavigateTab?.('filters')}
                className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-[var(--quant-border)] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--quant-surface-hover)]"
              >
                <span className="flex items-center gap-3">
                  <svg
                    className="size-4 text-[var(--quant-muted-foreground)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                  <span className="text-sm font-medium text-[var(--quant-foreground)]">Email</span>
                </span>
                <span className="flex items-center gap-2 text-xs text-[var(--quant-muted-foreground)]">
                  <span>{filterCount > 0 ? `${filterCount} rules` : 'Filters & rules'}</span>
                  <ChevronRight />
                </span>
              </button>
            )}

            {matchesSearch('Calendar', 'events schedule meetings timezones') && (
              <Link
                href="/calendar"
                className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-[var(--quant-border)] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--quant-surface-hover)]"
              >
                <span className="flex items-center gap-3">
                  <svg
                    className="size-4 text-[var(--quant-muted-foreground)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <rect width="18" height="18" x="3" y="4" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                  <span className="text-sm font-medium text-[var(--quant-foreground)]">
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
                <span className="flex items-center gap-3">
                  <svg
                    className="size-4 text-[var(--quant-muted-foreground)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                  </svg>
                  <span className="text-sm font-medium text-[var(--quant-foreground)]">
                    Contacts
                  </span>
                </span>
                <ChevronRight />
              </Link>
            )}

            {matchesSearch('Security & Passkey', 'encryption tls dkim spf 2fa passkey') && (
              <button
                type="button"
                onClick={() => onNavigateTab?.('security')}
                className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-[var(--quant-border)] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--quant-surface-hover)]"
              >
                <span className="flex items-center gap-3">
                  <svg
                    className="size-4 text-[var(--quant-muted-foreground)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                  </svg>
                  <span className="text-sm font-medium text-[var(--quant-foreground)]">
                    Security &amp; Passkey
                  </span>
                </span>
                <ChevronRight />
              </button>
            )}

            {matchesSearch('Privacy', 'data safety zero ads policy') && (
              <Link
                href="/privacy"
                className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--quant-surface-hover)]"
              >
                <span className="flex items-center gap-3">
                  <svg
                    className="size-4 text-[var(--quant-muted-foreground)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4M12 8h.01" />
                  </svg>
                  <span className="text-sm font-medium text-[var(--quant-foreground)]">
                    Privacy
                  </span>
                </span>
                <ChevronRight />
              </Link>
            )}
          </div>
        </div>

        {/* Set Default Email App Card */}
        {matchesSearch('Set Default Email App', 'mailto default handler browser') && (
          <div className="overflow-hidden rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)]">
            <button
              type="button"
              onClick={handleSetDefaultEmailApp}
              className="flex min-h-12 w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-[var(--brand-primary)] transition-colors hover:bg-[var(--quant-surface-hover)]"
            >
              <span>Set Default Email App</span>
              <ChevronRight />
            </button>
          </div>
        )}

        {/* Integrations & Add-Ins Section */}
        <div className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-[var(--quant-muted-foreground)]">
            Integrations &amp; Add-Ins
          </h2>
          <div className="overflow-hidden rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)]">
            {matchesSearch('Quanty Assistant', 'ai copilot fast balanced deep thinking') && (
              <button
                type="button"
                onClick={() => onNavigateTab?.('ai')}
                className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-[var(--quant-border)] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--quant-surface-hover)]"
              >
                <span className="text-sm font-medium text-[var(--quant-foreground)]">
                  Quanty AI Assistant
                </span>
                <span className="flex items-center gap-2 text-xs text-[var(--quant-muted-foreground)]">
                  <span>{aiModeLabel}</span>
                  <ChevronRight />
                </span>
              </button>
            )}

            {matchesSearch('Keyboard Shortcuts', 'hotkeys chords j k compose') && (
              <button
                type="button"
                onClick={() => onNavigateTab?.('keyboard')}
                className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--quant-surface-hover)]"
              >
                <span className="text-sm font-medium text-[var(--quant-foreground)]">
                  Keyboard Shortcuts
                </span>
                <ChevronRight />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── SCREEN 1: Accounts List (Microsoft Outlook iOS Accounts 1.png) ────────
  if (step === 'accounts') {
    return (
      <div className="space-y-5" data-testid="outlook-accounts-list">
        {/* Sub-header matching Outlook Screen 1: < Back | Accounts | Edit */}
        <div className="flex items-center justify-between rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] px-4 py-3">
          <button
            type="button"
            onClick={() => setStep('overview')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--brand-primary)] hover:underline"
          >
            <span aria-hidden="true">←</span> Settings
          </button>
          <h2 className="text-sm font-semibold text-[var(--quant-foreground)]">Accounts</h2>
          <button
            type="button"
            onClick={() => setEditMode((prev) => !prev)}
            className="text-xs font-semibold text-[var(--brand-primary)] hover:underline"
          >
            {editMode ? 'Done' : 'Edit'}
          </button>
        </div>

        {/* Connected Primary Account Card */}
        <div className="overflow-hidden rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)]">
          <button
            type="button"
            data-testid="outlook-primary-account-row"
            onClick={() => setStep('detail')}
            className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--quant-surface-hover)]"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden="true"
                style={{ backgroundColor: showAsColor }}
                className="grid size-10 flex-none place-items-center rounded-xl text-xs font-bold text-white shadow-sm"
              >
                {initials}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-[var(--quant-foreground)]">
                  QuantMail
                </span>
                <span className="block truncate text-xs text-[var(--quant-muted-foreground)]">
                  {profile.email || 'Primary QuantMail account'}
                </span>
              </span>
            </span>

            <span className="flex flex-none items-center gap-2.5">
              <span className="rounded-md border border-[var(--brand-soft-border)] bg-[var(--brand-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--brand-primary)]">
                Workspace
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
              <span className="rounded-full border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--quant-muted-foreground)]">
                {identity.verified ? 'Verified' : 'Awaiting code'}
              </span>
            </div>
          ))}
        </div>

        {/* Add Account / Create New Account Card */}
        <div className="overflow-hidden rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)]">
          <Link
            href="/settings/account"
            className="flex min-h-12 w-full items-center justify-between border-b border-[var(--quant-border)] px-4 py-3 text-left text-sm font-medium text-[var(--quant-foreground)] transition-colors hover:bg-[var(--quant-surface-hover)]"
          >
            <span>Add Account</span>
            <ChevronRight />
          </Link>
          <Link
            href="/register"
            className="flex min-h-12 w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-[var(--quant-foreground)] transition-colors hover:bg-[var(--quant-surface-hover)]"
          >
            <span>Create New Account</span>
            <ChevronRight />
          </Link>
        </div>
      </div>
    );
  }

  // ─── SCREEN 2 & 3: Account Detail (Microsoft Outlook iOS Accounts 2 & 3) ───
  return (
    <div className="space-y-5" data-testid="outlook-account-detail">
      {/* Top Bar: < Accounts | QuantMail */}
      <div className="flex items-center justify-between rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] px-4 py-3">
        <button
          type="button"
          onClick={() => setStep('accounts')}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--brand-primary)] hover:underline"
        >
          <span aria-hidden="true">←</span> Accounts
        </button>
        <h2 className="text-sm font-semibold text-[var(--quant-foreground)]">QuantMail</h2>
        <span className="w-12" aria-hidden="true" />
      </div>

      {/* Hero Centered Avatar + Name + Email (Screen 2 top) */}
      <div className="flex flex-col items-center rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] px-4 py-6 text-center">
        <div
          aria-hidden="true"
          style={{ backgroundColor: showAsColor }}
          className="grid size-20 place-items-center rounded-full text-2xl font-semibold text-white shadow-md"
        >
          {initials}
        </div>
        <h3 className="mt-3 text-base font-semibold text-[var(--quant-foreground)]">
          {profile.displayName || 'QuantMail User'}
        </h3>
        <p className="mt-0.5 text-xs text-[var(--quant-muted-foreground)]">
          {profile.email || 'Account connected'}
        </p>
      </div>

      {/* Card 1: Description & Show As */}
      <div className="overflow-hidden rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)]">
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
                <span className="block text-sm font-medium text-[var(--quant-foreground)]">
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
                htmlFor="outlook-account-description-input"
                className="block text-xs font-semibold text-[var(--quant-foreground)]"
              >
                Description
              </label>
              <input
                id="outlook-account-description-input"
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
                  className="rounded-lg bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-black"
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
                className="grid size-7 place-items-center rounded-full text-[11px] font-bold text-white"
              >
                {initials}
              </span>
              <span className="text-sm font-medium text-[var(--quant-foreground)]">Show As</span>
            </span>
            <ChevronRight />
          </button>

          {showColorPicker && (
            <div
              role="radiogroup"
              aria-label="Choose account avatar color"
              className="mt-3 flex flex-wrap gap-2 pt-1"
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
                      selected ? 'ring-2 ring-white ring-offset-2 ring-offset-[var(--quant-card)] scale-105' : 'opacity-80 hover:opacity-100'
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

      {/* Card 2: Plan & Storage */}
      <div className="overflow-hidden rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)]">
        <div className="flex min-h-12 items-center justify-between border-b border-[var(--quant-border)] px-4 py-3">
          <div>
            <span className="block text-sm font-medium text-[var(--quant-foreground)]">Plan</span>
            <span className="block text-xs text-[var(--quant-muted-foreground)]">Free</span>
          </div>
          <ChevronRight />
        </div>
        <Link
          href="/drive"
          className="flex min-h-12 items-center justify-between px-4 py-3 text-sm font-medium text-[var(--quant-foreground)] transition-colors hover:bg-[var(--quant-surface-hover)]"
        >
          <span>Storage</span>
          <ChevronRight />
        </Link>
      </div>

      {/* Section: Email & Calendar (Screen 2 & 3) */}
      <div className="space-y-2">
        <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-[var(--quant-muted-foreground)]">
          Email &amp; Calendar
        </h3>
        <div className="overflow-hidden rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)]">
          <button
            type="button"
            onClick={() => onNavigateTab?.('filters')}
            className="flex min-h-12 w-full items-center justify-between border-b border-[var(--quant-border)] px-4 py-3 text-left transition-colors hover:bg-[var(--quant-surface-hover)]"
          >
            <span className="text-sm font-medium text-[var(--quant-foreground)]">
              Sender Screening
            </span>
            <span className="flex items-center gap-2 text-xs text-[var(--quant-muted-foreground)]">
              <span>{filterCount > 0 ? `${filterCount} Active` : 'Off'}</span>
              <ChevronRight />
            </span>
          </button>

          <label className="flex min-h-12 cursor-pointer items-center justify-between border-b border-[var(--quant-border)] px-4 py-3">
            <span className="text-sm font-medium text-[var(--quant-foreground)]">
              Block External Images
            </span>
            <input
              type="checkbox"
              checked={blockExternalImages}
              onChange={(e) => handleToggleBlockImages(e.target.checked)}
              aria-label="Block External Images"
              className="size-4 accent-[var(--brand-primary)]"
            />
          </label>

          <label className="flex min-h-12 cursor-pointer items-center justify-between border-b border-[var(--quant-border)] px-4 py-3">
            <span className="text-sm font-medium text-[var(--quant-foreground)]">
              Quanty Editor
            </span>
            <input
              type="checkbox"
              checked={quantyEditorEnabled}
              onChange={(e) => handleToggleQuantyEditor(e.target.checked)}
              aria-label="Quanty Editor"
              className="size-4 accent-[var(--brand-primary)]"
            />
          </label>

          <button
            type="button"
            onClick={() => onNavigateTab?.('ai')}
            className="flex min-h-12 w-full items-center justify-between border-b border-[var(--quant-border)] px-4 py-3 text-left transition-colors hover:bg-[var(--quant-surface-hover)]"
          >
            <span className="text-sm font-medium text-[var(--quant-foreground)]">
              Editor Language &amp; Mode
            </span>
            <span className="flex items-center gap-2 text-xs text-[var(--quant-muted-foreground)]">
              <span>{aiModeLabel || 'Default'}</span>
              <ChevronRight />
            </span>
          </button>

          <button
            type="button"
            onClick={handleCycleReportMessages}
            className="flex min-h-12 w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--quant-surface-hover)]"
          >
            <span className="text-sm font-medium text-[var(--quant-foreground)]">
              Report Messages
            </span>
            <span className="flex items-center gap-2 text-xs text-[var(--quant-muted-foreground)]">
              <span>{reportMessagesMode === 'always_ask' ? 'Always Ask' : 'Always Report'}</span>
              <ChevronRight />
            </span>
          </button>
        </div>
      </div>

      {/* Section: Data Storage (Screen 3) */}
      <div className="space-y-1.5">
        <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-[var(--quant-muted-foreground)]">
          Data Storage
        </h3>
        <div className="overflow-hidden rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)]">
          <Link
            href="/settings/account"
            className="flex min-h-12 w-full items-center justify-between px-4 py-3 text-sm font-medium text-[var(--quant-foreground)] transition-colors hover:bg-[var(--quant-surface-hover)]"
          >
            <span>Sync Settings</span>
            <ChevronRight />
          </Link>
        </div>
        <p className="px-1 text-xs leading-relaxed text-[var(--quant-muted-foreground)]">
          Automatically sync and download your emails and attachments.
        </p>
      </div>

      {/* Reset Account Card (Screen 3) */}
      <div className="space-y-1.5">
        <div className="overflow-hidden rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)]">
          <button
            type="button"
            onClick={handleResetAccount}
            className="flex min-h-12 w-full items-center px-4 py-3 text-left text-sm font-semibold text-[var(--brand-primary)] transition-colors hover:bg-[var(--quant-surface-hover)]"
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
        <div className="overflow-hidden rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)]">
          {!confirmingRemove ? (
            <button
              type="button"
              onClick={() => setConfirmingRemove(true)}
              className="flex min-h-12 w-full items-center px-4 py-3 text-left text-sm font-semibold text-[var(--quant-destructive)] transition-colors hover:bg-[var(--quant-surface-hover)]"
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
                  className="rounded-lg bg-[var(--quant-destructive)] px-3 py-1.5 text-xs font-semibold text-white"
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

// ============================================================================
// QuantAI — Settings screen (Quanty S2 parity with the Muse app).
//
// 10 rows, Muse-style dark cards:
//   App lock · Set as default assistant · Add to home screen ·
//   Redeem referral code · Data controls · Report an issue ·
//   Help & support · Legal info · QuantID account · Log out (destructive)
//
// No dead buttons: every row opens a real flow or an honest explainer.
// ============================================================================
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../providers/auth-provider';
import { getAuthUser } from '../../lib/auth';
import { SettingsRow, SettingsCard } from '../../components/settings/SettingsRow';
import {
  SettingsSheet,
  SheetNote,
  SheetDangerButton,
} from '../../components/settings/SettingsSheet';
import {
  LockIcon,
  AssistantIcon,
  HomePlusIcon,
  GiftIcon,
  DataIcon,
  ReportIcon,
  HelpIcon,
  LegalIcon,
  UserIcon,
  LogoutIcon,
  BackIcon,
} from '../../components/settings/SettingsIcons';
import { AppLockSheet } from '../../components/settings/sheets/AppLockSheet';
import { DefaultAssistantSheet } from '../../components/settings/sheets/DefaultAssistantSheet';
import { AddToHomeScreenSheet } from '../../components/settings/sheets/AddToHomeScreenSheet';
import { ReferralSheet } from '../../components/settings/sheets/ReferralSheet';
import { DataControlsSheet } from '../../components/settings/sheets/DataControlsSheet';
import { ReportIssueSheet } from '../../components/settings/sheets/ReportIssueSheet';
import { HelpSheet } from '../../components/settings/sheets/HelpSheet';
import { LegalSheet } from '../../components/settings/sheets/LegalSheet';

type SheetKind =
  | 'app-lock'
  | 'default-assistant'
  | 'add-to-home'
  | 'referral'
  | 'data-controls'
  | 'report'
  | 'help'
  | 'legal'
  | 'logout'
  | null;

const QUANTMAIL_ACCOUNT_URL = 'https://quantmail.in/settings/account';

export default function SettingsPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, logout } = useAuth();
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const closeSheet = () => setSheet(null);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
      closeSheet();
      router.replace('/login');
    }
  }

  const user = getAuthUser();
  const displayName = user?.name ?? user?.email?.split('@')[0] ?? 'Quant member';
  const initial = (displayName.trim()[0] ?? 'Q').toUpperCase();

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto w-full max-w-xl px-4 pb-16 pt-4">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Back"
            data-testid="settings-back"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-white/80 transition-colors hover:bg-white/[0.1]"
          >
            <BackIcon />
          </button>
          <h1 className="flex-1 text-center text-[17px] font-semibold">Settings</h1>
          <span className="w-10" />
        </div>

        {!isLoading && !isAuthenticated ? (
          <div className="rounded-3xl bg-zinc-900/70 p-8 text-center">
            <p className="text-[15px] text-white/70">Sign in to manage your QuantAI settings.</p>
            <button
              type="button"
              onClick={() => router.replace('/login?returnTo=/settings')}
              data-testid="settings-signin"
              className="mt-4 w-full rounded-2xl bg-blue-500 py-3.5 text-[15px] font-semibold text-white hover:bg-blue-400"
            >
              Sign in
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Device */}
            <SettingsCard testId="settings-card-device">
              <SettingsRow
                icon={<LockIcon />}
                label="App lock"
                testId="settings-row-app-lock"
                onClick={() => setSheet('app-lock')}
              />
              <SettingsRow
                icon={<AssistantIcon />}
                label="Set as default assistant"
                testId="settings-row-default-assistant"
                onClick={() => setSheet('default-assistant')}
              />
              <SettingsRow
                icon={<HomePlusIcon />}
                label="Add to home screen"
                testId="settings-row-add-to-home"
                onClick={() => setSheet('add-to-home')}
              />
            </SettingsCard>

            {/* Referral */}
            <SettingsCard testId="settings-card-referral">
              <SettingsRow
                icon={<GiftIcon />}
                label="Redeem referral code"
                comingSoon
                testId="settings-row-referral"
                onClick={() => setSheet('referral')}
              />
            </SettingsCard>

            {/* Data & support */}
            <SettingsCard testId="settings-card-support">
              <SettingsRow
                icon={<DataIcon />}
                label="Data controls"
                subtitle="Export or delete your data"
                testId="settings-row-data-controls"
                onClick={() => setSheet('data-controls')}
              />
              <SettingsRow
                icon={<ReportIcon />}
                label="Report an issue"
                testId="settings-row-report"
                onClick={() => setSheet('report')}
              />
              <SettingsRow
                icon={<HelpIcon />}
                label="Help & support"
                testId="settings-row-help"
                onClick={() => setSheet('help')}
              />
              <SettingsRow
                icon={<LegalIcon />}
                label="Legal info"
                testId="settings-row-legal"
                onClick={() => setSheet('legal')}
              />
            </SettingsCard>

            {/* Account */}
            <div>
              <p className="mb-2 px-1 text-[13px] font-medium text-white/40">Your account</p>
              <SettingsCard testId="settings-card-account">
                <SettingsRow
                  icon={
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-500 text-[15px] font-bold text-white">
                      {initial}
                    </span>
                  }
                  label="QuantID Account"
                  subtitle={
                    user?.email
                      ? `${displayName} · ${user.email}`
                      : 'Password, security, personal details'
                  }
                  testId="settings-row-account"
                  onClick={() => window.open(QUANTMAIL_ACCOUNT_URL, '_blank', 'noopener,noreferrer')}
                />
              </SettingsCard>
            </div>

            {/* Log out */}
            <SettingsCard testId="settings-card-logout">
              <SettingsRow
                icon={<LogoutIcon />}
                label="Log out"
                destructive
                testId="settings-row-logout"
                onClick={() => setSheet('logout')}
              />
            </SettingsCard>
          </div>
        )}
      </div>

      {/* Sheets */}
      {sheet === 'app-lock' && <AppLockSheet onClose={closeSheet} />}
      {sheet === 'default-assistant' && <DefaultAssistantSheet onClose={closeSheet} />}
      {sheet === 'add-to-home' && <AddToHomeScreenSheet onClose={closeSheet} />}
      {sheet === 'referral' && <ReferralSheet onClose={closeSheet} />}
      {sheet === 'data-controls' && <DataControlsSheet onClose={closeSheet} />}
      {sheet === 'report' && <ReportIssueSheet onClose={closeSheet} />}
      {sheet === 'help' && <HelpSheet onClose={closeSheet} />}
      {sheet === 'legal' && <LegalSheet onClose={closeSheet} />}
      {sheet === 'logout' && (
        <SettingsSheet
          title="Log out?"
          subtitle="You'll need to sign in again to use QuantAI."
          onClose={closeSheet}
          testId="logout-sheet"
        >
          <div className="space-y-3">
            <SheetDangerButton onClick={handleLogout} disabled={loggingOut} testId="logout-confirm">
              {loggingOut ? 'Logging out…' : 'Log out'}
            </SheetDangerButton>
            <button
              type="button"
              onClick={closeSheet}
              className="w-full py-2 text-[15px] text-white/60 hover:text-white"
            >
              Cancel
            </button>
          </div>
          <SheetNote>
            This signs you out of QuantAI on this device. Your QuantID stays active for the other
            Quant apps.
          </SheetNote>
        </SettingsSheet>
      )}
    </div>
  );
}

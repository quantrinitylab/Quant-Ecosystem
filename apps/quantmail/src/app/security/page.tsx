'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button, Input, FormField, Skeleton } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';
import { PageTransition } from '../../components/PageTransition';
import { IconCheck } from '../../components/icons';
import { TwoFactorQrCode } from '../../components/security/TwoFactorQrCode';
import { apiClient } from '../../services/api-client';

// ---------------------------------------------------------------------------
// Security Tabs — GitHub/Gmail-quality tabbed navigation
// ---------------------------------------------------------------------------
type SecurityTab = 'password-auth' | 'sessions' | 'connected-apps';

const TABS: { key: SecurityTab; label: string }[] = [
  { key: 'password-auth', label: 'Password & Authentication' },
  { key: 'sessions', label: 'Active Sessions' },
  { key: 'connected-apps', label: 'Connected Apps & Integrations' },
];

// ---------------------------------------------------------------------------
// Two-factor authentication
//
// This section used to lie. `Enable 2FA` was offered unconditionally because
// nothing ever asked the server what was already true, the QR came from
// `api.qrserver.com` — handed the URI that carries the shared secret — and the
// recovery codes were printed before any code had been verified, for a factor
// that might never be switched on. All three are gone.
// ---------------------------------------------------------------------------

interface TwoFactorStatus {
  enabled: boolean;
  pendingSetup: boolean;
  confirmedAt: string | null;
  backupCodesRemaining: number;
}

/** Below this, the card says so — running out silently is how people lock up. */
const RECOVERY_CODES_LOW = 3;

/** Base32 in groups of four: the difference between typing it and giving up. */
const groupSecret = (secret: string): string => secret.replace(/(.{4})/g, '$1 ').trim();

const formatConfirmedAt = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

const statusSummary = (status: TwoFactorStatus): string => {
  const since = status.confirmedAt ? `On since ${formatConfirmedAt(status.confirmedAt)}. ` : '';
  const left = status.backupCodesRemaining;
  return `${since}${left} recovery ${left === 1 ? 'code' : 'codes'} left.`;
};

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Insecure context, or permission refused. The codes are on screen and
    // selectable either way, so this is a convenience failing, not a dead end.
    return false;
  }
}

function downloadRecoveryCodes(codes: string[]): void {
  const body = [
    'QuantMail recovery codes',
    `Generated: ${new Date().toISOString()}`,
    '',
    'Each code signs you in once if you lose your authenticator.',
    '',
    ...codes,
    '',
    // CRLF, because the likeliest place this file gets opened is Notepad.
  ].join('\r\n');

  const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'quantmail-recovery-codes.txt';
  link.click();
  URL.revokeObjectURL(url);
}

export default function SecurityPage() {
  const [activeTab, setActiveTab] = useState<SecurityTab>('password-auth');

  // ─── 2FA State ──────────────────────────────────────────────────────────────
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [statusError, setStatusError] = useState('');
  const [enrolment, setEnrolment] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);
  const [twoFactorError, setTwoFactorError] = useState('');
  const [twoFactorNotice, setTwoFactorNotice] = useState('');
  const [secretCopied, setSecretCopied] = useState(false);
  /**
   * Shown once, and only after the server has proved the authenticator works.
   * `null` is not "no codes" — it is "there is nothing new to show you".
   */
  const [freshCodes, setFreshCodes] = useState<string[] | null>(null);
  const [codesCopied, setCodesCopied] = useState(false);
  /** Disable and regenerate both cost the password; neither costs a code. */
  const [passwordPrompt, setPasswordPrompt] = useState<'disable' | 'regenerate' | null>(null);
  const [actionPassword, setActionPassword] = useState('');

  // ─── Password State ─────────────────────────────────────────────────────────
  const [passwordForm, setPasswordForm] = useState({ current: '', newPassword: '', confirm: '' });
  const [passwordStatus, setPasswordStatus] = useState<'idle' | 'saving' | 'success' | 'error'>(
    'idle',
  );
  const [passwordError, setPasswordError] = useState('');

  // ─── 2FA Handlers ───────────────────────────────────────────────────────────
  const loadStatus = useCallback(async () => {
    setStatusError('');
    const response = await apiClient.getTwoFactorStatus();
    if (!response.success || !response.data) {
      setStatusError(response.error?.message || 'Could not read your two-factor settings.');
      return;
    }
    setStatus(response.data);
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleStartSetup = useCallback(async () => {
    setTwoFactorBusy(true);
    setTwoFactorError('');
    setTwoFactorNotice('');
    setSecretCopied(false);
    const response = await apiClient.setupTwoFactor();
    setTwoFactorBusy(false);
    if (!response.success || !response.data) {
      setTwoFactorError(response.error?.message || 'Could not start setup.');
      // A 409 means another tab finished the job. Re-read rather than argue.
      void loadStatus();
      return;
    }
    setVerifyCode('');
    setEnrolment({ secret: response.data.secret, otpauthUri: response.data.otpauthUri });
  }, [loadStatus]);

  const handleConfirmEnable = useCallback(async () => {
    setTwoFactorError('');
    if (!/^\d{6}$/.test(verifyCode)) {
      setTwoFactorError('Enter the 6-digit code shown in your authenticator app.');
      return;
    }
    setTwoFactorBusy(true);
    const response = await apiClient.enableTwoFactor(verifyCode);
    setTwoFactorBusy(false);
    if (!response.success || !response.data) {
      setTwoFactorError(response.error?.message || 'That code did not match.');
      setVerifyCode('');
      return;
    }
    setEnrolment(null);
    setVerifyCode('');
    setCodesCopied(false);
    setFreshCodes(response.data.backupCodes);
    setTwoFactorNotice('Two-factor authentication is on.');
    await loadStatus();
  }, [verifyCode, loadStatus]);

  const cancelSetup = useCallback(() => {
    setEnrolment(null);
    setVerifyCode('');
    setTwoFactorError('');
    setSecretCopied(false);
  }, []);

  const openPasswordPrompt = useCallback((intent: 'disable' | 'regenerate') => {
    setPasswordPrompt(intent);
    setActionPassword('');
    setTwoFactorError('');
    setTwoFactorNotice('');
  }, []);

  const closePasswordPrompt = useCallback(() => {
    setPasswordPrompt(null);
    setActionPassword('');
    setTwoFactorError('');
  }, []);

  const handlePasswordGatedAction = useCallback(async () => {
    if (!passwordPrompt) return;
    if (!actionPassword) {
      setTwoFactorError('Enter your password to confirm.');
      return;
    }
    setTwoFactorBusy(true);
    setTwoFactorError('');

    if (passwordPrompt === 'disable') {
      const response = await apiClient.disableTwoFactor(actionPassword);
      setTwoFactorBusy(false);
      if (!response.success) {
        setTwoFactorError(response.error?.message || 'Could not turn two-factor off.');
        return;
      }
      setFreshCodes(null);
      setTwoFactorNotice('Two-factor authentication is off. Your recovery codes were deleted.');
    } else {
      const response = await apiClient.regenerateBackupCodes(actionPassword);
      setTwoFactorBusy(false);
      if (!response.success || !response.data) {
        setTwoFactorError(response.error?.message || 'Could not generate new recovery codes.');
        return;
      }
      setCodesCopied(false);
      setFreshCodes(response.data.backupCodes);
      setTwoFactorNotice('New recovery codes. The previous set no longer works.');
    }

    closePasswordPrompt();
    await loadStatus();
  }, [passwordPrompt, actionPassword, closePasswordPrompt, loadStatus]);

  // ─── Password Handler ───────────────────────────────────────────────────────
  const handlePasswordChange = useCallback(async () => {
    setPasswordError('');
    if (passwordForm.newPassword !== passwordForm.confirm) {
      setPasswordError('New passwords do not match');
      setPasswordStatus('error');
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      setPasswordStatus('error');
      return;
    }
    setPasswordStatus('saving');
    const response = await apiClient.changePassword(passwordForm.current, passwordForm.newPassword);
    if (!response.success) {
      setPasswordError(response.error?.message || 'Failed to update password');
      setPasswordStatus('error');
      return;
    }
    setPasswordStatus('success');
    setPasswordForm({ current: '', newPassword: '', confirm: '' });
  }, [passwordForm]);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <PageTransition className="workspace-page security-workspace flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-6 pt-6 pb-0">
          <h1 className="text-xl font-semibold tracking-tight text-[var(--quant-foreground)]">
            Security
          </h1>
          <p className="text-sm text-[var(--quant-muted-foreground)] mt-0.5">
            Manage passwords, two-factor authentication, sessions and connected apps.
          </p>
        </div>

        {/* Tab navigation */}
        <nav className="shrink-0 flex items-center gap-1 px-6 mt-4 border-b border-[var(--quant-border)] overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                relative px-3 py-2.5 text-sm font-medium rounded-t-md transition-colors whitespace-nowrap
                ${
                  activeTab === tab.key
                    ? 'text-[var(--quant-foreground)] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[var(--brand-primary)] after:rounded-t'
                    : 'text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)] hover:bg-[var(--quant-muted)]'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 w-full max-w-4xl mx-auto">
          {activeTab === 'password-auth' && (
            <div className="w-full space-y-8">
              <section>
                <h2 className="text-base font-semibold text-[var(--quant-foreground)] mb-1">
                  Two-Factor Authentication
                </h2>
                <p className="text-sm text-[var(--quant-muted-foreground)] mb-4">
                  A rotating code from your phone, on top of your password. Recovery codes cover you
                  if the phone goes missing.
                </p>
                <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5 space-y-4">
                  {twoFactorNotice ? (
                    <p
                      role="status"
                      aria-live="polite"
                      className="rounded-md border border-[var(--quant-success)]/25 bg-[var(--quant-success)]/10 px-3 py-2 text-sm text-[var(--quant-success)]"
                    >
                      {twoFactorNotice}
                    </p>
                  ) : null}

                  {statusError ? (
                    <div role="alert" className="flex flex-wrap items-center gap-3">
                      <p className="text-sm text-[var(--quant-destructive)]">{statusError}</p>
                      <Button variant="secondary" size="sm" onClick={() => void loadStatus()}>
                        Try again
                      </Button>
                    </div>
                  ) : null}

                  {!status && !statusError ? (
                    <div className="space-y-3">
                      <Skeleton variant="rect" width="100%" height="40px" />
                      <Skeleton variant="rect" width="60%" height="20px" />
                    </div>
                  ) : null}
                  {status && !enrolment ? (
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div
                          className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                            status.enabled
                              ? 'bg-[var(--quant-success)]/10 text-[var(--quant-success)]'
                              : 'bg-[var(--quant-muted)] text-[#FF8C42]'
                          }`}
                        >
                          {status.enabled ? (
                            <IconCheck size={20} strokeWidth={2.4} />
                          ) : (
                            <svg
                              className="size-5"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              aria-hidden="true"
                              focusable="false"
                            >
                              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[var(--quant-foreground)]">
                            {status.enabled ? 'Authenticator app is on' : 'Authenticator app'}
                          </p>
                          <p className="text-xs text-[var(--quant-muted-foreground)]">
                            {status.enabled
                              ? statusSummary(status)
                              : status.pendingSetup
                                ? 'You started setting this up but never confirmed a code, so it is not protecting anything yet.'
                                : 'Sign in with a rotating code from Google Authenticator, 1Password, Authy — any TOTP app.'}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {status.enabled ? (
                          <>
                            <Button
                              variant="secondary"
                              onClick={() => openPasswordPrompt('regenerate')}
                            >
                              New recovery codes
                            </Button>
                            <Button variant="danger" onClick={() => openPasswordPrompt('disable')}>
                              Turn off
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="primary"
                            loading={twoFactorBusy}
                            onClick={() => void handleStartSetup()}
                          >
                            {status.pendingSetup ? 'Continue setup' : 'Enable 2FA'}
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : null}
                  {status?.enabled &&
                  !passwordPrompt &&
                  status.backupCodesRemaining <= RECOVERY_CODES_LOW ? (
                    <p className="rounded-md border border-[#5C3016] bg-[#2B1A11] px-3 py-2 text-xs leading-5 text-[var(--quant-foreground)]">
                      {status.backupCodesRemaining === 0
                        ? 'No recovery codes left. Generate a new set now — without one, losing your authenticator means losing the account.'
                        : 'Nearly out of recovery codes. Generate a new set while you still have a way in.'}
                    </p>
                  ) : null}
                  {passwordPrompt ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void handlePasswordGatedAction();
                      }}
                      className="space-y-3 rounded-md border border-[var(--quant-border)] bg-[var(--quant-muted)] px-4 py-4"
                    >
                      <div>
                        <p className="text-sm font-medium text-[var(--quant-foreground)]">
                          {passwordPrompt === 'disable'
                            ? 'Turn off two-factor authentication'
                            : 'Replace your recovery codes'}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[var(--quant-muted-foreground)]">
                          {passwordPrompt === 'disable'
                            ? 'Your password becomes the only thing protecting this account, and your recovery codes are deleted.'
                            : 'The codes you hold now stop working the moment the new set is issued.'}
                        </p>
                      </div>
                      <div className="max-w-xs">
                        <FormField label="Password" required>
                          <Input
                            type="password"
                            value={actionPassword}
                            onChange={(event) => setActionPassword(event.target.value)}
                            placeholder="Enter your password"
                            autoComplete="current-password"
                          />
                        </FormField>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="submit"
                          variant={passwordPrompt === 'disable' ? 'danger' : 'primary'}
                          loading={twoFactorBusy}
                        >
                          {passwordPrompt === 'disable' ? 'Turn off' : 'Generate new codes'}
                        </Button>
                        <Button variant="ghost" onClick={closePasswordPrompt}>
                          Cancel
                        </Button>
                      </div>
                    </form>
                  ) : null}
                  {enrolment ? (
                    <div className="space-y-5">
                      <ol className="space-y-1 text-sm leading-6 text-[var(--quant-foreground)]">
                        <li>1. Open your authenticator app.</li>
                        <li>2. Scan the code below, or type the setup key in by hand.</li>
                        <li>3. Enter the 6-digit code it shows to finish.</li>
                      </ol>

                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                        <div className="mx-auto shrink-0 rounded-lg border border-[var(--quant-border)] bg-white p-3 sm:mx-0">
                          <TwoFactorQrCode value={enrolment.otpauthUri} size={176} />
                        </div>
                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="rounded-md border border-[var(--quant-border)] bg-[var(--quant-muted)] px-4 py-3">
                            <p className="mb-1 text-xs text-[var(--quant-muted-foreground)]">
                              Setup key — for typing in by hand
                            </p>
                            <code className="block select-all break-all font-mono text-sm tracking-wide text-[var(--quant-foreground)]">
                              {groupSecret(enrolment.secret)}
                            </code>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                void copyToClipboard(enrolment.secret).then(setSecretCopied);
                              }}
                            >
                              {secretCopied ? 'Copied' : 'Copy key'}
                            </Button>
                            {/*
                              Hands the secret straight to the app on the device you are
                              holding. Desktop browsers have nothing registered for
                              `otpauth://` and will do nothing at all, which is exactly
                              why the QR and the typed key are both on this card.
                            */}
                            <a
                              href={enrolment.otpauthUri}
                              className="inline-flex min-h-[44px] items-center rounded-md px-2 text-xs font-medium text-[var(--brand-primary)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] sm:min-h-0 sm:py-2"
                            >
                              Open in your authenticator app
                            </a>
                          </div>
                        </div>
                      </div>
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void handleConfirmEnable();
                        }}
                        className="space-y-3 border-t border-[var(--quant-border)] pt-4"
                      >
                        <div className="max-w-[200px]">
                          <FormField label="Code from your app" required>
                            <Input
                              value={verifyCode}
                              onChange={(event) =>
                                setVerifyCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                              }
                              placeholder="123456"
                              inputMode="numeric"
                              autoComplete="one-time-code"
                              maxLength={6}
                            />
                          </FormField>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button type="submit" variant="primary" loading={twoFactorBusy}>
                            Verify and turn on
                          </Button>
                          <Button variant="ghost" onClick={cancelSetup}>
                            Cancel
                          </Button>
                        </div>
                        <p className="text-xs text-[var(--quant-muted-foreground)]">
                          Recovery codes are issued once this code checks out — not before. A code
                          for a factor that never got switched on is a code nobody can use.
                        </p>
                      </form>
                    </div>
                  ) : null}
                  {twoFactorError ? (
                    <p role="alert" className="text-sm text-[var(--quant-destructive)]">
                      {twoFactorError}
                    </p>
                  ) : null}

                  {freshCodes ? (
                    <div className="space-y-3 rounded-md border border-[#5C3016] bg-[#2B1A11] px-4 py-4">
                      <div>
                        <h3 className="text-sm font-medium text-[var(--quant-foreground)]">
                          Save your recovery codes
                        </h3>
                        <p className="mt-1 text-xs leading-5 text-[var(--quant-muted-foreground)]">
                          Each one signs you in once if you lose your authenticator. This is the
                          only time they are shown — the server stores hashes, so it cannot show
                          them again even if you ask.
                        </p>
                      </div>
                      <ul className="grid grid-cols-2 gap-2">
                        {freshCodes.map((code) => (
                          <li
                            key={code}
                            className="select-all rounded border border-[var(--quant-border)] bg-[var(--quant-surface)] px-3 py-1.5 text-center font-mono text-xs tracking-wider text-[var(--quant-foreground)]"
                          >
                            {code}
                          </li>
                        ))}
                      </ul>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            void copyToClipboard(freshCodes.join('\n')).then(setCodesCopied);
                          }}
                        >
                          {codesCopied ? 'Copied' : 'Copy all'}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => downloadRecoveryCodes(freshCodes)}
                        >
                          Download
                        </Button>
                        <Button variant="primary" size="sm" onClick={() => setFreshCodes(null)}>
                          I have saved them
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>

              <section>
                <h2 className="text-base font-semibold text-[var(--quant-foreground)] mb-1">
                  Change Password
                </h2>
                <p className="text-sm text-[var(--quant-muted-foreground)] mb-4">
                  Update your password regularly to keep your account secure.
                </p>
                <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5">
                  <div className="space-y-4 max-w-sm">
                    <FormField label="Current Password" required>
                      <Input
                        type="password"
                        value={passwordForm.current}
                        onChange={(e) =>
                          setPasswordForm((prev) => ({ ...prev, current: e.target.value }))
                        }
                        placeholder="Enter current password"
                      />
                    </FormField>
                    <FormField label="New Password" required>
                      <Input
                        type="password"
                        value={passwordForm.newPassword}
                        onChange={(e) =>
                          setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))
                        }
                        placeholder="Enter new password"
                      />
                    </FormField>
                    <FormField label="Confirm New Password" required>
                      <Input
                        type="password"
                        value={passwordForm.confirm}
                        onChange={(e) =>
                          setPasswordForm((prev) => ({ ...prev, confirm: e.target.value }))
                        }
                        placeholder="Confirm new password"
                      />
                    </FormField>

                    {passwordStatus === 'error' && (
                      <div className="rounded-md bg-[var(--quant-destructive)]/10 border border-[var(--quant-destructive)]/20 px-3 py-2">
                        <p className="text-sm text-[var(--quant-destructive)]">
                          {passwordError || 'Passwords do not match'}
                        </p>
                      </div>
                    )}

                    {passwordStatus === 'success' && (
                      <div className="rounded-md bg-green-500/10 border border-green-500/20 px-3 py-2">
                        <p className="text-sm text-green-400">Password updated successfully</p>
                      </div>
                    )}

                    <div className="pt-2">
                      <Button variant="primary" onClick={handlePasswordChange}>
                        {passwordStatus === 'saving' ? 'Updating...' : 'Update Password'}
                      </Button>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'sessions' && (
            <div className="w-full space-y-8">
              <section>
                <h2 className="text-base font-semibold text-[var(--quant-foreground)] mb-1">
                  Active Sessions
                </h2>
                <p className="text-sm text-[var(--quant-muted-foreground)] mb-4">
                  Review where your account is signed in and revoke other devices when they appear.
                </p>
                <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] p-6">
                  <div className="flex items-center gap-3 pb-5 border-b border-[var(--quant-border)]">
                    <div className="w-10 h-10 rounded-full bg-[var(--brand-primary)]/10 flex items-center justify-center">
                      <span className="text-[var(--brand-primary)] text-lg">●</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[var(--quant-foreground)]">
                        Current session
                      </p>
                      <p className="text-xs text-[var(--quant-muted-foreground)]">
                        This device · Active now
                      </p>
                    </div>
                    <span className="text-xs font-medium text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">
                      Active
                    </span>
                  </div>

                  <div className="pt-5 text-center py-8">
                    <div className="w-14 h-14 rounded-full bg-[var(--quant-muted)] flex items-center justify-center mx-auto mb-4 text-[#A1A4AC]">
                      <svg
                        className="size-6"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                      >
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                        <line x1="8" y1="21" x2="16" y2="21" />
                        <line x1="12" y1="17" x2="12" y2="21" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-[var(--quant-foreground)] mb-1">
                      Only this device is active
                    </p>
                    <p className="text-xs text-[var(--quant-muted-foreground)] max-w-xs mx-auto">
                      When QuantMail detects other sessions, you&apos;ll review the device,
                      location, and last active time here before revoking access.
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-base font-semibold text-[var(--quant-foreground)] mb-1">
                  Session Management
                </h2>
                <p className="text-sm text-[var(--quant-muted-foreground)] mb-4">
                  End access on other devices once additional sessions appear here.
                </p>
                <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-[var(--quant-foreground)]">
                        Revoke other sessions
                      </p>
                      <p className="text-xs text-[var(--quant-muted-foreground)]">
                        Sign out of every device except the one you&apos;re using now.
                      </p>
                    </div>
                    <div className="relative group">
                      <Button variant="primary" disabled>
                        Revoke All
                      </Button>
                      <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 text-xs font-medium text-[var(--quant-foreground)] bg-[var(--quant-muted)] border border-[var(--quant-border)] rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                        Available when another session is active
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'connected-apps' && (
            <div className="w-full space-y-8">
              <section>
                <h2 className="text-base font-semibold text-[var(--quant-foreground)] mb-1">
                  Connected Applications
                </h2>
                <p className="text-sm text-[var(--quant-muted-foreground)] mb-4">
                  Third-party applications that have access to your QuantMail account.
                </p>
                <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] p-6">
                  <div className="text-center py-8">
                    <div className="w-14 h-14 rounded-full bg-[var(--quant-muted)] flex items-center justify-center mx-auto mb-4 text-[#A1A4AC]">
                      <svg
                        className="size-6"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                      >
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-[var(--quant-foreground)] mb-1">
                      No third-party apps connected
                    </p>
                    <p className="text-xs text-[var(--quant-muted-foreground)] max-w-xs mx-auto">
                      When you authorize third-party applications to access your account, they will
                      appear here. You can revoke access at any time.
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-base font-semibold text-[var(--quant-foreground)] mb-1">
                  Manage OAuth Apps
                </h2>
                <p className="text-sm text-[var(--quant-muted-foreground)] mb-4">
                  Control which apps can access your data through OAuth 2.0.
                </p>
                <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-md bg-[var(--quant-muted)] flex items-center justify-center shrink-0 mt-0.5 text-[#FF8C42]">
                      <svg
                        className="size-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--quant-foreground)]">
                        Email read access
                      </p>
                      <p className="text-xs text-[var(--quant-muted-foreground)]">
                        No apps currently have permission to read your emails
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-md bg-[var(--quant-muted)] flex items-center justify-center shrink-0 mt-0.5 text-[#FF8C42]">
                      <svg
                        className="size-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M12 19l7-7 3 3-7 7-3-3z" />
                        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                        <path d="M2 2l7.586 7.586" />
                        <circle cx="11" cy="11" r="2" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--quant-foreground)]">
                        Email send access
                      </p>
                      <p className="text-xs text-[var(--quant-muted-foreground)]">
                        No apps currently have permission to send emails on your behalf
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-md bg-[var(--quant-muted)] flex items-center justify-center shrink-0 mt-0.5 text-[#FF8C42]">
                      <svg
                        className="size-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--quant-foreground)]">
                        Profile access
                      </p>
                      <p className="text-xs text-[var(--quant-muted-foreground)]">
                        No apps currently have access to your profile information
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[var(--quant-border)]">
                    <p className="text-xs text-[var(--quant-muted-foreground)]">
                      OAuth apps will appear here once you authorize them. You can always revoke
                      access from this page.
                    </p>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </PageTransition>
    </AppShell>
  );
}

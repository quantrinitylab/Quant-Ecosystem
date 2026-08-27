'use client';

import { useState, useCallback } from 'react';
import { Button, Input, FormField, Skeleton } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';
import { PageTransition } from '../../components/PageTransition';
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

export default function SecurityPage() {
  const [activeTab, setActiveTab] = useState<SecurityTab>('password-auth');

  // ─── 2FA State ──────────────────────────────────────────────────────────────
  const [twoFactorStep, setTwoFactorStep] = useState<
    'idle' | 'loading' | 'setup' | 'verify' | 'done'
  >('idle');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verifyCode, setVerifyCode] = useState('');
  const [twoFactorError, setTwoFactorError] = useState('');

  // ─── Password State ─────────────────────────────────────────────────────────
  const [passwordForm, setPasswordForm] = useState({ current: '', newPassword: '', confirm: '' });
  const [passwordStatus, setPasswordStatus] = useState<'idle' | 'saving' | 'success' | 'error'>(
    'idle',
  );
  const [passwordError, setPasswordError] = useState('');

  // ─── 2FA Handlers ───────────────────────────────────────────────────────────
  const handleSetup2FA = useCallback(async () => {
    setTwoFactorStep('loading');
    setTwoFactorError('');
    const response = await apiClient.setupTwoFactor();
    if (!response.success) {
      setTwoFactorError(response.error?.message || 'Failed to setup 2FA');
      setTwoFactorStep('idle');
      return;
    }
    setQrCodeUrl(response.data!.qrCodeUrl);
    setSecret(response.data!.secret);
    setBackupCodes(response.data!.backupCodes);
    setTwoFactorStep('setup');
  }, []);

  const handleEnable2FA = useCallback(async () => {
    setTwoFactorStep('verify');
    const response = await apiClient.enableTwoFactor(secret, verifyCode, backupCodes);
    if (!response.success) {
      setTwoFactorError(response.error?.message || 'Invalid code');
      setTwoFactorStep('setup');
      return;
    }
    setTwoFactorStep('done');
  }, [secret, verifyCode, backupCodes]);

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
                  Add an extra layer of security to your account using an authenticator app.
                </p>
                <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5 space-y-4">
                  {twoFactorStep === 'idle' && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[var(--quant-muted)] flex items-center justify-center text-[#FF8C42]">
                          <svg
                            className="size-5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[var(--quant-foreground)]">
                            Authenticator app
                          </p>
                          <p className="text-xs text-[var(--quant-muted-foreground)]">
                            Use an app like Google Authenticator or Authy
                          </p>
                        </div>
                      </div>
                      <Button variant="primary" onClick={handleSetup2FA}>
                        Enable 2FA
                      </Button>
                    </div>
                  )}

                  {twoFactorStep === 'loading' && (
                    <div className="space-y-3">
                      <Skeleton variant="rect" width="100%" height="40px" />
                      <Skeleton variant="rect" width="60%" height="20px" />
                    </div>
                  )}

                  {twoFactorError && (
                    <p className="text-sm text-[var(--quant-destructive)]">{twoFactorError}</p>
                  )}

                  {twoFactorStep === 'setup' && (
                    <div className="space-y-5">
                      <div>
                        <p className="text-sm text-[var(--quant-foreground)] mb-3">
                          Scan this QR code with your authenticator app:
                        </p>
                        <div className="p-5 bg-[var(--quant-muted)] rounded-lg text-center border border-[var(--quant-border)]">
                          <img
                            src={qrCodeUrl}
                            alt="QR Code for 2FA setup"
                            className="mx-auto max-w-[180px] rounded"
                          />
                        </div>
                      </div>

                      <div className="rounded-md bg-[var(--quant-muted)] px-4 py-3 border border-[var(--quant-border)]">
                        <p className="text-xs text-[var(--quant-muted-foreground)] mb-1">
                          Manual entry code
                        </p>
                        <code className="text-sm font-mono text-[var(--quant-foreground)] select-all">
                          {secret}
                        </code>
                      </div>

                      <div className="max-w-xs">
                        <FormField label="Verification Code" required>
                          <Input
                            value={verifyCode}
                            onChange={(e) => setVerifyCode(e.target.value)}
                            placeholder="Enter 6-digit code"
                            maxLength={6}
                          />
                        </FormField>
                      </div>

                      <Button variant="primary" onClick={handleEnable2FA}>
                        Verify and Enable
                      </Button>

                      <div className="pt-4 border-t border-[var(--quant-border)]">
                        <h3 className="text-sm font-medium text-[var(--quant-foreground)] mb-2">
                          Backup Codes
                        </h3>
                        <p className="text-xs text-[var(--quant-muted-foreground)] mb-3">
                          Save these codes in a secure location. Each can be used once if you lose
                          access to your authenticator.
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {backupCodes.map((code) => (
                            <span
                              key={code}
                              className="font-mono text-xs bg-[var(--quant-muted)] text-[var(--quant-foreground)] px-3 py-1.5 rounded border border-[var(--quant-border)] text-center select-all"
                            >
                              {code}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {twoFactorStep === 'done' && (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                        <span className="text-green-400 text-lg">✓</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-green-400">
                          Two-factor authentication enabled
                        </p>
                        <p className="text-xs text-[var(--quant-muted-foreground)]">
                          Your account is now protected with 2FA
                        </p>
                      </div>
                    </div>
                  )}
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

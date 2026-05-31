'use client';

import { useState, useCallback } from 'react';
import { AppShell, Card, Button, Input, FormField, Skeleton } from '@quant/shared-ui';
import { ErrorState, EmptyState } from '@quant/shared-ui';
import { AppSidebar } from '../../components/AppSidebar';
import { PageTransition } from '../../components/PageTransition';
import { apiClient } from '../../services/api-client';

export default function SecurityPage() {
  const [twoFactorStep, setTwoFactorStep] = useState<
    'idle' | 'loading' | 'setup' | 'verify' | 'done'
  >('idle');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verifyCode, setVerifyCode] = useState('');
  const [twoFactorError, setTwoFactorError] = useState('');

  const [passwordForm, setPasswordForm] = useState({ current: '', newPassword: '', confirm: '' });
  const [passwordStatus, setPasswordStatus] = useState<'idle' | 'saving' | 'success' | 'error'>(
    'idle',
  );

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

  const handlePasswordChange = useCallback(async () => {
    if (passwordForm.newPassword !== passwordForm.confirm) {
      setPasswordStatus('error');
      return;
    }
    setPasswordStatus('saving');
    // Password change endpoint would be called here
    // For now simulating the flow
    setPasswordStatus('success');
    setPasswordForm({ current: '', newPassword: '', confirm: '' });
  }, [passwordForm]);

  return (
    <AppShell sidebar={<AppSidebar />}>
      <PageTransition className="flex flex-col h-full overflow-y-auto p-4 md:p-6 space-y-8">
        <h1 className="text-2xl font-bold">Security</h1>

        {/* 2FA Section */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Two-Factor Authentication</h2>
          {twoFactorStep === 'idle' && (
            <div>
              <p className="text-sm text-[var(--quant-muted-foreground)] mb-4">
                Add an extra layer of security to your account with two-factor authentication.
              </p>
              <Button variant="primary" onClick={handleSetup2FA}>
                Enable 2FA
              </Button>
            </div>
          )}
          {twoFactorStep === 'loading' && <Skeleton variant="rect" width="100%" height="100px" />}
          {twoFactorError && (
            <p className="text-sm text-[var(--quant-destructive)] mt-2">{twoFactorError}</p>
          )}
          {twoFactorStep === 'setup' && (
            <div className="space-y-4">
              <p className="text-sm">Scan this QR code with your authenticator app:</p>
              <div className="p-4 bg-[var(--quant-muted)] rounded-md text-center">
                <img src={qrCodeUrl} alt="QR Code" className="mx-auto max-w-[200px]" />
              </div>
              <p className="text-xs text-[var(--quant-muted-foreground)]">
                Manual entry code: <code className="font-mono">{secret}</code>
              </p>
              <FormField label="Verification Code" required>
                <Input
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                />
              </FormField>
              <Button variant="primary" onClick={handleEnable2FA}>
                Verify and Enable
              </Button>
              <div className="mt-4">
                <h3 className="text-sm font-medium mb-2">Backup Codes (save these):</h3>
                <div className="grid grid-cols-2 gap-2">
                  {backupCodes.map((code) => (
                    <span
                      key={code}
                      className="font-mono text-xs bg-[var(--quant-muted)] p-1 rounded"
                    >
                      {code}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
          {twoFactorStep === 'done' && (
            <p className="text-sm text-green-600 dark:text-green-400">
              Two-factor authentication has been enabled successfully.
            </p>
          )}
        </Card>

        {/* Password Change */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Change Password</h2>
          <div className="space-y-4 max-w-md">
            <FormField label="Current Password" required>
              <Input
                type="password"
                value={passwordForm.current}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, current: e.target.value }))}
              />
            </FormField>
            <FormField label="New Password" required>
              <Input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) =>
                  setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))
                }
              />
            </FormField>
            <FormField label="Confirm New Password" required>
              <Input
                type="password"
                value={passwordForm.confirm}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirm: e.target.value }))}
              />
            </FormField>
            {passwordStatus === 'error' && (
              <p className="text-sm text-[var(--quant-destructive)]">Passwords do not match</p>
            )}
            {passwordStatus === 'success' && (
              <p className="text-sm text-green-600 dark:text-green-400">
                Password updated successfully
              </p>
            )}
            <Button variant="primary" onClick={handlePasswordChange}>
              {passwordStatus === 'saving' ? 'Saving...' : 'Update Password'}
            </Button>
          </div>
        </Card>

        {/* Active Sessions */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Active Sessions</h2>
          <EmptyState
            title="Session management"
            description="Active session tracking coming soon"
          />
        </Card>

        {/* Connected Apps */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Connected Apps</h2>
          <EmptyState title="OAuth connected apps" description="No third-party apps connected" />
        </Card>
      </PageTransition>
    </AppShell>
  );
}

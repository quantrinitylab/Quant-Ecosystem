'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../../../services/api-client';
import { SettingsSection } from '../SettingsPrimitives';

/**
 * Recovery email (fix/qm-account-recovery-3, verified lifecycle
 * fix/qm-recovery-channel-authz for CODEX-REVIEW 6241280732 on #902).
 *
 * The problem it answers: password-reset links were mailed to the QuantMail
 * inbox only, which is unreachable when locked out (forgot password, no active
 * session). When a VERIFIED recovery email is set, the reset link is mailed
 * there too.
 *
 * A new address starts PENDING: the backend mails a 6-digit code to it, and
 * only the code (entered below) activates it. The UI never claims a delivery
 * it did not make: the value shown is always re-read from
 * GET /auth/account/recovery-email after every action, codeDelivered:false is
 * surfaced honestly, and the step-up 401 tells the user to sign in again
 * first instead of inventing a success.
 */

type LoadStatus = 'loading' | 'idle' | 'error';

const PRIMARY_BUTTON_CLASSES =
  'inline-flex items-center justify-center rounded-lg border border-[var(--brand-soft-border)] bg-[var(--brand-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-primary)] transition-colors hover:bg-[var(--brand-primary)] hover:text-black disabled:cursor-not-allowed disabled:opacity-50';

const SUBTLE_BUTTON_CLASSES =
  'inline-flex items-center justify-center rounded-lg border border-[var(--quant-border)] px-3 py-1.5 text-xs font-medium text-[var(--quant-foreground)] transition-colors hover:bg-[var(--quant-surface-elevated)] disabled:opacity-60';

export function RecoveryEmailSettings() {
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [loadError, setLoadError] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [code, setCode] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionNote, setActionNote] = useState('');

  const load = useCallback(async () => {
    setLoadStatus('loading');
    setLoadError('');
    const response = await apiClient.getRecoveryEmail();
    if (response.success && response.data) {
      setRecoveryEmail(response.data.recoveryEmail);
      setVerified(response.data.verified === true);
      setPendingEmail(response.data.pendingEmail ?? null);
      setDraft(response.data.recoveryEmail ?? '');
      setLoadStatus('idle');
    } else {
      setLoadError(response.error?.message || 'Your recovery email could not be loaded.');
      setLoadStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    setSaving(true);
    setActionError('');
    setActionNote('');
    const response = await apiClient.setRecoveryEmail(draft.trim() === '' ? null : draft);
    setSaving(false);
    if (response.success && response.data) {
      setRecoveryEmail(response.data.recoveryEmail);
      setVerified(response.data.verified === true);
      setPendingEmail(response.data.pendingEmail ?? null);
      setDraft(response.data.recoveryEmail ?? '');
      setEditing(false);
      setCode('');
      if (response.data.pendingVerification) {
        setActionNote(
          response.data.codeDelivered === false
            ? `We could not send the verification code to ${response.data.pendingEmail} right now. Check the address and try saving again.`
            : `We sent a 6-digit code to ${response.data.pendingEmail}. Enter it below to confirm the address — until then your current recovery email stays as it is.`,
        );
      } else {
        setActionNote(
          response.data.recoveryEmail
            ? `Recovery email set to ${response.data.recoveryEmail}. Reset links will be sent there as well as to your QuantMail inbox.`
            : 'Recovery email removed. Reset links will only go to your QuantMail inbox.',
        );
      }
    } else {
      setActionError(response.error?.message || 'Your recovery email could not be saved.');
    }
  }, [draft]);

  const verify = useCallback(async () => {
    setVerifying(true);
    setActionError('');
    setActionNote('');
    const response = await apiClient.verifyRecoveryEmail(code.trim());
    setVerifying(false);
    if (response.success && response.data) {
      setRecoveryEmail(response.data.recoveryEmail);
      setVerified(response.data.verified === true);
      setPendingEmail(response.data.pendingEmail ?? null);
      setDraft(response.data.recoveryEmail ?? '');
      setCode('');
      setActionNote(
        `Recovery email confirmed: ${response.data.recoveryEmail}. Reset links will be sent there as well as to your QuantMail inbox.`,
      );
    } else {
      setActionError(response.error?.message || 'The code could not be verified.');
    }
  }, [code]);

  const resendCode = useCallback(async () => {
    // Re-PUT the pending (or current unverified) address: the backend replaces
    // the pending verification with a fresh code. This is a new mutation, so
    // it crosses the step-up boundary again server-side.
    const target = pendingEmail ?? recoveryEmail;
    if (!target) return;
    setSaving(true);
    setActionError('');
    setActionNote('');
    const response = await apiClient.setRecoveryEmail(target);
    setSaving(false);
    if (response.success && response.data) {
      setPendingEmail(response.data.pendingEmail ?? null);
      setActionNote(
        response.data.codeDelivered === false
          ? `We could not send a new code to ${target} right now. Try again in a moment.`
          : `A new 6-digit code is on its way to ${response.data.pendingEmail ?? target}.`,
      );
    } else {
      setActionError(response.error?.message || 'A new code could not be sent.');
    }
  }, [pendingEmail, recoveryEmail]);

  const remove = useCallback(async () => {
    setSaving(true);
    setActionError('');
    setActionNote('');
    const response = await apiClient.setRecoveryEmail(null);
    setSaving(false);
    if (response.success && response.data) {
      setRecoveryEmail(null);
      setVerified(false);
      setPendingEmail(null);
      setDraft('');
      setEditing(false);
      setCode('');
      setActionNote('Recovery email removed. Reset links will only go to your QuantMail inbox.');
    } else {
      setActionError(response.error?.message || 'Your recovery email could not be removed.');
    }
  }, []);

  return (
    <SettingsSection
      title="Recovery email"
      description="The out-of-band address reset links are sent to — in addition to your QuantMail inbox — for when you cannot reach this inbox. Use an address you can open from anywhere; it must differ from your QuantMail address. A new address only becomes active after you confirm the code we send to it."
    >
      {loadStatus === 'loading' ? (
        <p className="pt-1 text-xs text-[var(--quant-muted-foreground)]">
          Loading your recovery email…
        </p>
      ) : loadStatus === 'error' ? (
        <div className="pt-1">
          <p className="text-xs text-[var(--quant-destructive)]">{loadError}</p>
          <button type="button" onClick={() => void load()} className={`${SUBTLE_BUTTON_CLASSES} mt-2`}>
            Try again
          </button>
        </div>
      ) : (
        <div className="pt-1">
          <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--quant-muted-foreground)]">
              Current recovery email
            </div>
            <div className="mt-1 text-sm font-medium text-[var(--quant-foreground)]">
              {recoveryEmail ?? 'Not set'}
            </div>
            {recoveryEmail ? (
              verified ? (
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--quant-muted-foreground)]">
                  Verified. Reset links are sent here as well as to your QuantMail inbox.
                </p>
              ) : (
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--quant-muted-foreground)]">
                  Not verified yet — reset links are not sent here until you confirm the
                  address.
                </p>
              )
            ) : (
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--quant-muted-foreground)]">
                No recovery email. If you lose your password and cannot reach this inbox, reset
                links have no out-of-band address to go to.
              </p>
            )}
          </div>

          {pendingEmail ? (
            <div className="mt-3 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--quant-muted-foreground)]">
                Confirm {pendingEmail}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--quant-muted-foreground)]">
                Enter the 6-digit code we sent to this address. It expires in 15 minutes.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  id="recovery-email-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  disabled={verifying}
                  className="w-32 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-3.5 py-2.5 text-center text-sm tracking-[0.3em] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--quant-muted-foreground)] focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/20 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => void verify()}
                  disabled={verifying || code.trim().length !== 6}
                  className={PRIMARY_BUTTON_CLASSES}
                >
                  {verifying ? 'Confirming…' : 'Confirm address'}
                </button>
                <button
                  type="button"
                  onClick={() => void resendCode()}
                  disabled={saving || verifying}
                  className={SUBTLE_BUTTON_CLASSES}
                >
                  {saving ? 'Sending…' : 'Resend code'}
                </button>
              </div>
            </div>
          ) : null}

          {recoveryEmail && !verified && !pendingEmail ? (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => void resendCode()}
                disabled={saving}
                className={SUBTLE_BUTTON_CLASSES}
              >
                {saving ? 'Sending…' : 'Send verification code'}
              </button>
            </div>
          ) : null}

          {editing ? (
            <div className="mt-3">
              <label
                htmlFor="recovery-email-input"
                className="mb-1.5 block text-[13px] font-medium text-[var(--quant-foreground)]"
              >
                Recovery email address
              </label>
              <input
                id="recovery-email-input"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="you@another-mailbox.com"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={saving}
                className="w-full rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] px-3.5 py-2.5 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-[var(--quant-muted-foreground)] focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/20 disabled:opacity-60"
              />
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  className={PRIMARY_BUTTON_CLASSES}
                >
                  {saving ? 'Saving…' : 'Save recovery email'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setDraft(recoveryEmail ?? '');
                    setActionError('');
                  }}
                  disabled={saving}
                  className={SUBTLE_BUTTON_CLASSES}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setActionError('');
                  setActionNote('');
                }}
                className={PRIMARY_BUTTON_CLASSES}
              >
                {recoveryEmail ? 'Change' : 'Add recovery email'}
              </button>
              {recoveryEmail ? (
                <button
                  type="button"
                  onClick={() => void remove()}
                  disabled={saving}
                  className={SUBTLE_BUTTON_CLASSES}
                >
                  {saving ? 'Removing…' : 'Remove'}
                </button>
              ) : null}
            </div>
          )}

          {actionError ? (
            <p role="alert" className="mt-2.5 text-xs text-[var(--quant-destructive)]">
              {actionError}
            </p>
          ) : null}
          {actionNote ? (
            <p role="status" className="mt-2.5 text-xs text-[var(--quant-muted-foreground)]">
              {actionNote}
            </p>
          ) : null}
        </div>
      )}
    </SettingsSection>
  );
}

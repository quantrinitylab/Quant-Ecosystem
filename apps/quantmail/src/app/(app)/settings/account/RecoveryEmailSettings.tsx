'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../../../services/api-client';
import { SettingsSection } from '../SettingsPrimitives';

/**
 * Recovery email (fix/qm-account-recovery-3) — the Account page's control for
 * the out-of-band recovery channel in `backend/routes/account-recovery.ts`.
 *
 * The problem it answers: password-reset links were mailed to the QuantMail
 * inbox only, which is unreachable when locked out (forgot password, no active
 * session). When a recovery email is set, the reset link is mailed there too.
 *
 * The UI never claims a delivery it did not make: the value shown is always
 * re-read from GET /auth/account/recovery-email after every action, and the
 * copy says exactly where reset links go. Changing the address requires the
 * session this page already holds — the backend 401s without one.
 */

type LoadStatus = 'loading' | 'idle' | 'error';

const PRIMARY_BUTTON_CLASSES =
  'inline-flex items-center justify-center rounded-lg border border-[var(--brand-soft-border)] bg-[var(--brand-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-primary)] transition-colors hover:bg-[var(--brand-primary)] hover:text-black disabled:cursor-not-allowed disabled:opacity-50';

const SUBTLE_BUTTON_CLASSES =
  'inline-flex items-center justify-center rounded-lg border border-[var(--quant-border)] px-3 py-1.5 text-xs font-medium text-[var(--quant-foreground)] transition-colors hover:bg-[var(--quant-surface-elevated)] disabled:cursor-not-allowed disabled:opacity-50';

export function RecoveryEmailSettings() {
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [loadError, setLoadError] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionNote, setActionNote] = useState('');

  const load = useCallback(async () => {
    setLoadStatus('loading');
    setLoadError('');
    const response = await apiClient.getRecoveryEmail();
    if (response.success && response.data) {
      setRecoveryEmail(response.data.recoveryEmail);
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
      setDraft(response.data.recoveryEmail ?? '');
      setEditing(false);
      setActionNote(
        response.data.recoveryEmail
          ? `Recovery email set to ${response.data.recoveryEmail}. Reset links will be sent there as well as to your QuantMail inbox.`
          : 'Recovery email removed. Reset links will only go to your QuantMail inbox.',
      );
    } else {
      setActionError(response.error?.message || 'Your recovery email could not be saved.');
    }
  }, [draft]);

  const remove = useCallback(async () => {
    setSaving(true);
    setActionError('');
    setActionNote('');
    const response = await apiClient.setRecoveryEmail(null);
    setSaving(false);
    if (response.success && response.data) {
      setRecoveryEmail(null);
      setDraft('');
      setEditing(false);
      setActionNote('Recovery email removed. Reset links will only go to your QuantMail inbox.');
    } else {
      setActionError(response.error?.message || 'Your recovery email could not be removed.');
    }
  }, []);

  return (
    <SettingsSection
      title="Recovery email"
      description="The out-of-band address reset links are sent to — in addition to your QuantMail inbox — for when you cannot reach this inbox. Use an address you can open from anywhere; it must differ from your QuantMail address."
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
            {!recoveryEmail ? (
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--quant-muted-foreground)]">
                No recovery email. If you lose your password and cannot reach this inbox, reset
                links have no out-of-band address to go to.
              </p>
            ) : null}
          </div>

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

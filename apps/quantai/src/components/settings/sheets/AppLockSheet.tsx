// ============================================================================
// AppLockSheet — device PIN gate setting (real implementation).
// Set / change / disable a 4–8 digit PIN, stored as salted SHA-256.
// Honest framing: a privacy screen, not encryption.
// ============================================================================
import React, { useEffect, useState } from 'react';
import {
  SettingsSheet,
  SheetNote,
  SheetPrimaryButton,
  SheetDangerButton,
} from '../SettingsSheet';
import {
  isAppLockAvailable,
  isAppLockEnabled,
  isValidPinFormat,
  setAppLockPin,
  verifyAppLockPin,
  changeAppLockPin,
  disableAppLock,
} from '../../../lib/app-lock';

type Mode = 'status' | 'set' | 'change-verify' | 'change-new' | 'disable-verify';

export function AppLockSheet({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('status');
  const [available] = useState(() => isAppLockAvailable());
  const [enabled, setEnabled] = useState(() => isAppLockEnabled());
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPin('');
    setConfirm('');
    setError(null);
  }, [mode]);

  const resetToStatus = () => {
    setEnabled(isAppLockEnabled());
    setMode('status');
  };

  async function handleSet() {
    setError(null);
    if (!isValidPinFormat(pin)) {
      setError('PIN must be 4–8 digits.');
      return;
    }
    if (pin !== confirm) {
      setError('PINs do not match.');
      return;
    }
    setBusy(true);
    try {
      await setAppLockPin(pin);
      resetToStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not set PIN.');
    } finally {
      setBusy(false);
    }
  }

  async function handleChangeVerify() {
    setError(null);
    setBusy(true);
    try {
      const ok = await verifyAppLockPin(pin);
      if (!ok) {
        setError('Current PIN is incorrect.');
        return;
      }
      setMode('change-new');
    } finally {
      setBusy(false);
    }
  }

  async function handleChangeNew() {
    setError(null);
    if (!isValidPinFormat(pin)) {
      setError('New PIN must be 4–8 digits.');
      return;
    }
    if (pin !== confirm) {
      setError('PINs do not match.');
      return;
    }
    setBusy(true);
    try {
      // Re-verify is unnecessary — the verify step just passed in this flow.
      await setAppLockPin(pin);
      resetToStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change PIN.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setError(null);
    setBusy(true);
    try {
      const ok = await verifyAppLockPin(pin);
      if (!ok) {
        setError('PIN is incorrect.');
        return;
      }
      disableAppLock();
      resetToStatus();
    } finally {
      setBusy(false);
    }
  }

  function PinInput({
    value,
    onChange,
    label,
    testId,
  }: {
    value: string;
    onChange: (v: string) => void;
    label: string;
    testId?: string;
  }) {
    return (
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-white/60">{label}</span>
        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={8}
          value={value}
          data-testid={testId}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
          placeholder="••••"
          className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-center text-2xl tracking-[0.5em] text-white placeholder:text-white/20 focus:border-blue-500/60 focus:outline-none"
        />
      </label>
    );
  }

  return (
    <SettingsSheet
      title="App lock"
      subtitle="Require a PIN to open QuantAI on this device."
      onClose={onClose}
      testId="app-lock-sheet"
    >
      {!available ? (
        <>
          <p className="text-[15px] text-white/70">
            App lock is not available in this browser — it needs WebCrypto and local storage.
          </p>
          <SheetNote>Try a recent version of Chrome, Edge, Firefox, or Safari.</SheetNote>
        </>
      ) : (
        <>
          {mode === 'status' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-2xl bg-white/[0.04] p-4">
                <span className="text-[15px] text-white/80">Status</span>
                <span
                  className={`rounded-full px-3 py-1 text-[13px] font-semibold ${
                    enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/[0.08] text-white/50'
                  }`}
                >
                  {enabled ? 'On' : 'Off'}
                </span>
              </div>
              {!enabled ? (
                <SheetPrimaryButton onClick={() => setMode('set')} testId="app-lock-setup">
                  Set up PIN
                </SheetPrimaryButton>
              ) : (
                <>
                  <SheetPrimaryButton onClick={() => setMode('change-verify')} testId="app-lock-change">
                    Change PIN
                  </SheetPrimaryButton>
                  <SheetDangerButton onClick={() => setMode('disable-verify')} testId="app-lock-disable">
                    Turn off app lock
                  </SheetDangerButton>
                </>
              )}
              <SheetNote>
                App lock is a privacy screen for this device — it does not encrypt your data.
              </SheetNote>
            </div>
          )}

          {mode === 'set' && (
            <div className="space-y-3">
              <PinInput value={pin} onChange={setPin} label="Choose a PIN (4–8 digits)" testId="app-lock-pin" />
              <PinInput value={confirm} onChange={setConfirm} label="Confirm PIN" testId="app-lock-pin-confirm" />
              {error && <p className="text-sm text-red-400" data-testid="app-lock-error">{error}</p>}
              <SheetPrimaryButton onClick={handleSet} disabled={busy} testId="app-lock-save">
                {busy ? 'Saving…' : 'Enable app lock'}
              </SheetPrimaryButton>
            </div>
          )}

          {mode === 'change-verify' && (
            <div className="space-y-3">
              <PinInput value={pin} onChange={setPin} label="Current PIN" testId="app-lock-pin" />
              {error && <p className="text-sm text-red-400" data-testid="app-lock-error">{error}</p>}
              <SheetPrimaryButton onClick={handleChangeVerify} disabled={busy} testId="app-lock-continue">
                {busy ? 'Checking…' : 'Continue'}
              </SheetPrimaryButton>
            </div>
          )}

          {mode === 'change-new' && (
            <div className="space-y-3">
              <PinInput value={pin} onChange={setPin} label="New PIN (4–8 digits)" testId="app-lock-pin" />
              <PinInput value={confirm} onChange={setConfirm} label="Confirm new PIN" testId="app-lock-pin-confirm" />
              {error && <p className="text-sm text-red-400" data-testid="app-lock-error">{error}</p>}
              <SheetPrimaryButton onClick={handleChangeNew} disabled={busy} testId="app-lock-save">
                {busy ? 'Saving…' : 'Change PIN'}
              </SheetPrimaryButton>
            </div>
          )}

          {mode === 'disable-verify' && (
            <div className="space-y-3">
              <PinInput value={pin} onChange={setPin} label="Enter PIN to turn off app lock" testId="app-lock-pin" />
              {error && <p className="text-sm text-red-400" data-testid="app-lock-error">{error}</p>}
              <SheetDangerButton onClick={handleDisable} disabled={busy} testId="app-lock-confirm-disable">
                {busy ? 'Checking…' : 'Turn off'}
              </SheetDangerButton>
            </div>
          )}
        </>
      )}
    </SettingsSheet>
  );
}

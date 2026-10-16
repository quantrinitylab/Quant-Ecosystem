// ============================================================================
// QuantChat - PasscodePad (QC-F-450, 'My Eyes Only')
//
// One component for all four vault flows: set / verify / change / reset.
// Honesty rules baked in:
//   - Setup says plainly what this lock IS and is NOT: a server-side lock
//     inside QuantChat, not end-to-end encryption.
//   - Reset (forgotten passcode) states, before any confirm, that every
//     private memory is permanently deleted — Snapchat's real behaviour —
//     and cannot proceed without an explicit confirmation.
//   - Accounts that sign in without a password are told reset is not
//     available for them; nothing pretends otherwise, and nothing is
//     deleted or unlocked by that message.
//   - Backend errors are shown as they are (wrong passcode, lockout with
//     the real wait time, passcode-equals-password). No fake success.
// The lock glyph is an inline SVG — no emoji in the UI.
// ============================================================================
'use client';

import { useCallback, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VaultError, type VaultStatus } from '../../../hooks/useMemories';

type PadMode = 'set' | 'verify' | 'change' | 'reset';

interface PasscodePadProps {
  open: boolean;
  vaultStatus: VaultStatus | null;
  onClose: () => void;
  onSet: (passcode: string) => Promise<void>;
  onVerify: (passcode: string) => Promise<void>;
  onChange: (currentPasscode: string, newPasscode: string) => Promise<void>;
  onReset: (accountPassword: string) => Promise<void>;
}

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 32 };
const PASSCODE_RE = /^\d{4,8}$/;

export function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <circle cx="12" cy="15" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

function describeError(err: unknown): string {
  if (err instanceof VaultError) {
    switch (err.code) {
      case 'INVALID_PASSCODE':
        return 'Incorrect passcode.';
      case 'INVALID_ACCOUNT_PASSWORD':
        return 'Incorrect account password.';
      case 'PASSCODE_LOCKED': {
        const secs = err.retryAfterSec ?? 900;
        const mins = Math.ceil(secs / 60);
        return `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`;
      }
      case 'PASSCODE_EQUALS_PASSWORD':
        return 'Your vault passcode must be different from your account password.';
      case 'PASSCODE_ALREADY_SET':
        return 'A passcode is already set. Use Change passcode instead.';
      case 'PASSCODE_NOT_SET':
        return 'No passcode is set yet — create one first.';
      case 'PASSCODE_RESET_UNAVAILABLE':
        return 'Passcode reset is not available for this account.';
      case 'VALIDATION_ERROR':
        return 'Passcodes are 4–8 digits.';
      default:
        return err.message;
    }
  }
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}

export function PasscodePad({
  open,
  vaultStatus,
  onClose,
  onSet,
  onVerify,
  onChange,
  onReset,
}: PasscodePadProps) {
  const hasPasscode = vaultStatus?.hasPasscode ?? false;
  const resetAvailable = vaultStatus?.resetAvailable ?? false;

  const [mode, setMode] = useState<PadMode | null>(null);
  const activeMode: PadMode = mode ?? (hasPasscode ? 'verify' : 'set');

  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [newPasscode, setNewPasscode] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [resetConfirmed, setResetConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const resetFields = useCallback(() => {
    setPasscode('');
    setConfirmPasscode('');
    setNewPasscode('');
    setAccountPassword('');
    setResetConfirmed(false);
    setError(null);
  }, []);

  const switchMode = useCallback(
    (next: PadMode) => {
      resetFields();
      setMode(next);
    },
    [resetFields],
  );

  const handleClose = useCallback(() => {
    resetFields();
    setMode(null);
    onClose();
  }, [onClose, resetFields]);

  const canSubmit = useMemo(() => {
    if (busy) return false;
    switch (activeMode) {
      case 'set':
        return PASSCODE_RE.test(passcode) && passcode === confirmPasscode;
      case 'verify':
        return PASSCODE_RE.test(passcode);
      case 'change':
        return PASSCODE_RE.test(passcode) && PASSCODE_RE.test(newPasscode);
      case 'reset':
        return resetAvailable && accountPassword.length > 0 && resetConfirmed;
      default:
        return false;
    }
  }, [activeMode, busy, passcode, confirmPasscode, newPasscode, accountPassword, resetAvailable, resetConfirmed]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      if (activeMode === 'set') {
        await onSet(passcode);
        // After setting, go straight to verify so the user opens the vault.
        switchMode('verify');
      } else if (activeMode === 'verify') {
        await onVerify(passcode);
        handleClose();
      } else if (activeMode === 'change') {
        await onChange(passcode, newPasscode);
        handleClose();
      } else if (activeMode === 'reset') {
        await onReset(accountPassword);
        handleClose();
      }
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }, [activeMode, canSubmit, passcode, newPasscode, accountPassword, onSet, onVerify, onChange, onReset, handleClose, switchMode]);

  const title =
    activeMode === 'set'
      ? 'Create your My Eyes Only passcode'
      : activeMode === 'change'
        ? 'Change passcode'
        : activeMode === 'reset'
          ? 'Reset passcode'
          : 'My Eyes Only is locked';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <motion.div
            className="w-full max-w-sm rounded-3xl border border-white/10 bg-zinc-900 p-6"
            initial={{ scale: 0.92, y: 24 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 24 }}
            transition={SPRING}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="My Eyes Only passcode"
          >
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-fuchsia-500/15 text-fuchsia-300">
                <LockIcon className="h-5 w-5" />
              </span>
              <h2 className="text-lg font-semibold text-white">{title}</h2>
            </div>

            {activeMode === 'set' && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-gray-300">
                  Choose a 4–8 digit passcode, different from your account password. Private
                  memories stay hidden — not listed, not counted — until you unlock them here.
                </p>
                <p className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-400">
                  This lock lives inside QuantChat and is enforced on the server. It is not
                  end-to-end encryption.
                </p>
                <PasscodeInput label="New passcode" value={passcode} onChange={setPasscode} autoFocus />
                <PasscodeInput label="Confirm passcode" value={confirmPasscode} onChange={setConfirmPasscode} />
                {confirmPasscode.length > 0 && passcode !== confirmPasscode && (
                  <p className="text-xs text-red-300">Passcodes do not match.</p>
                )}
              </div>
            )}

            {activeMode === 'verify' && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-gray-300">Enter your passcode to open My Eyes Only.</p>
                <PasscodeInput label="Passcode" value={passcode} onChange={setPasscode} autoFocus />
                <div className="flex gap-4 text-xs">
                  <button type="button" className="text-fuchsia-300 underline" onClick={() => switchMode('reset')}>
                    Forgot passcode?
                  </button>
                  <button type="button" className="text-gray-300 underline" onClick={() => switchMode('change')}>
                    Change passcode
                  </button>
                </div>
              </div>
            )}

            {activeMode === 'change' && (
              <div className="flex flex-col gap-3">
                <PasscodeInput label="Current passcode" value={passcode} onChange={setPasscode} autoFocus />
                <PasscodeInput label="New passcode" value={newPasscode} onChange={setNewPasscode} />
                <p className="text-xs text-gray-400">
                  Changing your passcode locks the vault on every device until it is opened again.
                </p>
                <button type="button" className="self-start text-xs text-gray-300 underline" onClick={() => switchMode('verify')}>
                  Back
                </button>
              </div>
            )}

            {activeMode === 'reset' && (
              <div className="flex flex-col gap-3">
                {!resetAvailable ? (
                  <p className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
                    Passcode reset isn&apos;t available for this account because you sign in
                    without a password. Your private memories stay locked — nothing is deleted,
                    and there is no other way to open them.
                  </p>
                ) : (
                  <>
                    <p className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">
                      If you reset your passcode, everything in My Eyes Only is permanently
                      deleted — it cannot be recovered. This is what keeps a stolen account
                      password from opening your private memories.
                    </p>
                    <label className="flex items-start gap-2 text-sm text-gray-200">
                      <input
                        type="checkbox"
                        checked={resetConfirmed}
                        onChange={(e) => setResetConfirmed(e.target.checked)}
                        className="mt-1"
                      />
                      I understand my private memories will be permanently deleted.
                    </label>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="vault-account-password" className="text-xs text-gray-400">
                        Account password
                      </label>
                      <input
                        id="vault-account-password"
                        type="password"
                        value={accountPassword}
                        onChange={(e) => setAccountPassword(e.target.value)}
                        autoComplete="current-password"
                        className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white outline-none focus:border-fuchsia-400"
                      />
                    </div>
                  </>
                )}
                <button type="button" className="self-start text-xs text-gray-300 underline" onClick={() => switchMode('verify')}>
                  Back
                </button>
              </div>
            )}

            {error && (
              <p role="alert" className="mt-3 text-sm text-red-300">
                {error}
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 active:scale-95"
              >
                Cancel
              </button>
              {!(activeMode === 'reset' && !resetAvailable) && (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="flex-1 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy
                    ? 'Working…'
                    : activeMode === 'set'
                      ? 'Set passcode'
                      : activeMode === 'change'
                        ? 'Change passcode'
                        : activeMode === 'reset'
                          ? 'Reset and delete'
                          : 'Unlock'}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PasscodeInput({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  const id = useMemo(() => `vault-passcode-${label.replace(/\s+/g, '-').toLowerCase()}`, [label]);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-gray-400">
        {label}
      </label>
      <input
        id={id}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 8))}
        className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-center text-lg tracking-[0.5em] text-white outline-none focus:border-fuchsia-400"
      />
    </div>
  );
}

export default PasscodePad;

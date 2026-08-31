'use client';

/**
 * The password meter, shared by `/register` and `/reset-password`.
 *
 * It scores; it does not decide. The rule that actually governs a password lives
 * on the server (`backend/lib/password-reset.ts` → `passwordComplaint`), which is
 * also where the breach list belongs. What is mirrored here are only the three
 * structural limits — constants, not data — so that the mistakes people make
 * most often are caught before a round trip. Anything rejected for a reason not
 * mirrored here comes back as `WEAK_PASSWORD` and the page renders that message
 * verbatim rather than guessing at it.
 *
 * Extracted from `/register`, which held the only copy: the second consumer is
 * what turns a one-off into a component rather than a paste.
 */

import { useMemo } from 'react';

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

/** The server's structural rules, restated for immediate feedback. */
export const structuralComplaint = (password: string): string | null => {
  if (!password) return null;
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Use ${MAX_PASSWORD_LENGTH} characters or fewer.`;
  }
  if (new Set(password).size === 1) return 'Use more than one repeated character.';
  return null;
};

const LABELS = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'] as const;

/* The four states the app already declares — the meter borrows them rather than
   inventing a fifth palette. */
const COLORS = [
  'var(--quant-destructive)',
  'var(--quant-warning)',
  'var(--quant-warning)',
  'var(--quant-info)',
  'var(--quant-success)',
] as const;

export const passwordStrength = (password: string): number => {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;
  return score;
};

interface PasswordStrengthMeterProps {
  password: string;
  /** Referenced by the field's `aria-describedby`, so the id belongs to the caller. */
  id: string;
  /** A rejection to show instead of the meter — server message or local check. */
  error?: string | null;
  /** Shown while the field is empty. */
  hint?: string;
}

export function PasswordStrengthMeter({
  password,
  id,
  error,
  hint = `Use ${MIN_PASSWORD_LENGTH} or more characters.`,
}: PasswordStrengthMeterProps) {
  const strength = useMemo(() => passwordStrength(password), [password]);

  return (
    <div id={id} className="mt-1.5">
      {error ? (
        <p className="text-xs text-[var(--quant-destructive)]">{error}</p>
      ) : password ? (
        <div className="flex items-center gap-2">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--quant-muted)]"
            role="progressbar"
            aria-label="Password strength"
            aria-valuemin={0}
            aria-valuemax={4}
            aria-valuenow={strength}
            aria-valuetext={LABELS[strength]}
          >
            <div
              className="h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${(strength / 4) * 100}%`, backgroundColor: COLORS[strength] }}
            />
          </div>
          <span className="text-[11px]" style={{ color: COLORS[strength] }}>
            {LABELS[strength]}
          </span>
        </div>
      ) : (
        <p className="text-xs text-[var(--quant-muted-foreground)]">{hint}</p>
      )}
    </div>
  );
}

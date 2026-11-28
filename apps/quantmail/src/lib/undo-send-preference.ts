// ============================================================================
// quantmail — the stored "Undo send" delay preference, read by the undo bar
// ============================================================================
//
// Gmail's undo-send setting is a 5/10/20/30-second cancellation period. This
// app used to have the same control and it was removed — correctly, at the
// time: it wrote `quant-undo-delay` and nothing read it, so the picker lied
// while the bar counted a hardcoded 10 seconds.
//
// This file is the reader that was missing. The settings page writes one key
// through here, and AppShell's UndoSendProvider reads it through here, so a
// choice on the settings page genuinely changes the next countdown. The old
// key is still honoured on read (migrated to the new key) so a browser that
// set a delay before the control was removed gets its choice back instead of
// silently dropping to the default.
//
// Stored on this browser, not on the account — same honesty rule as the
// Assistant tier preference. Returns 10 on the server, in a private-mode
// browser that throws on `localStorage`, and for any value this build does
// not recognise. A change applies to the NEXT send, never to a countdown
// already running: stretching a live window would rewrite a promise the user
// already saw ("10s left") mid-flight.
// ============================================================================

/** The cancellation periods Gmail offers, and the only values this app accepts. */
export const UNDO_SEND_DELAY_OPTIONS = [5, 10, 20, 30] as const;

export type UndoSendDelaySec = (typeof UNDO_SEND_DELAY_OPTIONS)[number];

/** The default, and the value every unrecognised stored value folds to. */
export const UNDO_SEND_DELAY_DEFAULT: UndoSendDelaySec = 10;

export const UNDO_SEND_DELAY_STORAGE_KEY = 'quant-undo-send-delay-sec';

/** The key the removed control wrote. Read for migration, never written again. */
const UNDO_SEND_DELAY_LEGACY_KEY = 'quant-undo-delay';

export function normalizeUndoSendDelay(value: unknown): UndoSendDelaySec {
  const numeric = typeof value === 'string' ? Number(value.trim()) : value;
  if (typeof numeric === 'number' && Number.isInteger(numeric)) {
    const found = UNDO_SEND_DELAY_OPTIONS.find((option) => option === numeric);
    if (found !== undefined) return found;
  }
  return UNDO_SEND_DELAY_DEFAULT;
}

export function readUndoSendDelay(): UndoSendDelaySec {
  if (typeof window === 'undefined') return UNDO_SEND_DELAY_DEFAULT;
  try {
    const stored = window.localStorage.getItem(UNDO_SEND_DELAY_STORAGE_KEY);
    if (stored !== null) return normalizeUndoSendDelay(stored);
    // A browser that set a delay before the control was removed still holds
    // the old key. Honour it once and rewrite it under the new key, so the
    // legacy id retires instead of being re-normalised on every read.
    const legacy = window.localStorage.getItem(UNDO_SEND_DELAY_LEGACY_KEY);
    if (legacy !== null) {
      const migrated = normalizeUndoSendDelay(legacy);
      try {
        window.localStorage.setItem(UNDO_SEND_DELAY_STORAGE_KEY, String(migrated));
      } catch {
        /* A preference we cannot persist still applies to this session. */
      }
      return migrated;
    }
  } catch {
    // Safari in private mode throws on access, not on write. An unreadable
    // preference is the same as an unset one.
  }
  return UNDO_SEND_DELAY_DEFAULT;
}

type UndoSendDelayListener = () => void;

const listeners = new Set<UndoSendDelayListener>();

/**
 * Notified after every write, even one whose storage throw was swallowed:
 * the provider is mounted above the settings page, so without this the
 * countdown would keep the old window until a reload — a setting that only
 * works after a reload is the "appears to do nothing" defect this page has
 * been shedding everywhere else.
 */
export function subscribeUndoSendDelay(listener: UndoSendDelayListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function writeUndoSendDelay(seconds: UndoSendDelaySec): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(UNDO_SEND_DELAY_STORAGE_KEY, String(seconds));
    } catch {
      /* A preference we cannot persist still applies to this session. */
    }
  }
  listeners.forEach((listener) => listener());
}

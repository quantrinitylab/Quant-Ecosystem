'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export interface QuantyCommandBarProps {
  /** Called with the trimmed command text. */
  onSubmit: (command: string) => void;
  /** True while a task is running — input locks to one task at a time. */
  busy?: boolean;
  /** Placeholder copy. */
  placeholder?: string;
  /**
   * Best-effort voice session start: when the voice live-agent mode opens,
   * try to begin listening immediately (the mode pick is a user gesture, so
   * the Speech API usually allows it). If it fails, the mic button keeps
   * pulsing as an invite to tap. Defaults to false.
   */
  autoStartListening?: boolean;
  className?: string;
}

const STORAGE_KEY = 'quanty-recent-commands';
const MAX_RECENT = 5;

/** Read recent commands from localStorage (safe no-op during SSR/tests). */
export function loadRecentCommands(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

/** Persist a command to the recent list (dedupe, newest first). */
export function saveRecentCommand(command: string): string[] {
  const trimmed = command.trim();
  if (!trimmed) return loadRecentCommands();
  const next = [trimmed, ...loadRecentCommands().filter((c) => c !== trimmed)].slice(0, MAX_RECENT);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage full/blocked — recent list is a nicety, not a requirement */
  }
  return next;
}

/**
 * The command input under the avatar: type or speak, send, and pick from
 * recent commands. 44px touch targets throughout; the mic uses the Web Speech
 * API when available and degrades to a disabled state otherwise.
 */
export function QuantyCommandBar({
  onSubmit,
  busy = false,
  placeholder = 'Quanty se kaho… "mere unread emails archive kar do"',
  autoStartListening = false,
  className = '',
}: QuantyCommandBarProps) {
  const [value, setValue] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [showRecent, setShowRecent] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  /**
   * Voice failures are surfaced, never swallowed: the mic button used to fail
   * silently (no permission prompt, no recording UI, no error) which read as a
   * dead button. Every failure path below writes an honest line here.
   */
  const [speechError, setSpeechError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    setRecent(loadRecentCommands());
    // Web Speech API feature-detect (Chrome/Android). Firefox/Safari: no mic.
    const SR =
      typeof window !== 'undefined' &&
      ((window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition ||
        (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition);
    setSpeechSupported(!!SR);
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const startListening = () => {
    setSpeechError(null);
    const SRClass =
      (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition ||
      (window as unknown as { SpeechRecognition?: new () => any }).SpeechRecognition;
    if (!SRClass) {
      // Honest, not dead: this browser has no Web Speech API (Firefox, Safari,
      // some WebViews). The button stays tappable so the reason is visible —
      // a disabled button with only a hover tooltip explains nothing on touch.
      setSpeechError('Is browser me voice input available nahi hai — type karke bhejein.');
      return;
    }
    if (listening) return;
    try {
      const recognition = new SRClass();
      recognition.lang = 'hi-IN';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => {
        const transcript = event.results[0]?.[0]?.transcript ?? '';
        if (transcript) setValue((v) => (v ? `${v} ${transcript}` : transcript));
      };
      recognition.onend = () => setListening(false);
      recognition.onerror = (event: { error?: string }) => {
        setListening(false);
        switch (event?.error) {
          case 'not-allowed':
          case 'service-not-allowed':
            setSpeechError('Mic ki permission nahi mili — browser settings me mic allow karein, phir dobara try karein.');
            break;
          case 'no-speech':
            setSpeechError('Kuch sunai nahi diya — dobara bolein.');
            break;
          case 'audio-capture':
            setSpeechError('Mic nahi mila — device ka mic check karein.');
            break;
          case 'network':
            setSpeechError('Voice service se connect nahi ho paya — type karke bhejein.');
            break;
          default:
            setSpeechError('Voice me dikkat hui — type karke bhejein.');
            break;
        }
      };
      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
      inputRef.current?.focus();
    } catch {
      // start() denial (e.g. no user activation in this frame): say so instead
      // of leaving the mic pulsing as a false invite.
      setListening(false);
      setSpeechError('Voice start nahi ho paya — mic button dobara dabayein ya type karke bhejein.');
    }
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  // Voice live-agent mode opens: best-effort auto-listen (the mode pick was a
  // user gesture). Runs once on mount when requested.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartListening && speechSupported && !autoStartedRef.current) {
      autoStartedRef.current = true;
      startListening();
    }
  }, [autoStartListening, speechSupported]);

  const toggleListening = () => {
    if (listening) {
      stopListening();
      return;
    }
    startListening();
  };

  const submit = () => {
    const command = value.trim();
    if (!command || busy) return;
    setRecent(saveRecentCommand(command));
    setValue('');
    setShowRecent(false);
    onSubmit(command);
  };

  const pickRecent = (command: string) => {
    setValue(command);
    setShowRecent(false);
    inputRef.current?.focus();
  };

  return (
    <div className={`w-full ${className}`}>
      <div
        className="flex items-center gap-2 rounded-2xl border border-white/10 bg-zinc-900/90 p-2 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl"
        role="search"
        aria-label="Quanty command"
      >
        {/* Recent commands toggle */}
        <button
          type="button"
          onClick={() => setShowRecent((s) => !s)}
          aria-expanded={showRecent}
          aria-controls={listId}
          aria-label={showRecent ? 'Recent commands band karein' : 'Recent commands dekhein'}
          disabled={busy || recent.length === 0}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M9 5.5V9l2.5 1.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {/* Text input */}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') setShowRecent(false);
          }}
          onFocus={() => recent.length > 0 && setShowRecent(true)}
          placeholder={placeholder}
          aria-label="Quanty ko command dein"
          disabled={busy}
          maxLength={500}
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
        />

        {/* Mic — never a dead button: tappable whenever it isn't busy so an
            unsupported browser or a denied permission explains itself instead
            of swallowing the tap. */}
        <button
          type="button"
          onClick={toggleListening}
          aria-label={listening ? 'Sunna band karein' : 'Bol kar command dein'}
          aria-pressed={listening}
          disabled={busy}
          title={speechSupported ? 'Voice command' : 'Voice command'}
          className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition disabled:cursor-not-allowed disabled:opacity-30 ${
            listening ? 'bg-red-500/20 text-red-400' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
          }`}
        >
          {listening && (
            <motion.span
              aria-hidden="true"
              className="absolute inset-0 rounded-xl border-2 border-red-400"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            />
          )}
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <rect x="6.5" y="2" width="5" height="8.5" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M4 8.5a5 5 0 0010 0M9 13.5V16M6.5 16h5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {/* Send */}
        <button
          type="button"
          onClick={submit}
          disabled={busy || value.trim().length === 0}
          aria-label="Command bhejein"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500"
        >
          {busy ? (
            <motion.svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              aria-hidden="true"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <path
                d="M9 2a7 7 0 017 7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </motion.svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path
                d="M2.5 9L15.5 2.5 11 15.5 8.5 10.5 2.5 9z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path d="M8.5 10.5L15.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>

      {/* Honest voice failure line: every mic failure explains itself here. */}
      <AnimatePresence>
        {speechError && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            role="alert"
            className="mt-2 rounded-xl border border-amber-500/25 bg-amber-950/60 px-3 py-2 text-xs text-amber-200"
          >
            {speechError}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Recent commands */}
      <AnimatePresence>
        {showRecent && recent.length > 0 && (
          <motion.ul
            id={listId}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            aria-label="Recent commands"
            className="mt-2 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/95 shadow-xl backdrop-blur-xl"
          >
            {recent.map((command) => (
              <li key={command}>
                <button
                  type="button"
                  onClick={() => pickRecent(command)}
                  className="flex h-11 w-full items-center gap-2 px-4 text-left text-sm text-zinc-300 transition hover:bg-white/5 hover:text-zinc-100"
                >
                  <svg width="14" height="14" viewBox="0 0 18 18" fill="none" aria-hidden="true" className="shrink-0 text-zinc-500">
                    <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M9 5.5V9l2.5 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                  <span className="truncate">{command}</span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

'use client';
// ============================================================================
// Shared UI - BackgroundBlur engine + hook + menu (QC-F-322)
// ============================================================================
//
// REAL background blur for LiveKit calls/meetings, built on the official
// companion package @livekit/track-processors (pinned 0.4.1, matching
// livekit-client ^2.9.1). This file replaces a pass-through theatre: the
// old hook returned the input stream unchanged while claiming blur was
// "active", and its setters were no-ops.
//
// Honesty rules (the whole point of the slice):
// - `status === 'active'` means one thing only: the camera track
//   verifiably carries a background processor RIGHT NOW
//   (track.getProcessor()). A requested mode is never a status.
// - Failure is fail-honest: status 'error' + a plain message, the mode
//   shows OFF, and the camera keeps running — the user decides whether
//   to keep their real background visible.
// - 'image' (virtual background) is honestly 'unavailable' in Slice 1:
//   there is no real preset/upload story yet, and a fake one is worse
//   than none. The API shape stays so Slice 2 can make it real.
// - Processor assets are SELF-HOSTED (brief §3.6): the segmentation
//   model + tasks-vision wasm are served from our own origin under
//   BACKGROUND_ASSET_PATH, never from the library's CDN defaults — a
//   call must not leak the viewer's IP/timing to a third-party CDN.
//
// The processor runs entirely on-device; no raw video ever leaves the
// client for background processing.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { LocalVideoTrack } from 'livekit-client';
import {
  BackgroundProcessor,
  BackgroundTransformer,
  ProcessorWrapper,
  type BackgroundOptions,
} from '@livekit/track-processors';

export type BackgroundMode = 'none' | 'blur' | 'image';
export type BackgroundStatus = 'off' | 'starting' | 'active' | 'unavailable' | 'error';

/** Own-origin directory the processor assets are served from. */
export const BACKGROUND_ASSET_PATH = '/livekit-track-processors';

/** The one honest failure sentence every surface shows (brief §3.3). */
export const BACKGROUND_BLUR_ERROR_MESSAGE =
  "Background blur couldn't start — your real background is visible.";

const IMAGE_UNAVAILABLE_MESSAGE = 'Virtual background images are not available yet.';
const UNSUPPORTED_MESSAGE = 'Background blur is not supported in this browser.';

export interface BackgroundBlurOptions {
  mode?: BackgroundMode;
  blurAmount?: number;
  /** Own-origin asset directory override (tests / non-default hosting). */
  assetPath?: string;
}

export interface UseBackgroundBlurReturn {
  isSupported: boolean;
  status: BackgroundStatus;
  error: string | null;
  mode: BackgroundMode;
  blurAmount: number;
  setMode: (mode: BackgroundMode) => void;
  setBlurAmount: (amount: number) => void;
  setBackgroundImage: (url: string) => void;
}

/**
 * Support from the library itself (MediaStreamTrackProcessor/Generator +
 * the transformer's own check) — never a proxy like the old
 * `'OffscreenCanvas' in window`, which proved nothing about whether
 * segmentation can actually run.
 */
export function backgroundIsSupported(): boolean {
  try {
    return ProcessorWrapper.isSupported && BackgroundTransformer.isSupported;
  } catch {
    return false;
  }
}

function assetPathsFor(assetPath: string): NonNullable<BackgroundOptions['assetPaths']> {
  const base = assetPath.replace(/\/$/, '');
  return {
    tasksVisionFileSet: `${base}/wasm`,
    modelAssetPath: `${base}/selfie_segmenter.tflite`,
  };
}

/** The processor instance we applied per track (for blur-radius updates). */
const appliedProcessors = new WeakMap<LocalVideoTrack, unknown>();

/**
 * The ONLY proof of blur: the track itself reports a background
 * processor via getProcessor(). Setters, flags and requested modes are
 * not evidence and are never consulted here.
 */
export function trackHasBackgroundProcessor(
  track: LocalVideoTrack | null | undefined,
): boolean {
  if (!track) return false;
  const processor = track.getProcessor();
  return (
    !!processor &&
    typeof processor.name === 'string' &&
    processor.name.startsWith('background')
  );
}

/**
 * Put a real background-blur processor on the track. Idempotent: a
 * track that already carries one is left untouched. Throws on failure
 * (unsupported browser, asset load, attach) — callers must surface that
 * honestly, never mark anything active.
 */
export async function applyBackgroundBlur(
  track: LocalVideoTrack,
  opts: { blurAmount?: number; assetPath?: string } = {},
): Promise<void> {
  if (trackHasBackgroundProcessor(track)) {
    appliedProcessors.set(track, track.getProcessor());
    return;
  }
  const processor = BackgroundProcessor({
    blurRadius: opts.blurAmount ?? 10,
    assetPaths: assetPathsFor(opts.assetPath ?? BACKGROUND_ASSET_PATH),
  });
  await track.setProcessor(processor);
  if (!trackHasBackgroundProcessor(track)) {
    throw new Error('Background processor did not attach to the camera track.');
  }
  appliedProcessors.set(track, processor);
}

/** Really remove the processor from the track (no-op when none). */
export async function removeBackgroundBlur(
  track: LocalVideoTrack | null | undefined,
): Promise<void> {
  if (!track) return;
  if (track.getProcessor()) {
    await track.stopProcessor();
  }
  appliedProcessors.delete(track);
}

async function updateBackgroundBlurAmount(
  track: LocalVideoTrack,
  amount: number,
  opts: { assetPath?: string },
): Promise<void> {
  const processor = appliedProcessors.get(track) as
    | { updateTransformerOptions?: (o: BackgroundOptions) => Promise<void> }
    | undefined;
  if (
    processor &&
    trackHasBackgroundProcessor(track) &&
    typeof processor.updateTransformerOptions === 'function'
  ) {
    await processor.updateTransformerOptions({ blurRadius: amount });
    return;
  }
  // No live handle to update (e.g. processor applied elsewhere): the
  // honest fallback is a full re-apply at the new radius, never a no-op.
  await track.stopProcessor();
  appliedProcessors.delete(track);
  await applyBackgroundBlur(track, { blurAmount: amount, assetPath: opts.assetPath });
}

interface HookState {
  track: LocalVideoTrack | null;
  status: BackgroundStatus;
  error: string | null;
}

/**
 * Bind background blur to a camera LocalVideoTrack (or null when the
 * camera is off / not yet published). The hook reconciles the REAL
 * processor with the requested mode whenever the track identity or the
 * mode changes: a new track (device switch, camera toggle, reconnect)
 * drops status out of 'active' immediately and re-applies from scratch —
 * yesterday's processor on yesterday's track proves nothing.
 */
export function useBackgroundBlur(
  track: LocalVideoTrack | null,
  options?: BackgroundBlurOptions,
): UseBackgroundBlurReturn {
  const isSupported = backgroundIsSupported();
  const [mode, setModeState] = useState<BackgroundMode>(options?.mode ?? 'none');
  const [blurAmount, setBlurAmountState] = useState<number>(options?.blurAmount ?? 10);
  const [state, setState] = useState<HookState>({ track: null, status: 'off', error: null });
  const assetPath = options?.assetPath ?? BACKGROUND_ASSET_PATH;
  const generationRef = useRef(0);

  useEffect(() => {
    const generation = ++generationRef.current;
    let cancelled = false;

    if (mode === 'image') {
      setState({ track, status: 'unavailable', error: IMAGE_UNAVAILABLE_MESSAGE });
      return;
    }

    if (mode === 'none') {
      void (async () => {
        if (track && trackHasBackgroundProcessor(track)) {
          await removeBackgroundBlur(track).catch(() => undefined);
        }
        if (!cancelled && generation === generationRef.current) {
          setState({ track, status: 'off', error: null });
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    // mode === 'blur'
    if (!isSupported) {
      setState({ track, status: 'unavailable', error: UNSUPPORTED_MESSAGE });
      return;
    }
    if (!track) {
      setState({ track: null, status: 'off', error: null });
      return;
    }
    if (trackHasBackgroundProcessor(track)) {
      setState({ track, status: 'active', error: null });
      return;
    }
    setState({ track, status: 'starting', error: null });
    void (async () => {
      try {
        await applyBackgroundBlur(track, { blurAmount, assetPath });
        if (!cancelled && generation === generationRef.current) {
          const on = trackHasBackgroundProcessor(track);
          setState({
            track,
            status: on ? 'active' : 'error',
            error: on ? null : BACKGROUND_BLUR_ERROR_MESSAGE,
          });
        }
      } catch {
        if (!cancelled && generation === generationRef.current) {
          setState({ track, status: 'error', error: BACKGROUND_BLUR_ERROR_MESSAGE });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // blurAmount is deliberately NOT a dependency: amount changes travel
    // through setBlurAmount's own update path, not a full re-apply.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, mode, isSupported, assetPath]);

  // Status belongs to a (track, mode) pair. If the track changed since
  // the stored state was written, that state is stale evidence: report
  // the honest in-between ('starting' while the effect reconciles),
  // never the old track's 'active'.
  const status: BackgroundStatus =
    state.track === track
      ? state.status
      : mode === 'blur'
        ? track
          ? 'starting'
          : 'off'
        : mode === 'image'
          ? 'unavailable'
          : 'off';
  const error: string | null =
    state.track === track
      ? state.error
      : mode === 'image'
        ? IMAGE_UNAVAILABLE_MESSAGE
        : null;

  const setMode = useCallback((next: BackgroundMode) => {
    setModeState(next);
  }, []);

  const setBlurAmount = useCallback(
    (amount: number) => {
      setBlurAmountState(amount);
      if (mode !== 'blur' || !track || !trackHasBackgroundProcessor(track)) return;
      const generation = ++generationRef.current;
      setState({ track, status: 'starting', error: null });
      void (async () => {
        try {
          await updateBackgroundBlurAmount(track, amount, { assetPath });
          if (generation === generationRef.current) {
            const on = trackHasBackgroundProcessor(track);
            setState({
              track,
              status: on ? 'active' : 'error',
              error: on ? null : BACKGROUND_BLUR_ERROR_MESSAGE,
            });
          }
        } catch {
          if (generation === generationRef.current) {
            setState({ track, status: 'error', error: BACKGROUND_BLUR_ERROR_MESSAGE });
          }
        }
      })();
    },
    [mode, track, assetPath],
  );

  const setBackgroundImage = useCallback((_url: string) => {
    // Slice 1 has no real image backgrounds (no presets, no upload
    // story). Route through mode 'image', whose status is honestly
    // 'unavailable' — never a processor, never an 'active' claim.
    setModeState('image');
  }, []);

  return {
    isSupported,
    status,
    error,
    mode,
    blurAmount,
    setMode,
    setBlurAmount,
    setBackgroundImage,
  };
}

export interface BackgroundBlurProps {
  mode: BackgroundMode;
  status: BackgroundStatus;
  error?: string | null;
  onModeChange: (mode: BackgroundMode) => void;
  className?: string;
  disabled?: boolean;
  /**
   * QC-F-487: 'inline' (default) renders the menu exactly as it always
   * has. 'responsive' keeps that same inline menu at >=640px and swaps
   * it for a 48px trigger + popover below 640px, so narrow call/meet
   * control docks stop overflowing. Presentation only — the engine,
   * statuses and honesty copy are identical in both modes.
   */
  presentation?: 'inline' | 'responsive';
}

/**
 * Presentational background menu: None / Blur only. Image mode is NOT
 * rendered — not even as a disabled tease (brief §3.4) — until Slice 2
 * makes it real. Every label comes from the verified status, so "Blur
 * on" can only appear while a processor is really on the track.
 */
export const BackgroundBlur: React.FC<BackgroundBlurProps> = ({
  mode,
  status,
  error,
  onModeChange,
  className = '',
  disabled = false,
  presentation = 'inline',
}) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // QC-F-487: Escape closes the compact popover and returns focus to
  // its trigger (the popover is a small menu — no focus trap).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open ]);

  const buttonClass = (active: boolean) =>
    `px-3 h-9 rounded-full border text-sm transition-colors ${
      active
        ? 'bg-blue-600 text-white border-transparent'
        : 'bg-transparent text-current border-gray-400/50 hover:bg-white/10'
    }`;

  // The original inline menu, unchanged: same DOM, same classes, same
  // testids, same honesty copy. The responsive presentation reuses this
  // exact render for its >=640px surface.
  const inlineMenu = (
    <>
      <div className="flex items-center gap-2 text-sm">
        <span className="opacity-70">Background:</span>
        <button
          type="button"
          data-testid="blur-mode-none"
          aria-pressed={mode === 'none'}
          disabled={disabled}
          onClick={() => onModeChange('none')}
          className={buttonClass(mode === 'none')}
        >
          None
        </button>
        <button
          type="button"
          data-testid="blur-mode-blur"
          aria-pressed={mode === 'blur'}
          disabled={disabled}
          onClick={() => onModeChange('blur')}
          className={buttonClass(mode === 'blur')}
        >
          Blur
        </button>
        {status === 'starting' && <span role="status">Starting…</span>}
        {status === 'active' && <span role="status">Blur on</span>}
        {status === 'unavailable' && (
          <span role="status">{error ?? UNSUPPORTED_MESSAGE}</span>
        )}
      </div>
      {status === 'error' && (
        <p role="alert" className="mt-1 text-sm text-red-500">
          {error ?? BACKGROUND_BLUR_ERROR_MESSAGE}
        </p>
      )}
    </>
  );

  if (presentation === 'inline') {
    return (
      <div className={className} data-testid="background-blur">
        {inlineMenu}
      </div>
    );
  }

  // ── QC-F-487 responsive presentation ──────────────────────────────────
  const panelButtonClass = (active: boolean) =>
    `flex-1 h-11 rounded-full border text-sm transition-colors ${
      active
        ? 'bg-blue-600 text-white border-transparent'
        : 'bg-transparent text-current border-gray-400/50 hover:bg-white/10'
    }`;
  const choose = (next: BackgroundMode) => {
    onModeChange(next);
    setOpen(false);
  };
  const triggerLabel = `Background settings — ${
    mode === 'blur'
      ? status === 'active'
        ? 'Blur on'
        : status === 'starting'
          ? 'Blur starting'
          : 'Blur'
      : 'None'
  }`;
  const triggerClass = `flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
    status === 'active'
      ? 'bg-blue-600 text-white hover:bg-blue-500'
      : 'bg-white/15 text-white hover:bg-white/25'
  }${
    mode === 'blur' && (status === 'starting' || status === 'error')
      ? ' ring-2 ring-blue-400/70'
      : ''
  }`;

  return (
    <div className={className} data-testid="background-blur">
      <div data-testid="background-blur-inline" className="hidden min-[640px]:block">
        {inlineMenu}
      </div>
      <div data-testid="background-blur-compact" className="relative min-[640px]:hidden">
        {status === 'error' && !open && (
          <p
            role="alert"
            data-testid="background-blur-error"
            className="absolute bottom-full right-0 mb-3 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-red-500/50 bg-red-950/95 px-3 py-2 text-sm text-red-200"
          >
            {error ?? BACKGROUND_BLUR_ERROR_MESSAGE}
          </p>
        )}
        <button
          ref={triggerRef}
          type="button"
          data-testid="blur-menu-trigger"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={triggerLabel}
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          className={triggerClass}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
          </svg>
        </button>
        {open && (
          <>
            <button
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              data-testid="blur-menu-backdrop"
              className="fixed inset-0 z-20 cursor-default"
              onClick={() => setOpen(false)}
            />
            <div
              role="dialog"
              aria-label="Background"
              data-testid="blur-menu-panel"
              className="absolute bottom-full right-0 z-30 mb-3 w-60 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/15 bg-gray-900 p-3 text-white shadow-xl"
            >
              <span className="text-sm opacity-70">Background:</span>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  data-testid="blur-mode-none"
                  aria-pressed={mode === 'none'}
                  disabled={disabled}
                  onClick={() => choose('none')}
                  className={panelButtonClass(mode === 'none')}
                >
                  None
                </button>
                <button
                  type="button"
                  data-testid="blur-mode-blur"
                  aria-pressed={mode === 'blur'}
                  disabled={disabled}
                  onClick={() => choose('blur')}
                  className={panelButtonClass(mode === 'blur')}
                >
                  Blur
                </button>
              </div>
              {(status === 'starting' || status === 'active' || status === 'unavailable') && (
                <div className="mt-2 text-sm">
                  {status === 'starting' && <span role="status">Starting…</span>}
                  {status === 'active' && <span role="status">Blur on</span>}
                  {status === 'unavailable' && (
                    <span role="status">{error ?? UNSUPPORTED_MESSAGE}</span>
                  )}
                </div>
              )}
              {status === 'error' && (
                <p role="alert" className="mt-2 text-sm text-red-300">
                  {error ?? BACKGROUND_BLUR_ERROR_MESSAGE}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

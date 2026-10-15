// @vitest-environment jsdom
//
// QC-F-322 Slice 1 — background-blur engine pins
// (specialist-qc-f-322-buildprep.md §5.1, cases E1–E7 + K1).
//
// The old useBackgroundBlur was a pass-through theatre: startProcessing
// returned the input stream unchanged while claiming blur was "active",
// and Controls.toggleBlur only flipped a state flag. These pins hold the
// replacement to the real thing: status may say "active" ONLY when a real
// @livekit/track-processors processor is verifiably on the camera track
// (track.getProcessor()), failure is honest, and image mode is honestly
// unavailable instead of fake.
//
// @livekit/track-processors is mocked at module level with a stable
// hoisted fake (never a fresh-identity mock). Negative control: on the
// pre-fix code E1/E2/E4/E5/E6/K1 fail — there is no status, no helper and
// no setProcessor anywhere in the old file, and the old toggleBlur shows
// ON with zero processor calls.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ─── Stable fake for @livekit/track-processors (hoisted) ──────────────────
const tp = vi.hoisted(() => ({
  supported: true,
  factoryCalls: [] as Array<Record<string, unknown>>,
  processors: [] as Array<{
    name: string;
    options: Record<string, unknown>;
    updateTransformerOptions: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock('@livekit/track-processors', () => {
  class ProcessorWrapper {
    static get isSupported() {
      return tp.supported;
    }
  }
  class BackgroundTransformer {
    static get isSupported() {
      return tp.supported;
    }
  }
  const BackgroundProcessor = (options: Record<string, unknown>) => {
    if (!tp.supported) {
      throw new Error('processor is not supported in this browser');
    }
    const processor = {
      name: 'background-processor',
      options,
      updateTransformerOptions: vi.fn(async (_opts: Record<string, unknown>) => undefined),
      destroy: vi.fn(async () => undefined),
    };
    tp.factoryCalls.push(options);
    tp.processors.push(processor);
    return processor;
  };
  return { BackgroundProcessor, ProcessorWrapper, BackgroundTransformer };
});

vi.mock('livekit-client', () => ({
  Room: class FakeRoom {},
  Track: {
    Source: { Camera: 'camera', Microphone: 'microphone', ScreenShare: 'screenShare' },
    Kind: { Video: 'video', Audio: 'audio' },
  },
}));

import {
  useBackgroundBlur,
  trackHasBackgroundProcessor,
  BackgroundBlur,
  BACKGROUND_BLUR_ERROR_MESSAGE,
  type UseBackgroundBlurReturn,
} from '../BackgroundBlur';
import { Controls } from '../Controls';

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

interface FakeTrack {
  processor: unknown;
  setProcessor: ReturnType<typeof vi.fn>;
  stopProcessor: ReturnType<typeof vi.fn>;
  getProcessor: ReturnType<typeof vi.fn>;
}

function makeFakeTrack(): FakeTrack {
  const track: FakeTrack = {
    processor: undefined,
    setProcessor: vi.fn(async (p: unknown) => {
      track.processor = p;
    }),
    stopProcessor: vi.fn(async () => {
      track.processor = undefined;
    }),
    getProcessor: vi.fn(() => track.processor),
  };
  return track;
}

// ─── Hook harness ──────────────────────────────────────────────────────────
let hook: UseBackgroundBlurReturn;
const statusLog: string[] = [];

function Harness({ track }: { track: FakeTrack | null }) {
  hook = useBackgroundBlur(track as never, { assetPath: '/test-assets' });
  statusLog.push(hook.status);
  return null;
}

describe('QC-F-322 background engine (useBackgroundBlur + helpers)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    tp.supported = true;
    tp.factoryCalls.length = 0;
    tp.processors.length = 0;
    statusLog.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderHarness(track: FakeTrack | null) {
    await act(async () => {
      root.render(<Harness track={track} />);
      await flushPromises();
    });
  }

  it('E1: blur applies a REAL processor; status is starting until the track verifiably has it, then active', async () => {
    const track = makeFakeTrack();
    let resolveProcessor!: () => void;
    track.setProcessor.mockImplementation(
      (p: unknown) =>
        new Promise<void>((resolve) => {
          resolveProcessor = () => {
            track.processor = p;
            resolve();
          };
        }),
    );
    await renderHarness(track);
    expect(hook.status).toBe('off');

    await act(async () => {
      hook.setMode('blur');
      await flushPromises();
    });
    // The processor promise has not resolved: claiming "active" now would
    // be the old theatre. It must still be starting.
    expect(hook.status).toBe('starting');
    expect(track.setProcessor).toHaveBeenCalledTimes(1);
    // Self-hosted assets only (§3.6): the factory must receive our own
    // origin paths, never the library's CDN defaults.
    expect(tp.factoryCalls).toHaveLength(1);
    expect(tp.factoryCalls[0]?.assetPaths).toEqual({
      tasksVisionFileSet: '/test-assets/wasm',
      modelAssetPath: '/test-assets/selfie_segmenter.tflite',
    });

    await act(async () => {
      resolveProcessor();
      await flushPromises();
    });
    expect(trackHasBackgroundProcessor(track as never)).toBe(true);
    expect(hook.status).toBe('active');
  });

  it('E2: a failed apply is honest — status error, an error message, and active NEVER appeared', async () => {
    const track = makeFakeTrack();
    track.setProcessor.mockRejectedValue(new Error('wasm load failed'));
    await renderHarness(track);

    await act(async () => {
      hook.setMode('blur');
      await flushPromises();
      await flushPromises();
    });

    expect(hook.status).toBe('error');
    expect(hook.error).toBeTruthy();
    expect(statusLog).not.toContain('active');
    expect(trackHasBackgroundProcessor(track as never)).toBe(false);
  });

  it('E3: turning blur off really stops the processor before status says off', async () => {
    const track = makeFakeTrack();
    await renderHarness(track);
    await act(async () => {
      hook.setMode('blur');
      await flushPromises();
    });
    expect(hook.status).toBe('active');

    await act(async () => {
      hook.setMode('none');
      await flushPromises();
    });
    expect(track.stopProcessor).toHaveBeenCalledTimes(1);
    expect(trackHasBackgroundProcessor(track as never)).toBe(false);
    expect(hook.status).toBe('off');
  });

  it('E4: setBlurAmount is not a no-op — the new radius reaches the live processor', async () => {
    const track = makeFakeTrack();
    await renderHarness(track);
    await act(async () => {
      hook.setMode('blur');
      await flushPromises();
    });
    expect(hook.status).toBe('active');
    const processor = tp.processors[0]!;

    await act(async () => {
      hook.setBlurAmount(24);
      await flushPromises();
    });
    expect(processor.updateTransformerOptions).toHaveBeenCalledWith({ blurRadius: 24 });
    expect(hook.status).toBe('active');
  });

  it('E5: image mode is honestly unavailable — no processor is ever created for it', async () => {
    const track = makeFakeTrack();
    await renderHarness(track);

    await act(async () => {
      hook.setMode('image');
      await flushPromises();
    });

    expect(hook.status).toBe('unavailable');
    expect(hook.error).toBeTruthy();
    expect(tp.factoryCalls).toHaveLength(0);
    expect(track.setProcessor).not.toHaveBeenCalled();
    expect(statusLog).not.toContain('active');
  });

  it('E6: support comes from the library, not an OffscreenCanvas proxy — unsupported means unavailable', async () => {
    tp.supported = false;
    const track = makeFakeTrack();
    await renderHarness(track);
    expect(hook.isSupported).toBe(false);

    await act(async () => {
      hook.setMode('blur');
      await flushPromises();
    });

    expect(hook.status).toBe('unavailable');
    expect(tp.factoryCalls).toHaveLength(0);
    expect(track.setProcessor).not.toHaveBeenCalled();
  });

  it('E7: setBackgroundImage is honestly unavailable in Slice 1 (no fake virtual background)', async () => {
    const track = makeFakeTrack();
    await renderHarness(track);

    await act(async () => {
      hook.setBackgroundImage('https://example.com/bg.jpg');
      await flushPromises();
    });

    expect(hook.status).toBe('unavailable');
    expect(hook.error).toBeTruthy();
    expect(tp.factoryCalls).toHaveLength(0);
    expect(track.setProcessor).not.toHaveBeenCalled();
    expect(statusLog).not.toContain('active');
  });
});

describe('QC-F-322 BackgroundBlur menu component (presentational pins P1–P3)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderMenu(props: {
    mode: 'none' | 'blur' | 'image';
    status: 'off' | 'starting' | 'active' | 'unavailable' | 'error';
    error?: string | null;
    onModeChange: (m: 'none' | 'blur' | 'image') => void;
  }) {
    await act(async () => {
      root.render(<BackgroundBlur {...props} />);
      await flushPromises();
    });
  }

  it('P1: only None/Blur exist (no Image tease, not even disabled); "Blur on" shows only when active', async () => {
    const onModeChange = vi.fn();
    await renderMenu({ mode: 'blur', status: 'active', onModeChange });
    const buttons = [...container.querySelectorAll('button')];
    expect(buttons).toHaveLength(2);
    expect(container.textContent).not.toContain('Virtual Background');
    expect(container.textContent).toContain('Blur on');

    await renderMenu({ mode: 'none', status: 'off', onModeChange });
    expect(container.textContent).not.toContain('Blur on');
  });

  it('P2: error status shows the honest copy in an alert and never "Blur on"', async () => {
    const onModeChange = vi.fn();
    await renderMenu({
      mode: 'blur',
      status: 'error',
      error: BACKGROUND_BLUR_ERROR_MESSAGE,
      onModeChange,
    });
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe(BACKGROUND_BLUR_ERROR_MESSAGE);
    expect(container.textContent).not.toContain('Blur on');
  });

  it('P3: buttons report mode changes; starting shows "Starting…" and not "Blur on"', async () => {
    const onModeChange = vi.fn();
    await renderMenu({ mode: 'none', status: 'starting', onModeChange });
    expect(container.textContent).toContain('Starting…');
    expect(container.textContent).not.toContain('Blur on');

    const blurBtn = container.querySelector('[data-testid="blur-mode-blur"]') as HTMLButtonElement;
    await act(async () => {
      blurBtn.click();
      await flushPromises();
    });
    expect(onModeChange).toHaveBeenCalledWith('blur');
    const noneBtn = container.querySelector('[data-testid="blur-mode-none"]') as HTMLButtonElement;
    await act(async () => {
      noneBtn.click();
      await flushPromises();
    });
    expect(onModeChange).toHaveBeenCalledWith('none');
  });
});

describe('QC-F-322 Controls dock blur (K1)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    tp.supported = true;
    tp.factoryCalls.length = 0;
    tp.processors.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('K1: toggleBlur drives the real engine — ON only with a processor on the track; failure stays OFF', async () => {
    const track = makeFakeTrack();
    const fakeRoom = {
      localParticipant: {
        getTrackPublication: (source: string) =>
          source === 'camera' ? { videoTrack: track, track } : undefined,
        setMicrophoneEnabled: vi.fn(async () => undefined),
        setCameraEnabled: vi.fn(async () => undefined),
        setScreenShareEnabled: vi.fn(async () => undefined),
        publishData: vi.fn(),
      },
      disconnect: vi.fn(),
    };

    await act(async () => {
      root.render(<Controls room={fakeRoom as never} />);
      await flushPromises();
    });
    const btn = container.querySelector('[data-testid="blur-toggle"]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.getAttribute('aria-pressed')).toBe('false');

    // ON: the processor must actually land before the button may show ON.
    await act(async () => {
      btn.click();
      await flushPromises();
    });
    expect(track.setProcessor).toHaveBeenCalledTimes(1);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.title).toBe('Disable blur');

    // OFF: processor really stopped.
    await act(async () => {
      btn.click();
      await flushPromises();
    });
    expect(track.stopProcessor).toHaveBeenCalledTimes(1);
    expect(btn.getAttribute('aria-pressed')).toBe('false');

    // Failure: setProcessor rejects — the button must stay OFF (the old
    // code flipped to purple ON here with zero processor calls).
    track.setProcessor.mockRejectedValue(new Error('boom'));
    await act(async () => {
      btn.click();
      await flushPromises();
      await flushPromises();
    });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(btn.title).not.toBe('Disable blur');
    expect(trackHasBackgroundProcessor(track as never)).toBe(false);
  });
});

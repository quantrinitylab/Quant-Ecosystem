// @vitest-environment jsdom
//
// QC-F-322 Slice 1 — 1:1/group call page background-blur pins
// (specialist-qc-f-322-buildprep.md §5.1, cases C1–C3 + one control).
//
// The calls page auto-joins (there is no pre-join — brief Sudhaar 5), so
// Slice 1 is an in-call Background menu only. Harness: the same stable
// hoisted FakeRoom pattern as the meet suites; the page's React `use()`
// params promise is resolved.
//
// Boundary note (honest scaffolding, same as the meet suite): the
// background engine is doubled at the '@quant/shared-ui' boundary,
// mirroring its documented contract (status ONLY from
// track.getProcessor(), starting → active/error). The real
// BackgroundBlur.tsx imports '@livekit/track-processors', a dependency
// of @quant/shared-ui only, which is NOT resolvable from this app's
// test module graph (verified firsthand), so the real engine + menu are
// pinned in shared-ui's own suite (qc-f-322-background-engine.test.tsx,
// E1–E7, K1, P1–P3) instead. This suite pins the calls page's wiring.
//
// Negative control: on the pre-fix page there is no background menu at
// all — C1–C3 fail there; the control (mic toggle) passes on both.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ─── Stable processor-factory state for the boundary double (hoisted) ────
const tp = vi.hoisted(() => ({
  supported: true,
  factoryCalls: [] as Array<Record<string, unknown>>,
}));

// ─── Stable fake LiveKit room/participants/tracks (hoisted) ───────────────
const lk = vi.hoisted(() => {
  class FakeVideoTrack {
    static instances: FakeVideoTrack[] = [];
    processor: unknown = undefined;
    setProcessor = vi.fn(async (p: unknown) => {
      this.processor = p;
    });
    stopProcessor = vi.fn(async () => {
      this.processor = undefined;
    });
    getProcessor = vi.fn(() => this.processor);
    attach = vi.fn();
    detach = vi.fn();
    stop = vi.fn();
    constructor() {
      FakeVideoTrack.instances.push(this);
    }
  }

  class FakeParticipant {
    identity = 'me';
    name = 'Me';
    cameraTrack: FakeVideoTrack | null = null;
    setMicrophoneEnabled = vi.fn(async (_enabled: boolean) => undefined);
    setCameraEnabled = vi.fn(async (enabled: boolean) => {
      if (enabled) {
        if (!this.cameraTrack) this.cameraTrack = new FakeVideoTrack();
      } else {
        this.cameraTrack = null;
      }
    });
    publishTrack = vi.fn(async (track: FakeVideoTrack) => {
      this.cameraTrack = track;
    });
    getTrackPublication(source: string) {
      if (source === 'camera' && this.cameraTrack) {
        return { videoTrack: this.cameraTrack, track: this.cameraTrack };
      }
      return undefined;
    }
  }

  class FakeRoom {
    localParticipant = new FakeParticipant();
    remoteParticipants = new Map<string, FakeParticipant>();
    static instances: FakeRoom[] = [];
    constructor() {
      FakeRoom.instances.push(this);
    }
    on() {
      return this;
    }
    async connect() {
      return undefined;
    }
    disconnect() {
      return undefined;
    }
  }

  const RoomEvent = {
    TrackSubscribed: 'trackSubscribed',
    TrackUnsubscribed: 'trackUnsubscribed',
    ParticipantConnected: 'participantConnected',
    ParticipantDisconnected: 'participantDisconnected',
    Disconnected: 'disconnected',
  };

  return { FakeVideoTrack, FakeParticipant, FakeRoom, RoomEvent };
});

vi.mock('livekit-client', () => ({
  Room: lk.FakeRoom,
  RoomEvent: lk.RoomEvent,
  Track: {
    Source: { Camera: 'camera', Microphone: 'microphone', ScreenShare: 'screenShare' },
  },
}));

const apiMocks = vi.hoisted(() => ({
  joinCall: vi.fn(),
  endCall: vi.fn(),
}));

vi.mock('../services/api-client', () => ({
  apiClient: {
    joinCall: apiMocks.joinCall,
    endCall: apiMocks.endCall,
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

// Background engine doubled at this boundary (see header note — the
// real module is pinned in shared-ui's own suite). The double mirrors
// the engine contract faithfully: status ONLY from
// track.getProcessor(), starting → active/error, image unavailable.
vi.mock('@quant/shared-ui', async () => {
  const React = await import('react');
  const { useState, useEffect, useCallback } = React;

  const ERR = "Background blur couldn't start — your real background is visible.";
  const IMG = 'Virtual background images are not available yet.';
  const UNSUP = 'Background blur is not supported in this browser.';
  const ASSET_PATH = '/livekit-track-processors';

  type AnyTrack = {
    getProcessor: () => { name?: string } | undefined;
    setProcessor: (p: unknown) => Promise<void>;
    stopProcessor: () => Promise<void>;
  };

  const trackHas = (track: AnyTrack | null | undefined): boolean =>
    !!track?.getProcessor() &&
    typeof track.getProcessor()?.name === 'string' &&
    (track.getProcessor()?.name as string).startsWith('background');

  const applyBackgroundBlur = async (
    track: AnyTrack,
    opts: { blurAmount?: number; assetPath?: string } = {},
  ): Promise<void> => {
    if (trackHas(track)) return;
    if (!tp.supported) throw new Error('processor is not supported in this browser');
    const options = {
      blurRadius: opts.blurAmount ?? 10,
      assetPaths: {
        tasksVisionFileSet: `${ASSET_PATH}/wasm`,
        modelAssetPath: `${ASSET_PATH}/selfie_segmenter.tflite`,
      },
    };
    tp.factoryCalls.push(options);
    const processor = {
      name: 'background-processor',
      options,
      updateTransformerOptions: vi.fn(async () => undefined),
      destroy: vi.fn(async () => undefined),
    };
    await track.setProcessor(processor);
    if (!trackHas(track)) throw new Error('processor did not attach');
  };

  const removeBackgroundBlur = async (track: AnyTrack | null | undefined) => {
    if (track?.getProcessor()) await track.stopProcessor();
  };

  function useBackgroundBlur(track: AnyTrack | null, _options?: unknown) {
    const [mode, setModeState] = useState<string>('none');
    const [state, setState] = useState<{
      track: unknown;
      status: string;
      error: string | null;
    }>({ track: null, status: 'off', error: null });
    useEffect(() => {
      let cancelled = false;
      if (mode === 'image') {
        setState({ track, status: 'unavailable', error: IMG });
        return;
      }
      if (mode === 'none') {
        void (async () => {
          if (track && trackHas(track)) {
            await removeBackgroundBlur(track).catch(() => undefined);
          }
          if (!cancelled) setState({ track, status: 'off', error: null });
        })();
        return () => {
          cancelled = true;
        };
      }
      if (!tp.supported) {
        setState({ track, status: 'unavailable', error: UNSUP });
        return;
      }
      if (!track) {
        setState({ track: null, status: 'off', error: null });
        return;
      }
      if (trackHas(track)) {
        setState({ track, status: 'active', error: null });
        return;
      }
      setState({ track, status: 'starting', error: null });
      void (async () => {
        try {
          await applyBackgroundBlur(track);
          if (!cancelled) {
            const on = trackHas(track);
            setState({ track, status: on ? 'active' : 'error', error: on ? null : ERR });
          }
        } catch {
          if (!cancelled) setState({ track, status: 'error', error: ERR });
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [track, mode]);
    const status =
      state.track === track
        ? state.status
        : mode === 'blur'
          ? track
            ? 'starting'
            : 'off'
          : mode === 'image'
            ? 'unavailable'
            : 'off';
    const error =
      state.track === track ? state.error : mode === 'image' ? IMG : null;
    const setMode = useCallback((m: string) => setModeState(m), []);
    return {
      isSupported: tp.supported,
      status,
      error,
      mode,
      blurAmount: 10,
      setMode,
      setBlurAmount: () => undefined,
      setBackgroundImage: () => setModeState('image'),
    };
  }

  const BackgroundBlur = ({
    mode,
    status,
    error,
    onModeChange,
  }: {
    mode: string;
    status: string;
    error?: string | null;
    onModeChange: (m: string) => void;
  }) => (
    <div data-testid="background-blur">
      <div>
        <span>Background:</span>
        <button
          type="button"
          data-testid="blur-mode-none"
          aria-pressed={mode === 'none'}
          onClick={() => onModeChange('none')}
        >
          None
        </button>
        <button
          type="button"
          data-testid="blur-mode-blur"
          aria-pressed={mode === 'blur'}
          onClick={() => onModeChange('blur')}
        >
          Blur
        </button>
        {status === 'starting' && <span role="status">Starting…</span>}
        {status === 'active' && <span role="status">Blur on</span>}
        {status === 'unavailable' && <span role="status">{error ?? UNSUP}</span>}
      </div>
      {status === 'error' && <p role="alert">{error ?? ERR}</p>}
    </div>
  );

  return {
    BackgroundBlur,
    useBackgroundBlur,
    applyBackgroundBlur,
    removeBackgroundBlur,
    trackHasBackgroundProcessor: trackHas,
    BACKGROUND_ASSET_PATH: ASSET_PATH,
    BACKGROUND_BLUR_ERROR_MESSAGE: ERR,
    AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    TopBar: () => null,
  };
});

import CallRoomPage from '../app/calls/[callId]/page';

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const BLUR_ERROR = "Background blur couldn't start — your real background is visible.";

describe('CallRoomPage background blur (QC-F-322 Slice 1)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    tp.supported = true;
    tp.factoryCalls.length = 0;
    lk.FakeRoom.instances.length = 0;
    lk.FakeVideoTrack.instances.length = 0;
    apiMocks.joinCall.mockResolvedValue({
      success: true,
      data: { token: 'tok', serverUrl: 'wss://sfu.example' },
    });
    apiMocks.endCall.mockResolvedValue({ success: true, data: {} });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderInCall() {
    await act(async () => {
      root.render(<CallRoomPage params={Promise.resolve({ callId: 'call-1' })} />);
      await flushPromises();
      await flushPromises();
    });
    const room = lk.FakeRoom.instances[0];
    expect(room).toBeDefined();
    // In-call controls render only in the in-call phase.
    expect(container.querySelector('[aria-label="End call"]')).not.toBeNull();
    return room;
  }

  async function clickBlur() {
    const btn = container.querySelector('[data-testid="blur-mode-blur"]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    await act(async () => {
      btn.click();
      await flushPromises();
      await flushPromises();
    });
    return btn;
  }

  it('C1: in-call Blur applies the processor to the camera publication track; ON only after it lands', async () => {
    const room = await renderInCall();
    const camTrack = room.localParticipant.cameraTrack!;
    expect(camTrack).toBeDefined();
    expect(camTrack.getProcessor()).toBeUndefined();

    await clickBlur();

    expect(camTrack.setProcessor).toHaveBeenCalledTimes(1);
    expect(camTrack.getProcessor()).toBeDefined();
    expect(container.textContent).toContain('Blur on');
  });

  it('C2: a failed apply shows the honest notice and never claims active', async () => {
    const room = await renderInCall();
    const camTrack = room.localParticipant.cameraTrack!;
    camTrack.setProcessor.mockRejectedValue(new Error('wasm load failed'));

    await clickBlur();
    await act(async () => {
      await flushPromises();
    });

    expect(container.textContent).toContain(BLUR_ERROR);
    expect(container.textContent).not.toContain('Blur on');
    expect(camTrack.getProcessor()).toBeUndefined();
  });

  it('C3: camera off→on re-applies blur to the new publication track', async () => {
    const room = await renderInCall();
    await clickBlur();
    const firstTrack = room.localParticipant.cameraTrack!;
    expect(firstTrack.getProcessor()).toBeDefined();

    const camBtn = container.querySelector(
      '[aria-label="Turn camera off"]',
    ) as HTMLButtonElement;
    expect(camBtn).not.toBeNull();
    await act(async () => {
      camBtn.click();
      await flushPromises();
    });
    expect(room.localParticipant.cameraTrack).toBeNull();
    expect(container.textContent).not.toContain('Blur on');

    const camOnBtn = container.querySelector(
      '[aria-label="Turn camera on"]',
    ) as HTMLButtonElement;
    await act(async () => {
      camOnBtn.click();
      await flushPromises();
      await flushPromises();
    });
    const newTrack = room.localParticipant.cameraTrack!;
    expect(newTrack).not.toBe(firstTrack);
    expect(newTrack.setProcessor).toHaveBeenCalledTimes(1);
    expect(newTrack.getProcessor()).toBeDefined();
    expect(container.textContent).toContain('Blur on');
  });

  it('control: existing in-call behaviour is untouched (mic toggle still wired)', async () => {
    const room = await renderInCall();
    const mic = container.querySelector(
      '[aria-label="Mute microphone"]',
    ) as HTMLButtonElement;
    expect(mic).not.toBeNull();
    await act(async () => {
      mic.click();
      await flushPromises();
    });
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(false);
    expect(tp.factoryCalls).toHaveLength(0);
  });
});

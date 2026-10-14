// @vitest-environment jsdom
//
// QC-F-322 Slice 1 — meet-room background-blur pins
// (specialist-qc-f-322-buildprep.md §5.1, cases M1–M5 + one control).
//
// Harness pattern: meet-room-raise-hand.test.tsx (stable module-level
// hoisted FakeRoom/FakeParticipant — never a fresh-identity mock),
// extended with camera-track processor spies. ParticipantTile is stubbed:
// tile rendering is QC-F-263's subject, not this slice's — the pins here
// are about WHICH track gets a processor, WHEN, and what the UI honestly
// says.
//
// Boundary note (honest scaffolding): the background engine itself
// (hook/helpers/menu from packages/shared-ui) is doubled at the
// '@quant/shared-ui' boundary below, mirroring its documented contract
// exactly — status derives ONLY from track.getProcessor(), transitions
// starting → active/error, image mode unavailable. Reason: the real
// BackgroundBlur.tsx imports '@livekit/track-processors', which is a
// dependency of @quant/shared-ui only and is NOT resolvable from this
// app's test module graph (verified firsthand: Node resolution from
// apps/quantchat throws), so a module mock here can never intercept it
// and the real package would load with isSupported=false under jsdom.
// The REAL engine + REAL menu component are pinned in the shared-ui
// package's own suite (qc-f-322-background-engine.test.tsx, E1–E7, K1,
// P1–P3), where that resolution works. What THIS suite pins is the meet
// page's wiring against the contract: track selection, the §3.5
// processed-before-publish order, and honest UI states.
//
// Negative control: on the pre-fix page there is no background menu at
// all — M1–M5 fail there (menu/buttons absent, no processor ever
// created); the control (plain join) passes on both versions.

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
  const callOrder: string[] = [];

  class FakeVideoTrack {
    static instances: FakeVideoTrack[] = [];
    processor: unknown = undefined;
    setProcessor = vi.fn(async (p: unknown) => {
      callOrder.push('setProcessor');
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
    identity: string;
    name: string;
    attributes: Record<string, string> = {};
    cameraTrack: FakeVideoTrack | null = null;
    screenTrack: FakeVideoTrack | null = null;
    setAttributes = vi.fn(async (attrs: Record<string, string>) => {
      Object.assign(this.attributes, attrs);
    });
    setMicrophoneEnabled = vi.fn(async (_enabled: boolean) => undefined);
    setCameraEnabled = vi.fn(async (enabled: boolean) => {
      if (enabled) {
        if (!this.cameraTrack) this.cameraTrack = new FakeVideoTrack();
      } else {
        // Unpublishing discards the publication; re-enabling creates a
        // NEW track object (the lifecycle the re-apply pins rely on).
        this.cameraTrack = null;
      }
    });
    publishTrack = vi.fn(async (track: FakeVideoTrack) => {
      callOrder.push('publishTrack');
      this.cameraTrack = track;
    });
    constructor(identity: string, name: string) {
      this.identity = identity;
      this.name = name;
    }
    getTrackPublication(source: string) {
      if (source === 'camera' && this.cameraTrack) {
        return { videoTrack: this.cameraTrack, track: this.cameraTrack };
      }
      if (source === 'screenShare' && this.screenTrack) {
        return { videoTrack: this.screenTrack, track: this.screenTrack };
      }
      return undefined;
    }
  }

  class FakeRoom {
    localParticipant = new FakeParticipant('me', 'Me');
    remoteParticipants = new Map<string, FakeParticipant>();
    handlers = new Map<string, Array<(...args: unknown[]) => void>>();
    static instances: FakeRoom[] = [];
    constructor() {
      FakeRoom.instances.push(this);
    }
    on(event: string, cb: (...args: unknown[]) => void) {
      const list = this.handlers.get(event) ?? [];
      list.push(cb);
      this.handlers.set(event, list);
      return this;
    }
    emit(event: string, ...args: unknown[]) {
      for (const cb of this.handlers.get(event) ?? []) cb(...args);
    }
    async connect() {
      return undefined;
    }
    disconnect() {
      return undefined;
    }
    removeAllListeners() {
      this.handlers.clear();
    }
    async switchActiveDevice() {
      return undefined;
    }
  }

  const RoomEvent = {
    ParticipantConnected: 'participantConnected',
    ParticipantDisconnected: 'participantDisconnected',
    TrackSubscribed: 'trackSubscribed',
    TrackUnsubscribed: 'trackUnsubscribed',
    TrackMuted: 'trackMuted',
    TrackUnmuted: 'trackUnmuted',
    LocalTrackPublished: 'localTrackPublished',
    LocalTrackUnpublished: 'localTrackUnpublished',
    ActiveSpeakersChanged: 'activeSpeakersChanged',
    Reconnecting: 'reconnecting',
    Reconnected: 'reconnected',
    Disconnected: 'disconnected',
    ParticipantAttributesChanged: 'participantAttributesChanged',
  };

  const ConnectionState = {
    Disconnected: 'disconnected',
    Connecting: 'connecting',
    Connected: 'connected',
    Reconnecting: 'reconnecting',
  };

  const createLocalVideoTrack = vi.fn(async (_opts?: unknown) => new FakeVideoTrack());

  return { FakeVideoTrack, FakeParticipant, FakeRoom, RoomEvent, ConnectionState, createLocalVideoTrack, callOrder };
});

vi.mock('livekit-client', () => ({
  Room: lk.FakeRoom,
  RoomEvent: lk.RoomEvent,
  ConnectionState: lk.ConnectionState,
  Track: {
    Source: { Camera: 'camera', Microphone: 'microphone', ScreenShare: 'screenShare' },
  },
  createLocalVideoTrack: lk.createLocalVideoTrack,
}));

const apiMocks = vi.hoisted(() => ({
  getMeetingRoom: vi.fn(),
  joinMeetingRoom: vi.fn(),
  leaveMeetingRoom: vi.fn(),
}));

vi.mock('../services/api-client', () => ({
  apiClient: {
    getMeetingRoom: apiMocks.getMeetingRoom,
    joinMeetingRoom: apiMocks.joinMeetingRoom,
    leaveMeetingRoom: apiMocks.leaveMeetingRoom,
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ roomId: 'room-1' }),
  useSearchParams: () => new URLSearchParams(),
}));

// Background engine doubled at this boundary (see header note — the
// real module is pinned in shared-ui's own suite). The double mirrors
// the engine contract faithfully: a processor object named
// 'background-processor' created per apply, status ONLY from
// track.getProcessor(), starting → active/error, image unavailable.
// DevicePicker stub exposes a camera-switch button so the
// device-change pin can drive onCameraSelect.
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
    LoadingState: ({ text }: { text?: string }) => <div>{text}</div>,
    ErrorState: ({ message }: { message?: string }) => <div>{message}</div>,
    ParticipantTile: () => null,
    DevicePicker: (props: {
      onCameraSelect?: (id: string) => void;
    }) => (
      <button
        type="button"
        data-testid="switch-camera"
        onClick={() => props.onCameraSelect?.('cam-2')}
      >
        Switch camera
      </button>
    ),
  };
});

import MeetRoomPage from '../app/meet/[roomId]/page';

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const ROOM_INFO = {
  id: 'room-1',
  name: 'Standup',
  hostId: 'host-1',
  status: 'active' as const,
  settings: {},
  participants: [],
  participantCount: 1,
  createdAt: '2026-10-13T00:00:00.000Z',
};

const BLUR_ERROR = "Background blur couldn't start — your real background is visible.";

describe('MeetRoomPage background blur (QC-F-322 Slice 1)', () => {
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
    lk.callOrder.length = 0;
    apiMocks.getMeetingRoom.mockResolvedValue({ success: true, data: ROOM_INFO });
    apiMocks.joinMeetingRoom.mockResolvedValue({
      success: true,
      data: { token: 'tok', serverUrl: 'wss://sfu.example', room: ROOM_INFO, participant: {} },
    });
    apiMocks.leaveMeetingRoom.mockResolvedValue({ success: true, data: ROOM_INFO });
    // Studio mic meter reads an audio-only getUserMedia stream.
    const audioTrack = { stop: vi.fn() };
    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getAudioTracks: () => [audioTrack],
          getTracks: () => [audioTrack],
        })),
      },
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderToGate() {
    await act(async () => {
      root.render(<MeetRoomPage />);
      await flushPromises();
    });
    const room = lk.FakeRoom.instances[0];
    expect(room).toBeDefined();
    return room;
  }

  /** Gate → "Check camera & mic" → studio (real preview track created). */
  async function enterStudio() {
    const room = await renderToGate();
    const check = container.querySelector('[data-testid="check-devices-button"]') as HTMLButtonElement;
    expect(check).not.toBeNull();
    await act(async () => {
      check.click();
      await flushPromises();
      await flushPromises();
    });
    expect(container.querySelector('[data-testid="join-now-button"]')).not.toBeNull();
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

  async function joinFromStudio() {
    const joinBtn = container.querySelector('[data-testid="join-now-button"]') as HTMLButtonElement;
    expect(joinBtn).not.toBeNull();
    await act(async () => {
      joinBtn.click();
      await flushPromises();
      await flushPromises();
    });
    expect(container.querySelector('[data-testid="toggle-mic"]')).not.toBeNull();
  }

  it('M1: studio blur choice → processed preview, and join publishes ONLY the processed track', async () => {
    const room = await enterStudio();
    // Preview track exists from createLocalVideoTrack.
    expect(lk.FakeVideoTrack.instances.length).toBeGreaterThanOrEqual(1);
    const previewTrack = lk.FakeVideoTrack.instances[0];

    await clickBlur();
    // The studio preview itself is processed — what you see is what ships.
    expect(previewTrack.setProcessor).toHaveBeenCalledTimes(1);
    expect(previewTrack.getProcessor()).toBeDefined();
    expect(container.textContent).toContain('Blur on');

    lk.callOrder.length = 0;
    await joinFromStudio();

    // A NEW track was created for the join, processed BEFORE publishing,
    // and the raw setCameraEnabled(true) path was never used for camera.
    const published = room.localParticipant.cameraTrack;
    expect(published).not.toBeNull();
    expect(published).not.toBe(previewTrack);
    expect(published!.getProcessor()).toBeDefined();
    expect(lk.callOrder.indexOf('setProcessor')).toBeGreaterThanOrEqual(0);
    expect(lk.callOrder.indexOf('setProcessor')).toBeLessThan(
      lk.callOrder.indexOf('publishTrack'),
    );
    expect(room.localParticipant.publishTrack).toHaveBeenCalledWith(published);
    expect(room.localParticipant.setCameraEnabled).not.toHaveBeenCalledWith(true);
    // The preview track was cleaned up, not leaked into the meeting.
    expect(previewTrack.stop).toHaveBeenCalled();
  });

  it('M2: in-call toggle works on the camera publication only — screenshare NEVER gets a processor', async () => {
    const room = await enterStudio();
    await clickBlur();
    await joinFromStudio();
    const camTrack = room.localParticipant.cameraTrack!;
    const screenTrack = new lk.FakeVideoTrack();
    room.localParticipant.screenTrack = screenTrack;

    const noneBtn = container.querySelector('[data-testid="blur-mode-none"]') as HTMLButtonElement;
    expect(noneBtn).not.toBeNull();
    await act(async () => {
      noneBtn.click();
      await flushPromises();
    });
    expect(camTrack.stopProcessor).toHaveBeenCalledTimes(1);
    expect(camTrack.getProcessor()).toBeUndefined();
    expect(container.textContent).not.toContain('Blur on');

    await clickBlur();
    expect(camTrack.setProcessor).toHaveBeenCalledTimes(2);
    expect(screenTrack.setProcessor).not.toHaveBeenCalled();
  });

  it('M3: a failed in-call apply shows the honest notice and never claims active', async () => {
    const room = await renderToGate();
    // Join plainly (skip device check) — no blur chosen.
    const skip = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Skip device check'),
    ) as HTMLButtonElement;
    await act(async () => {
      skip.click();
      await flushPromises();
    });
    await joinFromStudio();
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

  it('M4: switching camera in the studio re-applies blur to the NEW preview track', async () => {
    await enterStudio();
    await clickBlur();
    const firstTrack = lk.FakeVideoTrack.instances[0];
    expect(firstTrack.getProcessor()).toBeDefined();
    const before = lk.FakeVideoTrack.instances.length;

    const switchBtn = container.querySelector('[data-testid="switch-camera"]') as HTMLButtonElement;
    expect(switchBtn).not.toBeNull();
    await act(async () => {
      switchBtn.click();
      await flushPromises();
      await flushPromises();
    });

    expect(lk.FakeVideoTrack.instances.length).toBeGreaterThan(before);
    const newTrack = lk.FakeVideoTrack.instances[lk.FakeVideoTrack.instances.length - 1];
    expect(newTrack).not.toBe(firstTrack);
    expect(newTrack.setProcessor).toHaveBeenCalledTimes(1);
    expect(newTrack.getProcessor()).toBeDefined();
    expect(container.textContent).toContain('Blur on');
  });

  it('M5: camera off→on in the meeting re-applies blur to the new track; while off, no active claim', async () => {
    const room = await enterStudio();
    await clickBlur();
    await joinFromStudio();
    const firstTrack = room.localParticipant.cameraTrack!;
    expect(firstTrack.getProcessor()).toBeDefined();

    const camBtn = container.querySelector('[data-testid="toggle-camera"]') as HTMLButtonElement;
    await act(async () => {
      camBtn.click();
      await flushPromises();
    });
    expect(room.localParticipant.cameraTrack).toBeNull();
    expect(container.textContent).not.toContain('Blur on');

    await act(async () => {
      camBtn.click();
      await flushPromises();
      await flushPromises();
    });
    const newTrack = room.localParticipant.cameraTrack!;
    expect(newTrack).not.toBe(firstTrack);
    expect(newTrack.setProcessor).toHaveBeenCalledTimes(1);
    expect(newTrack.getProcessor()).toBeDefined();
    expect(container.textContent).toContain('Blur on');
  });

  it('control: joining without blur uses the plain camera path and creates no processor', async () => {
    const room = await renderToGate();
    const skip = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Skip device check'),
    ) as HTMLButtonElement;
    await act(async () => {
      skip.click();
      await flushPromises();
    });
    await joinFromStudio();

    expect(room.localParticipant.setCameraEnabled).toHaveBeenCalledWith(true);
    expect(room.localParticipant.publishTrack).not.toHaveBeenCalled();
    expect(tp.factoryCalls).toHaveLength(0);
  });
});

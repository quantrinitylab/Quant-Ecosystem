// @vitest-environment jsdom
//
// QC-F-296 — 1:1 call page low-data + audio-only pins
// (specialist-qc-f-296-buildprep.md §8: NC-296-4/5/8/9/10/11/12 + controls).
//
// Harness: stable hoisted FakeRoom/FakeParticipant pattern modelled on
// qc-f-455-calls-remote-audio.test.tsx (module-level identities only —
// no fresh-identity mocks). Publications are first-class fakes because
// the audio-only receive side acts on RemoteTrackPublication.setEnabled.
//
// Boundary note (honest scaffolding, same as F-455): '@quant/shared-ui'
// is doubled at the module boundary (its background engine is pinned in
// shared-ui's own suite); this suite pins the calls page's OWN wiring:
// which options reach setCameraEnabled, and which publications get
// disabled. The caps themselves are pinned in lib/__tests__/call-data.
//
// Negative control: on the pre-fix page there is no getSettings read, no
// Low data / Audio only toggle and no options on setCameraEnabled —
// NC-296-4/8/9/10/11/12 fail there; NC-296-5 (off = legacy call) passes
// on both, by design (it is the byte-identical control).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CAP_CAPTURE = { resolution: { width: 640, height: 360, frameRate: 15 } };
const CAP_PUBLISH = { videoEncoding: { maxBitrate: 300_000, maxFramerate: 15 } };

// ─── Stable fake LiveKit room/participants/tracks (hoisted) ───────────────
const lk = vi.hoisted(() => {
  class FakeVideoTrack {
    attach = vi.fn();
    detach = vi.fn();
    getProcessor = vi.fn(() => undefined);
    setProcessor = vi.fn(async () => undefined);
    stopProcessor = vi.fn(async () => undefined);
    stop = vi.fn();
  }

  class FakeAudioTrack {
    attach = vi.fn();
    detach = vi.fn();
  }

  class FakePublication {
    kind: string;
    source: string;
    videoTrack?: FakeVideoTrack;
    audioTrack?: FakeAudioTrack;
    track?: FakeVideoTrack | FakeAudioTrack;
    setEnabled = vi.fn();
    constructor(
      kind: string,
      source: string,
      track: FakeVideoTrack | FakeAudioTrack,
    ) {
      this.kind = kind;
      this.source = source;
      this.track = track;
      if (kind === 'video') this.videoTrack = track as FakeVideoTrack;
      else this.audioTrack = track as FakeAudioTrack;
    }
  }

  class FakeParticipant {
    identity = 'peer';
    name = 'Peer';
    cameraTrack: FakeVideoTrack | null = null;
    micTrack: FakeAudioTrack | null = null;
    trackPublications = new Map<string, FakePublication>();
    setMicrophoneEnabled = vi.fn(async (_enabled: boolean) => undefined);
    setCameraEnabled = vi.fn(
      async (enabled: boolean, _capture?: unknown, _publish?: unknown) => {
        if (enabled) {
          if (!this.cameraTrack) this.cameraTrack = new FakeVideoTrack();
          this.trackPublications.set(
            'camera',
            new FakePublication('video', 'camera', this.cameraTrack),
          );
        } else {
          this.cameraTrack = null;
          this.trackPublications.delete('camera');
        }
      },
    );
    publishTrack = vi.fn(async (track: FakeVideoTrack, _opts?: unknown) => {
      this.cameraTrack = track;
      this.trackPublications.set(
        'camera',
        new FakePublication('video', 'camera', track),
      );
    });
    getTrackPublication(source: string) {
      if (source === 'camera') return this.trackPublications.get('camera');
      if (source === 'microphone') return this.trackPublications.get('microphone');
      return undefined;
    }
  }

  class FakeRoom {
    static instances: FakeRoom[] = [];
    localParticipant = new FakeParticipant();
    remoteParticipants = new Map<string, FakeParticipant>();
    handlers = new Map<string, Set<(...args: unknown[]) => void>>();
    canPlaybackAudio = true;
    startAudio = vi.fn(async () => undefined);
    disconnect = vi.fn(() => undefined);
    constructor() {
      FakeRoom.instances.push(this);
      if (lk.nextRemote) {
        this.remoteParticipants.set(lk.nextRemote.identity, lk.nextRemote);
      }
    }
    on(event: string, fn: (...args: unknown[]) => void) {
      if (!this.handlers.has(event)) this.handlers.set(event, new Set());
      this.handlers.get(event)!.add(fn);
      return this;
    }
    emit(event: string, ...args: unknown[]) {
      for (const fn of this.handlers.get(event) ?? []) fn(...args);
    }
    async connect() {
      return undefined;
    }
  }

  const RoomEvent = {
    TrackSubscribed: 'trackSubscribed',
    TrackUnsubscribed: 'trackUnsubscribed',
    ParticipantConnected: 'participantConnected',
    ParticipantDisconnected: 'participantDisconnected',
    Disconnected: 'disconnected',
    AudioPlaybackStatusChanged: 'audioPlaybackChanged',
  };

  return {
    FakeVideoTrack,
    FakeAudioTrack,
    FakePublication,
    FakeParticipant,
    FakeRoom,
    RoomEvent,
    nextRemote: null as FakeParticipant | null,
  };
});

vi.mock('livekit-client', () => ({
  Room: lk.FakeRoom,
  RoomEvent: lk.RoomEvent,
  Track: {
    Source: { Camera: 'camera', Microphone: 'microphone', ScreenShare: 'screenShare' },
    Kind: { Video: 'video', Audio: 'audio' },
  },
}));

const apiMocks = vi.hoisted(() => ({
  joinCall: vi.fn(),
  endCall: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock('../services/api-client', () => ({
  apiClient: {
    joinCall: apiMocks.joinCall,
    endCall: apiMocks.endCall,
    getSettings: apiMocks.getSettings,
    updateSettings: apiMocks.updateSettings,
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

vi.mock('@quant/shared-ui', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TopBar: () => null,
  BackgroundBlur: () => null,
  useBackgroundBlur: () => ({
    mode: 'none',
    status: 'off',
    error: null,
    setMode: () => undefined,
  }),
  BACKGROUND_ASSET_PATH: '/livekit-track-processors',
}));

import CallRoomPage from '../app/calls/[callId]/page';

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

type FakeRoomT = InstanceType<typeof lk.FakeRoom>;
type FakeParticipantT = InstanceType<typeof lk.FakeParticipant>;

function makePeer(): FakeParticipantT {
  const p = new lk.FakeParticipant();
  p.identity = 'peer-1';
  p.cameraTrack = new lk.FakeVideoTrack();
  p.micTrack = new lk.FakeAudioTrack();
  p.trackPublications.set('camera', new lk.FakePublication('video', 'camera', p.cameraTrack));
  p.trackPublications.set('microphone', new lk.FakePublication('audio', 'microphone', p.micTrack));
  return p;
}

function settingsWith(lowDataMode: boolean) {
  return {
    success: true,
    data: {
      privacy: {},
      notifications: {},
      calls: { lowDataMode },
      theme: 'dark',
      language: 'en',
      blockedUsers: [],
    },
  };
}

describe('CallRoomPage low-data + audio-only (QC-F-296)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    lk.FakeRoom.instances.length = 0;
    lk.nextRemote = null;
    apiMocks.joinCall.mockResolvedValue({
      success: true,
      data: { token: 'tok', serverUrl: 'wss://sfu.example' },
    });
    apiMocks.endCall.mockResolvedValue({ success: true, data: {} });
    apiMocks.getSettings.mockResolvedValue(settingsWith(false));
    apiMocks.updateSettings.mockResolvedValue(settingsWith(true));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderInCall(): Promise<FakeRoomT> {
    await act(async () => {
      root.render(<CallRoomPage params={Promise.resolve({ callId: 'call-1' })} />);
      await flushPromises();
      await flushPromises();
      await flushPromises();
    });
    const room = lk.FakeRoom.instances[lk.FakeRoom.instances.length - 1];
    expect(room).toBeDefined();
    expect(container.querySelector('[aria-label="End call"]')).not.toBeNull();
    return room;
  }

  function buttonByLabel(label: string): HTMLButtonElement {
    const btn = container.querySelector(
      `[aria-label="${label}"]`,
    ) as HTMLButtonElement | null;
    expect(btn, `button "${label}"`).not.toBeNull();
    return btn!;
  }

  async function click(btn: HTMLButtonElement) {
    await act(async () => {
      btn.click();
      await flushPromises();
      await flushPromises();
    });
  }

  function cameraCalls(room: FakeRoomT) {
    return room.localParticipant.setCameraEnabled.mock.calls;
  }

  it('NC-296-4: join with the saved pref ON starts the camera WITH the caps', async () => {
    apiMocks.getSettings.mockResolvedValue(settingsWith(true));
    const room = await renderInCall();
    expect(cameraCalls(room)).toContainEqual([true, CAP_CAPTURE, CAP_PUBLISH]);
    expect(buttonByLabel('Low data').getAttribute('aria-pressed')).toBe('true');
  });

  it('NC-296-5 (control): join with the pref OFF is the legacy call — no options at all', async () => {
    const room = await renderInCall();
    // Legacy arity, hu-ba-hu: the pre-296 call was setCameraEnabled(true)
    // with ONE argument. Passing undefined options explicitly is a
    // different call shape and breaks the merged QC-F-322 pins — the
    // arity-preserving helper in call-data.ts makes the legacy call.
    expect(cameraCalls(room)).toContainEqual([true]);
    expect(buttonByLabel('Low data').getAttribute('aria-pressed')).toBe('false');
  });

  it('pref read failure: the call still joins on the default, and says so honestly', async () => {
    apiMocks.getSettings.mockResolvedValue({ success: false, error: { code: 'X', message: 'down', statusCode: 500 } });
    const room = await renderInCall();
    expect(cameraCalls(room)).toContainEqual([true]);
    expect(container.textContent).toContain("Couldn't load your saved call settings");
  });

  it('NC-296-8: in-call Low data toggle restarts the camera with the new options and writes the pref, both ways', async () => {
    const room = await renderInCall();
    const lp = room.localParticipant;
    lp.setCameraEnabled.mockClear();

    await click(buttonByLabel('Low data'));
    expect(lp.setCameraEnabled.mock.calls).toEqual([
      [false],
      [true, CAP_CAPTURE, CAP_PUBLISH],
    ]);
    expect(apiMocks.updateSettings).toHaveBeenCalledWith({ calls: { lowDataMode: true } });
    expect(buttonByLabel('Low data').getAttribute('aria-pressed')).toBe('true');

    lp.setCameraEnabled.mockClear();
    await click(buttonByLabel('Low data'));
    expect(lp.setCameraEnabled.mock.calls).toEqual([[false], [true]]);
    expect(apiMocks.updateSettings).toHaveBeenLastCalledWith({ calls: { lowDataMode: false } });
  });

  it('NC-296-9: pref write failure keeps the mode for this call and shows the band copy, never "Saved"', async () => {
    apiMocks.updateSettings.mockResolvedValue({ success: false, error: { code: 'X', message: 'down', statusCode: 500 } });
    await renderInCall();
    await click(buttonByLabel('Low data'));
    expect(container.textContent).toContain(
      "Couldn't save this setting — it applies to this call only.",
    );
    expect(container.textContent).not.toContain('Saved');
    expect(buttonByLabel('Low data').getAttribute('aria-pressed')).toBe('true');
  });

  it('NC-296-10: Audio only stops my camera AND disables remote video; mic + remote audio untouched', async () => {
    const peer = makePeer();
    lk.nextRemote = peer;
    const room = await renderInCall();
    const videoPub = peer.trackPublications.get('camera')!;
    const audioPub = peer.trackPublications.get('microphone')!;

    await click(buttonByLabel('Audio only'));
    expect(room.localParticipant.setCameraEnabled).toHaveBeenCalledWith(false);
    expect(videoPub.setEnabled).toHaveBeenCalledWith(false);
    expect(audioPub.setEnabled).not.toHaveBeenCalled();
    // Mic was enabled once at join and never disabled by audio-only.
    expect(room.localParticipant.setMicrophoneEnabled.mock.calls).toEqual([[true]]);
    expect(container.textContent).toContain("you won't send or receive video");
  });

  it('NC-296-11: a video publication subscribed AFTER audio-only turned on is disabled too', async () => {
    const room = await renderInCall();
    await click(buttonByLabel('Audio only'));
    const latePub = new lk.FakePublication('video', 'camera', new lk.FakeVideoTrack());
    await act(async () => {
      room.emit('trackSubscribed', latePub.track, latePub, null);
      await flushPromises();
    });
    expect(latePub.setEnabled).toHaveBeenCalledWith(false);
  });

  it('NC-296-12a: Audio only OFF restores remote video and the camera (it was on) with current caps', async () => {
    const peer = makePeer();
    lk.nextRemote = peer;
    const room = await renderInCall();
    const videoPub = peer.trackPublications.get('camera')!;
    await click(buttonByLabel('Audio only'));
    room.localParticipant.setCameraEnabled.mockClear();
    videoPub.setEnabled.mockClear();

    await click(buttonByLabel('Audio only'));
    expect(videoPub.setEnabled).toHaveBeenCalledWith(true);
    // Joined with the pref OFF, so "current caps" = no caps: the restore
    // is the legacy one-argument call (see NC-296-5 note).
    expect(cameraCalls(room)).toContainEqual([true]);
  });

  it('NC-296-12b: Audio only OFF does NOT force-open a camera the user had off', async () => {
    const room = await renderInCall();
    await click(buttonByLabel('Turn camera off'));
    await click(buttonByLabel('Audio only'));
    room.localParticipant.setCameraEnabled.mockClear();

    await click(buttonByLabel('Audio only'));
    const calls = cameraCalls(room);
    expect(calls.every((c) => c[0] === false)).toBe(true);
    expect(calls).toHaveLength(0);
  });
});

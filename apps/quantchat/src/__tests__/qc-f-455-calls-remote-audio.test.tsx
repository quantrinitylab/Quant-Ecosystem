// @vitest-environment jsdom
//
// QC-F-455 — 1:1 call room remote-audio pins (specialist-qc-f-455-buildprep.md §7,
// cases T1–T6 + C0 control).
//
// The defect: /calls/[callId] attached ONLY camera video tracks — the
// remote microphone track was never attached to any element, so the
// peer could be seen but never heard (LiveKit plays audio only through
// an attached HTMLAudioElement).
//
// Harness: stable hoisted FakeRoom/FakeParticipant/FakeTrack pattern,
// modelled on qc-f-322-calls-background.test.tsx. The FakeRoom here adds
// a handler registry + emit(), canPlaybackAudio and startAudio, because
// §7 needs event-driven cases. Module-level hoisted fakes only (no
// fresh-identity mocks).
//
// Boundary note (honest scaffolding, same as the F-322 suite): the
// '@quant/shared-ui' background engine is doubled at the module
// boundary (it is pinned in shared-ui's own suite); this suite pins the
// calls page's OWN audio wiring, which is the QC-F-455 surface.
//
// Negative control (verified on the pre-fix page, build run
// 2026-10-17): T1, T2, T3, T4, T4b, T6 FAIL (no <audio> element exists,
// the Microphone publication is never read, no
// AudioPlaybackStatusChanged listener, startAudio never called); T5
// passes vacuously on the old page (nothing was attached at all — it
// is a guard against a wrong-direction fix that would attach the
// LOCAL mic); C0 passes on both (it emits TrackSubscribed after
// mount, the production event that re-runs attachTracks on the old
// page too — harness is sound).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ─── Stable fake LiveKit room/participants/tracks (hoisted) ───────────────
const lk = vi.hoisted(() => {
  class FakeVideoTrack {
    attach = vi.fn();
    detach = vi.fn();
    getProcessor = vi.fn(() => undefined);
    setProcessor = vi.fn(async () => undefined);
    stopProcessor = vi.fn(async () => undefined);
  }

  class FakeAudioTrack {
    attach = vi.fn();
    detach = vi.fn();
  }

  class FakeParticipant {
    identity = 'peer';
    name = 'Peer';
    cameraTrack: FakeVideoTrack | null = null;
    micTrack: FakeAudioTrack | null = null;
    setMicrophoneEnabled = vi.fn(async (_enabled: boolean) => undefined);
    setCameraEnabled = vi.fn(async (enabled: boolean) => {
      if (enabled) {
        if (!this.cameraTrack) this.cameraTrack = new FakeVideoTrack();
      } else {
        this.cameraTrack = null;
      }
    });
    getTrackPublication(source: string) {
      if (source === 'camera' && this.cameraTrack) {
        return { videoTrack: this.cameraTrack, track: this.cameraTrack };
      }
      if (source === 'microphone' && this.micTrack) {
        return { audioTrack: this.micTrack, track: this.micTrack };
      }
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
      if (lk.nextLocalMic) {
        this.localParticipant.micTrack = new FakeAudioTrack();
      }
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
    FakeParticipant,
    FakeRoom,
    RoomEvent,
    nextRemote: null as FakeParticipant | null,
    nextLocalMic: false,
  };
});

vi.mock('livekit-client', () => ({
  Room: lk.FakeRoom,
  RoomEvent: lk.RoomEvent,
  Track: {
    Source: {
      Camera: 'camera',
      Microphone: 'microphone',
      ScreenShare: 'screenShare',
    },
    Kind: { Video: 'video', Audio: 'audio' },
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

// Background/AppShell doubled at this boundary (see header note — the
// real shared-ui pieces are pinned in their own suites; QC-F-455 does
// not touch them).
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

function makePeer(opts: { mic?: boolean; camera?: boolean } = {}): FakeParticipantT {
  const p = new lk.FakeParticipant();
  if (opts.mic) p.micTrack = new lk.FakeAudioTrack();
  if (opts.camera) p.cameraTrack = new lk.FakeVideoTrack();
  return p;
}

describe('CallRoomPage remote audio (QC-F-455)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    lk.FakeRoom.instances.length = 0;
    lk.nextRemote = null;
    lk.nextLocalMic = false;
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

  async function renderInCall(
    targetRoot: Root = root,
    targetContainer: HTMLDivElement = container,
  ): Promise<FakeRoomT> {
    await act(async () => {
      targetRoot.render(
        <CallRoomPage params={Promise.resolve({ callId: 'call-1' })} />,
      );
      await flushPromises();
      await flushPromises();
    });
    const room = lk.FakeRoom.instances[lk.FakeRoom.instances.length - 1];
    expect(room).toBeDefined();
    expect(
      targetContainer.querySelector('[aria-label="End call"]'),
    ).not.toBeNull();
    return room;
  }

  async function emit(room: FakeRoomT, event: string) {
    await act(async () => {
      room.emit(event);
      await flushPromises();
    });
  }

  it('T1: remote peer (mic + camera) present at join — mic attaches once to the page <audio> element, video attach unchanged', async () => {
    const peer = makePeer({ mic: true, camera: true });
    lk.nextRemote = peer;
    await renderInCall();

    const audioEl = container.querySelector('audio');
    expect(audioEl).not.toBeNull();
    expect(container.querySelectorAll('audio')).toHaveLength(1);
    expect(peer.micTrack!.attach).toHaveBeenCalledTimes(1);
    expect(peer.micTrack!.attach).toHaveBeenCalledWith(audioEl);

    const remoteVideoEl = container.querySelector(
      '[aria-label="Peer video"]',
    );
    expect(peer.cameraTrack!.attach).toHaveBeenCalledWith(remoteVideoEl);
  });

  it('T2: audio-only peer (no camera publication) still gets heard — audio path is independent of the video loop', async () => {
    const room = await renderInCall();
    const peer = makePeer({ mic: true });
    room.remoteParticipants.set(peer.identity, peer);

    await emit(room, lk.RoomEvent.TrackSubscribed);

    const audioEl = container.querySelector('audio');
    expect(audioEl).not.toBeNull();
    expect(peer.micTrack!.attach).toHaveBeenCalledTimes(1);
    expect(peer.micTrack!.attach).toHaveBeenCalledWith(audioEl);
  });

  it('T3: unsubscribe detaches the old track from the same element; re-subscribe attaches the new track, no second detach, still one <audio>', async () => {
    const peer = makePeer({ mic: true, camera: true });
    lk.nextRemote = peer;
    const room = await renderInCall();
    const audioEl = container.querySelector('audio');
    const firstMic = peer.micTrack!;
    expect(firstMic.attach).toHaveBeenCalledTimes(1);

    peer.micTrack = null;
    await emit(room, lk.RoomEvent.TrackUnsubscribed);
    expect(firstMic.detach).toHaveBeenCalledTimes(1);
    expect(firstMic.detach).toHaveBeenCalledWith(audioEl);
    expect(container.querySelectorAll('audio')).toHaveLength(1);

    const secondMic = new lk.FakeAudioTrack();
    peer.micTrack = secondMic;
    await emit(room, lk.RoomEvent.TrackSubscribed);
    expect(secondMic.attach).toHaveBeenCalledTimes(1);
    expect(secondMic.attach).toHaveBeenCalledWith(audioEl);
    expect(firstMic.detach).toHaveBeenCalledTimes(1);
  });

  it('T4: participant disconnect detaches the bound mic track', async () => {
    const peer = makePeer({ mic: true });
    lk.nextRemote = peer;
    const room = await renderInCall();
    const audioEl = container.querySelector('audio');
    expect(peer.micTrack!.attach).toHaveBeenCalledTimes(1);

    room.remoteParticipants.delete(peer.identity);
    await emit(room, lk.RoomEvent.ParticipantDisconnected);

    expect(peer.micTrack!.detach).toHaveBeenCalledTimes(1);
    expect(peer.micTrack!.detach).toHaveBeenCalledWith(audioEl);
  });

  it('T4b: unmount detaches the bound mic track BEFORE room.disconnect()', async () => {
    const peer = makePeer({ mic: true });
    lk.nextRemote = peer;
    const localContainer = document.createElement('div');
    document.body.appendChild(localContainer);
    const localRoot = createRoot(localContainer);
    try {
      const room = await renderInCall(localRoot, localContainer);
      expect(peer.micTrack!.attach).toHaveBeenCalledTimes(1);

      act(() => localRoot.unmount());

      expect(peer.micTrack!.detach).toHaveBeenCalledTimes(1);
      expect(room.disconnect).toHaveBeenCalled();
      const detachOrder = peer.micTrack!.detach.mock.invocationCallOrder[0];
      const disconnectOrder = room.disconnect.mock.invocationCallOrder[0];
      expect(detachOrder).toBeLessThan(disconnectOrder);
    } finally {
      localContainer.remove();
    }
  });

  it('T5: echo guard — the LOCAL microphone track is never attached, even when published', async () => {
    lk.nextLocalMic = true;
    const room = await renderInCall();

    const localMic = room.localParticipant.micTrack!;
    expect(localMic).not.toBeNull();
    expect(localMic.attach).not.toHaveBeenCalled();
    // (Element existence itself is pinned by T1/T2; keeping it out of
    // this guard case is what lets T5 pass vacuously on the pre-fix
    // page, per the brief's negative-control plan.)
  });

  it('T6: autoplay honesty — the enable-sound button exists only after the room reports playback blocked; its click is the startAudio gesture', async () => {
    const room = await renderInCall();
    const button = () =>
      [...container.querySelectorAll('button')].find(
        (b) => b.textContent === 'Tap to enable sound',
      );
    expect(button()).toBeUndefined();

    room.canPlaybackAudio = false;
    await emit(room, lk.RoomEvent.AudioPlaybackStatusChanged);
    const btn = button();
    expect(btn).toBeDefined();

    await act(async () => {
      btn!.click();
      await flushPromises();
    });
    expect(room.startAudio).toHaveBeenCalledTimes(1);
    // The click itself must NOT hide the button — only the room's next
    // event may (no fake success).
    expect(button()).toBeDefined();

    room.canPlaybackAudio = true;
    await emit(room, lk.RoomEvent.AudioPlaybackStatusChanged);
    expect(button()).toBeUndefined();
  });

  it('C0 control: in-call behaviour intact — mic toggle wired and remote video attaches (passes on old and new code)', async () => {
    const peer = makePeer({ mic: true, camera: true });
    lk.nextRemote = peer;
    const room = await renderInCall();

    // Control semantics (brief §7): a post-mount TrackSubscribed is the
    // production event that re-runs attachTracks once the in-call
    // elements exist — on the OLD page this is how video attach ever
    // happened, so the control must pass there too.
    await emit(room, lk.RoomEvent.TrackSubscribed);
    expect(peer.cameraTrack!.attach).toHaveBeenCalled();
    const micBtn = container.querySelector(
      '[aria-label="Mute microphone"]',
    ) as HTMLButtonElement;
    expect(micBtn).not.toBeNull();
    await act(async () => {
      micBtn.click();
      await flushPromises();
    });
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(false);
  });
});

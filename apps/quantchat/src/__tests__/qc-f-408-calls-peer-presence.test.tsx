// @vitest-environment jsdom
//
// QC-F-408 — 1:1 call room peer-presence pins (specialist-qc-f-408-buildprep.md
// §5: cases T1–T9 + C0 control).
//
// The defect: /calls/[callId] declared 'in-call' the moment OUR join
// finished — the peer's name only ever came from inside the remote
// VIDEO branch of attachTracks (an audio-only peer was heard after
// QC-F-455 but stayed "Connecting…" forever), a peer leaving changed
// nothing on screen, and there was no waiting state or reconnect
// notice at all.
//
// Harness: stable hoisted FakeRoom/FakeParticipant/FakeTrack pattern,
// modelled on qc-f-455-calls-remote-audio.test.tsx + the QC-F-296
// settings mocks (the join path reads apiClient.getSettings). The
// FakeRoom event map ADDS Reconnecting/Reconnected (the F-455 harness
// has neither — on the old page nothing listens for them, which is
// part of the negative control). The shared-ui TopBar double RENDERS
// its title prop (the F-455 double renders null) because the TopBar
// name is a pinned surface here. Module-level hoisted fakes only.
//
// Fake timers are used ONLY in the clock/grace cases (T1/T4/T5) and
// those cases settle the async join with microtask flushes first
// (brief §5.1/§9-R2); every other case uses real timers +
// flushPromises, the F-455 pattern.
//
// Negative control (band signature, brief §5.3 — verified on the
// pre-fix page in the build run): T1/T2/T4/T5/T6/T7/T9 FAIL (no
// waiting/left/notice rendering exists; the name never arrives
// without a video track; T6 is bound to an audio-only pre-existing
// peer so the old mount-re-run attach cannot rescue the name);
// T3/T8 pass as guards (video-peer name + first-remote rule already
// worked) and C0 passes on both (harness soundness).

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
    trackPublications = new Map<string, unknown>();
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
    // QC-F-408: the F-455 harness lacks these two — the fix's handlers
    // bind them, the old page binds neither (NC surface for T7).
    Reconnecting: 'reconnecting',
    Reconnected: 'reconnected',
  };

  return {
    FakeVideoTrack,
    FakeAudioTrack,
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

// Shared-ui doubled at the module boundary (same honest scaffolding as
// F-455/F-296: the real pieces are pinned in shared-ui's own suites).
// ONE deliberate difference: TopBar renders its title — the TopBar name
// is the QC-F-408 surface under test.
vi.mock('@quant/shared-ui', () => ({
  AppShell: ({
    children,
    topBar,
  }: {
    children: React.ReactNode;
    topBar?: React.ReactNode;
  }) => (
    <div>
      {topBar}
      {children}
    </div>
  ),
  TopBar: ({ title }: { title?: string }) => (
    <div data-testid="topbar-title">{title}</div>
  ),
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

// Join settling for the fake-timer cases: every step of the join path
// is promise-based, so microtask rounds settle it without touching
// the (faked) clock.
async function flushMicro(rounds = 60): Promise<void> {
  await act(async () => {
    for (let i = 0; i < rounds; i++) await Promise.resolve();
  });
}

type FakeRoomT = InstanceType<typeof lk.FakeRoom>;
type FakeParticipantT = InstanceType<typeof lk.FakeParticipant>;

function makePeer(opts: {
  identity: string;
  name: string;
  mic?: boolean;
  camera?: boolean;
}): FakeParticipantT {
  const p = new lk.FakeParticipant();
  p.identity = opts.identity;
  p.name = opts.name;
  if (opts.mic) p.micTrack = new lk.FakeAudioTrack();
  if (opts.camera) p.cameraTrack = new lk.FakeVideoTrack();
  return p;
}

describe('CallRoomPage peer presence (QC-F-408)', () => {
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
    apiMocks.getSettings.mockResolvedValue({
      success: true,
      data: {
        privacy: {},
        notifications: {},
        calls: { lowDataMode: false },
        theme: 'dark',
        language: 'en',
        blockedUsers: [],
      },
    });
    apiMocks.updateSettings.mockResolvedValue({ success: true, data: {} });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  async function renderInCall(fakeTimers = false): Promise<FakeRoomT> {
    await act(async () => {
      root.render(
        <CallRoomPage params={Promise.resolve({ callId: 'call-1' })} />,
      );
      if (fakeTimers) {
        for (let i = 0; i < 60; i++) await Promise.resolve();
      } else {
        await flushPromises();
        await flushPromises();
      }
    });
    if (fakeTimers) await flushMicro();
    const room = lk.FakeRoom.instances[lk.FakeRoom.instances.length - 1];
    expect(room).toBeDefined();
    expect(
      container.querySelector('[aria-label="End call"]'),
    ).not.toBeNull();
    return room;
  }

  async function emit(room: FakeRoomT, event: string) {
    await act(async () => {
      room.emit(event);
      await flushPromises();
    });
  }

  function topBarTitle(): string | null {
    return (
      container.querySelector('[data-testid="topbar-title"]')?.textContent ??
      null
    );
  }

  it('T1: peer never joins — honest waiting state, elapsed clock, 60s no-answer copy, and NO auto-end', async () => {
    vi.useFakeTimers();
    await renderInCall(true);

    expect(container.textContent).toContain(
      'Waiting for the other person to join…',
    );
    // The old placeholder-as-name is gone from the TopBar.
    expect(topBarTitle()).toBe('Call');
    expect(topBarTitle()).not.toBe('Connecting…');
    expect(container.textContent).toContain('0:00');
    expect(container.textContent).not.toContain('Still no answer');

    await act(async () => {
      vi.advanceTimersByTime(7_000);
    });
    expect(container.textContent).toContain('0:07');
    expect(container.textContent).not.toContain('Still no answer');

    await act(async () => {
      vi.advanceTimersByTime(53_000);
    });
    expect(container.textContent).toContain('Still no answer');
    expect(container.textContent).toContain(
      "the other person hasn't joined yet",
    );
    // §3.3 band faisla: no auto-disconnect, no fabricated record.
    expect(apiMocks.endCall).not.toHaveBeenCalled();
    const room = lk.FakeRoom.instances[lk.FakeRoom.instances.length - 1];
    expect(room.disconnect).not.toHaveBeenCalled();
  });

  it('T2: audio-only peer is NAMED — TopBar + avatar fallback + name, voice attaches, no video attach', async () => {
    const room = await renderInCall();
    const peer = makePeer({
      identity: 'asha',
      name: 'Asha',
      mic: true,
    });
    room.remoteParticipants.set(peer.identity, peer);

    await emit(room, lk.RoomEvent.ParticipantConnected);

    expect(topBarTitle()).toBe('Asha');
    expect(container.textContent).toContain('Asha');
    expect(container.textContent).toContain('Camera off');
    // Avatar fallback: the peer's real initial, no invented image.
    const badge = [...container.querySelectorAll('div')].find(
      (d) => d.textContent === 'A' && d.className.includes('rounded-full'),
    );
    expect(badge).toBeDefined();
    // Voice path (QC-F-455) unchanged: mic attaches to the <audio>.
    const audioEl = container.querySelector('audio');
    expect(audioEl).not.toBeNull();
    expect(peer.micTrack!.attach).toHaveBeenCalledWith(audioEl);
    // No camera track exists, so nothing may attach to the video el.
    expect(
      container.querySelector('[aria-label="Asha video"]'),
    ).not.toBeNull();
  });

  it('T3 (guard): video peer — name shows, remote video attaches, NO avatar fallback', async () => {
    const peer = makePeer({
      identity: 'asha',
      name: 'Asha',
      mic: true,
      camera: true,
    });
    lk.nextRemote = peer;
    await renderInCall();

    expect(topBarTitle()).toBe('Asha');
    const remoteVideoEl = container.querySelector(
      '[aria-label="Asha video"]',
    );
    expect(remoteVideoEl).not.toBeNull();
    expect(peer.cameraTrack!.attach).toHaveBeenCalledWith(remoteVideoEl);
    expect(container.textContent).not.toContain('Camera off');
    expect(container.textContent).not.toContain(
      'Waiting for the other person to join…',
    );
  });

  it('T4: peer leaves — left state at once, grace holds the call, then the REAL endCall path ends it with peer-left copy', async () => {
    vi.useFakeTimers();
    const peer = makePeer({
      identity: 'asha',
      name: 'Asha',
      mic: true,
      camera: true,
    });
    lk.nextRemote = peer;
    const room = await renderInCall(true);
    expect(topBarTitle()).toBe('Asha');

    room.remoteParticipants.delete(peer.identity);
    await act(async () => {
      room.emit(lk.RoomEvent.ParticipantDisconnected);
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });

    expect(container.textContent).toContain('Asha left the call');
    expect(container.textContent).toContain(
      'Waiting briefly in case they rejoin…',
    );
    // Still in-call during grace: no end yet.
    expect(
      container.querySelector('[aria-label="End call"]'),
    ).not.toBeNull();
    expect(apiMocks.endCall).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(19_000);
    });
    expect(apiMocks.endCall).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1_000);
      for (let i = 0; i < 30; i++) await Promise.resolve();
    });
    expect(room.disconnect).toHaveBeenCalledTimes(1);
    expect(apiMocks.endCall).toHaveBeenCalledTimes(1);
    expect(apiMocks.endCall).toHaveBeenCalledWith('call-1');
    // Ended panel carries the peer-left copy, not the generic line.
    expect(container.textContent).toContain('Asha left the call');
    expect(
      container.querySelector('[aria-label="End call"]'),
    ).toBeNull();
  });

  it('T5: peer rejoins inside the grace window — presence returns and the grace timer is dead', async () => {
    vi.useFakeTimers();
    const peer = makePeer({
      identity: 'asha',
      name: 'Asha',
      mic: true,
      camera: true,
    });
    lk.nextRemote = peer;
    const room = await renderInCall(true);

    room.remoteParticipants.delete(peer.identity);
    await act(async () => {
      room.emit(lk.RoomEvent.ParticipantDisconnected);
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(container.textContent).toContain('Asha left the call');

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    room.remoteParticipants.set(peer.identity, peer);
    await act(async () => {
      room.emit(lk.RoomEvent.ParticipantConnected);
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });

    expect(container.textContent).not.toContain('left the call');
    expect(topBarTitle()).toBe('Asha');

    // Well past the original grace deadline: no end may fire.
    await act(async () => {
      vi.advanceTimersByTime(25_000);
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(apiMocks.endCall).not.toHaveBeenCalled();
    expect(
      container.querySelector('[aria-label="End call"]'),
    ).not.toBeNull();
  });

  it('T6: peer already in the room before connect (audio-only) — post-connect sync names them with NO event', async () => {
    const peer = makePeer({
      identity: 'asha',
      name: 'Asha',
      mic: true,
    });
    lk.nextRemote = peer;
    await renderInCall();

    expect(topBarTitle()).toBe('Asha');
    expect(container.textContent).toContain('Camera off');
    expect(container.textContent).not.toContain(
      'Waiting for the other person to join…',
    );
  });

  it('T7: Reconnecting shows the Meet-pattern notice; Reconnected clears it AND re-derives presence', async () => {
    const peer = makePeer({
      identity: 'asha',
      name: 'Asha',
      mic: true,
      camera: true,
    });
    lk.nextRemote = peer;
    const room = await renderInCall();
    expect(container.textContent).not.toContain('Reconnecting…');

    await emit(room, lk.RoomEvent.Reconnecting);
    expect(container.textContent).toContain(
      'Reconnecting… your media will resume automatically.',
    );

    // While we were reconnecting, the peer actually left.
    room.remoteParticipants.delete(peer.identity);
    await emit(room, lk.RoomEvent.Reconnected);

    expect(container.textContent).not.toContain(
      'Reconnecting… your media will resume automatically.',
    );
    // Re-sync, not the stale name/state: the left state is derived.
    expect(container.textContent).toContain('Asha left the call');
  });

  it('T8 (guard): the FIRST remote owns the display — a second peer joining/leaving changes nothing', async () => {
    const first = makePeer({
      identity: 'asha',
      name: 'Asha',
      mic: true,
      camera: true,
    });
    lk.nextRemote = first;
    const room = await renderInCall();
    expect(topBarTitle()).toBe('Asha');

    const second = makePeer({
      identity: 'bala',
      name: 'Bala',
      mic: true,
      camera: true,
    });
    room.remoteParticipants.set(second.identity, second);
    await emit(room, lk.RoomEvent.ParticipantConnected);
    expect(topBarTitle()).toBe('Asha');

    room.remoteParticipants.delete(second.identity);
    await emit(room, lk.RoomEvent.ParticipantDisconnected);
    expect(topBarTitle()).toBe('Asha');
    expect(container.textContent).not.toContain('left the call');
  });

  it('T9: camera on/off flips between avatar fallback and video; the name survives every flip', async () => {
    const room = await renderInCall();
    const peer = makePeer({
      identity: 'asha',
      name: 'Asha',
      mic: true,
    });
    room.remoteParticipants.set(peer.identity, peer);
    await emit(room, lk.RoomEvent.ParticipantConnected);
    expect(container.textContent).toContain('Camera off');
    expect(topBarTitle()).toBe('Asha');

    peer.cameraTrack = new lk.FakeVideoTrack();
    await emit(room, lk.RoomEvent.TrackSubscribed);
    expect(container.textContent).not.toContain('Camera off');
    const remoteVideoEl = container.querySelector(
      '[aria-label="Asha video"]',
    );
    expect(peer.cameraTrack!.attach).toHaveBeenCalledWith(remoteVideoEl);
    expect(topBarTitle()).toBe('Asha');

    peer.cameraTrack = null;
    await emit(room, lk.RoomEvent.TrackUnsubscribed);
    expect(container.textContent).toContain('Camera off');
    expect(topBarTitle()).toBe('Asha');
  });

  it('C0 control: in-call behaviour intact on old and new code — mic toggle wired, local preview attaches, End ends with the GENERIC copy', async () => {
    const peer = makePeer({
      identity: 'asha',
      name: 'Asha',
      mic: true,
      camera: true,
    });
    lk.nextRemote = peer;
    const room = await renderInCall();

    await emit(room, lk.RoomEvent.TrackSubscribed);
    const localVideoEl = container.querySelector(
      '[aria-label="Your video preview"]',
    );
    expect(localVideoEl).not.toBeNull();
    expect(room.localParticipant.cameraTrack).not.toBeNull();
    expect(room.localParticipant.cameraTrack!.attach).toHaveBeenCalledWith(
      localVideoEl,
    );

    const micBtn = container.querySelector(
      '[aria-label="Mute microphone"]',
    ) as HTMLButtonElement;
    expect(micBtn).not.toBeNull();
    await act(async () => {
      micBtn.click();
      await flushPromises();
    });
    expect(
      room.localParticipant.setMicrophoneEnabled,
    ).toHaveBeenCalledWith(false);

    const endBtn = container.querySelector(
      '[aria-label="End call"]',
    ) as HTMLButtonElement;
    await act(async () => {
      endBtn.click();
      await flushPromises();
      await flushPromises();
    });
    expect(apiMocks.endCall).toHaveBeenCalledWith('call-1');
    expect(container.textContent).toContain('Call ended');
    expect(container.textContent).not.toContain('left the call');
  });
});

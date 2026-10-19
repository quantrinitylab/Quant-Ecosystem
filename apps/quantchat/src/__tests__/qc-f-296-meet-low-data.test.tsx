// @vitest-environment jsdom
//
// QC-F-296 — QuantMeet low-data + audio-only pins
// (specialist-qc-f-296-buildprep.md §8: NC-296-6/7/8/9/10/12 + gate write).
//
// Harness: stable hoisted FakeRoom/FakeParticipant pattern modelled on
// meet-room-raise-hand.test.tsx + qc-f-322-meet-background.test.tsx
// (module-level identities only). The background engine is doubled at
// the '@quant/shared-ui' boundary (pinned in shared-ui's own suite);
// its mode is switchable per test so the F-322 blur JOIN path — the one
// place a raw track must never be published — can be exercised.
//
// Negative control: on the pre-fix page there is no low-data checkbox,
// no getSettings read, no caps on either join path and no in-meeting
// toggles — NC-296-6/7/8/9/10 fail there; the pref-OFF join passes on
// both (byte-identical control, HG-296-3).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CAP_CAPTURE = { resolution: { width: 640, height: 360, frameRate: 15 } };
const CAP_PUBLISH = { videoEncoding: { maxBitrate: 300_000, maxFramerate: 15 } };

const ui = vi.hoisted(() => ({ mode: 'none' as string, callOrder: [] as string[] }));

// ─── Stable fake LiveKit room/participants/tracks (hoisted) ───────────────
const lk = vi.hoisted(() => {
  class FakeVideoTrack {
    attach = vi.fn();
    detach = vi.fn();
    stop = vi.fn();
    getProcessor = vi.fn(() => undefined);
    setProcessor = vi.fn(async () => undefined);
    stopProcessor = vi.fn(async () => undefined);
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
    constructor(kind: string, source: string, track: FakeVideoTrack | FakeAudioTrack) {
      this.kind = kind;
      this.source = source;
      this.track = track;
      if (kind === 'video') this.videoTrack = track as FakeVideoTrack;
      else this.audioTrack = track as FakeAudioTrack;
    }
  }

  class FakeParticipant {
    identity: string;
    name: string;
    attributes: Record<string, string> = {};
    cameraTrack: FakeVideoTrack | null = null;
    micTrack: FakeAudioTrack | null = null;
    trackPublications = new Map<string, FakePublication>();
    setAttributes = vi.fn(async (attrs: Record<string, string>) => {
      Object.assign(this.attributes, attrs);
    });
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
      ui.callOrder.push('publish');
      this.cameraTrack = track;
      this.trackPublications.set(
        'camera',
        new FakePublication('video', 'camera', track),
      );
    });
    constructor(identity: string, name: string) {
      this.identity = identity;
      this.name = name;
    }
    getTrackPublication(source: string) {
      if (source === 'camera') return this.trackPublications.get('camera');
      if (source === 'microphone') return this.trackPublications.get('microphone');
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
      if (lk.nextRemote) {
        this.remoteParticipants.set(lk.nextRemote.identity, lk.nextRemote);
      }
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

  const createLocalVideoTrack = vi.fn(async (_opts?: unknown) => {
    ui.callOrder.push('create');
    return new FakeVideoTrack();
  });

  return {
    FakeVideoTrack,
    FakeAudioTrack,
    FakePublication,
    FakeParticipant,
    FakeRoom,
    RoomEvent,
    ConnectionState,
    createLocalVideoTrack,
    nextRemote: null as FakeParticipant | null,
  };
});

vi.mock('livekit-client', () => ({
  Room: lk.FakeRoom,
  RoomEvent: lk.RoomEvent,
  ConnectionState: lk.ConnectionState,
  Track: {
    Source: { Camera: 'camera', Microphone: 'microphone', ScreenShare: 'screenShare' },
    Kind: { Video: 'video', Audio: 'audio' },
  },
  createLocalVideoTrack: lk.createLocalVideoTrack,
}));

const apiMocks = vi.hoisted(() => ({
  getMeetingRoom: vi.fn(),
  joinMeetingRoom: vi.fn(),
  leaveMeetingRoom: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock('../services/api-client', () => ({
  apiClient: {
    getMeetingRoom: apiMocks.getMeetingRoom,
    joinMeetingRoom: apiMocks.joinMeetingRoom,
    leaveMeetingRoom: apiMocks.leaveMeetingRoom,
    getSettings: apiMocks.getSettings,
    updateSettings: apiMocks.updateSettings,
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ roomId: 'room-1' }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@quant/shared-ui', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TopBar: () => null,
  LoadingState: ({ text }: { text?: string }) => <div>{text}</div>,
  ErrorState: ({ message }: { message?: string }) => <div>{message}</div>,
  DevicePicker: () => null,
  ParticipantTile: ({ participant }: { participant: { name?: string; identity: string } }) => (
    <div data-testid="participant-tile">{participant.name ?? participant.identity}</div>
  ),
  BackgroundBlur: () => null,
  useBackgroundBlur: () => ({
    mode: ui.mode,
    status: 'off',
    error: null,
    setMode: () => undefined,
  }),
  applyBackgroundBlur: async () => {
    ui.callOrder.push('apply');
    return undefined;
  },
  BACKGROUND_ASSET_PATH: '/livekit-track-processors',
}));

import MeetRoomPage from '../app/meet/[roomId]/page';

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

type FakeRoomT = InstanceType<typeof lk.FakeRoom>;

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

function makePeer(): InstanceType<typeof lk.FakeParticipant> {
  const p = new lk.FakeParticipant('peer-1', 'Peer');
  p.cameraTrack = new lk.FakeVideoTrack();
  p.micTrack = new lk.FakeAudioTrack();
  p.trackPublications.set('camera', new lk.FakePublication('video', 'camera', p.cameraTrack));
  p.trackPublications.set('microphone', new lk.FakePublication('audio', 'microphone', p.micTrack));
  return p;
}

describe('MeetRoomPage low-data + audio-only (QC-F-296)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    lk.FakeRoom.instances.length = 0;
    lk.nextRemote = null;
    ui.mode = 'none';
    ui.callOrder.length = 0;
    apiMocks.getMeetingRoom.mockResolvedValue({ success: true, data: ROOM_INFO });
    apiMocks.joinMeetingRoom.mockResolvedValue({
      success: true,
      data: { token: 'tok', serverUrl: 'wss://sfu.example', room: ROOM_INFO, participant: {} },
    });
    apiMocks.leaveMeetingRoom.mockResolvedValue({ success: true, data: ROOM_INFO });
    apiMocks.getSettings.mockResolvedValue(settingsWith(false));
    apiMocks.updateSettings.mockResolvedValue(settingsWith(true));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderGate(): Promise<FakeRoomT> {
    await act(async () => {
      root.render(<MeetRoomPage />);
      await flushPromises();
      await flushPromises();
    });
    const room = lk.FakeRoom.instances[0];
    expect(room).toBeDefined();
    expect(container.querySelector('[data-testid="low-data-checkbox"]')).not.toBeNull();
    return room;
  }

  async function joinMeeting(): Promise<FakeRoomT> {
    const room = await renderGate();
    const skip = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Skip device check'),
    ) as HTMLButtonElement;
    expect(skip).toBeTruthy();
    await act(async () => {
      skip.click();
      await flushPromises();
    });
    const joinBtn = container.querySelector(
      '[data-testid="join-now-button"]',
    ) as HTMLButtonElement;
    expect(joinBtn).toBeTruthy();
    await act(async () => {
      joinBtn.click();
      await flushPromises();
      await flushPromises();
      await flushPromises();
    });
    expect(container.querySelector('[data-testid="toggle-low-data"]')).not.toBeNull();
    return room;
  }

  async function clickEl(el: Element) {
    await act(async () => {
      (el as HTMLElement).click();
      await flushPromises();
      await flushPromises();
    });
  }

  it('gate: the low-data checkbox starts from the saved pref and writes changes back', async () => {
    apiMocks.getSettings.mockResolvedValue(settingsWith(true));
    await renderGate();
    const checkbox = container.querySelector(
      '[data-testid="low-data-checkbox"]',
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    await clickEl(checkbox);
    expect(apiMocks.updateSettings).toHaveBeenCalledWith({ calls: { lowDataMode: false } });
  });

  it('NC-296-6: plain join with low-data ON enables the camera WITH the caps', async () => {
    apiMocks.getSettings.mockResolvedValue(settingsWith(true));
    const room = await joinMeeting();
    expect(room.localParticipant.setCameraEnabled.mock.calls).toContainEqual([
      true,
      CAP_CAPTURE,
      CAP_PUBLISH,
    ]);
  });

  it('NC-296-6 control: plain join with low-data OFF is the legacy call (no options)', async () => {
    const room = await joinMeeting();
    // Legacy arity, hu-ba-hu (QC-F-322 pins): one argument, no explicit
    // undefined options — see the call-data.ts arity-helper note.
    expect(room.localParticipant.setCameraEnabled.mock.calls).toContainEqual([
      true,
    ]);
  });

  it('NC-296-7: blur join — capture carries the resolution, publish happens AFTER processing WITH the caps, raw track never published', async () => {
    ui.mode = 'blur';
    apiMocks.getSettings.mockResolvedValue(settingsWith(true));
    const room = await joinMeeting();
    // Capture: resolution merged into the create options.
    expect(lk.createLocalVideoTrack).toHaveBeenCalledWith({
      resolution: { width: 640, height: 360, frameRate: 15 },
    });
    // Publish: exactly one publish, with the encoding caps.
    const publishCalls = room.localParticipant.publishTrack.mock.calls;
    expect(publishCalls).toHaveLength(1);
    expect(publishCalls[0][1]).toEqual(CAP_PUBLISH);
    // Order: create → apply (processor) → publish. Never publish-before-process.
    expect(ui.callOrder).toEqual(['create', 'apply', 'publish']);
    // The plain enable path is NOT also used on a blur join.
    expect(room.localParticipant.setCameraEnabled).not.toHaveBeenCalled();
  });

  it('NC-296-8: in-meeting Low data toggle restarts the camera with the new options and writes the pref', async () => {
    const room = await joinMeeting();
    const lp = room.localParticipant;
    lp.setCameraEnabled.mockClear();

    await clickEl(container.querySelector('[data-testid="toggle-low-data"]')!);
    expect(lp.setCameraEnabled.mock.calls).toEqual([
      [false],
      [true, CAP_CAPTURE, CAP_PUBLISH],
    ]);
    expect(apiMocks.updateSettings).toHaveBeenCalledWith({ calls: { lowDataMode: true } });
  });

  it('NC-296-9: pref write failure shows the band copy for this meeting, never "Saved"', async () => {
    apiMocks.updateSettings.mockResolvedValue({ success: false, error: { code: 'X', message: 'down', statusCode: 500 } });
    await joinMeeting();
    await clickEl(container.querySelector('[data-testid="toggle-low-data"]')!);
    expect(container.textContent).toContain(
      "Couldn't save this setting — it applies to this meeting only.",
    );
    expect(container.textContent).not.toContain('Saved');
  });

  it('NC-296-10/12: Audio only disables remote video + my camera; OFF restores both', async () => {
    const peer = makePeer();
    lk.nextRemote = peer;
    const room = await joinMeeting();
    const videoPub = peer.trackPublications.get('camera')!;
    const audioPub = peer.trackPublications.get('microphone')!;

    await clickEl(container.querySelector('[data-testid="toggle-audio-only"]')!);
    expect(room.localParticipant.setCameraEnabled).toHaveBeenCalledWith(false);
    expect(videoPub.setEnabled).toHaveBeenCalledWith(false);
    expect(audioPub.setEnabled).not.toHaveBeenCalled();
    expect(container.textContent).toContain("you won't send or receive video");

    room.localParticipant.setCameraEnabled.mockClear();
    videoPub.setEnabled.mockClear();
    await clickEl(container.querySelector('[data-testid="toggle-audio-only"]')!);
    expect(videoPub.setEnabled).toHaveBeenCalledWith(true);
    expect(room.localParticipant.setCameraEnabled.mock.calls).toContainEqual([
      true,
    ]);
  });
});

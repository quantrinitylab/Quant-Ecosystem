// @vitest-environment jsdom
//
// QC-F-263 Slice 1 — meet-room raise-hand component pins
// (specialist-qc-f-263.md §6.2).
//
// The LiveKit Room is a stable module-level fake (hoisted classes — never a
// fresh-identity mock): participants are plain objects whose attributes the
// test mutates exactly the way the SFU echo would, and the REAL
// ParticipantTile from shared-ui renders the badge. Negative control: on
// the pre-fix page there is no toggle-hand button, no
// ParticipantAttributesChanged wiring and no hand badge — pins 7–11 fail
// there; pin 12 (existing controls) passes on both.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ─── Stable fake LiveKit participants + room (module-level, hoisted) ──────
const lk = vi.hoisted(() => {
  class FakeParticipant {
    identity: string;
    name: string;
    attributes: Record<string, string> = {};
    isCameraEnabled = true;
    isMicrophoneEnabled = true;
    setAttributes = vi.fn(async (attrs: Record<string, string>) => {
      Object.assign(this.attributes, attrs);
    });
    setMicrophoneEnabled = vi.fn(async (_enabled: boolean) => undefined);
    setCameraEnabled = vi.fn(async (_enabled: boolean) => undefined);
    constructor(identity: string, name: string) {
      this.identity = identity;
      this.name = name;
    }
    getTrackPublication() {
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

  return { FakeParticipant, FakeRoom, RoomEvent, ConnectionState };
});

vi.mock('livekit-client', () => ({
  Room: lk.FakeRoom,
  RoomEvent: lk.RoomEvent,
  ConnectionState: lk.ConnectionState,
  Track: { Source: { Camera: 'camera', Microphone: 'microphone' } },
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

// Real ParticipantTile (the badge under test) + minimal shells for the rest.
vi.mock('@quant/shared-ui', async () => {
  const tile = await import(
    '../../../../packages/shared-ui/src/components/Media/ParticipantTile'
  );
  return {
    ParticipantTile: tile.ParticipantTile,
    AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    TopBar: () => null,
    LoadingState: ({ text }: { text?: string }) => <div>{text}</div>,
    ErrorState: ({ message }: { message?: string }) => <div>{message}</div>,
    DevicePicker: () => null,
    // QC-F-322 harness migration (no assertion changed): the meet page
    // now wires shared-ui's background-blur engine. Raise-hand pins are
    // not about blur, so that boundary is stubbed OFF here — the real
    // engine is pinned by qc-f-322-background-engine.test.tsx and
    // qc-f-322-meet-background.test.tsx.
    BackgroundBlur: () => null,
    useBackgroundBlur: () => ({
      isSupported: false,
      status: 'off' as const,
      error: null,
      mode: 'none' as const,
      blurAmount: 10,
      setMode: () => undefined,
      setBlurAmount: () => undefined,
      setBackgroundImage: () => undefined,
    }),
    applyBackgroundBlur: async () => undefined,
    BACKGROUND_ASSET_PATH: '/livekit-track-processors',
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
  participantCount: 2,
  createdAt: '2026-10-13T00:00:00.000Z',
};

describe('MeetRoomPage raise hand (QC-F-263 Slice 1)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    lk.FakeRoom.instances.length = 0;
    apiMocks.getMeetingRoom.mockResolvedValue({ success: true, data: ROOM_INFO });
    apiMocks.joinMeetingRoom.mockResolvedValue({
      success: true,
      data: { token: 'tok', serverUrl: 'wss://sfu.example', room: ROOM_INFO, participant: {} },
    });
    apiMocks.leaveMeetingRoom.mockResolvedValue({ success: true, data: ROOM_INFO });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  /** Render, pass the gate via "Skip device check", and join the meeting. */
  async function joinMeeting() {
    await act(async () => {
      root.render(<MeetRoomPage />);
      await flushPromises();
    });
    const room = lk.FakeRoom.instances[0];
    expect(room).toBeDefined();
    const skip = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Skip device check'),
    ) as HTMLButtonElement;
    expect(skip).toBeTruthy();
    await act(async () => {
      skip.click();
      await flushPromises();
    });
    const joinBtn = container.querySelector('[data-testid="join-now-button"]') as HTMLButtonElement;
    expect(joinBtn).toBeTruthy();
    await act(async () => {
      joinBtn.click();
      await flushPromises();
      await flushPromises();
    });
    expect(container.querySelector('[data-testid="toggle-hand"]')).not.toBeNull();
    return room;
  }

  function tileFor(name: string): Element | null {
    return (
      [...container.querySelectorAll('[data-testid="participant-tile"]')].find((t) =>
        t.textContent?.includes(name),
      ) ?? null
    );
  }

  it('pin 7: Raise writes the exact attributes; the button state follows the echo, not optimism', async () => {
    const room = await joinMeeting();
    const btn = container.querySelector('[data-testid="toggle-hand"]') as HTMLButtonElement;
    expect(btn.getAttribute('aria-pressed')).toBe('false');

    await act(async () => {
      btn.click();
      await flushPromises();
    });

    expect(room.localParticipant.setAttributes).toHaveBeenCalledTimes(1);
    const arg = room.localParticipant.setAttributes.mock.calls[0][0] as Record<string, string>;
    expect(arg.qcHandRaised).toBe('true');
    expect(arg.qcHandRaisedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // The fake SFU echo applied the attributes; only now may the UI show raised.
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    // Own tile carries the badge too (own truth renders like everyone else's).
    expect(tileFor('Me')?.querySelector('[data-testid="hand-badge"]')).not.toBeNull();
  });

  it('pin 11: lowering writes false + empty timestamp and the queue empties', async () => {
    const room = await joinMeeting();
    const btn = container.querySelector('[data-testid="toggle-hand"]') as HTMLButtonElement;
    await act(async () => {
      btn.click();
      await flushPromises();
    });
    expect(container.querySelector('[data-testid="raise-queue"]')).not.toBeNull();

    await act(async () => {
      btn.click();
      await flushPromises();
    });

    const calls = room.localParticipant.setAttributes.mock.calls;
    expect(calls[calls.length - 1][0]).toEqual({ qcHandRaised: 'false', qcHandRaisedAt: '' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('[data-testid="raise-queue"]')).toBeNull();
  });

  it('pin 8: a remote attribute change (event) shows their badge + queue entry; a down remote gets none', async () => {
    const room = await joinMeeting();
    const zoya = new lk.FakeParticipant('u-zoya', 'Zoya');
    const kabir = new lk.FakeParticipant('u-kabir', 'Kabir');
    room.remoteParticipants.set(zoya.identity, zoya);
    room.remoteParticipants.set(kabir.identity, kabir);
    await act(async () => {
      room.emit(lk.RoomEvent.ParticipantConnected, zoya);
      await flushPromises();
    });
    expect(tileFor('Zoya')).not.toBeNull();
    expect(tileFor('Zoya')?.querySelector('[data-testid="hand-badge"]')).toBeNull();
    expect(container.querySelector('[data-testid="raise-queue"]')).toBeNull();

    zoya.attributes = {
      qcHandRaised: 'true',
      qcHandRaisedAt: new Date(Date.now() - 120_000).toISOString(),
    };
    await act(async () => {
      room.emit(lk.RoomEvent.ParticipantAttributesChanged, {}, zoya);
      await flushPromises();
    });

    expect(tileFor('Zoya')?.querySelector('[data-testid="hand-badge"]')).not.toBeNull();
    expect(tileFor('Kabir')?.querySelector('[data-testid="hand-badge"]')).toBeNull();
    const strip = container.querySelector('[data-testid="raise-queue"]');
    expect(strip?.textContent).toContain('1 hand raised');

    // Expand the queue: Zoya listed, with her derived wait time.
    const toggle = container.querySelector('[data-testid="raise-queue-toggle"]') as HTMLButtonElement;
    await act(async () => {
      toggle.click();
      await flushPromises();
    });
    const list = container.querySelector('[data-testid="raise-queue-list"]');
    expect(list?.textContent).toContain('Zoya');
    expect(list?.textContent).toContain('2m');
    expect(list?.textContent).not.toContain('Kabir');
  });

  it('pin 9: a hand already raised before I join is visible on first render — no event needed', async () => {
    // Seed the remote BEFORE joining: refreshParticipants on join must
    // surface the badge + queue from attributes alone (a data-packet design
    // can never pass this pin).
    await act(async () => {
      root.render(<MeetRoomPage />);
      await flushPromises();
    });
    const room = lk.FakeRoom.instances[0];
    const early = new lk.FakeParticipant('u-early', 'Early');
    early.attributes = {
      qcHandRaised: 'true',
      qcHandRaisedAt: '2026-10-13T01:00:00.000Z',
    };
    room.remoteParticipants.set(early.identity, early);

    const skip = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Skip device check'),
    ) as HTMLButtonElement;
    await act(async () => {
      skip.click();
      await flushPromises();
    });
    const joinBtn = container.querySelector('[data-testid="join-now-button"]') as HTMLButtonElement;
    await act(async () => {
      joinBtn.click();
      await flushPromises();
      await flushPromises();
    });

    expect(tileFor('Early')?.querySelector('[data-testid="hand-badge"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="raise-queue"]')?.textContent).toContain(
      '1 hand raised',
    );
  });

  it('pin 10: a failed write shows the honest notice and no fake raised state', async () => {
    const room = await joinMeeting();
    room.localParticipant.setAttributes.mockRejectedValueOnce(new Error('not connected'));
    const btn = container.querySelector('[data-testid="toggle-hand"]') as HTMLButtonElement;

    await act(async () => {
      btn.click();
      await flushPromises();
    });

    expect(container.textContent).toContain(
      'Could not raise your hand — check your connection and try again.',
    );
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('[data-testid="raise-queue"]')).toBeNull();
    expect(tileFor('Me')?.querySelector('[data-testid="hand-badge"]')).toBeNull();
  });

  it('pin 12: existing dock behaviour is untouched (mic toggle + Leave still wired)', async () => {
    const room = await joinMeeting();
    const mic = container.querySelector('[data-testid="toggle-mic"]') as HTMLButtonElement;
    expect(mic).not.toBeNull();
    expect(container.querySelector('[data-testid="leave-meeting"]')).not.toBeNull();
    await act(async () => {
      mic.click();
      await flushPromises();
    });
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(false);
  });
});

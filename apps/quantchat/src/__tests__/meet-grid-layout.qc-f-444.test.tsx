// @vitest-environment jsdom
//
// QC-F-444 — participant-grid layout pins.
//
// The meet page used to render a fixed `grid-cols-2` for every meeting:
// a lone participant got a phantom empty black column, a 1:1 pair was
// squeezed into narrow full-height cells (object-cover cropping most of
// the 16:9 video), and larger meetings never gained columns. The grid
// class and the per-tile class are now DERIVED from the real participant
// count (brief specialist-qc-f-444-buildprep.md §3, band faisla), and the
// ParticipantTile camera-off placeholder no longer forces min-h-[160px]
// against its aspect-bound cell.
//
// Harness mirrors meet-room-raise-hand.test.tsx: a stable module-level
// fake LiveKit Room (hoisted classes — never a fresh-identity mock) and
// the REAL ParticipantTile from shared-ui. Negative control: on the
// pre-fix page the grid class is the fixed string for every count and
// tiles receive no className at all — every pin below fails there; on
// the pre-fix tile the placeholder carries min-h-[160px].

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

// Real ParticipantTile (its root receives the page's className) + shells.
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
  createdAt: '2026-10-16T00:00:00.000Z',
};

describe('MeetRoomPage participant grid layout (QC-F-444)', () => {
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

  /**
   * Render the page, seed `remoteCount` remotes into the fake room BEFORE
   * joining (refreshParticipants on join must surface them), then join.
   */
  async function joinWithRemotes(remoteCount: number) {
    await act(async () => {
      root.render(<MeetRoomPage />);
      await flushPromises();
    });
    const room = lk.FakeRoom.instances[0];
    expect(room).toBeDefined();
    const remotes: InstanceType<typeof lk.FakeParticipant>[] = [];
    for (let i = 0; i < remoteCount; i++) {
      const p = new lk.FakeParticipant(`u-${i}`, `Guest ${i}`);
      room.remoteParticipants.set(p.identity, p);
      remotes.push(p);
    }
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
    expect(container.querySelector('[data-testid="participant-grid"]')).not.toBeNull();
    return { room, remotes };
  }

  function gridClass(): string {
    return container.querySelector('[data-testid="participant-grid"]')?.className ?? '';
  }

  function tileClasses(): string[] {
    return [...container.querySelectorAll('[data-testid="participant-tile"]')].map(
      (t) => t.className,
    );
  }

  it('n=1: single column, centered — no phantom second column exists', async () => {
    await joinWithRemotes(0);
    const cls = gridClass();
    expect(cls).toContain('grid-cols-1');
    expect(cls).toContain('place-items-center');
    expect(cls).toContain('content-center');
    expect(cls).not.toContain('grid-cols-2');
    const tiles = tileClasses();
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toContain('aspect-video');
    expect(tiles[0]).toContain('max-w-4xl');
    expect(tiles[0]).toContain('max-h-full');
  });

  it('n=2: stacked on small screens, side-by-side from sm — tiles capped at max-w-3xl', async () => {
    await joinWithRemotes(1);
    const cls = gridClass();
    expect(cls).toContain('grid-cols-1');
    expect(cls).toContain('sm:grid-cols-2');
    expect(cls).toContain('content-center');
    expect(cls).not.toContain('md:grid-cols-3');
    const tiles = tileClasses();
    expect(tiles).toHaveLength(2);
    for (const t of tiles) {
      expect(t).toContain('aspect-video');
      expect(t).toContain('max-w-3xl');
      expect(t).toContain('max-h-full');
    }
  });

  it('n=4: a real 2x2 — two columns, content-centered rows, uncapped tiles', async () => {
    await joinWithRemotes(3);
    const cls = gridClass();
    expect(cls).toContain('grid-cols-2');
    expect(cls).toContain('content-center');
    expect(cls).not.toContain('content-start');
    expect(cls).not.toContain('md:grid-cols-3');
    const tiles = tileClasses();
    expect(tiles).toHaveLength(4);
    for (const t of tiles) {
      expect(t).toContain('aspect-video');
      expect(t).not.toContain('max-w-3xl');
      expect(t).not.toContain('max-w-4xl');
    }
  });

  it('n=6: responsive columns with content-start so extra tiles scroll, not shrink', async () => {
    await joinWithRemotes(5);
    const cls = gridClass();
    expect(cls).toContain('grid-cols-2');
    expect(cls).toContain('md:grid-cols-3');
    expect(cls).toContain('2xl:grid-cols-4');
    expect(cls).toContain('content-start');
    expect(cls).toContain('overflow-y-auto');
    expect(tileClasses()).toHaveLength(6);
  });

  it('layout is derived live: a participant joining mid-meeting re-derives the grid', async () => {
    const { room } = await joinWithRemotes(0);
    expect(gridClass()).toContain('place-items-center');
    const late = new lk.FakeParticipant('u-late', 'Late');
    room.remoteParticipants.set(late.identity, late);
    await act(async () => {
      room.emit(lk.RoomEvent.ParticipantConnected, late);
      await flushPromises();
    });
    const cls = gridClass();
    expect(cls).toContain('sm:grid-cols-2');
    expect(cls).not.toContain('place-items-center');
    expect(tileClasses()).toHaveLength(2);
  });

  it('camera-off placeholder carries no min-h-[160px] box against the aspect-bound tile', async () => {
    await joinWithRemotes(0);
    const tile = container.querySelector('[data-testid="participant-tile"]');
    expect(tile).not.toBeNull();
    // Fake participants publish no track, so the tile renders its
    // camera-off placeholder (first element child of the tile root).
    const placeholder = tile?.firstElementChild as HTMLElement | null;
    expect(placeholder).not.toBeNull();
    expect(placeholder?.className).not.toContain('min-h-[160px]');
    expect(placeholder?.className).toContain('w-full');
    expect(placeholder?.className).toContain('h-full');
  });
});

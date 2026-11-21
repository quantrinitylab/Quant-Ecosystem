// @vitest-environment jsdom
// ============================================================================
// QuantChat — /calls/[callId] honest hangup (QC-F-129)
// ============================================================================
//
// Before QC-F-129 the call page disconnected locally FIRST and never read
// apiClient.endCall's result (request() returns ApiResponse — it never
// throws — so the try/catch was dead code), then claimed 'Call ended'
// unconditionally. The server-side call stayed alive: registry entry,
// participant list, history row. These tests pin the honest teardown:
// server first, 'ended' only on confirmation, an honest unconfirmed state
// on failure (with Retry), a double-tap guard, and disconnect-before-claim
// ordering.
//
// All external surfaces are stable module-level hoisted mocks: apiClient,
// livekit-client Room (with captured event handlers), next/navigation,
// lib/call-data, @quant/shared-ui.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  joinCall: vi.fn(),
  endCall: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock('../services/api-client', () => ({
  apiClient: {
    joinCall: apiMocks.joinCall,
    endCall: apiMocks.endCall,
    getSettings: apiMocks.getSettings,
  },
}));

const routerMocks = vi.hoisted(() => ({
  back: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => routerMocks,
}));

const roomMocks = vi.hoisted(() => {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  const localParticipant = {
    getTrackPublication: vi.fn().mockReturnValue(undefined),
    setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
    setCameraEnabled: vi.fn().mockResolvedValue(undefined),
  };
  const room = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      (handlers[event] ??= []).push(cb);
      return room;
    }),
    localParticipant,
    remoteParticipants: new Map(),
    canPlaybackAudio: true,
    startAudio: vi.fn().mockResolvedValue(undefined),
  };
  // NOTE: `new Room()` in the page requires a constructible mock — a
  // vi.fn wrapping an ARROW function is not constructible ("not a
  // constructor"), so the implementation is a regular function.
  return { room, handlers, Room: vi.fn(function () { return room; }) };
});

vi.mock('livekit-client', () => ({
  Room: roomMocks.Room,
  RoomEvent: {
    TrackSubscribed: 'TrackSubscribed',
    TrackUnsubscribed: 'TrackUnsubscribed',
    ParticipantConnected: 'ParticipantConnected',
    ParticipantDisconnected: 'ParticipantDisconnected',
    AudioPlaybackStatusChanged: 'AudioPlaybackStatusChanged',
    Disconnected: 'Disconnected',
  },
  Track: { Source: { Microphone: 'microphone', Camera: 'camera' } },
}));

vi.mock('../lib/call-data', () => ({
  applyAudioOnlyToPublication: vi.fn(),
  applyAudioOnlyToPublications: vi.fn(),
  setCameraEnabledForDataMode: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@quant/shared-ui', () => ({
  AppShell: ({ topBar, children }: { topBar?: React.ReactNode; children?: React.ReactNode }) =>
    React.createElement('div', null, topBar, children),
  TopBar: ({ title, onBack }: { title?: string; onBack?: () => void }) =>
    React.createElement(
      'div',
      null,
      React.createElement('span', null, title),
      React.createElement('button', { 'aria-label': 'top-back', onClick: onBack }),
    ),
  BackgroundBlur: () => null,
  useBackgroundBlur: () => ({ mode: 'off', status: 'idle', error: null, setMode: () => {} }),
  BACKGROUND_ASSET_PATH: '',
}));

// The page module is imported AFTER the mocks above.
import CallRoomPage from '../app/calls/[callId]/page';

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('CallRoomPage honest hangup (QC-F-129)', () => {
  let container: HTMLDivElement;
  let root: Root;

  const joinOk = { success: true, data: { token: 'tok-1', serverUrl: 'wss://livekit.test' } };
  const settingsOk = { success: true, data: { calls: { lowDataMode: false } } };
  const endOk = { success: true, data: { message: 'Call ended' } };
  const endFail503 = {
    success: false,
    error: { code: 'CALLS_UNAVAILABLE', message: 'down', statusCode: 503 },
  };

  beforeEach(() => {
    apiMocks.joinCall.mockReset().mockResolvedValue(joinOk);
    apiMocks.getSettings.mockReset().mockResolvedValue(settingsOk);
    apiMocks.endCall.mockReset().mockResolvedValue(endOk);
    routerMocks.back.mockReset();
    routerMocks.push.mockReset();
    roomMocks.room.connect.mockClear();
    roomMocks.room.disconnect.mockClear();
    roomMocks.room.on.mockClear();
    for (const key of Object.keys(roomMocks.handlers)) delete roomMocks.handlers[key];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderInCall() {
    await act(async () => {
      root.render(
        <CallRoomPage params={Promise.resolve({ callId: 'call-1' })} />,
      );
    });
    await act(async () => {
      await flushPromises();
    });
    await act(async () => {
      await flushPromises();
    });
    // The page reached the in-call phase: the End button is rendered.
    const endButton = container.querySelector('button[aria-label="End call"]');
    expect(endButton).not.toBeNull();
    return endButton as HTMLButtonElement;
  }

  function click(el: Element | null) {
    expect(el).not.toBeNull();
    act(() => {
      (el as HTMLButtonElement).dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      );
    });
  }

  it('hangs up server-first: one endCall POST, disconnect only after confirmation, then "Call ended"', async () => {
    const endButton = await renderInCall();
    click(endButton);
    await act(async () => {
      await flushPromises();
    });

    expect(apiMocks.endCall).toHaveBeenCalledTimes(1);
    expect(apiMocks.endCall).toHaveBeenCalledWith('call-1', { timeout: 5000 });
    // Server first: the POST was issued before the local disconnect ran.
    const endOrder = apiMocks.endCall.mock.invocationCallOrder[0]!;
    const discOrder = roomMocks.room.disconnect.mock.invocationCallOrder[0]!;
    expect(endOrder).toBeLessThan(discOrder);
    expect(roomMocks.room.disconnect).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Call ended');
    expect(container.textContent).not.toContain("couldn't confirm");
  });

  it('on a failed hangup shows an honest unconfirmed state — never a false "Call ended" — with Retry', async () => {
    apiMocks.endCall.mockResolvedValue(endFail503);
    const endButton = await renderInCall();
    click(endButton);
    await act(async () => {
      await flushPromises();
    });

    // The user still left locally (not trapped in the call)…
    expect(roomMocks.room.disconnect).toHaveBeenCalledTimes(1);
    // …but the page does NOT claim the call ended.
    expect(container.textContent).not.toContain('Call ended');
    expect(container.textContent).toContain("couldn't confirm it ended");
    expect(container.textContent).toContain('Retry');

    // Retry re-sends the hangup; success then shows the real ended state.
    apiMocks.endCall.mockResolvedValue(endOk);
    const retry = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Retry'),
    );
    click(retry ?? null);
    await act(async () => {
      await flushPromises();
    });
    expect(apiMocks.endCall).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('Call ended');
  });

  it('guards against double-tap: two rapid End clicks send one POST', async () => {
    const endButton = await renderInCall();
    click(endButton);
    click(endButton);
    await act(async () => {
      await flushPromises();
    });
    expect(apiMocks.endCall).toHaveBeenCalledTimes(1);
  });

  it('TopBar back on a confirmed hangup navigates back; on failure it stays for Retry', async () => {
    const endButton = await renderInCall();
    expect(endButton).not.toBeNull();

    // Success path: back navigates away.
    const topBack = container.querySelector('button[aria-label="top-back"]');
    click(topBack);
    await act(async () => {
      await flushPromises();
    });
    expect(apiMocks.endCall).toHaveBeenCalledTimes(1);
    expect(routerMocks.back).toHaveBeenCalledTimes(1);

    // Failure path: back does NOT navigate away — the unconfirmed state
    // (with Retry) must stay visible.
    apiMocks.endCall.mockReset().mockResolvedValue(endFail503);
    routerMocks.back.mockReset();
    const topBack2 = container.querySelector('button[aria-label="top-back"]');
    click(topBack2);
    await act(async () => {
      await flushPromises();
    });
    expect(apiMocks.endCall).toHaveBeenCalledTimes(1);
    expect(routerMocks.back).not.toHaveBeenCalled();
    expect(container.textContent).toContain("couldn't confirm it ended");

    // "Leave anyway" navigates without claiming the end.
    const leaveAnyway = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Leave anyway'),
    );
    click(leaveAnyway ?? null);
    expect(routerMocks.back).toHaveBeenCalledTimes(1);
  });

  it('a remote LiveKit disconnect still shows the ended state (existing behavior pin)', async () => {
    await renderInCall();
    const disconnected = roomMocks.handlers['Disconnected'];
    expect(disconnected).toBeDefined();
    await act(async () => {
      disconnected![0]!();
      await flushPromises();
    });
    expect(container.textContent).toContain('Call ended');
  });
});

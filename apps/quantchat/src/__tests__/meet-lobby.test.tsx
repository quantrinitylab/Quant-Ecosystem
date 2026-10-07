// @vitest-environment jsdom
//
// K23 — QuantMeet lobby (C08.1) rendering contract.
//
// The lobby must never fabricate meetings: the "recent meetings" section
// renders exactly what GET /meetings/rooms returns (via apiClient), an honest
// empty state when there are none, and an error state when the call fails.
// "Start instant meeting" creates a real room and navigates to /meet/{id}.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  listMeetingRooms: vi.fn(),
  createMeetingRoom: vi.fn(),
}));

vi.mock('../services/api-client', () => ({
  apiClient: {
    listMeetingRooms: apiMocks.listMeetingRooms,
    createMeetingRoom: apiMocks.createMeetingRoom,
  },
}));

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerMocks.push }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

import MeetLobbyPage from '../app/meet/page';

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('MeetLobbyPage (C08.1)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders an honest empty state when the user has no meetings', async () => {
    apiMocks.listMeetingRooms.mockResolvedValue({ success: true, data: [] });

    await act(async () => {
      root.render(<MeetLobbyPage />);
      await flushPromises();
    });

    expect(container.textContent).toContain('No meetings yet');
    expect(container.textContent).not.toContain('Weekly sync');
  });

  it('renders exactly the rooms the backend returns — nothing fabricated', async () => {
    apiMocks.listMeetingRooms.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'room-1',
          name: 'Design review',
          hostId: 'u1',
          status: 'active',
          settings: {},
          participants: [
            { id: 'p1', userId: 'u1', displayName: 'A', role: 'host', audioEnabled: true, videoEnabled: true, joinedAt: '' },
            { id: 'p2', userId: 'u2', displayName: 'B', role: 'participant', audioEnabled: true, videoEnabled: true, joinedAt: '' },
          ],
          createdAt: new Date('2026-10-08T03:00:00Z').toISOString(),
        },
      ],
    });

    await act(async () => {
      root.render(<MeetLobbyPage />);
      await flushPromises();
    });

    const list = container.querySelector('[data-testid="recent-meetings"]');
    expect(list).not.toBeNull();
    expect(list?.querySelectorAll('li').length).toBe(1);
    expect(container.textContent).toContain('Design review');
    expect(container.textContent).toContain('2 participants');
  });

  it('shows an error state when the rooms call fails', async () => {
    apiMocks.listMeetingRooms.mockResolvedValue({
      success: false,
      error: { code: 'X', message: 'boom', statusCode: 500 },
    });

    await act(async () => {
      root.render(<MeetLobbyPage />);
      await flushPromises();
    });

    expect(container.textContent).toContain('boom');
  });

  it('start instant meeting creates a real room and navigates to it', async () => {
    apiMocks.listMeetingRooms.mockResolvedValue({ success: true, data: [] });
    apiMocks.createMeetingRoom.mockResolvedValue({
      success: true,
      data: { id: 'new-room-9' },
    });

    await act(async () => {
      root.render(<MeetLobbyPage />);
      await flushPromises();
    });

    const button = container.querySelector(
      '[data-testid="start-instant-meeting"]',
    ) as HTMLButtonElement;
    expect(button).not.toBeNull();

    await act(async () => {
      button.click();
      await flushPromises();
    });

    expect(apiMocks.createMeetingRoom).toHaveBeenCalledTimes(1);
    const payload = apiMocks.createMeetingRoom.mock.calls[0][0] as { name: string };
    expect(typeof payload.name).toBe('string');
    expect(routerMocks.push).toHaveBeenCalledWith('/meet/new-room-9');
  });

  it('join with code navigates to the room route for that code', async () => {
    apiMocks.listMeetingRooms.mockResolvedValue({ success: true, data: [] });

    await act(async () => {
      root.render(<MeetLobbyPage />);
      await flushPromises();
    });

    const input = container.querySelector(
      '[data-testid="join-code-input"]',
    ) as HTMLInputElement;
    const joinBtn = container.querySelector(
      '[data-testid="join-code-button"]',
    ) as HTMLButtonElement;

    // Simulate typing via native setter so React's onChange fires.
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set;
    await act(async () => {
      nativeSetter?.call(input, 'abc123');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await flushPromises();
    });
    await act(async () => {
      joinBtn.click();
      await flushPromises();
    });

    expect(routerMocks.push).toHaveBeenCalledWith('/meet/abc123');
  });
});

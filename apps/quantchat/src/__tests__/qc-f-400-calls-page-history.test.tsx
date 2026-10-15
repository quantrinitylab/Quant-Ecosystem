// @vitest-environment jsdom
// ============================================================================
// QC-F-400 — /calls history rendering on the canonical wire vocabulary
//
// The backend call-history DTO now translates the Prisma UPPERCASE enums
// into the client's lowercase wire vocabulary (backend B-cases in
// qc-f-400-call-history-wire.test.ts pin that contract). These tests feed
// the page CANONICAL (post-fix) fixtures through the mocked apiClient and
// pin the page-side behaviour the fix revives: human status text (never a
// raw enum), the Missed tab + red styling, the video/voice distinction,
// and the untouched incoming/outgoing filters.
//
// Negative-control signature (brief §5): on the ORIGINAL page, F1 FAILS
// ('active' rendered as "Active" via the charAt fallback instead of
// "Ongoing") and F2–F7 PASS as controls — the defect lived on the wire,
// not in the page's comparisons.
// Api/router mocks are module-level hoisted objects with stable identities.
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  getCallHistory: vi.fn(),
  getMe: vi.fn(),
}));

vi.mock('../services/api-client', () => ({
  apiClient: {
    getCallHistory: apiMocks.getCallHistory,
    getMe: apiMocks.getMe,
  },
}));

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/router', () => ({
  useRouter: () => routerMocks,
}));

import { CallsPage } from '../pages/calls';

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

interface FixtureRow {
  id: string;
  conversationId: string;
  initiatorId: string;
  type: string;
  status: string;
  duration: number | null;
  participants: string[];
  roomId: string | null;
  startedAt: string;
  createdAt: string;
}

function row(overrides: Partial<FixtureRow> & { id: string }): FixtureRow {
  return {
    conversationId: 'conv-1',
    initiatorId: 'other-1',
    type: 'video',
    status: 'ended',
    duration: 65,
    participants: ['me-1', 'other-1'],
    roomId: `room-${overrides.id}`,
    startedAt: '2026-10-14T10:00:00.000Z',
    createdAt: '2026-10-14T10:00:00.000Z',
    ...overrides,
  };
}

describe('CallsPage — QC-F-400 canonical history rendering', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    apiMocks.getCallHistory.mockReset();
    apiMocks.getMe.mockReset();
    apiMocks.getMe.mockResolvedValue({ success: true, data: { id: 'me-1' } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderPage() {
    await act(async () => {
      root.render(<CallsPage />);
    });
    await act(async () => {
      await flushPromises();
    });
  }

  async function clickTab(label: string) {
    const button = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === label,
    );
    expect(button, `tab button "${label}"`).toBeTruthy();
    await act(async () => {
      button!.click();
    });
    await act(async () => {
      await flushPromises();
    });
  }

  function callbackButtons(): HTMLButtonElement[] {
    return Array.from(container.querySelectorAll('button')).filter((b) =>
      (b.getAttribute('aria-label') ?? '').startsWith('Call back via QuantMeet'),
    ) as HTMLButtonElement[];
  }

  it('F1: an active row renders the human text "Ongoing", never a raw-ish enum', async () => {
    apiMocks.getCallHistory.mockResolvedValue({
      success: true,
      data: { calls: [row({ id: 'c-active', status: 'active', type: 'video' })] },
    });

    await renderPage();

    expect(container.textContent).toContain('Ongoing');
    expect(container.textContent).not.toContain('ACTIVE');
  });

  it('F2 (control): a missed row shows in the All tab and in the Missed tab', async () => {
    apiMocks.getCallHistory.mockResolvedValue({
      success: true,
      data: {
        calls: [
          row({ id: 'c-missed', status: 'missed', type: 'video' }),
          row({ id: 'c-ended', status: 'ended', type: 'voice' }),
        ],
      },
    });

    await renderPage();
    expect(container.textContent).toContain('Missed');
    expect(container.textContent).toContain('Ended');

    await clickTab('Missed');
    expect(container.textContent).toContain('Missed');
    expect(container.textContent).not.toContain('Ended');
    expect(container.textContent).not.toContain('No calls yet');
  });

  it('F3 (control): a missed row carries the red styling', async () => {
    apiMocks.getCallHistory.mockResolvedValue({
      success: true,
      data: { calls: [row({ id: 'c-missed', status: 'missed', type: 'video' })] },
    });

    await renderPage();

    expect(container.textContent).toContain('Missed');
    expect(container.innerHTML).toContain('text-red-500');
  });

  it('F4 (control): a video row gets the video callback affordance and "Ended" text', async () => {
    apiMocks.getCallHistory.mockResolvedValue({
      success: true,
      data: { calls: [row({ id: 'c-video', status: 'ended', type: 'video' })] },
    });

    await renderPage();

    expect(container.textContent).toContain('Ended');
    const buttons = callbackButtons();
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.getAttribute('aria-label')).toContain('video');
    expect(buttons[0]!.textContent).toContain('📹');
  });

  it('F5 (control): a voice row gets the voice callback label', async () => {
    apiMocks.getCallHistory.mockResolvedValue({
      success: true,
      data: { calls: [row({ id: 'c-voice', status: 'ended', type: 'voice' })] },
    });

    await renderPage();

    const buttons = callbackButtons();
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.getAttribute('aria-label')).toContain('voice');
  });

  it('F6 (control): incoming/outgoing filters still split on initiatorId', async () => {
    // Rows are identified by their formatted durations (1:51 vs 3:42) —
    // deliberately NOT by status text, so this control pins ONLY the
    // filter behaviour and stays independent of the F1 display-text fix.
    apiMocks.getCallHistory.mockResolvedValue({
      success: true,
      data: {
        calls: [
          row({ id: 'c-in', status: 'ended', type: 'video', initiatorId: 'other-1', duration: 111 }),
          row({ id: 'c-out', status: 'ended', type: 'voice', initiatorId: 'me-1', duration: 222 }),
        ],
      },
    });

    await renderPage();
    expect(container.textContent).toContain('1:51');
    expect(container.textContent).toContain('3:42');

    await clickTab('Incoming');
    expect(container.textContent).toContain('1:51');
    expect(container.textContent).not.toContain('3:42');

    await clickTab('Outgoing');
    expect(container.textContent).toContain('3:42');
    expect(container.textContent).not.toContain('1:51');
  });

  it('F7 (control): with rows present but none missed, the Missed tab shows the honest empty state', async () => {
    apiMocks.getCallHistory.mockResolvedValue({
      success: true,
      data: { calls: [row({ id: 'c-ended', status: 'ended', type: 'video' })] },
    });

    await renderPage();
    expect(container.textContent).not.toContain('No calls yet');

    await clickTab('Missed');
    expect(container.textContent).toContain('No calls yet');
  });
});

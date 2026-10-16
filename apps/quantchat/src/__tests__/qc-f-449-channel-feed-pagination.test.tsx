// @vitest-environment jsdom
// ============================================================================
// QC-F-449 — Channel feed archive pagination (hook + ChannelDetail UI)
// ============================================================================
// The feed used to render only the newest page the backend returned (50
// posts, hard ceiling) with no way back. Fix (specialist-qc-f-449-buildprep
// §3.4/§3.5, BAND): useChannelFeed is a useInfiniteQuery over the composite
// `before` cursor; ChannelDetail shows a "Load older posts" button while
// hasMore, an honest "Beginning of channel" strip at the true start, and an
// inline retry (posts preserved) when an older page fails — the full
// ErrorState is only for a failed FIRST load.
// Harness: QC-F-448 pattern — createRoot + stable module-level mocks; the
// REAL hook runs against a mocked apiClient so hook↔UI are pinned together.
// NC signature (original code): U1/U2 FAIL (no Load-older button exists, the
// hook has no pagination), U3 FAILs on the Beginning strip, U5 FAILs (no
// inline older-error surface); U4/U6 are control-PASS.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  getChannels: vi.fn(),
  getChannelMessages: vi.fn(),
  createChannel: vi.fn(),
  subscribeChannel: vi.fn(),
  unsubscribeChannel: vi.fn(),
  publishToChannel: vi.fn(),
}));

vi.mock('../services/api-client', () => ({ apiClient: apiMocks }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock('@quant/shared-ui', () => ({
  AppShell: ({ children, topBar }: { children: React.ReactNode; topBar?: React.ReactNode }) => (
    <div>
      {topBar}
      {children}
    </div>
  ),
  TopBar: ({ title }: { title: string }) => <div>{title}</div>,
  BottomNav: () => null,
  LoadingState: ({ text }: { text?: string }) => <div>{text ?? 'loading'}</div>,
  ErrorState: ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
    <div data-testid="error-state">
      <div role="alert">{message}</div>
      {onRetry ? <button onClick={onRetry}>Retry</button> : null}
    </div>
  ),
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));

import ChannelsPage from '../app/channels/page';

const CHANNEL = {
  id: 'ch-1',
  name: 'Quant News',
  description: null,
  ownerId: 'u-owner',
  subscriberCount: 3,
  role: 'MEMBER',
  canPost: false,
};

function msg(id: string, minute: number) {
  return {
    id,
    channelId: 'ch-1',
    senderId: 'u-owner',
    content: `content-${id}`,
    createdAt: new Date(1_700_000_000_000 + minute * 60_000).toISOString(),
  };
}

function ok(data: unknown, pagination?: { hasMore: boolean; nextCursor: string | null }) {
  return { success: true, data, ...(pagination ? { pagination } : {}) };
}

async function settle(ms = 0) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  await settle(10);
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((b) =>
    (b.textContent ?? '').includes(text),
  ) as HTMLButtonElement | undefined;
}

function renderedContents(container: HTMLElement): string[] {
  return [...container.querySelectorAll('p')]
    .map((p) => p.textContent ?? '')
    .filter((t) => t.startsWith('content-'));
}

describe('QC-F-449 channel feed pagination', () => {
  let container: HTMLDivElement;
  let root: Root;
  let qc: QueryClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    apiMocks.getChannels.mockResolvedValue(ok([CHANNEL]));
    apiMocks.unsubscribeChannel.mockResolvedValue(ok({ unsubscribed: true }));
    apiMocks.publishToChannel.mockResolvedValue(ok({ id: 'new' }));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    qc.clear();
    container.remove();
  });

  async function openChannel() {
    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <ChannelsPage />
        </QueryClientProvider>,
      );
    });
    await settle(20);
    const open = buttonByText(container, 'Quant News');
    expect(open, 'channel list se channel khulna chahiye').toBeTruthy();
    await click(open!);
    await settle(20);
  }

  it('U1+U2: Load older posts pages upward via the cursor and ends at Beginning of channel', async () => {
    apiMocks.getChannelMessages.mockImplementation(
      async (_id: string, opts?: { before?: string }) => {
        if (!opts?.before) {
          return ok([msg('m48', 48), msg('m49', 49), msg('m50', 50)], {
            hasMore: true,
            nextCursor: 'm48',
          });
        }
        expect(opts.before).toBe('m48');
        return ok([msg('m46', 46), msg('m47', 47)], { hasMore: false, nextCursor: null });
      },
    );
    await openChannel();
    expect(renderedContents(container)).toEqual(['content-m48', 'content-m49', 'content-m50']);
    expect(buttonByText(container, 'Load older posts')).toBeTruthy();
    expect(container.textContent).not.toContain('Beginning of channel');

    await click(buttonByText(container, 'Load older posts')!);
    await settle(20);
    expect(apiMocks.getChannelMessages).toHaveBeenCalledTimes(2);
    // Older posts land ABOVE; the whole feed stays chronological.
    expect(renderedContents(container)).toEqual([
      'content-m46',
      'content-m47',
      'content-m48',
      'content-m49',
      'content-m50',
    ]);
    expect(buttonByText(container, 'Load older posts')).toBeUndefined();
    expect(container.textContent).toContain('Beginning of channel');
  });

  it('U3: a short channel shows Beginning of channel from the first render, no button', async () => {
    apiMocks.getChannelMessages.mockResolvedValue(
      ok([msg('m1', 1), msg('m2', 2), msg('m3', 3)], { hasMore: false, nextCursor: null }),
    );
    await openChannel();
    expect(renderedContents(container)).toHaveLength(3);
    expect(buttonByText(container, 'Load older posts')).toBeUndefined();
    expect(container.textContent).toContain('Beginning of channel');
  });

  it('U4 (control): an empty channel shows No posts yet and no Beginning strip', async () => {
    apiMocks.getChannelMessages.mockResolvedValue(ok([], { hasMore: false, nextCursor: null }));
    await openChannel();
    expect(container.textContent).toContain('No posts yet');
    expect(container.textContent).not.toContain('Beginning of channel');
    expect(buttonByText(container, 'Load older posts')).toBeUndefined();
  });

  it('U5: an older-page failure keeps the posts and offers an inline Retry that recovers', async () => {
    let calls = 0;
    apiMocks.getChannelMessages.mockImplementation(
      async (_id: string, opts?: { before?: string }) => {
        calls += 1;
        if (!opts?.before) {
          return ok([msg('m49', 49), msg('m50', 50)], { hasMore: true, nextCursor: 'm49' });
        }
        if (calls === 2) {
          return {
            success: false,
            error: { code: 'NETWORK', message: 'older page boom', statusCode: 500 },
          };
        }
        return ok([msg('m48', 48)], { hasMore: false, nextCursor: null });
      },
    );
    await openChannel();
    await click(buttonByText(container, 'Load older posts')!);
    await settle(20);
    // Posts preserved; no full-screen ErrorState; inline alert + Retry.
    expect(renderedContents(container)).toEqual(['content-m49', 'content-m50']);
    expect(container.querySelector('[data-testid="error-state"]')).toBeNull();
    const retry = buttonByText(container, 'Retry');
    expect(retry, 'inline Retry dikhna chahiye').toBeTruthy();

    await click(retry!);
    await settle(20);
    expect(renderedContents(container)).toEqual(['content-m48', 'content-m49', 'content-m50']);
    expect(container.textContent).toContain('Beginning of channel');
  });

  it('U6 (control): a failed FIRST load shows the full ErrorState', async () => {
    apiMocks.getChannelMessages.mockResolvedValue({
      success: false,
      error: { code: 'NETWORK', message: 'feed boom', statusCode: 500 },
    });
    await openChannel();
    expect(container.querySelector('[data-testid="error-state"]')).not.toBeNull();
    expect(container.textContent).toContain('feed boom');
  });
});

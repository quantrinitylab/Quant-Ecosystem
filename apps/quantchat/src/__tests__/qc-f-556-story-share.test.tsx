// @vitest-environment jsdom
// ============================================================================
// QC-F-556 — story share / forward / link (web surfaces)
// ============================================================================
//
// Defect: stories had no share surface at all — StoryViewer's only button
// was Close, there was no conversation picker, no shareable link, and no
// gated /stories/[storyId] page for a card or link to land on.
//
// Slice-1 web pins:
//   W1 parseStoryShare accepts ONLY the exact server snapshot shape and
//      never carries content keys (mediaUrl/text) into the client card.
//   W2 A live StoryShareCard renders author/type/expiry and navigates to
//      the gated story page on tap; an expired card is disabled and
//      honest, and never navigates.
//   W3 StoryViewer shows a Share action only when onShare is wired, and
//      reports the CURRENT story when tapped.
//   W4 /stories/[storyId] is a gated app route (route-access registry).
//   W5 StoryShareSheet sends through onShare, shows Sent only after the
//      send resolves, and surfaces a rejection as an error (no fake Sent).
//
// Negative control: against the pre-fix tree this suite fails at import /
// assertion level — parseStoryShare, StoryShareCard, StoryShareSheet and
// the route pattern did not exist, and StoryViewer had no Share action.
// Mocks are stable module-level hoisted objects (never fresh identities).
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// --- framer-motion: SAFE-prop mock (same pattern as QC-F-364) --------------
vi.mock('framer-motion', () => {
  const SAFE = /^(className|id|children|role|onClick|style|href|target|rel)$|^(aria-|data-)/;
  const make = (tag: string) =>
    React.forwardRef(function MotionMock(props: Record<string, unknown>, ref: unknown) {
      const out: Record<string, unknown> = { ref };
      for (const key of Object.keys(props)) {
        if (SAFE.test(key)) out[key] = props[key];
      }
      return React.createElement(tag, out, props.children as React.ReactNode);
    });
  const motion = new Proxy({}, { get: (_t, tag: string) => make(typeof tag === 'string' ? tag : 'div') });
  return {
    motion,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
    useMotionValue: () => 0,
    useTransform: () => 1,
  };
});

vi.mock('@quant/brand', () => ({ spring: { gentle: {}, snappy: {}, stiff: {} } }));

// --- next/navigation: stable router mock ------------------------------------
const routerMock = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  useParams: () => ({ storyId: 'story-photo' }),
}));

// --- useConversations: stable single-conversation world ----------------------
const conversationsMock = vi.hoisted(() => ({
  value: {
    conversations: [
      {
        id: 'conv-group',
        type: 'GROUP',
        name: 'Weekend Group',
        participants: [],
        lastActivityAt: new Date(),
        unreadCount: 0,
        isPinned: false,
        isMuted: false,
        disappearMode: 'off',
        encryptionEnabled: false,
      },
    ],
    isLoading: false,
    error: null,
    data: undefined,
    refetch: vi.fn(),
    isError: false,
  },
}));
vi.mock('../hooks/useConversations', () => ({
  useConversations: () => conversationsMock.value,
}));

// Imported after mocks are registered.
import { parseStoryShare, isStoryShareExpired } from '../lib/story-share';
import { StoryShareCard } from '../components/StoryShareCard';
import { StoryShareSheet } from '../components/StoryShareSheet';
import { StoryViewer } from '../components/StoryViewer';
import { classifyPath } from '../lib/route-access';

const HOUR = 60 * 60 * 1000;

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    storyShare: {
      storyId: 'story-photo',
      authorId: 'user_author',
      authorName: 'Ann Author',
      authorAvatar: '',
      storyType: 'photo',
      audience: 'ALL',
      createdAt: new Date(Date.now() - HOUR).toISOString(),
      expiresAt: new Date(Date.now() + HOUR).toISOString(),
      ...overrides,
    },
  };
}

// --- render helpers ----------------------------------------------------------
let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(element: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(element);
  });
  return container;
}

async function unmount() {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  container?.remove();
  container = null;
  root = null;
}

beforeEach(() => {
  routerMock.push.mockClear();
});

afterEach(async () => {
  await unmount();
});

describe('QC-F-556 web story share', () => {
  it('W1: parseStoryShare accepts the server snapshot and strips content keys', () => {
    const parsed = parseStoryShare(
      snapshot({ mediaUrl: 'data:image/jpeg;base64,PHOTOCONTENT', text: 'secret' }),
    );
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      storyId: 'story-photo',
      authorId: 'user_author',
      authorName: 'Ann Author',
      storyType: 'photo',
      audience: 'ALL',
    });
    expect(JSON.stringify(parsed)).not.toContain('PHOTOCONTENT');
    expect(JSON.stringify(parsed)).not.toContain('secret');
    // Misshapen payloads never become cards.
    expect(parseStoryShare(null)).toBeNull();
    expect(parseStoryShare({})).toBeNull();
    expect(parseStoryShare({ storyShare: { storyId: 'x' } })).toBeNull();
    expect(parseStoryShare(snapshot({ storyType: 'hologram' }))).toBeNull();
    expect(parseStoryShare(snapshot({ expiresAt: 'not-a-date' }))).toBeNull();
    expect(isStoryShareExpired(parsed!, Date.now())).toBe(false);
    expect(
      isStoryShareExpired(
        parseStoryShare(snapshot({ expiresAt: new Date(Date.now() - HOUR).toISOString() }))!,
      ),
    ).toBe(true);
  });

  it('W2: a live card navigates to the gated story page; an expired card is disabled and honest', async () => {
    const live = parseStoryShare(snapshot())!;
    const el = await mount(<StoryShareCard share={live} />);
    const card = el.querySelector('[data-testid="story-share-card"]') as HTMLButtonElement;
    expect(card).not.toBeNull();
    expect(card.textContent).toContain('Ann Author');
    expect(card.textContent).toContain('Photo story');
    expect(card.disabled).toBe(false);
    await act(async () => {
      card.click();
    });
    expect(routerMock.push).toHaveBeenCalledWith('/stories/story-photo');
    await unmount();

    const expired = parseStoryShare(
      snapshot({ expiresAt: new Date(Date.now() - HOUR).toISOString() }),
    )!;
    const el2 = await mount(<StoryShareCard share={expired} />);
    const deadCard = el2.querySelector('[data-testid="story-share-card"]') as HTMLButtonElement;
    expect(deadCard.disabled).toBe(true);
    expect(deadCard.textContent).toContain('expired');
    routerMock.push.mockClear();
    await act(async () => {
      deadCard.click();
    });
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('W3: StoryViewer offers Share only when wired, reporting the current story', async () => {
    const stories = [
      {
        id: 'story-photo',
        authorName: 'Ann Author',
        type: 'photo' as const,
        mediaUrl: 'https://cdn.example/p.jpg',
        duration: 15,
        createdAt: new Date().toISOString(),
      },
    ];
    const onShare = vi.fn();
    const el = await mount(
      <StoryViewer
        stories={stories}
        currentIndex={0}
        isOpen={true}
        onClose={() => {}}
        onNext={() => {}}
        onPrev={() => {}}
        autoAdvance={false}
        onShare={onShare}
      />,
    );
    const shareBtn = Array.from(el.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Share story',
    );
    expect(shareBtn).toBeDefined();
    await act(async () => {
      shareBtn!.click();
    });
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onShare.mock.calls[0]?.[0]).toMatchObject({ id: 'story-photo' });
    await unmount();

    const el2 = await mount(
      <StoryViewer
        stories={stories}
        currentIndex={0}
        isOpen={true}
        onClose={() => {}}
        onNext={() => {}}
        onPrev={() => {}}
        autoAdvance={false}
      />,
    );
    const absent = Array.from(el2.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Share story',
    );
    expect(absent).toBeUndefined();
  });

  it('W4: /stories/[storyId] classifies as a gated app route, not public/unknown', () => {
    expect(classifyPath('/stories/story-photo')).toBe('app');
    expect(classifyPath('/stories')).toBe('app');
  });

  it('W5: the sheet marks Sent only after onShare resolves, and surfaces rejections honestly', async () => {
    const onShare = vi.fn(() => Promise.resolve());
    const el = await mount(
      <StoryShareSheet
        storyId="story-photo"
        authorName="Ann Author"
        isOpen={true}
        onClose={() => {}}
        onShare={onShare}
      />,
    );
    expect(el.textContent).toContain('Weekend Group');
    expect(el.textContent).toContain('Copy link');
    const sendBtn = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent === 'Send',
    );
    expect(sendBtn).toBeDefined();
    await act(async () => {
      sendBtn!.click();
    });
    expect(onShare).toHaveBeenCalledWith('conv-group');
    expect(el.textContent).toContain('Sent');
    await unmount();

    const failing = vi.fn(() => Promise.reject(new Error('You are not a member of this conversation')));
    const el2 = await mount(
      <StoryShareSheet
        storyId="story-photo"
        authorName="Ann Author"
        isOpen={true}
        onClose={() => {}}
        onShare={failing}
      />,
    );
    const sendBtn2 = Array.from(el2.querySelectorAll('button')).find(
      (b) => b.textContent === 'Send',
    );
    await act(async () => {
      sendBtn2!.click();
    });
    expect(el2.textContent).toContain('You are not a member of this conversation');
    expect(el2.textContent).not.toContain('Sent');
  });
});

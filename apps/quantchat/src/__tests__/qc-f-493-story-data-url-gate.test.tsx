// @vitest-environment jsdom
// ============================================================================
// QC-F-493 — stories page gate blocked every real photo/video story
//
// The shipped StoryCreator produces ONLY inline media: camera photos are
// `canvas.toDataURL('image/jpeg', 0.9)` and gallery picks are
// `FileReader.readAsDataURL` — both `data:` URLs. The stories page's
// handlePostStory only let `/^https?:\/\//i` URLs through to createStory and
// answered everything else with "Story uploads are coming soon", so a photo
// or video story could NEVER post from the shipped creator — even though
// the backend has accepted exactly these data: payloads since QC-F-330
// (zod cap 12,582,912 chars + validator allowData ['image/','video/']).
//
// Fix (specialist-qc-f-493-buildprep.md §5.1, band): the page gate mirrors
// the backend contract — data:image//data:video/ (case-sensitive, like the
// validator) up to the same 12,582,912-char cap posts; oversize gets an
// honest too-large notice (~9 MB of real media), 'video-placeholder'
// (StoryCreator's fake camera recording, QC-F-362) gets a
// recording-not-ready notice, anything else a generic can't-post notice,
// and "coming soon" is gone. Text/http flows are byte-identical.
//
// Negative control (against the ORIGINAL page): T1/T2/T9 FAIL (data: went
// to the else branch — createStory never called, "coming soon" shown);
// T3/T4/T5/T8 FAIL on their notice wording (the original's only notice was
// "coming soon"; their createStory-not-called half passes on the original
// too, because the old gate blocked everything); T10 FAILS ("coming soon"
// present, constant absent). T6/T7 are controls — text/http already posted
// correctly and must not regress.
//
// Mocks are stable module-level hoisted objects (never fresh identities).
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// --- framer-motion: qc-f-364 SAFE-prop mock --------------------------------
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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined }),
}));

// --- useStories: controlled mock with a stable createStory spy -------------
const storyMocks = vi.hoisted(() => ({
  createStory: vi.fn(),
  fetchStories: vi.fn(),
  nextStory: vi.fn(),
  prevStory: vi.fn(),
  setCurrentStoryGroup: vi.fn(),
}));

vi.mock('../hooks/useStories', () => ({
  useStories: () => ({
    storyGroups: [],
    currentStory: null,
    loading: false,
    error: null,
    fetchStories: storyMocks.fetchStories,
    createStory: storyMocks.createStory,
    nextStory: storyMocks.nextStory,
    prevStory: storyMocks.prevStory,
    setCurrentStoryGroup: storyMocks.setCurrentStoryGroup,
  }),
}));

// --- StoryCreator: stub that hands its props to the test --------------------
const creatorHolder = vi.hoisted(() => ({
  current: null as null | { onPost: (story: unknown) => Promise<void> },
}));

vi.mock('../components/StoryCreator', () => ({
  StoryCreator: (props: { onPost: (story: unknown) => Promise<void> }) => {
    creatorHolder.current = props;
    return React.createElement('div', { 'data-testid': 'story-creator-stub' });
  },
}));

vi.mock('../components/StoryViewer', () => ({
  StoryViewer: () => null,
}));

// --- @quant/shared-ui: light stubs ------------------------------------------
vi.mock('@quant/shared-ui', () => ({
  AppShell: ({ children, topBar }: { children?: React.ReactNode; topBar?: React.ReactNode }) =>
    React.createElement('div', null, topBar, children),
  TopBar: ({ rightActions }: { rightActions?: React.ReactNode }) =>
    React.createElement('div', null, rightActions),
  BottomNav: () => null,
  LoadingState: () => React.createElement('div', null, 'loading'),
  ErrorState: ({ message }: { message?: string }) => React.createElement('div', null, message),
  EmptyState: ({
    actionLabel,
    onAction,
  }: {
    actionLabel?: string;
    onAction?: () => void;
  }) =>
    React.createElement('button', { onClick: onAction }, actionLabel),
}));

vi.mock('../lib/navigation', () => ({ navItems: [], routes: {} }));
vi.mock('../lib/motion-variants', () => ({ circleVariants: {}, staggerContainer: {} }));

import StoriesPage from '../app/stories/page';

let container: HTMLDivElement;
let root: Root;

async function renderPage() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<StoriesPage />);
  });
  // Open the creator via the empty state's "Create story" action.
  const openBtn = [...container.querySelectorAll('button')].find(
    (b) => b.textContent === 'Create story',
  );
  if (!openBtn) throw new Error('Create story action not rendered');
  await act(async () => {
    openBtn.click();
  });
  if (!creatorHolder.current) throw new Error('StoryCreator stub did not receive props');
}

async function post(payload: unknown) {
  const onPost = creatorHolder.current?.onPost;
  if (!onPost) throw new Error('onPost not captured');
  await act(async () => {
    await onPost(payload);
  });
}

function noticeText(): string | null {
  return container.querySelector('[role="status"]')?.textContent ?? null;
}

beforeEach(() => {
  vi.clearAllMocks();
  creatorHolder.current = null;
  storyMocks.createStory.mockResolvedValue(undefined);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

describe('QC-F-493 stories page data: gate', () => {
  it('T1: a camera photo (data:image/jpeg) reaches createStory verbatim, no notice', async () => {
    await renderPage();
    const mediaUrl = `data:image/jpeg;base64,${'A'.repeat(2000)}`;
    await post({ type: 'photo', mediaUrl });
    expect(storyMocks.createStory).toHaveBeenCalledTimes(1);
    expect(storyMocks.createStory).toHaveBeenCalledWith({ type: 'photo', mediaUrl, duration: 5 });
    expect(noticeText()).toBeNull();
  });

  it('T2: a gallery video (data:video/mp4) reaches createStory verbatim, no notice', async () => {
    await renderPage();
    const mediaUrl = 'data:video/mp4;base64,AAAA';
    await post({ type: 'video', mediaUrl });
    expect(storyMocks.createStory).toHaveBeenCalledTimes(1);
    expect(storyMocks.createStory).toHaveBeenCalledWith({ type: 'video', mediaUrl, duration: 5 });
    expect(noticeText()).toBeNull();
  });

  it("T3: 'video-placeholder' never posts and gets the recording-not-ready notice", async () => {
    await renderPage();
    await post({ type: 'video', mediaUrl: 'video-placeholder' });
    expect(storyMocks.createStory).not.toHaveBeenCalled();
    expect(noticeText()).toBe(
      "Video recording isn't ready yet — post a photo, or pick a video from your gallery instead.",
    );
  });

  it('T4: inline media one char over the backend cap never posts and gets the too-large notice', async () => {
    await renderPage();
    const prefix = 'data:image/jpeg;base64,';
    const mediaUrl = prefix + 'A'.repeat(12_582_913 - prefix.length);
    expect(mediaUrl.length).toBe(12_582_913);
    await post({ type: 'photo', mediaUrl });
    expect(storyMocks.createStory).not.toHaveBeenCalled();
    expect(noticeText()).toContain('too large to post as a story');
    expect(noticeText()).toContain('about 9 MB');
  });

  it('T5: a non-media data: payload never posts and gets the generic notice', async () => {
    await renderPage();
    await post({ type: 'photo', mediaUrl: 'data:text/html;base64,AAAA' });
    expect(storyMocks.createStory).not.toHaveBeenCalled();
    expect(noticeText()).toBe("That media can't be posted as a story.");
  });

  it('T6 (control): text stories still post exactly as before', async () => {
    await renderPage();
    await post({ type: 'text', text: 'hello' });
    expect(storyMocks.createStory).toHaveBeenCalledTimes(1);
    expect(storyMocks.createStory).toHaveBeenCalledWith({ type: 'text', text: 'hello', duration: 5 });
    expect(noticeText()).toBeNull();
  });

  it('T6b (control): empty text still gets the type-something notice and never posts', async () => {
    await renderPage();
    await post({ type: 'text', text: '  ' });
    expect(storyMocks.createStory).not.toHaveBeenCalled();
    expect(noticeText()).toBe('Type something first — a text story needs words.');
  });

  it('T7 (control): http(s) media URLs still reach createStory (page behaviour unchanged)', async () => {
    await renderPage();
    await post({ type: 'photo', mediaUrl: 'https://example.com/x.jpg' });
    await post({ type: 'photo', mediaUrl: 'http://example.com/x.jpg' });
    expect(storyMocks.createStory).toHaveBeenCalledTimes(2);
    expect(storyMocks.createStory).toHaveBeenNthCalledWith(1, {
      type: 'photo',
      mediaUrl: 'https://example.com/x.jpg',
      duration: 5,
    });
    expect(storyMocks.createStory).toHaveBeenNthCalledWith(2, {
      type: 'photo',
      mediaUrl: 'http://example.com/x.jpg',
      duration: 5,
    });
  });

  it('T8: a media story with no mediaUrl never posts and gets the generic notice', async () => {
    await renderPage();
    await post({ type: 'photo' });
    expect(storyMocks.createStory).not.toHaveBeenCalled();
    expect(noticeText()).toBe("That media can't be posted as a story.");
  });

  it('T9: inline media at exactly the backend cap (12,582,912 chars) posts verbatim — cap is inclusive', async () => {
    await renderPage();
    const prefix = 'data:image/jpeg;base64,';
    const mediaUrl = prefix + 'A'.repeat(12_582_912 - prefix.length);
    expect(mediaUrl.length).toBe(12_582_912);
    await post({ type: 'photo', mediaUrl });
    expect(storyMocks.createStory).toHaveBeenCalledTimes(1);
    const call = storyMocks.createStory.mock.calls[0] as unknown as [
      { type: string; mediaUrl: string; duration: number },
    ];
    expect(call[0].mediaUrl).toBe(mediaUrl);
    expect(call[0].mediaUrl.length).toBe(12_582_912);
  });

  it('T10 (source pin): "coming soon" is gone and the cap constant mirrors the backend', () => {
    const candidates = [
      resolve(process.cwd(), 'src/app/stories/page.tsx'),
      resolve(process.cwd(), 'apps/quantchat/src/app/stories/page.tsx'),
    ];
    const found = candidates.find((p) => existsSync(p));
    if (!found) throw new Error('Could not locate src/app/stories/page.tsx');
    const src = readFileSync(found, 'utf8');
    expect(/coming soon/i.test(src)).toBe(false);
    expect(src).toContain('MAX_STORY_MEDIA_URL_LENGTH = 12_582_912');
  });
});

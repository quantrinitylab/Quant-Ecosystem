// @vitest-environment jsdom
// ============================================================================
// QC-F-364 — StoryViewer VIDEO stories rendered through <img> (never play)
//
// The shipped StoryViewer had exactly one media branch: every non-text
// story was rendered as <img src={mediaUrl}>. A VIDEO story therefore showed
// a broken/empty frame for its whole stored duration and then advanced
// unseen — the backend has always sent type:'video' (stories.ts
// prismaToClientType VIDEO->'video') and the viewer is its only shipped
// consumer. There were TWO advance owners, both keyed to the stored
// `duration` (a number the stories page hardcodes to 5 on post, see
// buildprep C3): the viewer's rAF loop AND an independent setTimeout in
// useStories. Slice 1 (specialist-qc-f-364-buildprep.md §5, band):
//   - StoryViewer renders type:'video' + mediaUrl as a real
//     <video autoPlay muted playsInline preload="auto">; progress comes
//     from the element's currentTime/duration (timeupdate), advance only
//     from `ended` (the same onNext/onClose path tap-next uses, so
//     view-marking in useStories.nextStory is byte-identical), isPaused
//     pauses/plays the element itself, and onError swaps to the honest
//     fallback text "This video couldn't be played" (progress then falls
//     back to the stored-duration path so the viewer never wedges).
//   - useStories' auto-advance setTimeout is skipped for video stories —
//     a video's only advance owner is its own `ended`.
// Photo/text branches are untouched.
//
// jsdom honesty note: HTMLMediaElement play()/pause()/duration/currentTime
// are STUBBED below (seeded test values, not a claim about production
// media). These tests pin the WIRING (element choice, event binding,
// timer ownership); actual codec playback is a live-browser verify step.
//
// Negative control (this file against the ORIGINAL StoryViewer/useStories
// @ 20e6ba387): V1, V4, V5, V6, V7, H1, S1 FAIL (7); V2, V3, H2 PASS (3
// controls — photo/text render and the photo advance timer were always
// correct, which is what makes the FAILs attributable to the defect).
// Mocks are stable module-level hoisted objects (never fresh identities).
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// --- framer-motion: 309-style SAFE-prop mock + the two value stubs the ----
// component calls at top level (useMotionValue/useTransform).
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

vi.mock('@quant/common', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// --- @quant/api-client: only the seam useStories consumes ------------------
const apiMocks = vi.hoisted(() => ({ apiFetchRaw: vi.fn() }));
vi.mock('@quant/api-client', () => ({ apiFetchRaw: apiMocks.apiFetchRaw }));

// Imported after mocks are registered.
import { StoryViewer } from '../components/StoryViewer';
import { useStories } from '../hooks/useStories';

// --- media element stubs (seeded values; see header honesty note) ----------
const playSpy = vi.fn(() => Promise.resolve());
const pauseSpy = vi.fn();
const origPlay = HTMLMediaElement.prototype.play;
const origPause = HTMLMediaElement.prototype.pause;

beforeEach(() => {
  playSpy.mockClear();
  pauseSpy.mockClear();
  HTMLMediaElement.prototype.play = playSpy as typeof HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.pause = pauseSpy as typeof HTMLMediaElement.prototype.pause;
});

afterEach(() => {
  HTMLMediaElement.prototype.play = origPlay;
  HTMLMediaElement.prototype.pause = origPause;
  vi.useRealTimers();
});

// --- render helpers ---------------------------------------------------------
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

afterEach(async () => {
  await unmount();
});

type ViewerStory = {
  id: string;
  authorName: string;
  type: 'photo' | 'video' | 'text';
  mediaUrl?: string;
  text?: string;
  duration: number;
  createdAt: string;
};

const VIDEO_URL = 'https://media.example/story-v1.mp4';
const PHOTO_URL = 'https://media.example/story-p1.jpg';

function story(partial: Partial<ViewerStory> & { id: string }): ViewerStory {
  return {
    authorName: 'Asha',
    type: 'photo',
    duration: 60,
    createdAt: '2026-10-14T10:00:00.000Z',
    ...partial,
  };
}

function viewerProps(stories: ViewerStory[], currentIndex = 0) {
  return {
    stories,
    currentIndex,
    isOpen: true,
    onClose: vi.fn(),
    onNext: vi.fn(),
    onPrev: vi.fn(),
  };
}

async function fire(el: Element, type: string) {
  await act(async () => {
    el.dispatchEvent(new Event(type, { bubbles: true }));
  });
}

function contentContainer(el: HTMLElement): HTMLElement {
  const node = el.querySelector<HTMLElement>('.cursor-pointer');
  if (!node) throw new Error('story content container not found');
  return node;
}

describe('QC-F-364 StoryViewer — video stories actually play', () => {
  it('V1: a video story renders a real <video> with the story URL, autoplay/muted/playsInline — and no <img>', async () => {
    const el = await mount(
      React.createElement(StoryViewer, viewerProps([story({ id: 'v1', type: 'video', mediaUrl: VIDEO_URL })])),
    );
    const video = el.querySelector('video');
    expect(video).not.toBeNull();
    expect(video!.getAttribute('src')).toBe(VIDEO_URL);
    const v = video as unknown as HTMLVideoElement & { playsInline?: boolean };
    expect(v.autoplay === true || video!.hasAttribute('autoplay')).toBe(true);
    expect(v.muted === true || video!.hasAttribute('muted')).toBe(true);
    expect(v.playsInline === true || video!.hasAttribute('playsinline')).toBe(true);
    expect(el.querySelector('img')).toBeNull();
  });

  it('V2 (control): a photo story still renders <img> and no <video>', async () => {
    const el = await mount(
      React.createElement(StoryViewer, viewerProps([story({ id: 'p1', type: 'photo', mediaUrl: PHOTO_URL })])),
    );
    const img = el.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe(PHOTO_URL);
    expect(el.querySelector('video')).toBeNull();
  });

  it('V3 (control): a text story still renders its text, with no media element', async () => {
    const el = await mount(
      React.createElement(
        StoryViewer,
        viewerProps([story({ id: 't1', type: 'text', text: 'Namaste', mediaUrl: undefined })]),
      ),
    );
    expect(el.textContent).toContain('Namaste');
    expect(el.querySelector('video')).toBeNull();
    expect(el.querySelector('img')).toBeNull();
  });

  it('V4: a video that fails to load is replaced by the honest fallback text', async () => {
    const el = await mount(
      React.createElement(StoryViewer, viewerProps([story({ id: 'v1', type: 'video', mediaUrl: VIDEO_URL })])),
    );
    const video = el.querySelector('video');
    expect(video).not.toBeNull();
    await fire(video!, 'error');
    expect(el.textContent).toContain("This video couldn't be played");
    expect(el.querySelector('video')).toBeNull();
  });

  it('V5: ended advances via onNext — and on the last story via onClose (never by itself)', async () => {
    const props = viewerProps([
      story({ id: 'v1', type: 'video', mediaUrl: VIDEO_URL }),
      story({ id: 'p2', type: 'photo', mediaUrl: PHOTO_URL }),
    ]);
    const el = await mount(React.createElement(StoryViewer, props));
    await fire(el.querySelector('video')!, 'ended');
    expect(props.onNext).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
    await unmount();

    const lastProps = viewerProps([story({ id: 'v1', type: 'video', mediaUrl: VIDEO_URL })]);
    const el2 = await mount(React.createElement(StoryViewer, lastProps));
    await fire(el2.querySelector('video')!, 'ended');
    expect(lastProps.onClose).toHaveBeenCalledTimes(1);
    expect(lastProps.onNext).not.toHaveBeenCalled();
  });

  it('V6: progress is driven by the video clock, not the stored duration', async () => {
    const el = await mount(
      React.createElement(
        StoryViewer,
        viewerProps([story({ id: 'v1', type: 'video', mediaUrl: VIDEO_URL, duration: 60 })]),
      ),
    );
    const video = el.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { value: 10, configurable: true });
    Object.defineProperty(video, 'currentTime', { value: 5, configurable: true });
    await fire(video, 'timeupdate');
    const widths = Array.from(el.querySelectorAll<HTMLElement>('div'))
      .map((d) => d.style.width)
      .filter(Boolean);
    expect(widths).toContain('50%');
  });

  it('V7: hold pauses the video itself (and shows PAUSED); release plays it again', async () => {
    const el = await mount(
      React.createElement(StoryViewer, viewerProps([story({ id: 'v1', type: 'video', mediaUrl: VIDEO_URL })])),
    );
    expect(el.querySelector('video')).not.toBeNull();
    playSpy.mockClear();
    pauseSpy.mockClear();
    const zone = contentContainer(el);
    await fire(zone, 'pointerdown');
    expect(pauseSpy).toHaveBeenCalled();
    expect(el.textContent).toContain('PAUSED');
    // Re-query before pointerup: the framer-motion mock above creates a
    // fresh component identity per render, so a state change remounts the
    // subtree and the pre-pause node is detached (real framer-motion is
    // identity-stable — this is a harness trait, not component behaviour).
    await fire(contentContainer(el), 'pointerup');
    expect(playSpy).toHaveBeenCalled();
  });
});

// --- useStories auto-advance ownership (probe component, no new package) ---
function UseStoriesProbe() {
  const s = useStories();
  return React.createElement('div', { 'data-testid': 'probe-current' }, s.currentStory?.id ?? 'none');
}

function hookStory(id: string, type: 'photo' | 'video' | 'text', duration: number) {
  return {
    id,
    authorId: 'u-asha',
    authorName: 'Asha',
    authorAvatar: '',
    type,
    mediaUrl: type === 'text' ? undefined : `https://media.example/${id}`,
    duration,
    viewCount: 0,
    createdAt: '2026-10-14T10:00:00.000Z',
    expiresAt: '2026-10-15T10:00:00.000Z',
    isViewed: false,
    replies: 0,
  };
}

const FEED_GROUP = {
  userId: 'u-asha',
  userName: 'Asha',
  userAvatar: '',
  hasUnviewed: true,
  stories: [hookStory('s-photo-1', 'photo', 5), hookStory('s-video', 'video', 30), hookStory('s-photo-2', 'photo', 5)],
};

async function mountProbe() {
  apiMocks.apiFetchRaw.mockReset();
  apiMocks.apiFetchRaw.mockImplementation(async (url: string) => {
    if (url.includes('/api/stories/feed')) {
      return { ok: true, status: 200, json: async () => ({ groups: [FEED_GROUP] }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });
  vi.useFakeTimers();
  const el = await mount(React.createElement(UseStoriesProbe));
  // Flush the feed fetch promise chain so storyGroups lands.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return el;
}

function probeCurrent(el: HTMLElement): string | null {
  return el.querySelector('[data-testid="probe-current"]')?.textContent ?? null;
}

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

describe('QC-F-364 useStories — the hook timer must not cut a video short', () => {
  it('H1: while the current story is a video, the hook timer does NOT advance it (its ended owns advance)', async () => {
    const el = await mountProbe();
    expect(probeCurrent(el)).toBe('s-photo-1');
    await advance(5000);
    expect(probeCurrent(el)).toBe('s-video');
    // Far beyond the video's stored 30s — with no viewer mounted, nothing
    // may move past the video: only the viewer's `ended` can do that.
    await advance(60000);
    expect(probeCurrent(el)).toBe('s-video');
  });

  it('H2 (control): the hook timer still advances photo stories on their stored duration', async () => {
    const el = await mountProbe();
    expect(probeCurrent(el)).toBe('s-photo-1');
    await advance(5000);
    expect(probeCurrent(el)).toBe('s-video');
  });
});

describe('QC-F-364 source pins', () => {
  it('S1: viewer source has a <video> branch + the fallback copy; the hook advance effect is video-guarded', () => {
    const viewerPath = [
      resolve(process.cwd(), 'src/components/StoryViewer.tsx'),
      resolve(process.cwd(), 'apps/quantchat/src/components/StoryViewer.tsx'),
    ].find((p) => existsSync(p))!;
    const hookPath = [
      resolve(process.cwd(), 'src/hooks/useStories.ts'),
      resolve(process.cwd(), 'apps/quantchat/src/hooks/useStories.ts'),
    ].find((p) => existsSync(p))!;
    const viewerSrc = readFileSync(viewerPath, 'utf8');
    const hookSrc = readFileSync(hookPath, 'utf8');
    expect(viewerSrc).toContain('<video');
    expect(viewerSrc).toContain("This video couldn't be played");
    expect(hookSrc).toMatch(/currentStory\.type\s*!==\s*'video'/);
  });
});

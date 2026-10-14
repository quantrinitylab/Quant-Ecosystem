// @vitest-environment jsdom
//
// QC-F-331 Slice 1 — Snap Map search page contract.
//
// The map header search input was completely dead: no value, no onChange,
// no aria-label — typed text went nowhere and the placeholder promised
// "Search locations..." although the page has no places/geocoding data at
// all. Slice 1 wires the input to the real friends list the page already
// loads (GET /api/map/friends) with an honest placeholder, a results panel,
// and pin focus on selection. These tests render the REAL page + REAL
// MapCanvas/FriendPin/GhostModeToggle (only transport + animation + router
// are mocked, with stable module-level mocks) and pin:
//   B1 controlled input + aria-label · B2 typing filters the panel ·
//   B3 focus with empty query lists everyone · B4 select focuses the pin
//   (+ popup) and closes the panel · B5 honest no-match state · B6 honest
//   empty-friends state · B7 select from Explore switches to Friends ·
//   B8 clear resets query/focus/panel · B9 honest placeholder ·
//   B10 typing again clears a stale focus.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiState = vi.hoisted(() => ({
  apiFetchRaw: vi.fn(),
  friendsPayload: null as unknown,
}));

vi.mock('@quant/api-client', () => ({ apiFetchRaw: apiState.apiFetchRaw }));

vi.mock('../services/chat-socket', () => ({
  chatSocket: {
    acquire: vi.fn(),
    release: vi.fn(),
    onMessage: vi.fn(() => () => {}),
    send: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@quant/brand', () => ({ spring: { gentle: {}, snappy: {}, stiff: {} } }));

vi.mock('framer-motion', () => {
  const SAFE = /^(className|id|children|role|onClick|style)$|^(aria-|data-)/;
  const make = (tag: string) =>
    React.forwardRef(function MotionMock(props: Record<string, unknown>, ref: unknown) {
      const out: Record<string, unknown> = { ref };
      for (const key of Object.keys(props)) {
        if (!SAFE.test(key)) continue;
        if (key === 'style' && props.style && typeof props.style === 'object') {
          // Drop motion-value objects from style; keep plain CSS values.
          const style: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(props.style as Record<string, unknown>)) {
            if (typeof v === 'string' || typeof v === 'number') style[k] = v;
          }
          out.style = style;
        } else {
          out[key] = props[key];
        }
      }
      return React.createElement(tag, out, props.children as React.ReactNode);
    });
  // Component identity MUST be stable across renders: a fresh component
  // type per render makes React remount the subtree every time, and
  // MapCanvas's mount effect (geolocation → parent state) would loop
  // forever. Cache one mock component per tag.
  const cache = new Map<string, unknown>();
  const motion = new Proxy(
    {},
    {
      get: (_t, tag: string) => {
        const key = typeof tag === 'string' ? tag : 'div';
        if (!cache.has(key)) cache.set(key, make(key));
        return cache.get(key);
      },
    },
  );
  const motionValue = (initial: number) => ({
    get: () => initial,
    set: () => {},
    on: () => () => {},
  });
  return {
    motion,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
    useMotionValue: motionValue,
    useSpring: motionValue,
    useTransform: () => motionValue(0),
  };
});

vi.mock('@quant/shared-ui', () => ({
  BottomNav: () => React.createElement('div', { 'data-testid': 'bottom-nav' }),
}));

import MapPage from '../app/map/page';

const FRIENDS_PAYLOAD = {
  success: true,
  data: {
    friends: [
      { userId: 'u-alina', username: 'alina_k', displayName: 'Alina Kapoor', avatarUrl: null, latitude: 28.615, longitude: 77.215, updatedAt: new Date().toISOString() },
      { userId: 'u-rk', username: 'rk_92', displayName: 'Ramesh Kumar', avatarUrl: null, latitude: 28.6, longitude: 77.2, updatedAt: new Date().toISOString() },
      { userId: 'u-sana', username: 'sana', displayName: 'Sana Sheikh', avatarUrl: null, latitude: 28.62, longitude: 77.22, updatedAt: new Date().toISOString() },
    ],
  },
};

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('QC-F-331 MapPage search (Slice 1)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    apiState.friendsPayload = FRIENDS_PAYLOAD;
    apiState.apiFetchRaw.mockImplementation(async (url: string) => {
      if (String(url).includes('/api/map/friends')) {
        return { ok: true, json: async () => apiState.friendsPayload };
      }
      return { ok: true, json: async () => ({ data: [] }) };
    });
    // Geolocation stub: pins only render once the user's own location is
    // known — this is the page's real render gate, not test decoration.
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: (pos: unknown) => void) =>
          success({
            coords: { latitude: 28.61, longitude: 77.21, accuracy: 10 },
            timestamp: Date.now(),
          }),
      },
    });
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
      root.render(<MapPage />);
      await flushPromises();
      await flushPromises();
    });
  }

  function getInput(): HTMLInputElement {
    const input = container.querySelector('input[type="text"]');
    if (!input) throw new Error('search input not found');
    return input as HTMLInputElement;
  }

  function getPanel(): HTMLElement | null {
    return container.querySelector('[aria-label="Friends sharing their location"]');
  }

  async function focusInput() {
    const input = getInput();
    await act(async () => {
      input.focus();
      input.dispatchEvent(new window.Event('focusin', { bubbles: true }));
    });
  }

  async function typeQuery(value: string) {
    const input = getInput();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (!setter) throw new Error('native input value setter unavailable');
    await act(async () => {
      setter.call(input, value);
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
  }

  async function click(el: Element) {
    await act(async () => {
      (el as HTMLElement).click();
    });
  }

  function panelButtons(): HTMLButtonElement[] {
    const panel = getPanel();
    if (!panel) return [];
    return [...panel.querySelectorAll('button')];
  }

  it('B1: search input has the honest aria-label and is controlled (typed text stays)', async () => {
    await renderPage();
    const input = getInput();
    expect(input.getAttribute('aria-label')).toBe('Search friends on the map');
    await focusInput();
    await typeQuery('a');
    expect(getInput().value).toBe('a');
  });

  it('B2: typing filters the results panel to the matching friend only', async () => {
    await renderPage();
    await focusInput();
    await typeQuery('ramesh');
    const panel = getPanel();
    expect(panel).not.toBeNull();
    const buttons = panelButtons();
    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent).toContain('rk_92');
    expect(buttons[0].textContent).toContain('Ramesh Kumar');
    expect(panel?.textContent).not.toContain('alina_k');
    expect(panel?.textContent).not.toContain('Sana Sheikh');
  });

  it('B3: focusing with an empty query lists every sharing friend', async () => {
    await renderPage();
    await focusInput();
    const buttons = panelButtons();
    expect(buttons.length).toBe(3);
    const text = getPanel()?.textContent ?? '';
    expect(text).toContain('alina_k');
    expect(text).toContain('rk_92');
    expect(text).toContain('sana');
  });

  it('B4: selecting a result focuses its pin (data-focused + open popup) and closes the panel', async () => {
    await renderPage();
    await focusInput();
    const sanaButton = panelButtons().find((b) => b.textContent?.includes('sana'));
    if (!sanaButton) throw new Error('sana result button not found');
    await click(sanaButton);
    expect(getPanel()).toBeNull();
    const focused = container.querySelectorAll('[data-focused="true"]');
    expect(focused.length).toBe(1);
    expect(focused[0].textContent).toContain('sana');
    const openChat = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Open Chat',
    );
    expect(openChat).toBeTruthy();
  });

  it('B5: no match shows the honest empty state and no result buttons', async () => {
    await renderPage();
    await focusInput();
    await typeQuery('zzzz');
    const panel = getPanel();
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain('No sharing friends match');
    expect(panel?.textContent).toContain("place search isn't available yet");
    expect(panelButtons().length).toBe(0);
  });

  it('B6: when no friends share at all, the panel states the real reason', async () => {
    apiState.friendsPayload = { success: true, data: { friends: [] } };
    await renderPage();
    await focusInput();
    await typeQuery('anyone');
    const panel = getPanel();
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain('No friends are sharing their location right now.');
  });

  it('B7: selecting from the Explore tab switches to Friends and focuses the pin', async () => {
    await renderPage();
    const exploreTab = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Explore',
    );
    if (!exploreTab) throw new Error('Explore tab not found');
    await click(exploreTab);
    // Pins are not rendered on Explore.
    expect(container.querySelectorAll('[data-focused="true"]').length).toBe(0);
    await focusInput();
    await typeQuery('alina');
    const result = panelButtons().find((b) => b.textContent?.includes('alina_k'));
    if (!result) throw new Error('alina result button not found');
    await click(result);
    const focused = container.querySelectorAll('[data-focused="true"]');
    expect(focused.length).toBe(1);
    expect(focused[0].textContent).toContain('alina_k');
  });

  it('B8: clear button resets the query, the pin focus and the panel', async () => {
    await renderPage();
    await focusInput();
    await typeQuery('ali');
    const result = panelButtons().find((b) => b.textContent?.includes('alina_k'));
    if (!result) throw new Error('alina result button not found');
    await click(result);
    expect(container.querySelectorAll('[data-focused="true"]').length).toBe(1);
    const clear = container.querySelector('button[aria-label="Clear search"]');
    if (!clear) throw new Error('clear button not found');
    await click(clear);
    expect(getInput().value).toBe('');
    expect(getPanel()).toBeNull();
    expect(container.querySelectorAll('[data-focused="true"]').length).toBe(0);
  });

  it('B9: placeholder is honest — friends, not locations', async () => {
    await renderPage();
    expect(getInput().getAttribute('placeholder')).toBe('Search friends on the map...');
  });

  it('B10: typing a new query clears a stale pin focus and its popup', async () => {
    await renderPage();
    await focusInput();
    const sanaButton = panelButtons().find((b) => b.textContent?.includes('sana'));
    if (!sanaButton) throw new Error('sana result button not found');
    await click(sanaButton);
    expect(container.querySelectorAll('[data-focused="true"]').length).toBe(1);
    await typeQuery('x');
    expect(container.querySelectorAll('[data-focused="true"]').length).toBe(0);
    const openChat = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Open Chat',
    );
    expect(openChat).toBeUndefined();
  });
});

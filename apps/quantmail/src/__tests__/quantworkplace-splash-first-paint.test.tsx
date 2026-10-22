// @vitest-environment jsdom
// QuantWorkplace splash: the first paint, before and instead of "Authenticating...".
//
// Live behaviour this replaces: every hard load of a signed-in route painted the
// words "Authenticating..." (server-rendered by AuthGuard, because the auth
// provider starts with isLoading = true) for the 2-3s the session refresh takes,
// and only afterwards the shell mounted and QuantumSplashIntro showed a brand
// splash. The splash now IS the loading state:
//
//  - the server-rendered HTML of a guarded route contains the splash and nothing
//    else, so it is what the browser paints before any JavaScript runs;
//  - the browser hydrates that markup without a mismatch and without replacing it;
//  - "Authenticating..." is announced to screen readers once, inside the splash's
//    own live region, and is never drawn;
//  - when the session settles, the app mounts underneath and the SAME splash node
//    fades out (no remount, no animation restart, no flash of a loading state),
//    ignoring pointer events and honouring prefers-reduced-motion;
//  - QuantumSplashIntro does not stack a second splash on top of it, and it is
//    short (no hold of minutes, no gesture needed to dismiss it).
//
// Brand constraints (user): #040508 canvas, exactly five app badges, no extra words.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';

// React 19 act() requires this flag in the jsdom test environment.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const authState = vi.hoisted(() => ({
  isLoading: true,
  isAuthenticated: false,
}));
const navState = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('../providers/auth-provider', () => ({
  useAuth: () => authState,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => navState.pathname,
}));
// Strip the motion props: the intro's cross-fade is not what these tests are about.
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, initial, animate, transition, ...rest }: any) => (
      <div {...rest}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReducedMotion: () => false,
}));

import { AuthGuard } from '../components/AuthGuard';
import { BrandLoader } from '../components/BrandLoader';
import { QuantumSplashIntro } from '../components/QuantumSplashIntro';
import {
  QW_SPLASH_EXIT_MS,
  QuantWorkplaceRevolvingSplash,
} from '../components/workplace/QuantWorkplaceRevolvingSplash';
import {
  __resetSplashSessionForTests,
  hasSplashBeenShown,
  markSplashShown,
} from '../lib/splash-session';

const SPLASH = '[data-testid="qw-splash"]';
const APP_MARKER = 'app-content-marker';
const APP = <div data-marker={APP_MARKER}>app</div>;

/** Words a sighted user can read: everything except the sr-only text and the stylesheet. */
function visibleText(node: Element): string {
  const clone = node.cloneNode(true) as Element;
  clone.querySelectorAll('style, .sr-only').forEach((el) => el.remove());
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function setAuth(isLoading: boolean, isAuthenticated: boolean, pathname = '/') {
  authState.isLoading = isLoading;
  authState.isAuthenticated = isAuthenticated;
  navState.pathname = pathname;
}

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = null;
  __resetSplashSessionForTests();
  setAuth(true, false);
});

afterEach(async () => {
  if (root) {
    const mounted = root;
    await act(async () => {
      mounted.unmount();
    });
  }
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (window as any).matchMedia;
});

describe('server-rendered first paint of a guarded route', () => {
  it('is the splash and nothing else: no Authenticating... loader, no app behind it', () => {
    setAuth(true, false, '/');
    container.innerHTML = renderToString(<AuthGuard>{APP}</AuthGuard>);

    // The splash is the first (and only) thing in the document.
    expect(container.childElementCount).toBe(1);
    expect(container.firstElementChild?.getAttribute('data-testid')).toBe('qw-splash');
    expect(container.innerHTML).not.toContain(APP_MARKER);
    // The old loader (a centred LoadingState with visible text) is gone.
    expect(container.querySelector('[data-testid="loading"]')).toBeNull();
    expect(visibleText(container)).not.toContain('Authenticating');
  });

  it('announces "Authenticating..." once, in the splash live region, without drawing it', () => {
    setAuth(true, false, '/');
    container.innerHTML = renderToString(<AuthGuard>{APP}</AuthGuard>);

    const liveRegions = container.querySelectorAll('[role="status"]');
    expect(liveRegions).toHaveLength(1);
    expect(liveRegions[0].getAttribute('aria-live')).toBe('polite');
    expect(liveRegions[0].getAttribute('aria-busy')).toBe('true');
    const spoken = liveRegions[0].querySelectorAll('.sr-only');
    expect(spoken).toHaveLength(1);
    expect(spoken[0].textContent).toBe('Authenticating...');
  });

  it('applies the same rule on every guarded route, and none on public or unknown routes', () => {
    for (const pathname of ['/', '/calendar', '/drive', '/settings/account']) {
      setAuth(true, false, pathname);
      const html = renderToStaticMarkup(<AuthGuard>{APP}</AuthGuard>);
      expect(html, pathname).toContain('data-testid="qw-splash"');
      expect(html, pathname).not.toContain(APP_MARKER);
    }
    for (const pathname of ['/login', '/register', '/invite/abc123', '/no-such-page-xyz']) {
      setAuth(true, false, pathname);
      const html = renderToStaticMarkup(<AuthGuard>{APP}</AuthGuard>);
      expect(html, pathname).toContain(APP_MARKER);
      expect(html, pathname).not.toContain('qw-splash');
      expect(html, pathname).not.toContain('Authenticating');
    }
  });

  it('keeps the splash up (no blank page) while a signed-out visitor is sent to /login', () => {
    setAuth(false, false, '/calendar');
    const html = renderToStaticMarkup(<AuthGuard>{APP}</AuthGuard>);
    expect(html).toContain('data-testid="qw-splash"');
    expect(html).not.toContain(APP_MARKER);
  });

  it('renders the app, not the splash, for a signed-in visitor once loading is over', () => {
    setAuth(false, true, '/calendar');
    const html = renderToStaticMarkup(<AuthGuard>{APP}</AuthGuard>);
    expect(html).toContain(APP_MARKER);
    expect(html).not.toContain('qw-splash');
  });
});

describe('hydration', () => {
  it('adopts the server-rendered splash: no mismatch, no recoverable error, same DOM node', async () => {
    setAuth(true, false, '/');
    container.innerHTML = renderToString(<AuthGuard>{APP}</AuthGuard>);
    const serverNode = container.querySelector(SPLASH);
    expect(serverNode).not.toBeNull();

    const consoleErrors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(' '));
    });
    const onRecoverableError = vi.fn();

    await act(async () => {
      root = hydrateRoot(container, <AuthGuard>{APP}</AuthGuard>, { onRecoverableError });
    });

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(consoleErrors.filter((line) => /hydrat|did not match|mismatch/i.test(line))).toEqual([]);
    // Hydration reused the server's node instead of client-rendering a new one.
    expect(container.querySelector(SPLASH)).toBe(serverNode);
    expect(container.innerHTML).not.toContain(APP_MARKER);
  });
});

describe('hand-over to the app', () => {
  it('mounts the app under the SAME splash node, fades it, then removes it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    setAuth(true, false, '/');
    root = createRoot(container);
    await act(async () => {
      root!.render(<AuthGuard>{APP}</AuthGuard>);
    });

    const splash = container.querySelector(SPLASH);
    expect(splash).not.toBeNull();
    expect(splash?.hasAttribute('data-leaving')).toBe(false);
    expect(container.innerHTML).not.toContain(APP_MARKER);

    // The session settles signed-in.
    setAuth(false, true, '/');
    await act(async () => {
      root!.render(<AuthGuard>{APP}</AuthGuard>);
    });

    // Same commit: the app is there, and the splash is the very node that was
    // painted before (a remount would restart the revolving animation).
    expect(container.innerHTML).toContain(APP_MARKER);
    expect(container.querySelector(SPLASH)).toBe(splash);
    expect(splash?.getAttribute('data-leaving')).toBe('true');
    // Non-blocking: the fading splash cannot swallow taps meant for the app.
    expect(splash?.className).toContain('pointer-events-none');
    // No loading state at any point of the hand-over.
    expect(container.querySelector('[data-testid="loading"]')).toBeNull();
    expect(visibleText(container)).not.toContain('Authenticating');

    await act(async () => {
      vi.advanceTimersByTime(QW_SPLASH_EXIT_MS + 20);
    });
    expect(container.querySelector(SPLASH)).toBeNull();
    expect(container.innerHTML).toContain(APP_MARKER);
  });

  it('keeps the exit short enough to never feel like a wait', () => {
    expect(QW_SPLASH_EXIT_MS).toBeGreaterThan(0);
    expect(QW_SPLASH_EXIT_MS).toBeLessThanOrEqual(300);
  });

  it('drops the splash immediately when the user prefers reduced motion', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
    setAuth(true, false, '/');
    root = createRoot(container);
    await act(async () => {
      root!.render(<AuthGuard>{APP}</AuthGuard>);
    });
    setAuth(false, true, '/');
    await act(async () => {
      root!.render(<AuthGuard>{APP}</AuthGuard>);
    });
    expect(container.querySelector(SPLASH)).not.toBeNull();

    // A zero-length timer, not QW_SPLASH_EXIT_MS.
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    expect(container.querySelector(SPLASH)).toBeNull();
    expect(container.innerHTML).toContain(APP_MARKER);
  });

  it('does not show a splash at all when the session was already known (soft navigation)', async () => {
    setAuth(false, true, '/calendar');
    root = createRoot(container);
    await act(async () => {
      root!.render(<AuthGuard>{APP}</AuthGuard>);
    });
    expect(container.querySelector(SPLASH)).toBeNull();
    expect(container.innerHTML).toContain(APP_MARKER);
  });
});

describe('the splash itself (brand constraints)', () => {
  it('has the #040508 canvas, exactly five app badges and no extra words', () => {
    container.innerHTML = renderToStaticMarkup(<QuantWorkplaceRevolvingSplash message="Loading" />);
    const splash = container.querySelector(SPLASH)!;

    expect(splash.className).toContain('bg-[#040508]');

    const badges = Array.from(container.querySelectorAll('img[data-qw-badge]'));
    expect(badges.map((b) => b.getAttribute('data-qw-badge')).sort()).toEqual([
      'calendar',
      'contacts',
      'drive',
      'mail',
      'quantgit',
    ]);
    // Static, preloaded twins (layout.tsx preloads exactly these) and decorative.
    for (const badge of badges) {
      expect(badge.getAttribute('src')).toMatch(/^\/mascots\/[a-z]+-sm\.webp$/);
      expect(badge.getAttribute('alt')).toBe('');
    }
    // Five coloured rings, one per badge.
    expect(container.querySelectorAll('circle[stroke-width="5.2"]')).toHaveLength(5);

    // The only words drawn are the brand's own: "by" in text, the wordmarks as images.
    expect(visibleText(splash)).toBe('by');
    const named = Array.from(container.querySelectorAll('img[alt]:not([alt=""])')).map((img) =>
      img.getAttribute('alt'),
    );
    expect(named.sort()).toEqual(['QuantWorkplace', 'quantrinity']);
  });

  it('paints without JavaScript: static images and CSS motion, no canvas', () => {
    container.innerHTML = renderToStaticMarkup(<QuantWorkplaceRevolvingSplash />);
    expect(container.querySelector('canvas')).toBeNull();
    const css = container.querySelector('style')?.textContent ?? '';
    expect(css).toContain('qw-orbit-spin');
    expect(css).toContain('qw-counter-spin');
  });

  it('stops all motion under prefers-reduced-motion', () => {
    container.innerHTML = renderToStaticMarkup(<QuantWorkplaceRevolvingSplash />);
    const css = container.querySelector('style')?.textContent ?? '';
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toContain('.qw-revolving-wheel');
    expect(reduced).toContain('.qw-upright-mascot');
    expect(reduced.match(/animation: none/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('serialises its stylesheet without characters HTML would escape', () => {
    // Server and client must produce the identical <style> text.
    const css = container.appendChild(document.createElement('div'));
    css.innerHTML = renderToStaticMarkup(<QuantWorkplaceRevolvingSplash />);
    const text = css.querySelector('style')?.textContent ?? '';
    expect(text).not.toMatch(/[<>&'"]/);
  });

  it('speaks `message` but only ever draws `hint`', () => {
    container.innerHTML = renderToStaticMarkup(
      <QuantWorkplaceRevolvingSplash message="Spoken only" hint={<p>Taking longer than expected…</p>} />,
    );
    expect(container.querySelector('.sr-only')?.textContent).toBe('Spoken only');
    expect(visibleText(container)).toContain('Taking longer than expected…');
    expect(visibleText(container)).not.toContain('Spoken only');
  });

  it('is what BrandLoader (RouteSplash and route loaders) renders', () => {
    container.innerHTML = renderToStaticMarkup(<BrandLoader />);
    expect(container.querySelector(SPLASH)).not.toBeNull();
    expect(container.querySelector('.sr-only')?.textContent).toBe('Loading QuantWorkplace…');
    expect(visibleText(container)).toBe('by');
  });
});

describe('QuantumSplashIntro does not stack a second splash', () => {
  it('shows the short hold on a fresh session, then leaves without any gesture', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const onComplete = vi.fn();
    root = createRoot(container);
    await act(async () => {
      root!.render(<QuantumSplashIntro onComplete={onComplete} />);
    });
    expect(container.querySelector(SPLASH)).not.toBeNull();
    expect(hasSplashBeenShown()).toBe(true);

    // The hold is a beat, not minutes: gone well inside two seconds, unprompted.
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(container.querySelector(SPLASH)).toBeNull();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('has no double-tap dismissal; a single click dismisses it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const onComplete = vi.fn();
    root = createRoot(container);
    await act(async () => {
      root!.render(<QuantumSplashIntro onComplete={onComplete} />);
    });
    const splash = container.querySelector(SPLASH)!;

    await act(async () => {
      splash.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    expect(container.querySelector(SPLASH)).not.toBeNull();
    expect(onComplete).not.toHaveBeenCalled();

    await act(async () => {
      splash.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector(SPLASH)).toBeNull();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('skips itself when the AuthGuard splash has already been painted', async () => {
    markSplashShown();
    const onComplete = vi.fn();
    root = createRoot(container);
    await act(async () => {
      root!.render(<QuantumSplashIntro onComplete={onComplete} />);
    });
    expect(container.querySelector(SPLASH)).toBeNull();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('remembers the AuthGuard splash even when sessionStorage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(hasSplashBeenShown()).toBe(false);
    markSplashShown();
    expect(hasSplashBeenShown()).toBe(true);

    const onComplete = vi.fn();
    root = createRoot(container);
    await act(async () => {
      root!.render(<QuantumSplashIntro onComplete={onComplete} />);
    });
    expect(container.querySelector(SPLASH)).toBeNull();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('AuthGuard marks the session so the intro that follows it stays silent', async () => {
    setAuth(true, false, '/');
    root = createRoot(container);
    await act(async () => {
      root!.render(<AuthGuard>{APP}</AuthGuard>);
    });
    expect(hasSplashBeenShown()).toBe(true);
  });
});

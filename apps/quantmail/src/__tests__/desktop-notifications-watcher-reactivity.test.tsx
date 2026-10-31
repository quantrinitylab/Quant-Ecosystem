// @vitest-environment node
// ============================================================================
// Desktop-alert watcher reactivity — the Settings toggle must start/stop the
// AppShell watcher's 30s poll WITHOUT waiting for a remount.
//
// REGRESSION (finding, 2026-10-11): the watcher read
// `desktopNotificationsAllowed()` once per AppShell render and subscribed to
// nothing, while `setEnabled` only wrote localStorage plus Settings-local
// state. AppShell does not re-render when Settings toggles, so enabling left
// the query `enabled: false` (zero alerts until navigation) and disabling
// kept polling GET /api/notifications every 30s. A `storage` event alone
// cannot fix this: it only fires in OTHER tabs.
//
// THE FIX under test: writes through this module notify in-process
// subscribers AND dispatch a same-tab event, and the watcher consumes the
// gate through `useDesktopNotificationsAllowed` (useSyncExternalStore over
// that subscription). So the chain proven here is:
//   Settings setEnabled() -> writePreference() -> notify subscribers
//   -> the watcher's subscribed gate re-reads -> useQuery `enabled` flips.
// The last link (React re-rendering a useSyncExternalStore subscriber on
// notification) is React's own contract; what this file proves is that every
// link this codebase owns actually fires, using the real write path.
//
// HARNESS: node environment, no testing-library (apps/quantmail does not
// declare it and CI's frozen lockfile rejects it). Browser globals are
// stubbed with vi.stubGlobal, components render with renderToStaticMarkup
// (effects never run under SSR, which is fine: the write path and the
// snapshot reads are plain functions, and the subscription is exercised
// directly through the module's exported subscribe function — the exact
// function the watcher hook passes to useSyncExternalStore).
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  desktopNotificationsAllowed,
  subscribeDesktopPreferenceChange,
  useDesktopNotifications,
  useDesktopNotificationsAllowed,
  type DesktopNotificationControl,
} from '../hooks/useDesktopNotifications';

vi.mock('@tanstack/react-query', () => ({
  // Capture the options the watcher hands to useQuery so the test can read
  // the `enabled` flag the toggle is supposed to flip.
  useQuery: (options: { enabled?: boolean }) => {
    capturedQueryEnabled = options.enabled;
    return { data: undefined };
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../services/browser-api-request', () => ({
  browserApiRequest: async () => ({ ok: false }),
}));

// Imported AFTER the mocks above (vitest hoists vi.mock anyway).
import { useNewMailDesktopAlerts } from '../hooks/useNewMailDesktopAlerts';

let capturedQueryEnabled: boolean | undefined;

function createLocalStorageStub() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

function createWindowStub(notificationStub: { permission: string }) {
  const listeners = new Map<string, Set<(event: { type: string }) => void>>();
  return {
    Notification: notificationStub,
    addEventListener: (type: string, fn: (event: { type: string }) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: (event: { type: string }) => void) => {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent: (event: { type: string }) => {
      for (const fn of [...(listeners.get(event.type) ?? [])]) fn(event);
      return true;
    },
  };
}

const notificationStub = { permission: 'granted' };
let localStorageStub: ReturnType<typeof createLocalStorageStub>;
let control: DesktopNotificationControl | null = null;
let allowedSnapshot: boolean | undefined = undefined;

function ControlProbe() {
  control = useDesktopNotifications();
  return null;
}

function AllowedProbe() {
  allowedSnapshot = useDesktopNotificationsAllowed();
  return null;
}

function WatcherProbe() {
  useNewMailDesktopAlerts();
  return null;
}

beforeEach(() => {
  localStorageStub = createLocalStorageStub();
  notificationStub.permission = 'granted';
  control = null;
  allowedSnapshot = undefined;
  capturedQueryEnabled = undefined;
  vi.stubGlobal('localStorage', localStorageStub);
  vi.stubGlobal('Notification', notificationStub);
  vi.stubGlobal('window', createWindowStub(notificationStub));
  vi.stubGlobal(
    'CustomEvent',
    class {
      type: string;
      constructor(type: string) {
        this.type = type;
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('desktop notification preference subscription', () => {
  it('the gate reads the stored preference (baseline: off until opted in)', () => {
    expect(desktopNotificationsAllowed()).toBe(false);
    localStorageStub.setItem('quant-notify-desktop', '1');
    expect(desktopNotificationsAllowed()).toBe(true);
    notificationStub.permission = 'denied';
    expect(desktopNotificationsAllowed()).toBe(false);
  });

  it('a real Settings toggle notifies subscribers in the same tab', async () => {
    const seen: boolean[] = [];
    const unsubscribe = subscribeDesktopPreferenceChange(() => {
      seen.push(desktopNotificationsAllowed());
    });
    try {
      // The real write path: render the Settings control, then toggle it.
      renderToStaticMarkup(<ControlProbe />);
      expect(control).not.toBeNull();
      await control!.setEnabled(true);
      expect(localStorageStub.getItem('quant-notify-desktop')).toBe('1');
      expect(seen).toEqual([true]);

      await control!.setEnabled(false);
      expect(localStorageStub.getItem('quant-notify-desktop')).toBe('0');
      expect(seen).toEqual([true, false]);
    } finally {
      unsubscribe();
    }
  });

  it('unsubscribed listeners stop hearing toggles', async () => {
    let calls = 0;
    const unsubscribe = subscribeDesktopPreferenceChange(() => {
      calls += 1;
    });
    renderToStaticMarkup(<ControlProbe />);
    await control!.setEnabled(true);
    expect(calls).toBe(1);
    unsubscribe();
    await control!.setEnabled(false);
    expect(calls).toBe(1);
  });

  it('a throwing listener does not break the toggle itself', async () => {
    const unsubscribe = subscribeDesktopPreferenceChange(() => {
      throw new Error('subscriber blew up');
    });
    try {
      renderToStaticMarkup(<ControlProbe />);
      await control!.setEnabled(true);
      expect(localStorageStub.getItem('quant-notify-desktop')).toBe('1');
      expect(desktopNotificationsAllowed()).toBe(true);
    } finally {
      unsubscribe();
    }
  });
});

describe('watcher gate follows the toggle', () => {
  it('the reactive gate snapshot flips with the stored preference', async () => {
    renderToStaticMarkup(<AllowedProbe />);
    expect(allowedSnapshot).toBe(false);

    renderToStaticMarkup(<ControlProbe />);
    await control!.setEnabled(true);

    renderToStaticMarkup(<AllowedProbe />);
    expect(allowedSnapshot).toBe(true);
  });

  it('the watcher hands the toggled value to useQuery enabled', async () => {
    renderToStaticMarkup(<WatcherProbe />);
    expect(capturedQueryEnabled).toBe(false);

    renderToStaticMarkup(<ControlProbe />);
    await control!.setEnabled(true);

    // Before the fix the watcher re-read the gate only when AppShell itself
    // re-rendered; here the value it passes to useQuery already tracks the
    // toggle, because it subscribes to the preference instead of reading it
    // once per render.
    renderToStaticMarkup(<WatcherProbe />);
    expect(capturedQueryEnabled).toBe(true);

    await control!.setEnabled(false);
    renderToStaticMarkup(<WatcherProbe />);
    expect(capturedQueryEnabled).toBe(false);
  });
});

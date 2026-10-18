// @vitest-environment jsdom
//
// QC-F-467 — web birthday surfaces.
//
// Before this fix there was NO birthday UI anywhere: no banner component,
// no DOB field in the profile form, no birthday row in settings, and the
// /me payload carried no dateOfBirth to render. These tests pin:
//   T4-1 banner: empty list renders NOTHING; one entry shows the real name
//     with an inline SVG (never the cake emoji character); many entries
//     collapse to "X and N others"; tap routes to the real direct thread,
//     or to /new-chat for a close-friend-only entry (no fabricated thread).
//   T4-2 profile: the hub shows the owner's own birthday (year included —
//     it is their own data); the edit form is prefilled from /me, saves a
//     changed date as a 'YYYY-MM-DD' string, and sends null on Clear.
//   T4-3 settings: the "Who can see my birthday" select is bound to the
//     GET value (not write-only) and a change rides the real PUT body.
//
// Harness mirrors qc-f-391-profile-edit (stable module-level mocks; the
// router push spy and the settings fetch are hoisted harnesses, never
// fresh-identity mocks). Negative control: on the pre-fix tree the banner
// and icon modules do not exist (import failure), the profile form has no
// date input, and the settings page has no birthday select — every case
// fails.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const harness = vi.hoisted(() => ({
  push: vi.fn(),
  updateProfile: vi.fn(),
  me: null as Record<string, unknown> | null,
  settingsPayload: null as Record<string, unknown> | null,
  putBodies: [] as Array<Record<string, unknown>>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: harness.push,
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('next/router', () => ({
  useRouter: () => ({ push: harness.push, replace: vi.fn(), back: vi.fn() }),
}));

vi.mock('next/head', () => ({ default: () => null }));

vi.mock('../services/api-client', () => ({
  apiClient: { updateProfile: harness.updateProfile },
}));

vi.mock('../hooks/useMe', () => ({
  useMe: () => ({ me: harness.me, isLoading: false, error: null, refetch: async () => {} }),
}));

vi.mock('@quant/api-client', () => ({
  apiFetchRaw: async (url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === 'PUT') {
      harness.putBodies.push(JSON.parse(init.body ?? '{}') as Record<string, unknown>);
      return { ok: true, status: 200, json: async () => ({ success: true, data: harness.settingsPayload }) };
    }
    void url;
    return { ok: true, status: 200, json: async () => ({ success: true, data: harness.settingsPayload }) };
  },
}));

vi.mock('@quant/common', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('../lib/auth', () => ({
  getAuthHeaders: () => ({}),
  getAuthHeadersWithContent: () => ({ 'Content-Type': 'application/json' }),
}));

vi.mock('../lib/auth-session', () => ({ signOut: async () => {} }));

vi.mock('framer-motion', () => {
  const SAFE = /^(className|id|children|role|onClick|style)$|^(aria-|data-)/;
  const cache = new Map<string, React.ComponentType<Record<string, unknown>>>();
  const make = (tag: string) => {
    let comp = cache.get(tag);
    if (!comp) {
      comp = React.forwardRef(function MotionMock(props: Record<string, unknown>, ref: unknown) {
        const out: Record<string, unknown> = { ref };
        for (const key of Object.keys(props)) {
          if (SAFE.test(key)) out[key] = props[key];
        }
        return React.createElement(tag, out, props.children as React.ReactNode);
      }) as React.ComponentType<Record<string, unknown>>;
      cache.set(tag, comp);
    }
    return comp;
  };
  const motion = new Proxy(
    {},
    { get: (_t, tag: string) => make(typeof tag === 'string' ? tag : 'div') },
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
  };
});

vi.mock('@quant/shared-ui', () => ({
  AppShell: ({
    children,
    topBar,
  }: {
    children?: React.ReactNode;
    topBar?: React.ReactNode;
  }) => React.createElement('div', null, topBar, children),
  TopBar: ({ title }: { title?: string }) => React.createElement('div', null, title),
  BottomNav: () => null,
  LoadingState: () => React.createElement('div', null, 'Loading'),
  ErrorState: () => React.createElement('div', null, 'Error'),
}));

vi.mock('../components/avatar/AlienAvatar', () => ({
  AlienAvatar: () => React.createElement('div', { 'data-testid': 'alien-avatar' }),
}));
vi.mock('../components/profile/LevelProgress', () => ({
  LevelProgress: () => React.createElement('div', { 'data-testid': 'level-progress' }),
}));
vi.mock('../components/profile/AvatarGenerator', () => ({ AvatarGenerator: () => null }));
vi.mock('../components/settings/NotificationSettings', () => ({
  NotificationSettings: () => null,
}));
vi.mock('../lib/navigation', () => ({
  navItems: [],
  routes: {
    stories: '/stories',
    spotlight: '/spotlight',
    memories: '/memories',
    reels: '/reels',
    channels: '/channels',
    profile: '/profile',
  },
}));

import { BirthdayBanner } from '../components/BirthdayBanner';
import ProfilePage from '../app/profile/page';
import { SettingsPage } from '../pages/settings';
import type { BirthdayTodayEntry } from '../types';

let container: HTMLDivElement;
let root: Root;

async function render(node: React.ReactNode) {
  await act(async () => {
    root.render(node);
  });
}

function entry(partial: Partial<BirthdayTodayEntry> & { userId: string }): BirthdayTodayEntry {
  return {
    displayName: partial.userId,
    username: partial.userId,
    avatarUrl: null,
    directConversationId: 'conv_1',
    ...partial,
  };
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function setSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  harness.push.mockClear();
  harness.updateProfile.mockReset();
  harness.updateProfile.mockResolvedValue({ success: true, data: {} });
  harness.putBodies.length = 0;
  harness.me = {
    id: 'user-1',
    username: 'tester',
    displayName: 'Test User',
    bio: '',
    xpPoints: 10,
    level: 1,
    dateOfBirth: '2000-03-12',
  };
  harness.settingsPayload = {
    privacy: {
      whoCanMessage: 'friends',
      whoCanSeeStory: 'friends',
      whoCanSeeLocation: 'friends',
      showOnlineStatus: true,
      showReadReceipts: true,
      showTypingIndicator: true,
      allowScreenshots: false,
      hideFromSearch: false,
      whoCanSeeBirthday: 'nobody',
    },
    notifications: {},
    theme: 'dark',
    language: 'en',
    blockedUsers: [],
  };
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

describe('QC-F-467 T4-1: BirthdayBanner', () => {
  it('renders NOTHING for an empty list', async () => {
    await render(React.createElement(BirthdayBanner, { entries: [] }));
    expect(container.querySelector('[data-testid="birthday-banner"]')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('one entry: real name, inline SVG, never the cake emoji character', async () => {
    await render(
      React.createElement(BirthdayBanner, {
        entries: [entry({ userId: 'u1', displayName: 'Tara' })],
      }),
    );
    const banner = container.querySelector('[data-testid="birthday-banner"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("Today is Tara's birthday");
    expect(banner?.querySelector('svg')).not.toBeNull();
    expect(container.textContent).not.toContain('🎂');
  });

  it('three entries collapse to "first and 2 others"', async () => {
    await render(
      React.createElement(BirthdayBanner, {
        entries: [
          entry({ userId: 'u1', displayName: 'Tara' }),
          entry({ userId: 'u2', displayName: 'Bela' }),
          entry({ userId: 'u3', displayName: 'Cyrus' }),
        ],
      }),
    );
    expect(container.textContent).toContain('Tara and 2 others have birthdays today');
  });

  it('tap opens the real direct thread; close-friend-only goes to /new-chat', async () => {
    await render(
      React.createElement(BirthdayBanner, {
        entries: [entry({ userId: 'u1', displayName: 'Tara', directConversationId: 'conv_9' })],
      }),
    );
    const banner = container.querySelector('[data-testid="birthday-banner"]') as HTMLElement;
    await act(async () => {
      banner.click();
    });
    expect(harness.push).toHaveBeenCalledWith('/chat/conv_9');

    harness.push.mockClear();
    await render(
      React.createElement(BirthdayBanner, {
        entries: [entry({ userId: 'u2', displayName: 'Bela', directConversationId: null })],
      }),
    );
    const banner2 = container.querySelector('[data-testid="birthday-banner"]') as HTMLElement;
    await act(async () => {
      banner2.click();
    });
    expect(harness.push).toHaveBeenCalledWith('/new-chat');
  });
});

describe('QC-F-467 T4-2: profile birthday', () => {
  async function openEditPanel() {
    await render(React.createElement(ProfilePage));
    const tile = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Edit profile'),
    );
    expect(tile).toBeTruthy();
    await act(async () => {
      tile!.click();
    });
  }

  it('hub shows the owner their own birthday with the year', async () => {
    await render(React.createElement(ProfilePage));
    expect(container.textContent).toContain('Birthday: 12 March 2000');
  });

  it('edit form is prefilled and saves a changed date as a string', async () => {
    await openEditPanel();
    const input = container.querySelector('#profile-dob') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('2000-03-12');
    expect(input.max).toBeTruthy();
    await act(async () => {
      setInputValue(input, '1999-07-04');
    });
    const save = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Save changes',
    );
    await act(async () => {
      save!.click();
    });
    expect(harness.updateProfile).toHaveBeenCalledTimes(1);
    const payload = harness.updateProfile.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload['dateOfBirth']).toBe('1999-07-04');
  });

  it('Clear sends null so the backend actually clears the column', async () => {
    await openEditPanel();
    const clear = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Clear',
    );
    expect(clear).toBeTruthy();
    await act(async () => {
      clear!.click();
    });
    const save = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Save changes',
    );
    await act(async () => {
      save!.click();
    });
    const payload = harness.updateProfile.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toHaveProperty('dateOfBirth', null);
  });
});

describe('QC-F-467 T4-3: settings birthday visibility', () => {
  it('select is bound to the GET value and a change rides the PUT body', async () => {
    await render(React.createElement(SettingsPage));
    // Let the mount fetch resolve and state settle.
    await act(async () => {});
    const label = [...container.querySelectorAll('label')].find(
      (l) => l.textContent === 'Who can see my birthday',
    );
    expect(label).toBeTruthy();
    const select = container.querySelector(
      `#${label!.getAttribute('for')}`,
    ) as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(select.value).toBe('nobody'); // the GET value, not the default

    await act(async () => {
      setSelectValue(select, 'everyone');
    });
    const save = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Save',
    );
    await act(async () => {
      save!.click();
    });
    expect(harness.putBodies.length).toBe(1);
    const privacy = harness.putBodies[0]?.['privacy'] as Record<string, unknown>;
    expect(privacy['whoCanSeeBirthday']).toBe('everyone');
  });
});

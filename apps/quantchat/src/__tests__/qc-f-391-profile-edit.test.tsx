// @vitest-environment jsdom
//
// QC-F-391 — Web profile edit: clearing the BIO was impossible. EditProfileForm
// built its payload with `bio: bio.trim() || undefined`, so a cleared bio was
// dropped from the JSON body, the backend's real clear path (`bio: ''` is a
// valid write) was never used, and the UI still said 'Saved ✓' while the
// refetch resurrected the old bio. The same drop silently discarded a cleared
// display name, and success/failure shared one grey, role-less <p>, so a raw
// backend 400 read exactly like a success. The Edit-profile tile also promised
// 'Name, bio and photo' although the form has no photo field.
//
// Fix (page only — backend, api-client and proxy already pass '' through):
//   * an emptied display name is rejected locally BEFORE the API call with
//     'Display name cannot be empty.' (the backend schema is min(1));
//   * a cleared bio (there was one, now empty — trim-based, so spaces-only
//     counts) is sent as `bio: ''`; a bio that was already empty still sends
//     `undefined` (no fake clear);
//   * the save message is a typed { kind, text }: success renders
//     role="status" + emerald, failure role="alert" + red;
//   * the tile copy is 'Name and bio'.
//
// Harness (brief §6.1, F-077/F-317 parampara — stable module-level mocks):
// `apiClient.updateProfile` is a counting mock and `useMe` is an external
// store. The pair simulates the backend's firsthand contract, not a fantasy
// server: updateProfile stages exactly what PUT /auth/profile would persist
// (zod-trimmed; a key with value `undefined` never reaches the handler —
// JSON.stringify drops it — so that field stays unchanged), and `refetch`
// (GET /auth/me) is the only moment the page's `me` advances to that staged
// truth. T391-02's "the old bio is gone" is therefore a property of the real
// mechanism, not of a mock's whim.
//
// Negative control (brief §6.3): on the pre-fix page T391-01, 02, 04, 05, 06,
// 08, 09, 10 FAIL at runtime (payload drops the clear / API is called with no
// local guard / message has no role / old tile copy). T391-03, 07, 11 are
// raksha controls — they PASS pre- and post-fix (what already worked must
// keep working), so they assert the payload and the 'Saved ✓' text, not the
// new role/class dressing (that dressing is pinned by T391-02/09).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface MeShape {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  xpPoints: number;
  level: number;
}

const harness = vi.hoisted(() => ({
  serverMe: null as MeShape | null,
  clientMe: null as MeShape | null,
  listeners: new Set<() => void>(),
  updateProfile: vi.fn(),
}));

vi.mock('../services/api-client', () => ({
  apiClient: { updateProfile: harness.updateProfile },
}));

vi.mock('../hooks/useMe', () => ({
  useMe: () => {
    const me = React.useSyncExternalStore(
      (cb: () => void) => {
        harness.listeners.add(cb);
        return () => {
          harness.listeners.delete(cb);
        };
      },
      () => harness.clientMe,
      () => harness.clientMe,
    );
    return {
      me,
      isLoading: false,
      error: null,
      refetch: async () => {
        harness.clientMe = harness.serverMe ? { ...harness.serverMe } : null;
        harness.listeners.forEach((cb) => cb());
      },
    };
  },
}));

vi.mock('framer-motion', () => {
  const SAFE = /^(className|id|children|role|onClick|style)$|^(aria-|data-)/;
  // Component identities MUST be cached per tag: a fresh component type on
  // every render makes React remount the subtree, wiping the form's state
  // (the stable-mock rule). The real framer-motion has stable identities.
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
  // QC-F-050: the profile page now mounts the ecosystem app switcher for real;
  // stub it so this suite keeps pinning bio-edit behaviour, not the switcher.
  UniversalAppSwitcher: () => null,
}));

vi.mock('../components/avatar/AlienAvatar', () => ({
  AlienAvatar: () => React.createElement('div', { 'data-testid': 'alien-avatar' }),
}));
vi.mock('../components/profile/LevelProgress', () => ({
  LevelProgress: () => React.createElement('div', { 'data-testid': 'level-progress' }),
}));
vi.mock('../components/profile/AvatarGenerator', () => ({
  AvatarGenerator: () => null,
}));
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

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Imported after mocks are registered.
import ProfilePage from '../app/profile/page';

const BASE_ME: MeShape = {
  id: 'user-1',
  username: 'tester',
  displayName: 'Test User',
  bio: 'Hello world',
  xpPoints: 120,
  level: 1,
};

function seedMe(overrides: Partial<MeShape> = {}) {
  harness.serverMe = { ...BASE_ME, ...overrides };
  harness.clientMe = { ...harness.serverMe };
}

let container: HTMLDivElement;
let root: Root;

async function renderPage() {
  await act(async () => {
    root.render(React.createElement(ProfilePage));
  });
}

function editTile(): HTMLButtonElement {
  const btn = [...container.querySelectorAll('button')].find((b) =>
    b.textContent?.includes('Edit profile'),
  );
  if (!btn) throw new Error('Edit profile tile not rendered');
  return btn as HTMLButtonElement;
}

async function clickEl(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
}

async function openForm() {
  await clickEl(editTile());
  if (!nameInput() || !bioInput()) throw new Error('Edit form did not open');
}

function nameInput(): HTMLInputElement | null {
  return container.querySelector('input[placeholder="Your display name"]');
}

function bioInput(): HTMLTextAreaElement | null {
  return container.querySelector('textarea[placeholder="A line about you…"]');
}

async function setField(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  await act(async () => {
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function clickSave() {
  const btn = [...container.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === 'Save changes',
  );
  if (!btn) throw new Error('Save changes button not rendered');
  await clickEl(btn as HTMLButtonElement);
}

function statusEl(): HTMLElement | null {
  return container.querySelector('[role="status"]');
}

function alertEl(): HTMLElement | null {
  return container.querySelector('[role="alert"]');
}

function lastPayload(): Record<string, unknown> {
  const calls = harness.updateProfile.mock.calls;
  return calls[calls.length - 1][0] as Record<string, unknown>;
}

beforeEach(() => {
  harness.serverMe = null;
  harness.clientMe = null;
  harness.listeners.clear();
  harness.updateProfile.mockReset();
  // Default: the backend contract of PUT /auth/profile (routes/auth.ts) —
  // defined keys are written (zod-trimmed), undefined keys never arrive.
  harness.updateProfile.mockImplementation(async (data: Record<string, unknown>) => {
    const next = { ...(harness.serverMe as MeShape) };
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        (next as unknown as Record<string, unknown>)[key] =
          typeof value === 'string' ? value.trim() : value;
      }
    }
    harness.serverMe = next;
    return { success: true, data: next };
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

describe('QC-F-391: profile edit — bio clear, honest save outcomes', () => {
  it('T391-01: clearing the bio sends bio:"" in the payload (the key exists, value is the empty string)', async () => {
    seedMe();
    await renderPage();
    await openForm();
    await setField(bioInput()!, '');
    await clickSave();

    expect(harness.updateProfile).toHaveBeenCalledTimes(1);
    const payload = lastPayload();
    expect('bio' in payload).toBe(true);
    expect(payload.bio).toBe('');
    expect(payload.displayName).toBe('Test User');
  });

  it('T391-02: after the clear + refetch the header no longer shows the old bio, and Saved ✓ is a status', async () => {
    seedMe();
    await renderPage();
    expect(container.textContent).toContain('Hello world');
    await openForm();
    await setField(bioInput()!, '');
    await clickSave();

    expect(container.textContent).not.toContain('Hello world');
    expect(statusEl()?.textContent).toBe('Saved ✓');
    expect(alertEl()).toBeNull();
  });

  it('T391-03 (control): typing a new bio sends the new value and saves', async () => {
    seedMe();
    await renderPage();
    await openForm();
    await setField(bioInput()!, 'New line');
    await clickSave();

    expect(harness.updateProfile).toHaveBeenCalledTimes(1);
    expect(lastPayload().bio).toBe('New line');
    expect(container.textContent).toContain('Saved ✓');
    expect(container.textContent).toContain('New line');
  });

  it('T391-04: a spaces-only bio is a clear (trim-based) — payload carries bio:""', async () => {
    seedMe();
    await renderPage();
    await openForm();
    await setField(bioInput()!, '   ');
    await clickSave();

    expect(harness.updateProfile).toHaveBeenCalledTimes(1);
    expect(lastPayload().bio).toBe('');
    expect(container.textContent).not.toContain('Hello world');
  });

  it('T391-05: clearing BOTH fields never calls the API — local alert, no raw backend sentence', async () => {
    seedMe();
    await renderPage();
    await openForm();
    await setField(nameInput()!, '');
    await setField(bioInput()!, '');
    await clickSave();

    expect(harness.updateProfile).not.toHaveBeenCalled();
    expect(alertEl()?.textContent).toBe('Display name cannot be empty.');
    expect(container.textContent).not.toContain(
      'At least one of displayName, bio, avatarUrl is required',
    );
    expect(statusEl()).toBeNull();
  });

  it('T391-06: clearing only the name (bio present) is also stopped locally — no silent discard, no fake Saved ✓', async () => {
    seedMe();
    await renderPage();
    await openForm();
    await setField(nameInput()!, '');
    await setField(bioInput()!, 'Some bio');
    await clickSave();

    expect(harness.updateProfile).not.toHaveBeenCalled();
    expect(alertEl()?.textContent).toBe('Display name cannot be empty.');
    expect(container.textContent).not.toContain('Saved ✓');
  });

  it('T391-07 (control): changing the name sends the new name and saves', async () => {
    seedMe();
    await renderPage();
    await openForm();
    await setField(nameInput()!, 'New Name');
    await clickSave();

    expect(harness.updateProfile).toHaveBeenCalledTimes(1);
    expect(lastPayload().displayName).toBe('New Name');
    expect(container.textContent).toContain('Saved ✓');
  });

  it('T391-08: a failed save shows the real reason as a red alert — never Saved ✓', async () => {
    seedMe();
    harness.updateProfile.mockReset();
    harness.updateProfile.mockResolvedValue({
      success: false,
      error: { message: 'Profile update failed' },
    });
    await renderPage();
    await openForm();
    await setField(bioInput()!, 'New line');
    await clickSave();

    const alert = alertEl();
    expect(alert?.textContent).toBe('Profile update failed');
    expect(alert?.className).toContain('text-red-400');
    expect(container.textContent).not.toContain('Saved ✓');
    expect(statusEl()).toBeNull();
  });

  it('T391-09: a successful save is a status in emerald — and no alert exists', async () => {
    seedMe();
    await renderPage();
    await openForm();
    await setField(bioInput()!, 'Another bio');
    await clickSave();

    const status = statusEl();
    expect(status?.textContent).toBe('Saved ✓');
    expect(status?.className).toContain('text-emerald-400');
    expect(alertEl()).toBeNull();
  });

  it("T391-10: the Edit-profile tile tells the truth — 'Name and bio', no photo promise", async () => {
    seedMe();
    await renderPage();

    const tile = editTile();
    expect(tile.textContent).toContain('Name and bio');
    expect(tile.textContent).not.toContain('Name, bio and photo');
  });

  it('T391-11 (control): a bio that was already empty sends bio:undefined — no fake clear', async () => {
    seedMe({ bio: '' });
    await renderPage();
    await openForm();
    await clickSave();

    expect(harness.updateProfile).toHaveBeenCalledTimes(1);
    const payload = lastPayload();
    expect(payload.bio).toBeUndefined();
    expect(payload.displayName).toBe('Test User');
    expect(container.textContent).toContain('Saved ✓');
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const authState = vi.hoisted(() => ({
  isAuthenticated: true,
  isLoading: false,
  logout: vi.fn(),
}));

vi.mock('../../../providers/auth-provider', () => ({
  useAuth: () => ({
    isAuthenticated: authState.isAuthenticated,
    isLoading: authState.isLoading,
    error: null,
    login: vi.fn(),
    logout: authState.logout,
  }),
}));

const routerMocks = vi.hoisted(() => ({
  back: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => routerMocks,
  usePathname: () => '/settings',
  useSearchParams: () => new URLSearchParams(),
}));

import SettingsPage from '../page';

const ALL_ROWS = [
  'settings-row-app-lock',
  'settings-row-default-assistant',
  'settings-row-add-to-home',
  'settings-row-referral',
  'settings-row-data-controls',
  'settings-row-report',
  'settings-row-help',
  'settings-row-legal',
  'settings-row-account',
  'settings-row-logout',
];

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderPage() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<SettingsPage />);
  });
  return container!;
}

async function clickTestId(el: HTMLElement, testId: string) {
  const target = el.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
  expect(target, `expected [data-testid="${testId}"] to exist`).not.toBeNull();
  await act(async () => {
    target!.click();
  });
}

beforeEach(() => {
  authState.isAuthenticated = true;
  authState.isLoading = false;
  authState.logout.mockReset();
  routerMocks.back.mockReset();
  routerMocks.replace.mockReset();
  routerMocks.push.mockReset();
  window.localStorage.clear();
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container?.remove();
  container = null;
});

describe('Quanty Settings screen', () => {
  it('renders all 10 Muse-parity rows', async () => {
    const el = await renderPage();
    for (const testId of ALL_ROWS) {
      expect(el.querySelector(`[data-testid="${testId}"]`), testId).not.toBeNull();
    }
  });

  it('groups rows into cards like the Muse app', async () => {
    const el = await renderPage();
    expect(el.querySelector('[data-testid="settings-card-device"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="settings-card-referral"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="settings-card-support"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="settings-card-account"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="settings-card-logout"]')).not.toBeNull();
  });

  it('marks the referral row honestly (program not live)', async () => {
    const el = await renderPage();
    const row = el.querySelector('[data-testid="settings-row-referral"]');
    expect(row?.textContent).toMatch(/Soon/);
  });

  it('styles Log out as destructive red', async () => {
    const el = await renderPage();
    const row = el.querySelector('[data-testid="settings-row-logout"]');
    expect(row?.querySelector('.text-red-400')).not.toBeNull();
  });

  it('opens the app-lock sheet when its row is tapped', async () => {
    const el = await renderPage();
    await clickTestId(el, 'settings-row-app-lock');
    expect(el.querySelector('[data-testid="app-lock-sheet"]')).not.toBeNull();
  });

  it('opens the referral sheet when its row is tapped', async () => {
    const el = await renderPage();
    await clickTestId(el, 'settings-row-referral');
    expect(el.querySelector('[data-testid="referral-sheet"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="referral-input"]')).not.toBeNull();
  });

  it('opens the data-controls sheet when its row is tapped', async () => {
    const el = await renderPage();
    await clickTestId(el, 'settings-row-data-controls');
    expect(el.querySelector('[data-testid="data-controls-sheet"]')).not.toBeNull();
  });

  it('logs out for real: confirm calls logout() and routes to /login', async () => {
    const el = await renderPage();
    await clickTestId(el, 'settings-row-logout');
    expect(el.querySelector('[data-testid="logout-sheet"]')).not.toBeNull();
    await clickTestId(el, 'logout-confirm');
    expect(authState.logout).toHaveBeenCalledTimes(1);
    expect(routerMocks.replace).toHaveBeenCalledWith('/login');
  });

  it('shows a sign-in gate when unauthenticated instead of dead rows', async () => {
    authState.isAuthenticated = false;
    const el = await renderPage();
    expect(el.querySelector('[data-testid="settings-signin"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="settings-row-logout"]')).toBeNull();
  });
});

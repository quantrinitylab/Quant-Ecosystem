// @vitest-environment jsdom
//
// QC-F-296 — settings page `calls` section pins
// (specialist-qc-f-296-buildprep.md §8: NC-296-13 + HG-296-2 copy rule).
//
// Before this fix the settings page had no 'calls' section at all
// (SECTIONS was a closed list without it), so the low-data preference
// had no surface. Pins: the section exists, its toggle starts from the
// server's real value, toggling PUTs ONLY the {calls:{lowDataMode}}
// patch (the backend deep-merges), a failed save reverts the toggle
// and shows the real error (never a fake saved state), and the
// explainer carries NO data-saving number/percentage anywhere
// (HG-296-2: caps are declared, savings are not measured).
//
// Api mocks are module-level hoisted objects with stable identities.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  apiFetchRaw: vi.fn(),
}));

vi.mock('@quant/api-client', () => ({
  apiFetchRaw: apiMocks.apiFetchRaw,
}));

vi.mock('@quant/common', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../lib/auth', () => ({
  getAuthHeaders: () => ({}),
  getAuthHeadersWithContent: () => ({ 'Content-Type': 'application/json' }),
}));

vi.mock('../lib/auth-session', () => ({
  signOut: vi.fn(async () => undefined),
}));

vi.mock('next/head', () => ({
  default: () => null,
}));

vi.mock('next/router', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

import { SettingsPage } from '../pages/settings';

function fakeResponse(ok: boolean, status: number, body: unknown) {
  return {
    ok,
    status,
    json: async () => body,
    blob: async () => new Blob([]),
  };
}

const FULL_SETTINGS = {
  privacy: {
    whoCanMessage: 'friends',
    whoCanSeeStory: 'friends',
    whoCanSeeLocation: 'friends',
    showOnlineStatus: true,
    showReadReceipts: true,
    showTypingIndicator: true,
    allowScreenshots: false,
    hideFromSearch: false,
  },
  notifications: {
    messages: true,
    stories: true,
    friendRequests: true,
    mentions: true,
    groupInvites: true,
    streakReminders: true,
    spotlight: true,
    sound: true,
    vibrate: true,
    preview: true,
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00',
  },
  calls: { lowDataMode: true },
  theme: 'dark',
  language: 'en',
  blockedUsers: [],
};

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('SettingsPage calls section (QC-F-296)', () => {
  let container: HTMLDivElement;
  let root: Root;
  let putResponse: ReturnType<typeof fakeResponse>;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    putResponse = fakeResponse(true, 200, { success: true, data: FULL_SETTINGS });
    apiMocks.apiFetchRaw.mockImplementation(
      async (_url: string, init?: { method?: string }) => {
        if (init?.method === 'PUT') return putResponse;
        return fakeResponse(true, 200, { success: true, data: FULL_SETTINGS });
      },
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderAndOpenCalls() {
    await act(async () => {
      root.render(<SettingsPage />);
      await flushPromises();
      await flushPromises();
    });
    const navBtn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent?.trim().toLowerCase() === 'calls',
    ) as HTMLButtonElement | undefined;
    expect(navBtn, 'calls section nav button').toBeTruthy();
    await act(async () => {
      navBtn!.click();
      await flushPromises();
    });
  }

  function lowDataCheckbox(): HTMLInputElement {
    const label = [...container.querySelectorAll('label')].find((l) =>
      l.textContent?.includes('Use less data for calls'),
    );
    expect(label, 'low-data ToggleRow').toBeTruthy();
    const input = label!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    return input;
  }

  it('NC-296-13: section exists, toggle starts from the server value, explainer has no saving number', async () => {
    await renderAndOpenCalls();
    const checkbox = lowDataCheckbox();
    expect(checkbox.checked).toBe(true);
    const section = checkbox.closest('section');
    expect(section?.textContent).toContain(
      'Calls send and receive video in lower quality, so they use less data.',
    );
    // HG-296-2: no MB figure, no percentage, no "saved" claim in the section.
    expect(section?.textContent).not.toMatch(/\d+\s*(MB|GB|%)/);
    expect(section?.textContent).not.toMatch(/sav(e|es|ed|ing)/i);
  });

  it('NC-296-13: toggling PUTs exactly {calls:{lowDataMode}} and nothing else', async () => {
    await renderAndOpenCalls();
    const checkbox = lowDataCheckbox();
    await act(async () => {
      checkbox.click();
      await flushPromises();
      await flushPromises();
    });
    const putCalls = apiMocks.apiFetchRaw.mock.calls.filter(
      (c) => (c[1] as { method?: string } | undefined)?.method === 'PUT',
    );
    expect(putCalls).toHaveLength(1);
    const body = JSON.parse((putCalls[0][1] as { body: string }).body) as unknown;
    expect(body).toEqual({ calls: { lowDataMode: false } });
    expect(checkbox.checked).toBe(false);
  });

  it('save failure reverts the toggle and shows the real error (no fake saved state)', async () => {
    putResponse = fakeResponse(false, 500, {
      success: false,
      error: { message: 'Server unavailable' },
    });
    await renderAndOpenCalls();
    const checkbox = lowDataCheckbox();
    expect(checkbox.checked).toBe(true);
    await act(async () => {
      checkbox.click();
      await flushPromises();
      await flushPromises();
    });
    expect(checkbox.checked).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Server unavailable',
    );
  });
});

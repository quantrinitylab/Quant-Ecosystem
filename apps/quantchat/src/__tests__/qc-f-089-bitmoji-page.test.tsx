// @vitest-environment jsdom
// ============================================================================
// QuantChat — /bitmoji page data layer (QC-F-089)
//
// The page's load and save endpoints were phantoms: load silently swallowed
// every failure and always opened on defaults, and Save always failed.
// These tests pin the honest behaviour against the real envelope
// ({ success, data: { config, updatedAt } }): a saved config is applied on
// load, "no saved config yet" (config: null) is not an error, a failed
// load is surfaced instead of swallowed, and "Avatar saved" appears only
// when the server confirms success.
//
// Api mocks are module-level hoisted objects with stable identities.
// ============================================================================
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

vi.mock('next/head', () => ({
  default: () => null,
}));

import { BitmojiPage } from '../pages/bitmoji';

function fakeResponse(ok: boolean, status: number, body: unknown) {
  return { ok, status, json: async () => body };
}

const SAVED_CONFIG = {
  faceShape: 'oval',
  skinTone: '#FFDBB4',
  hairStyle: 'curly',
  hairColor: '#FF4500',
  eyeShape: 'almond',
  eyeColor: '#634E34',
  noseShape: 'small',
  mouthShape: 'smile',
  eyebrowShape: 'natural',
  facialHair: 'none',
  outfit: 'casual_tee',
  outfitColor: '#000000',
  accessories: [] as string[],
  background: '#FFFC00',
};

let loadResponse: ReturnType<typeof fakeResponse>;
let saveResponse: ReturnType<typeof fakeResponse>;
let container: HTMLDivElement;
let root: Root;

async function renderPage() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<BitmojiPage />);
  });
}

// QC-F-002 fast-follow: the preview is SVG geometry now (the old bare
// .hair div is gone); hair colour lives on the SVG path's fill attribute.
function hairColor(): string {
  const hair = container.querySelector('[data-testid="avatar-hair"]');
  if (!hair) throw new Error('hair preview not rendered');
  return hair.getAttribute('fill') ?? '';
}

function saveButton(): HTMLButtonElement {
  const btn = [...container.querySelectorAll('button')].find(
    (b) => b.textContent === 'Save Avatar' || b.textContent === 'Saving...',
  );
  if (!btn) throw new Error('save button not rendered');
  return btn as HTMLButtonElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  loadResponse = fakeResponse(true, 200, {
    success: true,
    data: { config: null, updatedAt: null },
  });
  saveResponse = fakeResponse(true, 201, {
    success: true,
    data: { config: SAVED_CONFIG, updatedAt: '2026-02-01T00:00:00.000Z' },
  });
  apiMocks.apiFetchRaw.mockImplementation(async (url: string) =>
    url.includes('/api/bitmoji/save') ? saveResponse : loadResponse,
  );
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

describe('Bitmoji page (QC-F-089)', () => {
  it('applies the saved config returned by the server on load', async () => {
    loadResponse = fakeResponse(true, 200, {
      success: true,
      data: { config: SAVED_CONFIG, updatedAt: '2026-02-01T00:00:00.000Z' },
    });
    await renderPage();
    // Default hair is #2C1B18; the saved #FF4500 proves the load was applied.
    expect(hairColor()).toBe('#FF4500');
    expect(container.textContent).not.toContain('Could not load your saved avatar');
  });

  it('config: null means "never saved" — defaults, and no error is shown', async () => {
    await renderPage();
    expect(hairColor()).toBe('#2C1B18'); // default
    expect(container.textContent).not.toContain('Could not load your saved avatar');
    expect(saveButton().disabled).toBe(false);
  });

  it('a failed load is surfaced honestly, not swallowed into silent defaults', async () => {
    loadResponse = fakeResponse(false, 503, {
      success: false,
      error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable', statusCode: 503 },
    });
    await renderPage();
    expect(container.textContent).toContain('Could not load your saved avatar');
  });

  it('shows "Avatar saved" only after the server confirms the save', async () => {
    await renderPage();
    await act(async () => {
      saveButton().click();
    });
    expect(apiMocks.apiFetchRaw).toHaveBeenCalledWith(
      '/api/bitmoji/save',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(container.textContent).toContain('Avatar saved');
  });

  it('a failed save shows the server message and never claims success', async () => {
    saveResponse = fakeResponse(false, 503, {
      success: false,
      error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable', statusCode: 503 },
    });
    await renderPage();
    await act(async () => {
      saveButton().click();
    });
    expect(container.textContent).toContain('Database unavailable');
    expect(container.textContent).not.toContain('Avatar saved');
  });
});

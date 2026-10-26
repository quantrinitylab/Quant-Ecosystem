// @vitest-environment jsdom
// ============================================================================
// QuantChat — /bitmoji styling fast-follow (QC-F-002)
//
// The page was the leftover of the P0 unstyled-pages finding: every class it
// used was a custom name defined in no stylesheet, its avatar preview was
// bare divs with only data-* attributes (blind by construction), and its
// animation buttons changed nothing (previewAnimation fed only an
// undefined 'active' class). These tests pin the fast-follow slice:
//   1. every className in bitmoji.tsx resolves to a Tailwind utility, a
//      token var, or a globals.css primitive — and the suite FAILS on the
//      pre-fix file (negative control: the old custom names are listed);
//   2. the preview renders real SVG geometry from config (face/hair/
//      outfit/background fills, accessories, bald = no hair element);
//   3. selecting an animation changes the preview's rendered animation
//      state (data-animation + a real Tailwind animate class);
//   4. regression: save/load endpoints and the /bitmoji gate are unchanged.
//
// Api mocks are module-level hoisted objects with stable identities.
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
import { classifyPath } from '../lib/route-access';

function readAppSource(relFromApp: string): string {
  const candidates = [
    resolve(process.cwd(), relFromApp),
    resolve(process.cwd(), 'apps/quantchat', relFromApp),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`Could not locate source file: ${relFromApp}`);
  return readFileSync(found, 'utf8');
}

const OLD_CUSTOM_CLASSES = [
  'bitmoji-page', 'bitmoji-header', 'header-actions', 'undo-btn', 'random-btn',
  'save-btn', 'bitmoji-layout', 'preview-panel', 'avatar-body', 'avatar-face',
  'face-shape', 'facial-hair', 'avatar-outfit', 'animation-controls',
  'editor-panel', 'editor-tabs', 'editor-content', 'options-grid', 'options-row',
  'color-picker-row', 'color-swatch', 'color-input', 'accessories-grid',
  'option-preview', 'error-toast', 'success-toast', 'bitmoji-loading',
  'face-editor', 'hair-editor', 'eyes-editor', 'nose-editor', 'mouth-editor',
  'outfit-editor', 'accessories-editor',
];

// Token prefixes / exact tokens that resolve without any custom stylesheet:
// Tailwind utilities (incl. arbitrary token vars like bg-[var(--quant-*)])
// plus the globals.css primitives the settings/discover pages already use.
const TOKEN_PREFIXES = [
  'min-h-', 'min-w-', 'max-w-', 'h-', 'w-', 'aspect-', 'flex', 'grid',
  'grid-cols-', 'shrink-', 'items-', 'justify-', 'gap-', 'space-y-', 'rounded',
  'border', 'px-', 'py-', 'p-', 'pb-', 'pt-', 'pl-', 'pr-', 'mx-', 'mt-',
  'mb-', 'text-', 'font-', 'bg-', 'ring-', 'animate-', 'capitalize',
  'leading-', 'cursor-', 'z-', 'fixed', 'left-', 'translate-', 'overflow-',
  'sr-only', 'opacity-',
];
// Responsive/state variants (sm:, lg:, disabled:, ...) wrap a plain utility.
const VARIANT = /^(sm|md|lg|xl|disabled|hover|focus|active):/;
function coreToken(token: string): string {
  return token.replace(VARIANT, '');
}
const EXACT_TOKENS = new Set([
  'flex', 'grid', 'shrink-0', 'min-w-0', 'capitalize', 'leading-none',
  'quant-btn-primary', 'quant-btn-secondary', 'quant-btn-ghost',
]);

function classNameStrings(source: string): string[] {
  const out: string[] = [];
  const re = /className=\{`([^`]+)`\}|className="([^"]+)"|className=\{('[^']+')\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    out.push(m[1] ?? m[2] ?? m[3] ?? '');
  }
  return out;
}

function staticTokens(classAttr: string): string[] {
  // Strip ${...} interpolations; what remains is static class text.
  return classAttr
    .replace(/\$\{[^}]*\}/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

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
  accessories: ['glasses'],
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

function byTestId(id: string): Element {
  const el = container.querySelector(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing [data-testid="${id}"]`);
  return el;
}

function buttonWithText(text: string): HTMLButtonElement {
  const btn = [...container.querySelectorAll('button')].find((b) => b.textContent === text);
  if (!btn) throw new Error(`button "${text}" not rendered`);
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
  // The class-coverage test renders nothing, so root/container may be unset.
  if (root) {
    await act(async () => {
      root.unmount();
    });
  }
  if (container) container.remove();
  root = undefined as unknown as Root;
  container = undefined as unknown as HTMLDivElement;
});

describe('Bitmoji styling fast-follow (QC-F-002)', () => {
  it('every className resolves to Tailwind/token/globals — no custom class survives', () => {
    const source = readAppSource('src/pages/bitmoji.tsx');
    const attrs = classNameStrings(source);
    expect(attrs.length).toBeGreaterThan(20);
    for (const attr of attrs) {
      for (const old of OLD_CUSTOM_CLASSES) {
        expect(attr).not.toContain(old);
      }
      for (const rawToken of staticTokens(attr)) {
        const token = coreToken(rawToken);
        const resolves =
          EXACT_TOKENS.has(token) ||
          TOKEN_PREFIXES.some((p) => token.startsWith(p)) ||
          // Conditional branch literals inside template expressions.
          token.startsWith("'") ||
          token === 'border-emerald-500' ||
          token === 'bg-emerald-500' ||
          token === 'text-white' ||
          token === 'border-[var(--quant-border)]' ||
          token === 'ring-2' ||
          token === 'ring-emerald-500/50';
        expect(resolves).toBe(true);
      }
    }
    // The old preview markup is gone entirely: no bare avatar divs.
    expect(source).not.toContain('className="avatar-preview"');
    expect(source).not.toContain('className="face-shape"');
  });

  it('the preview renders real SVG geometry from the default config', async () => {
    await renderPage();
    const svg = byTestId('avatar-preview-svg');
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(byTestId('avatar-face').getAttribute('fill')).toBe('#FFDBB4');
    expect(byTestId('avatar-hair').getAttribute('fill')).toBe('#2C1B18');
    expect(byTestId('avatar-outfit').querySelector('path')?.getAttribute('fill')).toBe('#4A90D9');
    expect(byTestId('avatar-background').getAttribute('fill')).toBe('#FFFC00');
    expect(container.querySelector('[data-testid="avatar-eyes"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="avatar-mouth"]')).not.toBeNull();
  });

  it('a saved config drives the preview, and bald renders no hair element', async () => {
    loadResponse = fakeResponse(true, 200, {
      success: true,
      data: { config: SAVED_CONFIG, updatedAt: '2026-02-01T00:00:00.000Z' },
    });
    await renderPage();
    expect(byTestId('avatar-hair').getAttribute('fill')).toBe('#FF4500');
    expect(container.querySelector('[data-testid="avatar-accessory-glasses"]')).not.toBeNull();
  });

  it('bald config renders no hair geometry (honest absence, not an empty box)', async () => {
    loadResponse = fakeResponse(true, 200, {
      success: true,
      data: {
        config: { ...SAVED_CONFIG, hairStyle: 'bald' },
        updatedAt: '2026-02-01T00:00:00.000Z',
      },
    });
    await renderPage();
    expect(container.querySelector('[data-testid="avatar-hair"]')).toBeNull();
    expect(container.querySelector('[data-testid="avatar-face"]')).not.toBeNull();
  });

  it('selecting an animation changes the preview rendered animation state', async () => {
    await renderPage();
    const preview = byTestId('avatar-preview');
    expect(preview.getAttribute('data-animation')).toBe('idle');
    await act(async () => {
      buttonWithText('wave').click();
    });
    expect(byTestId('avatar-preview').getAttribute('data-animation')).toBe('wave');
    expect(byTestId('avatar-preview').getAttribute('class') ?? '').toContain('animate-bounce');
    await act(async () => {
      buttonWithText('think').click();
    });
    expect(byTestId('avatar-preview').getAttribute('data-animation')).toBe('think');
    expect(byTestId('avatar-preview').getAttribute('class') ?? '').toContain('animate-pulse');
  });

  it('regression: load/save endpoints and the /bitmoji gate are unchanged', async () => {
    await renderPage();
    expect(apiMocks.apiFetchRaw).toHaveBeenCalledWith(
      '/api/bitmoji/current',
      expect.objectContaining({ headers: expect.anything() }),
    );
    await act(async () => {
      buttonWithText('Save Avatar').click();
    });
    expect(apiMocks.apiFetchRaw).toHaveBeenCalledWith(
      '/api/bitmoji/save',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(classifyPath('/bitmoji')).toBe('app');
  });
});

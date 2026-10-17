// @vitest-environment jsdom
//
// QC-F-466 Slice 1 — expiring emoji status: the WEB render surfaces
// (brief specialist-qc-f-466-buildprep.md §5-T3).
//
// The badge and picker are new modules in this slice:
//   * EmojiStatusBadge renders a live status ONLY through the QC-F-336
//     catalog manifest (resolveCustomEmoji) — an unknown key renders
//     NOTHING (never a derived URL, broken image, or placeholder), and a
//     status whose expiresAt has passed renders NOTHING even if a stale
//     client cache still holds it (the server never serves expired
//     statuses; this is the second layer for already-loaded data).
//   * EmojiStatusPicker offers exactly the catalog's 12 entries and the
//     closed duration set ('1h' | '24h' | '7d'); Set hands the caller
//     { key, duration } (the client NEVER computes an absolute expiry)
//     and Clear hands null.
//
// New modules are loaded with variable-specifier dynamic imports inside
// each case (QC-F-336/F-341 precedent) so that, on the pre-fix tree,
// every case fails individually at runtime instead of collapsing into
// one file-load failure.
//
// Negative control (brief §5): on original code all cases FAIL (the
// modules do not exist). No case here is a guard pin.
// ===========================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BADGE_SPECIFIER = '../components/EmojiStatusBadge';
const PICKER_SPECIFIER = '../components/EmojiStatusPicker';
const LIB_SPECIFIER = '../lib/custom-emoji';

async function loadBadge() {
  return import(BADGE_SPECIFIER);
}
async function loadPicker() {
  return import(PICKER_SPECIFIER);
}
async function loadLib() {
  return import(LIB_SPECIFIER);
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(node: React.ReactNode): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(node);
  });
  return container;
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
});

const futureIso = (msFromNow = 3_600_000) => new Date(Date.now() + msFromNow).toISOString();
const pastIso = () => new Date(Date.now() - 60_000).toISOString();

describe('QC-F-466: EmojiStatusBadge', () => {
  it('14a: a known live key renders the manifest image with its assetUrl and alt', async () => {
    const { EmojiStatusBadge } = await loadBadge();
    const { CUSTOM_EMOJI_PACKS } = await loadLib();
    const entry = CUSTOM_EMOJI_PACKS[0].entries.find(
      (e: { name: string }) => e.name === 'flame',
    )!;
    const el = render(
      <EmojiStatusBadge status={{ key: 'quant:flame', expiresAt: futureIso() }} />,
    );
    const img = el.querySelector('img[data-testid="emoji-status-badge"]');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe(entry.assetUrl);
    expect(img!.getAttribute('alt')).toBe(entry.alt);
  });

  it('14b: an unknown key renders NOTHING — no image, no placeholder', async () => {
    const { EmojiStatusBadge } = await loadBadge();
    const el = render(
      <EmojiStatusBadge status={{ key: 'quant:nope', expiresAt: futureIso() }} />,
    );
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toBe('');
  });

  it('14c: an expired status renders NOTHING even though the client still holds it', async () => {
    const { EmojiStatusBadge } = await loadBadge();
    const el = render(
      <EmojiStatusBadge status={{ key: 'quant:flame', expiresAt: pastIso() }} />,
    );
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toBe('');
  });

  it('14d: null / malformed statuses render nothing', async () => {
    const { EmojiStatusBadge } = await loadBadge();
    for (const status of [
      null,
      undefined,
      { key: 'no-separator', expiresAt: futureIso() },
      { key: 'quant:flame', expiresAt: 'not-a-date' },
    ]) {
      const el = render(<EmojiStatusBadge status={status as never} />);
      expect(el.querySelector('img')).toBeNull();
      act(() => {
        root!.unmount();
      });
      root = null;
      container?.remove();
      container = null;
    }
  });
});

describe('QC-F-466: EmojiStatusPicker', () => {
  it('15a: the picker lists exactly the catalog entries (12) as options', async () => {
    const { EmojiStatusPicker } = await loadPicker();
    const { CUSTOM_EMOJI_PACKS } = await loadLib();
    const pack = CUSTOM_EMOJI_PACKS[0];
    const el = render(<EmojiStatusPicker current={null} onSave={() => {}} />);
    const options = el.querySelectorAll('[data-status-key]');
    expect(options).toHaveLength(pack.entries.length);
    expect(pack.entries.length).toBe(12);
    const keys = Array.from(options).map((o) => o.getAttribute('data-status-key'));
    expect(keys).toEqual(pack.entries.map((e: { name: string }) => `${pack.id}:${e.name}`));
  });

  it('15b: choosing an entry + a duration and pressing Set hands the caller {key, duration} — never an absolute expiry', async () => {
    const { EmojiStatusPicker } = await loadPicker();
    const onSave = vi.fn();
    const el = render(<EmojiStatusPicker current={null} onSave={onSave} />);

    const flame = el.querySelector('[data-status-key="quant:flame"]')!;
    click(flame);

    const select = el.querySelector('select[aria-label="Status duration"]') as HTMLSelectElement;
    expect(select).not.toBeNull();
    act(() => {
      select.value = '7d';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const setButton = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent === 'Set status',
    )!;
    click(setButton);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ key: 'quant:flame', duration: '7d' });
    const arg = onSave.mock.calls[0][0] as Record<string, unknown>;
    expect(arg).not.toHaveProperty('expiresAt');
  });

  it('15c: with a current status, Clear hands the caller null; without one, no Clear is offered', async () => {
    const { EmojiStatusPicker } = await loadPicker();
    const onSave = vi.fn();
    const el = render(
      <EmojiStatusPicker
        current={{ key: 'quant:wave', expiresAt: futureIso() }}
        onSave={onSave}
      />,
    );
    const clearButton = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent === 'Clear status',
    );
    expect(clearButton).toBeDefined();
    click(clearButton!);
    expect(onSave).toHaveBeenCalledWith(null);

    const el2 = render(<EmojiStatusPicker current={null} onSave={onSave} />);
    expect(
      Array.from(el2.querySelectorAll('button')).find((b) => b.textContent === 'Clear status'),
    ).toBeUndefined();
  });

  it('15d: the duration options are exactly the closed server set (1h / 24h / 7d)', async () => {
    const { EmojiStatusPicker, EMOJI_STATUS_DURATION_OPTIONS } = await loadPicker();
    expect(EMOJI_STATUS_DURATION_OPTIONS.map((o: { value: string }) => o.value)).toEqual([
      '1h',
      '24h',
      '7d',
    ]);
    const el = render(<EmojiStatusPicker current={null} onSave={() => {}} />);
    const select = el.querySelector('select[aria-label="Status duration"]') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['1h', '24h', '7d']);
  });
});

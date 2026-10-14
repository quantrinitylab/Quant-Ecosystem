// @vitest-environment jsdom
//
// QC-F-309 (Slice 1) — LinkPreviewCard unit contract.
//
// The card may only show what is actually known: the URL itself (taken from
// the message text) and its hostname. The previous props (title /
// description / imageUrl) were only ever filled with fabricated text
// ("Link from <hostname>" / "Shared content from <hostname>") — no fetch
// ever happened. Those props are gone; real previews arrive only from the
// verified unfurl endpoint (QC-F-309 Slice 2).
//
// Render calls pass props through a plain object cast so that, against the
// ORIGINAL card (which required a `title` prop), these tests fail on
// behaviour (the full URL is never rendered as text) instead of failing to
// compile — see buildprep §6.4.
import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@quant/brand', () => ({ spring: { gentle: {}, snappy: {}, stiff: {} } }));

vi.mock('framer-motion', () => {
  const SAFE = /^(className|id|children|role|onClick|style|href|target|rel)$|^(aria-|data-)/;
  const make = (tag: string) =>
    React.forwardRef(function MotionMock(props: Record<string, unknown>, ref: unknown) {
      const out: Record<string, unknown> = { ref };
      for (const key of Object.keys(props)) {
        if (SAFE.test(key)) out[key] = props[key];
      }
      return React.createElement(tag, out, props.children as React.ReactNode);
    });
  const motion = new Proxy({}, { get: (_t, tag: string) => make(typeof tag === 'string' ? tag : 'div') });
  return {
    motion,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
  };
});

// Imported after mocks are registered.
import { LinkPreviewCard } from '../components/LinkPreviewCard';

let container: HTMLElement | null = null;
let root: Root | null = null;

async function renderCard(props: Record<string, unknown>) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(React.createElement(LinkPreviewCard, props as never));
  });
  return container;
}

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  container?.remove();
  container = null;
  root = null;
});

describe('QC-F-309 LinkPreviewCard — honest { url } contract', () => {
  it('C1: renders only hostname + full URL — no title block, no description, no image', async () => {
    const url = 'https://example.com/asal-page?x=1';
    const el = await renderCard({ url });
    expect(el.textContent).toContain('example.com');
    expect(el.textContent).toContain(url);
    expect(el.querySelectorAll('img').length).toBe(0);
    expect(el.textContent).not.toContain('Link from');
    expect(el.textContent).not.toContain('Shared content from');
  });

  it('C2: anchor opens exactly the given URL in a new tab with noopener noreferrer', async () => {
    const url = 'https://example.com/kuch-bhi';
    const el = await renderCard({ url });
    const anchor = el.querySelector('a');
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute('href')).toBe(url);
    expect(anchor?.getAttribute('target')).toBe('_blank');
    const rel = anchor?.getAttribute('rel') ?? '';
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');
  });

  it('C3: an unparseable URL falls back to showing the raw URL without crashing', async () => {
    const url = 'https://[galat';
    const el = await renderCard({ url });
    expect(el.textContent).toContain(url);
    expect(el.querySelector('a')?.getAttribute('href')).toBe(url);
  });

  it('C4: query string and fragment survive verbatim in both visible text and href', async () => {
    const url = 'https://example.com/p?a=1&b=2#hissa';
    const el = await renderCard({ url });
    expect(el.textContent).toContain(url);
    expect(el.querySelector('a')?.getAttribute('href')).toBe(url);
  });

  it('C5: hostname comes from a real URL parse (www. kept, path not leaked into it)', async () => {
    const el = await renderCard({ url: 'https://www.example.com/x' });
    const paragraphs = Array.from(el.querySelectorAll('p')).map((p) => p.textContent);
    // The hostname line is exactly the parsed hostname — the path (/x) does
    // not leak into it. (The second line is the full URL itself, where /x
    // legitimately belongs.)
    expect(paragraphs[0]).toBe('www.example.com');
  });

  it('C6: a long URL is fully present in the DOM text and href (CSS truncation only)', async () => {
    const url = `https://example.com/${'bahut-lamba-raasta/'.repeat(6)}ant`;
    const el = await renderCard({ url });
    expect(el.textContent).toContain(url);
    expect(el.querySelector('a')?.getAttribute('href')).toBe(url);
  });
});

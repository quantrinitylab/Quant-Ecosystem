// @vitest-environment jsdom
//
// QC-F-336 Slice 1 — custom / animated emoji system.
//
// Before this slice QuantChat had no custom-emoji system at all: the
// reaction picker offered 6 hardcoded unicode emoji and message text was
// rendered as a plain string, so a user could never send an expression
// with an identity of its own. Slice 1 adds one first-party pack
// ("Quant Originals", original assets in public/emoji/quant/), an inline
// token (`:ce:<pack>:<name>:`) that renders as the real asset in the
// thread and in reaction displays, and a pack tab in ReactionPicker.
//
// Named cases E1–E15 follow specialist-qc-f-336-buildprep.md §6.2. The
// new modules (lib/custom-emoji, components/CustomEmojiText) are loaded
// with variable-specifier dynamic imports inside each case so that, on
// the pre-fix code, every case fails individually at runtime instead of
// collapsing into one file-load failure (a literal dynamic import is
// resolved by vite at transform time — QC-F-341 precedent). Only
// pre-existing components (ChatBubble, ReactionPicker) are
// imported statically. Mocks are stable module-level (framer-motion /
// brand springs only — no data is mocked anywhere).
//
// Negative-control signature (brief §6.3): on original code E1–E12,
// E14, E15 FAIL and E13 PASSes; with the fix all 15 PASS.
import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ReactionPicker } from '../components/ReactionPicker';
import { ChatBubble } from '../../../../packages/shared-ui/src/components/Chat/ChatBubble';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@quant/brand', () => ({
  spring: { gentle: {}, snappy: {}, stiff: {}, bouncy: {} },
}));

vi.mock('framer-motion', () => {
  const SAFE = /^(className|id|children|role|onClick|style)$|^(aria-|data-)/;
  const make = (tag: string) =>
    React.forwardRef(function MotionMock(props: Record<string, unknown>, ref: unknown) {
      const out: Record<string, unknown> = { ref };
      for (const key of Object.keys(props)) {
        if (SAFE.test(key)) out[key] = props[key];
      }
      return React.createElement(tag, out, props.children as React.ReactNode);
    });
  const motion = new Proxy(
    {},
    { get: (_t, tag: string) => make(typeof tag === 'string' ? tag : 'div') },
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
  };
});

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../');

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

// Variable specifiers (QC-F-341 precedent): a literal dynamic import is
// resolved by vite's import-analysis at transform time, so on the pre-fix
// tree the whole suite would fail to load instead of each new-behaviour
// case failing individually at runtime.
const LIB_SPECIFIER = '../lib/custom-emoji';
const RENDERER_SPECIFIER = '../components/CustomEmojiText';

async function loadLib() {
  return import(LIB_SPECIFIER);
}

async function loadRenderer() {
  return import(RENDERER_SPECIFIER);
}

describe('QC-F-336 custom emoji — parser (lib/custom-emoji)', () => {
  it('E1 known token parses to a custom-emoji segment with manifest asset and alt', async () => {
    const { parseCustomEmoji, CUSTOM_EMOJI_PACKS } = await loadLib();
    const first = CUSTOM_EMOJI_PACKS[0].entries[0];
    const token = `:ce:${CUSTOM_EMOJI_PACKS[0].id}:${first.name}:`;
    const segments = parseCustomEmoji(token);
    expect(segments).toHaveLength(1);
    const seg = segments[0];
    if (seg.type !== 'custom-emoji') throw new Error('expected a custom-emoji segment');
    expect(seg.assetUrl).toBe(first.assetUrl);
    expect(seg.alt).toBe(first.alt);
    expect(seg.alt.length).toBeGreaterThan(0);
    expect(seg.raw).toBe(token);
  });

  it('E2 plain text and unicode emoji pass through untouched', async () => {
    const { parseCustomEmoji } = await loadLib();
    const input = 'hello 👍 world :joy: bye';
    expect(parseCustomEmoji(input)).toEqual([{ type: 'text', text: input }]);
  });

  it('E3 unknown pack or name falls back to literal text — no segment, no asset', async () => {
    const { parseCustomEmoji } = await loadLib();
    for (const input of [':ce:quant:doesnotexist:', ':ce:otherpack:wave:']) {
      expect(parseCustomEmoji(input)).toEqual([{ type: 'text', text: input }]);
    }
  });

  it('E4 bare shortcode without the ce namespace is never parsed', async () => {
    const { parseCustomEmoji } = await loadLib();
    expect(parseCustomEmoji(':wave:')).toEqual([{ type: 'text', text: ':wave:' }]);
  });

  it('E5 malformed tokens are literal', async () => {
    const { parseCustomEmoji } = await loadLib();
    const malformed = [
      ':ce::wave:',
      ':ce:quant:',
      ':ce:quant:Wave:',
      `:ce:quant:${'a'.repeat(33)}:`,
      ':ce:quant:wave',
    ];
    for (const input of malformed) {
      expect(parseCustomEmoji(input)).toEqual([{ type: 'text', text: input }]);
    }
  });

  it('E6 backslash escapes a token and is consumed', async () => {
    const { parseCustomEmoji } = await loadLib();
    expect(parseCustomEmoji('\\:ce:quant:wave:')).toEqual([
      { type: 'text', text: ':ce:quant:wave:' },
    ]);
    expect(parseCustomEmoji('a\\b')).toEqual([{ type: 'text', text: 'a\\b' }]);
  });

  it('E7 multiple tokens interleave with text in order', async () => {
    const { parseCustomEmoji } = await loadLib();
    const segments = parseCustomEmoji(
      ':ce:quant:wave: mid :ce:quant:gem: end :ce:quant:bolt:',
    );
    expect(segments.map((s: { type: string }) => s.type)).toEqual([
      'custom-emoji',
      'text',
      'custom-emoji',
      'text',
      'custom-emoji',
    ]);
    const texts = segments.filter((s: { type: string }) => s.type === 'text').map((s: { text?: string }) => s.text);
    expect(texts).toEqual([' mid ', ' end ']);
    const names = segments
      .filter((s: { type: string }) => s.type === 'custom-emoji')
      .map((s: { type: string; name?: string }) => (s.type === 'custom-emoji' ? s.name : ''));
    expect(names).toEqual(['wave', 'gem', 'bolt']);
  });

  it('E8 tokens inside URLs are not parsed and the per-message cap holds', async () => {
    const { parseCustomEmoji, MAX_CUSTOM_EMOJI_PER_MESSAGE } = await loadLib();
    const url = 'see https://example.com:8080/x now';
    expect(parseCustomEmoji(url)).toEqual([{ type: 'text', text: url }]);

    const many = Array.from({ length: 33 }, () => ':ce:quant:wave:').join(' ');
    const segments = parseCustomEmoji(many);
    const rendered = segments.filter((s: { type: string }) => s.type === 'custom-emoji');
    expect(MAX_CUSTOM_EMOJI_PER_MESSAGE).toBe(32);
    expect(rendered).toHaveLength(32);
    const lastText = segments
      .filter((s: { type: string }) => s.type === 'text')
      .map((s: { text?: string }) => s.text)
      .join('');
    expect(lastText).toContain(':ce:quant:wave:');
  });

  it('E9 ciphertext envelope content is returned untouched', async () => {
    const { parseCustomEmoji } = await loadLib();
    const input = '{"ciphertext":"abc:ce:quant:wave:xyz"}';
    expect(parseCustomEmoji(input)).toEqual([{ type: 'text', text: input }]);
  });
});

describe('QC-F-336 custom emoji — renderer + picker + bubble', () => {
  it('E10 CustomEmojiText renders a known token as an inline image with manifest src and alt', async () => {
    const { CUSTOM_EMOJI_PACKS } = await loadLib();
    const { CustomEmojiText } = await loadRenderer();
    const first = CUSTOM_EMOJI_PACKS[0].entries[0];
    const token = `:ce:${CUSTOM_EMOJI_PACKS[0].id}:${first.name}:`;
    const el = render(<CustomEmojiText text={`hi ${token} there`} />);
    const img = el.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe(first.assetUrl);
    expect(img!.getAttribute('alt')).toBe(first.alt);
    expect(img!.getAttribute('data-custom-emoji')).toBe(token);
    expect(el.textContent).toBe('hi  there');
  });

  it('E11 CustomEmojiText renders an unknown token as clean literal text with no image', async () => {
    const { CustomEmojiText } = await loadRenderer();
    const el = render(<CustomEmojiText text="look :ce:quant:doesnotexist: here" />);
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toBe('look :ce:quant:doesnotexist: here');
  });

  it('E12 ReactionPicker pack tab lists the manifest and selects the exact token', async () => {
    const { CUSTOM_EMOJI_PACKS, customEmojiToken } = await loadLib();
    const pack = CUSTOM_EMOJI_PACKS[0];
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const el = render(<ReactionPicker isOpen onSelect={onSelect} onClose={onClose} />);

    const tab = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent === pack.name,
    );
    expect(tab).toBeDefined();
    click(tab!);

    const images = el.querySelectorAll('img');
    expect(images).toHaveLength(pack.entries.length);
    expect(pack.entries.length).toBe(12);

    const firstButton = images[0].closest('button');
    expect(firstButton).not.toBeNull();
    click(firstButton!);
    expect(onSelect).toHaveBeenCalledWith(
      customEmojiToken(pack.id, pack.entries[0].name),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('E13 pre-336 surfaces are unchanged: ChatBubble renders plain text and quick reactions return unicode', () => {
    const bubbleEl = render(
      <ChatBubble message="plain hello" sender="other" timestamp="10:00" />,
    );
    expect(bubbleEl.textContent).toContain('plain hello');
    expect(bubbleEl.querySelector('img')).toBeNull();

    const onSelect = vi.fn();
    const onClose = vi.fn();
    const pickerEl = render(
      <ReactionPicker isOpen onSelect={onSelect} onClose={onClose} />,
    );
    const thumbs = Array.from(pickerEl.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'React with 👍',
    );
    expect(thumbs).toBeDefined();
    click(thumbs!);
    expect(onSelect).toHaveBeenCalledWith('👍');
  });

  it('E14 ChatBubble renders messageNode content instead of the raw token string', async () => {
    const { CustomEmojiText } = await loadRenderer();
    const token = ':ce:quant:wave:';
    const el = render(
      <ChatBubble
        message={token}
        messageNode={<CustomEmojiText text={token} />}
        sender="self"
        timestamp="10:01"
      />,
    );
    expect(el.querySelector('img')).not.toBeNull();
    expect(el.textContent).not.toContain(':ce:quant:wave:');
  });

  it('E15 manifest integrity: unique names, band limits, and every asset file exists', async () => {
    const { CUSTOM_EMOJI_PACKS } = await loadLib();
    expect(CUSTOM_EMOJI_PACKS).toHaveLength(1);
    const pack = CUSTOM_EMOJI_PACKS[0];
    expect(pack.entries).toHaveLength(12);
    const names = pack.entries.map((e: { name: string }) => e.name);
    expect(new Set(names).size).toBe(names.length);
    for (const entry of pack.entries) {
      expect(entry.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(entry.assetUrl).toBe(`/emoji/quant/${entry.name}.webp`);
      expect(entry.alt.length).toBeGreaterThan(0);
      const filePath = resolve(appRoot, 'public', entry.assetUrl.replace(/^\//, ''));
      expect(existsSync(filePath)).toBe(true);
      expect(statSync(filePath).size).toBeLessThanOrEqual(64 * 1024);
    }
  });
});

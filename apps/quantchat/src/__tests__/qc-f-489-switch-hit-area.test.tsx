// @vitest-environment jsdom
//
// QC-F-489 — shipped privacy/consent switches were only 24px tall, half the
// app's own 44px touch standard (tailwind min-h-touch, globals .touch-target,
// settings ToggleRow's 44px label row). A mis-tap could flip Quanty
// auto-reply (AI replies on the user's behalf), Ghost Mode (live-location
// broadcast), or a notification category (incl. SYSTEM security alerts).
//
// Fix pattern (band Slice-1): the role="switch" <button> itself becomes the
// >=44px hit-area (min-h-touch / inline minHeight 2.75rem) and the visible
// 24px pill moves to an inner track element — visual size, colours and thumb
// travel are unchanged; no shared Switch component, the standard is guarded
// by the census test T5 below.
//
// jsdom gives no layout (getBoundingClientRect = 0), so the height checks
// read the DECLARED CSS (class tokens / inline style) — the same declaration
// the browser applies. Real pixel proof is the live-verify gate (HG-489-1).
//
// Negative-control signature: on the ORIGINAL code the hit-area assertions
// in T1/T2/T3 and the census T5 FAIL (declared height 24, no min-h
// declaration anywhere); the click/aria/independence assertions and the
// pill-guard T4 PASS on original too — they are regression guards, not NC.
import { describe, it, expect, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AIAgentPanel } from '../components/chat/AIAgentPanel';
import { GhostModeToggle } from '../components/map/GhostModeToggle';
import {
  NotificationSettings,
  defaultNotificationSettings,
} from '../components/settings/NotificationSettings';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// Declared-size helpers (class tokens + inline style; tailwind spacing = 4px)
// ---------------------------------------------------------------------------

function parseCssSize(raw: string): number | null {
  const m = raw.trim().match(/^(-?\d+(?:\.\d+)?)(px|rem|em)$/);
  if (!m) return null;
  const v = parseFloat(m[1]!);
  return m[2] === 'px' ? v : v * 16;
}

function declaredSizePx(el: Element, axis: 'height' | 'width'): number {
  const style = (el as HTMLElement).style;
  const classes = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
  const minPrefix = axis === 'height' ? 'min-h-' : 'min-w-';
  // A min-size declaration is the hit-area floor and wins over direct size.
  const minInline = axis === 'height' ? style?.minHeight : style?.minWidth;
  if (minInline) {
    const px = parseCssSize(minInline);
    if (px != null) return px;
  }
  for (const c of classes) {
    if ((axis === 'height' && c === 'min-h-touch') || (axis === 'width' && c === 'min-w-touch')) {
      return 44;
    }
    if (c.startsWith(minPrefix + '[') && c.endsWith(']')) {
      const px = parseCssSize(c.slice(minPrefix.length + 1, -1));
      if (px != null) return px;
    }
  }
  const inline = axis === 'height' ? style?.height : style?.width;
  if (inline) {
    const px = parseCssSize(inline);
    if (px != null) return px;
  }
  const prefix = axis === 'height' ? 'h-' : 'w-';
  for (const c of classes) {
    if (c.startsWith(prefix + '[') && c.endsWith(']')) {
      const px = parseCssSize(c.slice(prefix.length + 1, -1));
      if (px != null) return px;
    }
    if (c.startsWith(prefix)) {
      const num = Number(c.slice(prefix.length));
      if (Number.isFinite(num) && c.slice(prefix.length).trim() !== '') return num * 4;
    }
  }
  return 0;
}

const declaredHitHeightPx = (el: Element) => declaredSizePx(el, 'height');
const declaredWidthPx = (el: Element) => declaredSizePx(el, 'width');

/** The visible pill: first descendant declaring 24px height, else the button
 *  itself (on the original code the button WAS the pill). */
function pillTrack(button: HTMLElement): Element {
  for (const d of Array.from(button.querySelectorAll('*'))) {
    if (declaredSizePx(d, 'height') === 24) return d;
  }
  return button;
}

// ---------------------------------------------------------------------------
// Render helper (same react-dom/client + act pattern as qc-f-067)
// ---------------------------------------------------------------------------

async function mount(node: React.ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  // Flush mount-effect promise resolutions.
  await act(async () => {
    await Promise.resolve();
  });
  return {
    container,
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

const switchIn = (container: HTMLElement) =>
  container.querySelector<HTMLButtonElement>('button[role="switch"]')!;

// ---------------------------------------------------------------------------

describe('QC-F-489 switch hit-area >= 44px, pill stays 24px', () => {
  it('T1: AIAgentPanel auto-reply switch — hit >=44, no direct h-6, toggle behaviour intact', async () => {
    const toggleAutoReply = vi.fn(async () => ({ enabled: true, cancelledCount: 0 }));
    const { container, unmount } = await mount(
      <AIAgentPanel
        conversationId="conv-489"
        fetchAutoReplyState={async () => ({ enabled: false })}
        toggleAutoReply={toggleAutoReply}
      />,
    );
    try {
      const sw = switchIn(container);
      expect(declaredHitHeightPx(sw)).toBeGreaterThanOrEqual(44);
      expect(sw.classList.contains('h-6')).toBe(false);
      await act(async () => {
        sw.click();
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(toggleAutoReply).toHaveBeenCalledTimes(1);
      expect(toggleAutoReply).toHaveBeenCalledWith({
        conversationId: 'conv-489',
        enabled: true,
      });
      expect(sw.getAttribute('aria-checked')).toBe('true');
    } finally {
      await unmount();
    }
  });

  it('T2: GhostModeToggle switch — hit >=44, no direct h-6, onToggle fires exactly once', async () => {
    const onToggle = vi.fn();
    const { container, unmount } = await mount(
      <GhostModeToggle enabled={false} onToggle={onToggle} />,
    );
    try {
      const sw = switchIn(container);
      expect(declaredHitHeightPx(sw)).toBeGreaterThanOrEqual(44);
      expect(sw.classList.contains('h-6')).toBe(false);
      await act(async () => {
        sw.click();
      });
      expect(onToggle).toHaveBeenCalledTimes(1);
      expect(onToggle).toHaveBeenCalledWith(true);
    } finally {
      await unmount();
    }
  });

  it('T3: NotificationSettings — all 6 category switches hit >=44, no inline 1.5rem height, independence intact', async () => {
    const onChange = vi.fn();
    const { container, unmount } = await mount(
      <NotificationSettings
        initialSettings={defaultNotificationSettings()}
        onChange={onChange}
      />,
    );
    try {
      const switches = Array.from(
        container.querySelectorAll<HTMLButtonElement>('button[role="switch"]'),
      );
      expect(switches).toHaveLength(6);
      for (const sw of switches) {
        expect(declaredHitHeightPx(sw)).toBeGreaterThanOrEqual(44);
        expect(sw.style.height).toBe('');
      }
      const messages = switches.find(
        (s) => s.getAttribute('aria-label') === 'Messages notifications',
      )!;
      await act(async () => {
        messages.click();
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(onChange).toHaveBeenCalled();
      const last = onChange.mock.calls[onChange.mock.calls.length - 1]![0] as Record<
        string,
        boolean
      >;
      // Req 9.6 independence: ONLY MESSAGES flipped.
      expect(last.MESSAGES).toBe(false);
      expect(last.CALLS).toBe(true);
      expect(last.STORIES).toBe(true);
      expect(last.STREAKS).toBe(true);
      expect(last.REELS).toBe(true);
      expect(last.SYSTEM).toBe(true);
      expect(messages.getAttribute('aria-checked')).toBe('false');
    } finally {
      await unmount();
    }
  });

  it('T4: visual pill guard — track stays 24px tall, widths 44/48/44 unchanged', async () => {
    const ai = await mount(
      <AIAgentPanel
        conversationId="conv-489"
        fetchAutoReplyState={async () => ({ enabled: true })}
        toggleAutoReply={vi.fn()}
      />,
    );
    try {
      const track = pillTrack(switchIn(ai.container));
      expect(declaredSizePx(track, 'height')).toBe(24);
      expect(declaredWidthPx(track)).toBe(44);
    } finally {
      await ai.unmount();
    }

    const ghost = await mount(<GhostModeToggle enabled onToggle={vi.fn()} />);
    try {
      const track = pillTrack(switchIn(ghost.container));
      expect(declaredSizePx(track, 'height')).toBe(24);
      expect(declaredWidthPx(track)).toBe(48);
    } finally {
      await ghost.unmount();
    }

    const notif = await mount(
      <NotificationSettings initialSettings={defaultNotificationSettings()} />,
    );
    try {
      const track = pillTrack(switchIn(notif.container));
      expect(declaredSizePx(track, 'height')).toBe(24);
      expect(declaredWidthPx(track)).toBe(44);
    } finally {
      await notif.unmount();
    }
  });

  it('T5: census guard — exactly 3 shipped switch files, every one declares a 44px hit-area', () => {
    const srcRoot = path.resolve(__dirname, '..');
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
          walk(full, out);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          out.push(full);
        }
      }
      return out;
    };
    const files = ['components', 'app', 'pages']
      .map((d) => path.join(srcRoot, d))
      .filter((d) => fs.existsSync(d))
      .flatMap((d) => walk(d));
    const switchFiles = files.filter((f) =>
      fs.readFileSync(f, 'utf8').includes('role="switch"'),
    );
    expect(switchFiles).toHaveLength(3);
    for (const f of switchFiles) {
      const content = fs.readFileSync(f, 'utf8');
      expect(
        /min-h-touch|min-h-\[44px\]|minHeight/.test(content),
        `${path.basename(f)} must declare a >=44px hit-area`,
      ).toBe(true);
    }
  });
});

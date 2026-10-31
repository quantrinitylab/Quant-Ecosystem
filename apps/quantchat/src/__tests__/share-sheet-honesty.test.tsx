// @vitest-environment jsdom
//
// QC-F-025 — ShareSheet must never report a share that did not happen.
//
// Before the fix, every menu option fired onShare (which POSTs
// /reels/:id/share and increments the reel's share count + Spotlight
// engagement score) — including Send Message / Add to Story / Save Video,
// which were no-ops, and Copy Link even when the clipboard write failed
// (the rejection was swallowed). These tests pin the honest contract:
// a share is counted only when a real share action completes.
//
// QC-F-373 — the link Copy Link and the native share produced points at
// /reels/<id>, a route that does not exist (no page segment, no
// route-access registry pattern): every produced link lands on the
// styled 404. Counting a "share" for a dead link is the same dishonesty
// QC-F-025 removed for the no-op options, so until QC-F-365 lands a real
// focused route (/reels?reel=<id>), Copy Link joins the disabled set and
// the native share attempt on open is removed entirely. These tests pin:
// no clipboard touch, no native attempt, no onShare from this sheet —
// on any path, including a programmatic click on a disabled option.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { ShareSheet } from '../app/reels/components/ShareSheet';

// Resolve a source file regardless of whether the suite runs with the
// cwd at the quantchat app or at the monorepo root (qc-f-044 pattern).
function readAppSource(relFromApp: string): string {
  const candidates = [
    resolve(process.cwd(), relFromApp),
    resolve(process.cwd(), 'apps/quantchat', relFromApp),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`Could not locate source file: ${relFromApp}`);
  return readFileSync(found, 'utf8');
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function flushAll(): Promise<void> {
  await flushPromises();
  await flushPromises();
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll('button'));
  const match = buttons.find((b) => b.textContent?.includes(label));
  if (!match) throw new Error(`button not found: ${label}`);
  return match as HTMLButtonElement;
}

function setNavigatorProp(name: string, value: unknown): void {
  Object.defineProperty(window.navigator, name, {
    value,
    configurable: true,
    writable: true,
  });
}

describe('ShareSheet honesty (QC-F-025 + QC-F-373)', () => {
  let container: HTMLDivElement;
  let root: Root;
  let onShare: ReturnType<typeof vi.fn<(reelId: string) => void>>;
  let onClose: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    onShare = vi.fn<(reelId: string) => void>();
    onClose = vi.fn<() => void>();
    // Default: no native share, no clipboard — each test opts in explicitly.
    setNavigatorProp('share', undefined);
    setNavigatorProp('clipboard', undefined);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    setNavigatorProp('share', undefined);
    setNavigatorProp('clipboard', undefined);
  });

  async function renderSheet(): Promise<void> {
    await act(async () => {
      root.render(
        <ShareSheet
          isOpen={true}
          onClose={onClose}
          reelId="reel-42"
          caption="hello reel"
          onShare={onShare}
        />,
      );
      await flushAll();
    });
  }

  it('marks EVERY option — Copy Link included — as not available instead of faking success', async () => {
    await renderSheet();

    for (const label of ['Copy Link', 'Send Message', 'Add to Story', 'Save Video']) {
      const button = findButton(container, label);
      expect(button.disabled).toBe(true);
      expect(button.textContent).toContain('Not available');

      await act(async () => {
        button.click();
        await flushAll();
      });
    }

    // No share may be reported for actions that never happened.
    expect(onShare).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('never touches the clipboard for Copy Link — whether the clipboard would succeed, fail, or is unavailable', async () => {
    // Scenario 1: the clipboard write WOULD succeed. The dead link must
    // still not be produced, and no share may be counted for it.
    const writeTextOk = vi.fn().mockResolvedValue(undefined);
    setNavigatorProp('clipboard', { writeText: writeTextOk });
    await renderSheet();

    await act(async () => {
      findButton(container, 'Copy Link').click();
      await flushAll();
    });

    expect(writeTextOk).not.toHaveBeenCalled();
    expect(onShare).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    // Scenario 2: the clipboard write WOULD fail. Same contract: the
    // clipboard is never even attempted.
    const writeTextFail = vi.fn().mockRejectedValue(new Error('clipboard denied'));
    setNavigatorProp('clipboard', { writeText: writeTextFail });
    await renderSheet();

    await act(async () => {
      findButton(container, 'Copy Link').click();
      await flushAll();
    });

    expect(writeTextFail).not.toHaveBeenCalled();
    expect(onShare).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    // Scenario 3: no clipboard API at all. Same contract.
    setNavigatorProp('clipboard', undefined);
    await renderSheet();

    await act(async () => {
      findButton(container, 'Copy Link').click();
      await flushAll();
    });

    expect(onShare).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the honest guard behind the disabled options (source-pinned)', () => {
    // The handler guard behind the disabled rendering cannot be reached
    // through the DOM in this harness — proven firsthand while building
    // QC-F-373: a native click listener on a disabled option fires, but
    // React DOM suppresses the synthetic onClick for a form control
    // whose rendered props are disabled, even after the DOM disabled
    // flag is cleared. So the guard's presence is pinned at the source
    // level (the same doctrine as the source pin below): every option
    // click lands on the one honest notice, and that notice is the
    // exact user-facing copy. Behaviourally, the disabled options
    // themselves are pinned by the first two tests: nothing is copied,
    // nothing is counted, the sheet does not close.
    const source = readAppSource('src/app/reels/components/ShareSheet.tsx');

    expect(source).toContain(
      'That share option is not available yet — no share was counted.',
    );
  });

  it('does NOT attempt a native share on open, even when the Web Share API exists', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigatorProp('share', share);
    await renderSheet();
    // Give framer-motion's open animation every chance to fire — opening
    // the sheet must not trigger any share attempt; only the menu shows.
    await act(async () => {
      await flushAll();
    });

    expect(share).not.toHaveBeenCalled();
    expect(onShare).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // The custom menu itself is what the user sees.
    expect(container.textContent).toContain('Copy Link');
    expect(container.textContent).toContain('Not available');
  });

  it('source pin: ShareSheet produces no dead link and attempts no native share (QC-F-373)', () => {
    // jsdom cannot be trusted to fire framer-motion's onAnimationComplete,
    // so the native-attempt removal is also pinned at the source level:
    // the dead URL shape and the native share call must not exist in the
    // component at all, and every share option must be unavailable.
    const source = readAppSource('src/app/reels/components/ShareSheet.tsx');

    expect(source).not.toContain('/reels/${');
    expect(source).not.toContain('navigator.share');
    expect(source).not.toContain('available: true');
    expect(source.match(/available: false/g)?.length).toBeGreaterThanOrEqual(4);
  });
});

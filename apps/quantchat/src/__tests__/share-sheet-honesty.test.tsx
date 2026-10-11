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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { ShareSheet } from '../app/reels/components/ShareSheet';

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

describe('ShareSheet honesty (QC-F-025)', () => {
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

  it('marks the no-flow options (message/story/download) as not available instead of faking success', async () => {
    await renderSheet();

    for (const label of ['Send Message', 'Add to Story', 'Save Video']) {
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

  it('counts a share for Copy Link only when the clipboard write succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigatorProp('clipboard', { writeText });
    await renderSheet();

    await act(async () => {
      findButton(container, 'Copy Link').click();
      await flushAll();
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain('/reels/reel-42');
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onShare).toHaveBeenCalledWith('reel-42');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT count a share when the clipboard write fails, and says so honestly', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('clipboard denied'));
    setNavigatorProp('clipboard', { writeText });
    await renderSheet();

    await act(async () => {
      findButton(container, 'Copy Link').click();
      await flushAll();
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(onShare).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(container.textContent).toContain('no share was counted');
  });

  it('does NOT count a share when the clipboard API is unavailable', async () => {
    setNavigatorProp('clipboard', undefined);
    await renderSheet();

    await act(async () => {
      findButton(container, 'Copy Link').click();
      await flushAll();
    });

    expect(onShare).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(container.textContent).toContain('no share was counted');
  });

  it('does NOT count a share when the user cancels the native share sheet', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    setNavigatorProp('share', share);
    await renderSheet();
    // Give framer-motion's open animation a chance to fire onAnimationComplete,
    // which is what triggers the native share attempt.
    await act(async () => {
      await flushAll();
    });

    expect(onShare).not.toHaveBeenCalled();
  });
});

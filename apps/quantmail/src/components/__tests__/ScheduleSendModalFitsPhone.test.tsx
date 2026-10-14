// @vitest-environment jsdom
// Live (iPhone 14, 390x844): the Schedule Send sheet is ~1000px tall and was
// centred in a fixed, non-scrolling overlay — the title was cut off at the top
// and the "Schedule Send" button sat half off the bottom edge. The sheet is now
// a height-capped column whose middle scrolls; it is also a real dialog that
// Escape closes.
import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ScheduleSendModal } from '../ScheduleSendModal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(onClose = vi.fn()) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<ScheduleSendModal isOpen onClose={onClose} onSchedule={vi.fn()} />));
  return { onClose };
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('ScheduleSendModal on a phone-height viewport', () => {
  it('is a labelled modal dialog', () => {
    mount();
    const dialog = document.querySelector('[data-testid="schedule-send-dialog"]')!;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const title = document.getElementById(dialog.getAttribute('aria-labelledby')!);
    expect(title?.textContent?.trim()).toBe('Schedule Send');
  });

  it('caps its height to the viewport and scrolls only the body', () => {
    mount();
    const dialog = document.querySelector('[data-testid="schedule-send-dialog"]')!;
    expect(dialog.className).toContain('max-h-[calc(100dvh-1.5rem)]');
    expect(dialog.className).toContain('flex-col');
    const body = document.querySelector('[data-testid="schedule-send-body"]')!;
    expect(body.className).toContain('overflow-y-auto');
    expect(body.className).toContain('min-h-0');
    // The confirm action lives outside the scrolling body, so it is always on screen.
    const confirm = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Schedule Send',
    )!;
    expect(body.contains(confirm)).toBe(false);
    expect(dialog.contains(confirm)).toBe(true);
  });

  it('closes on Escape', () => {
    const { onClose } = mount();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

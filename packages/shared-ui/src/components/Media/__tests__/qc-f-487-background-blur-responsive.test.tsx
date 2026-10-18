// @vitest-environment jsdom
//
// QC-F-487 — BackgroundBlur responsive presentation pins
// (specialist-qc-f-487-buildprep.md §8.2 File A, cases T1–T4).
//
// The shipped BackgroundBlur menu is a ~199px wide no-wrap row (label +
// None/Blur + status span). Inside the calls dock (~447px intrinsic) and
// the meet dock (~491px vs 358px available) it overflowed a 390px screen
// and pushed edge controls (incl. meet's Leave) off-screen. Slice-1 adds
// presentation="responsive": below 640px the menu collapses to a 48px
// trigger + popover; at/above 640px the ORIGINAL inline render shows,
// byte-for-byte. The default (no prop) render is untouched.
//
// jsdom applies no CSS, so both surfaces exist in the DOM at once; all
// queries below are scoped to a surface (background-blur-compact /
// background-blur-inline). Visibility itself is pinned by the class
// contract + the live gate HG-487-1, never claimed from jsdom.
//
// @livekit/track-processors is mocked at module level with a stable
// hoisted fake (same pattern as qc-f-322) — never a fresh-identity mock.
//
// Negative-control signature: on the ORIGINAL component T1/T2/T4 FAIL
// (the prop is ignored, no trigger/panel/backdrop exists) and T3's
// inline-surface half FAILS (no background-blur-inline wrapper); T3's
// default-render half PASSES on original too — it is a guard, not NC.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tp = vi.hoisted(() => ({ supported: true }));

vi.mock('@livekit/track-processors', () => {
  class ProcessorWrapper {
    static get isSupported() {
      return tp.supported;
    }
  }
  class BackgroundTransformer {
    static get isSupported() {
      return tp.supported;
    }
  }
  const BackgroundProcessor = (options: Record<string, unknown>) => ({
    name: 'background-processor',
    options,
    updateTransformerOptions: vi.fn(async () => undefined),
    destroy: vi.fn(async () => undefined),
  });
  return { BackgroundProcessor, ProcessorWrapper, BackgroundTransformer };
});

vi.mock('livekit-client', () => ({
  Room: class FakeRoom {},
  Track: {
    Source: { Camera: 'camera', Microphone: 'microphone', ScreenShare: 'screenShare' },
    Kind: { Video: 'video', Audio: 'audio' },
  },
}));

import {
  BackgroundBlur,
  BACKGROUND_BLUR_ERROR_MESSAGE,
  type BackgroundMode,
  type BackgroundStatus,
} from '../BackgroundBlur';

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

interface MenuProps {
  mode: BackgroundMode;
  status: BackgroundStatus;
  error?: string | null;
  presentation?: 'inline' | 'responsive';
  onModeChange: (m: BackgroundMode) => void;
}

describe('QC-F-487 BackgroundBlur responsive presentation', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    tp.supported = true;
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderMenu(props: MenuProps) {
    await act(async () => {
      root.render(<BackgroundBlur {...props} />);
      await flushPromises();
    });
  }

  // Fresh component instance (the popover's open state legitimately
  // survives prop re-renders on the same instance, so independent
  // scenarios remount instead of inheriting it).
  async function remountMenu(props: MenuProps) {
    act(() => root.unmount());
    container.remove();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await renderMenu(props);
  }

  const compact = () => container.querySelector('[data-testid="background-blur-compact"]');
  const inlineSurface = () => container.querySelector('[data-testid="background-blur-inline"]');
  const trigger = () =>
    compact()?.querySelector('[data-testid="blur-menu-trigger"]') as HTMLButtonElement | null;
  const panel = () => compact()?.querySelector('[data-testid="blur-menu-panel"]');

  async function click(el: Element) {
    await act(async () => {
      (el as HTMLElement).click();
      await flushPromises();
    });
  }

  it('T1: trigger + panel behaviour — opens, panel buttons are h-11, choice fires once and closes, Escape closes and refocuses the trigger', async () => {
    const onModeChange = vi.fn();
    await renderMenu({ mode: 'none', status: 'off', presentation: 'responsive', onModeChange });

    const trig = trigger();
    expect(trig).not.toBeNull();
    expect(trig!.getAttribute('aria-expanded')).toBe('false');
    expect(trig!.getAttribute('aria-haspopup')).toBe('dialog');
    expect(panel()).toBeNull();

    await click(trig!);
    expect(trigger()!.getAttribute('aria-expanded')).toBe('true');
    const openPanel = panel();
    expect(openPanel).not.toBeNull();
    const panelBlur = openPanel!.querySelector('[data-testid="blur-mode-blur"]') as HTMLButtonElement;
    expect(panelBlur).not.toBeNull();
    expect(panelBlur.className).toContain('h-11');

    await click(panelBlur);
    expect(onModeChange).toHaveBeenCalledTimes(1);
    expect(onModeChange).toHaveBeenCalledWith('blur');
    expect(panel()).toBeNull();

    // Reopen, then Escape: panel closes and focus returns to the trigger.
    await click(trigger()!);
    expect(panel()).not.toBeNull();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await flushPromises();
    });
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('T2: honesty in the compact surface — "Blur on" only when active, error visible without opening, unavailable copy verbatim, no Image/Virtual tease', async () => {
    const onModeChange = vi.fn();

    await renderMenu({ mode: 'blur', status: 'active', presentation: 'responsive', onModeChange });
    expect(trigger()!.getAttribute('aria-label')).toContain('Blur on');
    await click(trigger()!);
    expect(panel()!.querySelector('[role="status"]')?.textContent).toBe('Blur on');

    await renderMenu({ mode: 'none', status: 'off', presentation: 'responsive', onModeChange });
    expect(container.textContent).not.toContain('Blur on');
    expect(trigger()!.getAttribute('aria-label')).toBe('Background settings — None');

    await remountMenu({
      mode: 'blur',
      status: 'error',
      error: BACKGROUND_BLUR_ERROR_MESSAGE,
      presentation: 'responsive',
      onModeChange,
    });
    // Panel still closed: the failure must already be visible.
    expect(panel()).toBeNull();
    const bar = compact()!.querySelector('[role="alert"]');
    expect(bar?.textContent).toBe(BACKGROUND_BLUR_ERROR_MESSAGE);
    expect(compact()!.querySelector('[data-testid="background-blur-error"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Blur on');

    await remountMenu({ mode: 'blur', status: 'unavailable', presentation: 'responsive', onModeChange });
    await click(trigger()!);
    expect(panel()!.textContent).toContain('Background blur is not supported in this browser.');

    for (const btn of [...container.querySelectorAll('button')]) {
      expect(btn.textContent ?? '').not.toMatch(/virtual|image/i);
    }
  });

  it('T3: inline protection — responsive keeps the original px-3 h-9 inline menu; the default render has no trigger and exactly 2 buttons', async () => {
    const onModeChange = vi.fn();
    await renderMenu({ mode: 'none', status: 'off', presentation: 'responsive', onModeChange });
    const surface = inlineSurface();
    expect(surface).not.toBeNull();
    const noneBtn = surface!.querySelector('[data-testid="blur-mode-none"]') as HTMLButtonElement;
    const blurBtn = surface!.querySelector('[data-testid="blur-mode-blur"]') as HTMLButtonElement;
    expect(noneBtn.className).toContain('px-3');
    expect(noneBtn.className).toContain('h-9');
    expect(blurBtn.className).toContain('px-3');
    expect(blurBtn.className).toContain('h-9');

    await renderMenu({ mode: 'none', status: 'off', onModeChange });
    expect(container.querySelector('[data-testid="blur-menu-trigger"]')).toBeNull();
    expect(container.querySelector('[data-testid="background-blur-compact"]')).toBeNull();
    expect([...container.querySelectorAll('button')]).toHaveLength(2);
  });

  it('T4: backdrop click closes the panel and aria-expanded tells the truth throughout', async () => {
    const onModeChange = vi.fn();
    await renderMenu({ mode: 'none', status: 'off', presentation: 'responsive', onModeChange });
    await click(trigger()!);
    expect(panel()).not.toBeNull();
    expect(trigger()!.getAttribute('aria-expanded')).toBe('true');

    const backdrop = compact()!.querySelector('[data-testid="blur-menu-backdrop"]') as HTMLButtonElement;
    expect(backdrop).not.toBeNull();
    await click(backdrop);
    expect(panel()).toBeNull();
    expect(trigger()!.getAttribute('aria-expanded')).toBe('false');
  });
});

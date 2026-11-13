// @vitest-environment jsdom

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { SwipeableEmailRow } from '../components/SwipeableEmailRow';
import MobilePreviewPage from '../app/mobile/page';


// MobileRoute calls useRouter — stub the router the way the other suites do,
// so this suite renders the page the way the app router would mount it.
vi.mock('next/navigation', () => ({
      useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
      useSearchParams: () => new URLSearchParams(),
      usePathname: () => '/mobile',
}));
    let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderEl(el: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root.render(el);
  });
  return {
    container: container!,
  };
}

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
    });
    root = null;
  }
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

function createTouchEvent(type: string, clientX: number, clientY: number) {
  const touch = { clientX, clientY, identifier: 0, target: null };
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: [touch] });
  Object.defineProperty(event, 'targetTouches', { value: [touch] });
  Object.defineProperty(event, 'changedTouches', { value: [touch] });
  return event;
}

describe('Mobile Touch & Gesture Physics Suite', () => {
  describe('Mobile PWA Full-Screen Page Structure', () => {
    it('renders MobilePreviewPage without fake 390px phone bezel box and allows full-screen responsive layout', () => {
      const { container } = renderEl(<MobilePreviewPage />);
      // Should not contain artificial phone bezel classes
      expect(container.querySelector('.max-w-\\[390px\\]')).toBeNull();
      expect(container.querySelector('.h-\\[844px\\]')).toBeNull();

      // Should render full-screen container
      const main = container.querySelector('main');
      expect(main).not.toBeNull();
      expect(main!.className).toContain('w-full');
      expect(main!.className).toContain('min-h-screen');
      expect(main!.className).toContain('flex');
      expect(main!.className).toContain('flex-col');
    });
  });

  describe('SwipeableEmailRow Touch & Swipe Gestures', () => {
    it('reveals Archive pane on swipe left and calls onArchive when released past threshold', () => {
      const onArchive = vi.fn();
      const onSnooze = vi.fn();
      const { container } = renderEl(
        <SwipeableEmailRow onArchive={onArchive} onSnooze={onSnooze}>
          <div data-testid="row-content">Email content</div>
        </SwipeableEmailRow>,
      );
      const row = container.firstElementChild as HTMLElement;
      expect(row).not.toBeNull();

      act(() => {
        row.dispatchEvent(createTouchEvent('touchstart', 200, 50));
        row.dispatchEvent(createTouchEvent('touchmove', 80, 50));
      });

      expect(container.querySelector('.is-archive')).not.toBeNull();

      act(() => {
        row.dispatchEvent(createTouchEvent('touchend', 80, 50));
      });

      expect(onArchive).toHaveBeenCalledTimes(1);
      expect(onSnooze).not.toHaveBeenCalled();
    });

    it('reveals Snooze pane on swipe right and calls onSnooze when released past threshold', () => {
      const onArchive = vi.fn();
      const onSnooze = vi.fn();
      const { container } = renderEl(
        <SwipeableEmailRow onArchive={onArchive} onSnooze={onSnooze}>
          <div data-testid="row-content">Email content</div>
        </SwipeableEmailRow>,
      );
      const row = container.firstElementChild as HTMLElement;

      act(() => {
        row.dispatchEvent(createTouchEvent('touchstart', 100, 50));
        row.dispatchEvent(createTouchEvent('touchmove', 220, 50));
      });

      expect(container.querySelector('.is-snooze')).not.toBeNull();

      act(() => {
        row.dispatchEvent(createTouchEvent('touchend', 220, 50));
      });

      expect(onSnooze).toHaveBeenCalledTimes(1);
      expect(onArchive).not.toHaveBeenCalled();
    });

    it('springs back and does not trigger action when released below threshold', () => {
      const onArchive = vi.fn();
      const onSnooze = vi.fn();
      const { container } = renderEl(
        <SwipeableEmailRow onArchive={onArchive} onSnooze={onSnooze}>
          <div data-testid="row-content">Email content</div>
        </SwipeableEmailRow>,
      );
      const row = container.firstElementChild as HTMLElement;

      act(() => {
        row.dispatchEvent(createTouchEvent('touchstart', 200, 50));
        row.dispatchEvent(createTouchEvent('touchmove', 180, 50));
        row.dispatchEvent(createTouchEvent('touchend', 180, 50));
      });

      expect(onArchive).not.toHaveBeenCalled();
      expect(onSnooze).not.toHaveBeenCalled();
    });
  });
});

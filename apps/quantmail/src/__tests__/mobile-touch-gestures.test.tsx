// @vitest-environment jsdom

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { MobileInboxFlowSuite } from '../components/MobileInboxFlowSuite';
import { MobileComposerSheet } from '../components/MobileComposerAndDraftsSuite';
import MobilePreviewPage from '../app/mobile/page';


vi.mock('next/navigation', () => {
    useRouter: () => ({
          push: vi.fn(),
          replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    }),
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

  describe('Email Row Swipe Left Gestures (Delete & Flag)', () => {
    it('reveals Delete and Flag action buttons on swipe left and deletes email when Delete button is tapped', () => {
      const { container } = renderEl(<MobileInboxFlowSuite />);

      const row = container.querySelector('[data-testid="mobile-email-row-m-1"]');
      expect(row).not.toBeNull();

      // Swipe Left: from 200px to 100px (dx = -100px)
      act(() => {
        row!.dispatchEvent(createTouchEvent('touchstart', 200, 50));
        row!.dispatchEvent(createTouchEvent('touchmove', 100, 50));
        row!.dispatchEvent(createTouchEvent('touchend', 100, 50));
      });

      // Actions are revealed
      const deleteBtn = container.querySelector<HTMLButtonElement>('[data-testid="swipe-action-delete-m-1"]');
      const flagBtn = container.querySelector<HTMLButtonElement>('[data-testid="swipe-action-flag-m-1"]');
      expect(deleteBtn).not.toBeNull();
      expect(flagBtn).not.toBeNull();
      expect(deleteBtn!.className).toContain('bg-rose-600');
      expect(flagBtn!.className).toContain('bg-amber-500');

      // Tap Delete button
      act(() => {
        deleteBtn!.click();
      });

      // Row m-1 is deleted from state
      expect(container.querySelector('[data-testid="mobile-email-row-m-1"]')).toBeNull();

      // Undo toast is displayed
      const toast = container.querySelector('[data-testid="inbox-deleted-toast"]');
      expect(toast).not.toBeNull();
      expect(toast!.textContent).toContain('Deleted');
      expect(toast!.textContent).toContain('Undo');

      // Tap Undo to restore email
      const undoBtn = toast!.querySelector('button');
      expect(undoBtn).not.toBeNull();
      act(() => {
        undoBtn!.click();
      });

      // Email m-1 is restored
      expect(container.querySelector('[data-testid="mobile-email-row-m-1"]')).not.toBeNull();
    });

    it('commits Delete directly when swiped left past -120px and released', () => {
      const { container } = renderEl(<MobileInboxFlowSuite />);

      const row = container.querySelector('[data-testid="mobile-email-row-m-1"]');
      expect(row).not.toBeNull();

      // Swipe Left past -120px: from 200px to 50px (dx = -150px)
      act(() => {
        row!.dispatchEvent(createTouchEvent('touchstart', 200, 50));
        row!.dispatchEvent(createTouchEvent('touchmove', 50, 50));
        row!.dispatchEvent(createTouchEvent('touchend', 50, 50));
      });

      // Automatically committed delete
      expect(container.querySelector('[data-testid="mobile-email-row-m-1"]')).toBeNull();
      expect(container.querySelector('[data-testid="inbox-deleted-toast"]')).not.toBeNull();
    });

    it('toggles flagged status when Flag action button is tapped', () => {
      const { container } = renderEl(<MobileInboxFlowSuite />);

      const row = container.querySelector('[data-testid="mobile-email-row-m-4"]');
      expect(row).not.toBeNull();

      // Row m-4 is initially not flagged
      expect(row!.querySelector('[aria-label="Flagged"]')).toBeNull();

      // Swipe Left
      act(() => {
        row!.dispatchEvent(createTouchEvent('touchstart', 200, 50));
        row!.dispatchEvent(createTouchEvent('touchmove', 120, 50));
        row!.dispatchEvent(createTouchEvent('touchend', 120, 50));
      });

      const flagBtn = container.querySelector<HTMLButtonElement>('[data-testid="swipe-action-flag-m-4"]');
      expect(flagBtn).not.toBeNull();

      act(() => {
        flagBtn!.click();
      });

      // Now row m-4 is flagged
      const updatedRow = container.querySelector('[data-testid="mobile-email-row-m-4"]');
      expect(updatedRow!.querySelector('[aria-label="Flagged"]')).not.toBeNull();
    });
  });

  describe('Email Row Swipe Right Gestures (Unread & Archive)', () => {
    it('reveals Unread and Archive action buttons on swipe right and toggles unread on button tap', () => {
      const { container } = renderEl(<MobileInboxFlowSuite />);

      const row = container.querySelector('[data-testid="mobile-email-row-m-1"]');
      expect(row).not.toBeNull();
      // Initially m-1 is read (no Unread blue dot)
      expect(row!.querySelector('[aria-label="Unread"]')).toBeNull();

      // Swipe Right: from 100px to 190px (dx = +90px)
      act(() => {
        row!.dispatchEvent(createTouchEvent('touchstart', 100, 50));
        row!.dispatchEvent(createTouchEvent('touchmove', 190, 50));
        row!.dispatchEvent(createTouchEvent('touchend', 190, 50));
      });

      const unreadBtn = container.querySelector<HTMLButtonElement>('[data-testid="swipe-action-unread-m-1"]');
      const archiveBtn = container.querySelector<HTMLButtonElement>('[data-testid="swipe-action-archive-m-1"]');
      expect(unreadBtn).not.toBeNull();
      expect(archiveBtn).not.toBeNull();
      expect(unreadBtn!.className).toContain('bg-blue-600');
      expect(archiveBtn!.className).toContain('bg-emerald-600');

      // Tap Unread button
      act(() => {
        unreadBtn!.click();
      });

      // Now m-1 has unread dot
      const updatedRow = container.querySelector('[data-testid="mobile-email-row-m-1"]');
      expect(updatedRow!.querySelector('[aria-label="Unread"]')).not.toBeNull();
    });

    it('commits Toggle Unread directly when dragged past +120px and released', () => {
      const { container } = renderEl(<MobileInboxFlowSuite />);

      const row = container.querySelector('[data-testid="mobile-email-row-m-1"]');
      expect(row).not.toBeNull();
      expect(row!.querySelector('[aria-label="Unread"]')).toBeNull();

      // Swipe Right past 120px: from 100px to 250px (dx = +150px)
      act(() => {
        row!.dispatchEvent(createTouchEvent('touchstart', 100, 50));
        row!.dispatchEvent(createTouchEvent('touchmove', 250, 50));
        row!.dispatchEvent(createTouchEvent('touchend', 250, 50));
      });

      const updatedRow = container.querySelector('[data-testid="mobile-email-row-m-1"]');
      expect(updatedRow!.querySelector('[aria-label="Unread"]')).not.toBeNull();
    });

    it('archives email and shows undo toast when Archive action button is tapped', () => {
      const { container } = renderEl(<MobileInboxFlowSuite />);

      const row = container.querySelector('[data-testid="mobile-email-row-m-2"]');
      expect(row).not.toBeNull();

      // Swipe Right
      act(() => {
        row!.dispatchEvent(createTouchEvent('touchstart', 100, 50));
        row!.dispatchEvent(createTouchEvent('touchmove', 180, 50));
        row!.dispatchEvent(createTouchEvent('touchend', 180, 50));
      });

      const archiveBtn = container.querySelector<HTMLButtonElement>('[data-testid="swipe-action-archive-m-2"]');
      expect(archiveBtn).not.toBeNull();

      act(() => {
        archiveBtn!.click();
      });

      // Row m-2 is removed and toast is shown
      expect(container.querySelector('[data-testid="mobile-email-row-m-2"]')).toBeNull();
      expect(container.querySelector('[data-testid="inbox-deleted-toast"]')).not.toBeNull();
    });
  });

  describe('Unswiped Tap Navigation', () => {
    it('opens email detail screen when clicking on an unswiped email row', () => {
      const { container } = renderEl(<MobileInboxFlowSuite />);

      const row = container.querySelector<HTMLDivElement>('[data-testid="mobile-email-row-m-1"]');
      expect(row).not.toBeNull();

      act(() => {
        row!.click();
      });

      // Navigated to email detail screen
      expect(container.querySelector('[data-testid="mobile-email-detail-view"]')).not.toBeNull();
    });
  });

  describe('Pull-to-Refresh Gesture Physics', () => {
    it('renders pull-to-refresh indicator and reacts to vertical pull drag', () => {
      const { container } = renderEl(<MobileInboxFlowSuite />);

      const ptr = container.querySelector('[data-testid="mobile-pull-to-refresh"]');
      expect(ptr).not.toBeNull();

      const scrollContainer = ptr!.parentElement!;

      // Pull down from 50px to 180px (dy = 130px > 55px threshold)
      act(() => {
        scrollContainer.dispatchEvent(createTouchEvent('touchstart', 150, 50));
        scrollContainer.dispatchEvent(createTouchEvent('touchmove', 150, 180));
      });

      expect(ptr!.textContent).toContain('Release to refresh');

      // Release touch triggers refresh
      act(() => {
        scrollContainer.dispatchEvent(createTouchEvent('touchend', 150, 180));
      });

      expect(ptr!.textContent).toContain('Refreshing…');
    });
  });

  describe('Bottom Sheet Swipe-Down to Dismiss', () => {
    it('renders iOS grab handle on Filter sheet and dragging down > 70px dismisses it', () => {
      const { container } = renderEl(<MobileInboxFlowSuite />);

      // Open filter sheet
      const filterBtn = container.querySelector<HTMLButtonElement>('[data-testid="mobile-inbox-filter-btn"]');
      expect(filterBtn).not.toBeNull();
      act(() => {
        filterBtn!.click();
      });

      const filterSheet = container.querySelector('[data-testid="mobile-inbox-filter-sheet"]');
      expect(filterSheet).not.toBeNull();

      // Check iOS grab handle pill
      const handle = filterSheet!.querySelector('[data-testid="sheet-drag-handle"]');
      expect(handle).not.toBeNull();
      expect(handle!.className).toContain('w-10');
      expect(handle!.className).toContain('h-1.5');
      expect(handle!.className).toContain('rounded-full');
      expect(handle!.className).toContain('cursor-grab');

      // Drag handle down > 70px (e.g. from y=100 to y=190, dy=90)
      act(() => {
        handle!.dispatchEvent(createTouchEvent('touchstart', 150, 100));
        handle!.dispatchEvent(createTouchEvent('touchmove', 150, 190));
        handle!.dispatchEvent(createTouchEvent('touchend', 150, 190));
      });

      // Filter sheet is dismissed
      expect(container.querySelector('[data-testid="mobile-inbox-filter-sheet"]')).toBeNull();
    });

    it('renders grab handle on MobileComposerSheet and dragging down > 70px dismisses it', () => {
      const onClose = vi.fn();
      const { container } = renderEl(<MobileComposerSheet isOpen={true} onClose={onClose} />);

      const composer = container.querySelector('[data-testid="mobile-composer-sheet"]');
      expect(composer).not.toBeNull();

      const handle = composer!.querySelector('[data-testid="sheet-drag-handle"]');
      expect(handle).not.toBeNull();

      // Drag down 80px
      act(() => {
        handle!.dispatchEvent(createTouchEvent('touchstart', 150, 50));
        handle!.dispatchEvent(createTouchEvent('touchmove', 150, 130));
        handle!.dispatchEvent(createTouchEvent('touchend', 150, 130));
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('renders grab handle on Drawer Add Account action sheet and dragging down dismisses it', () => {
      const { container } = renderEl(<MobileInboxFlowSuite />);

      // Open drawer
      const avatarBtn = container.querySelector<HTMLButtonElement>('[data-testid="mobile-inbox-avatar-btn"]');
      expect(avatarBtn).not.toBeNull();
      act(() => {
        avatarBtn!.click();
      });

      const drawer = container.querySelector('[data-testid="mobile-drawer-add-account"]');
      expect(drawer).not.toBeNull();

      const actionSheetBtn = drawer!.querySelector('[data-testid="action-sheet-add-email-account"]');
      expect(actionSheetBtn).not.toBeNull();

      const handles = drawer!.querySelectorAll('[data-testid="sheet-drag-handle"]');
      expect(handles.length).toBeGreaterThan(0);

      // Drag down the action sheet handle
      const sheetHandle = handles[handles.length - 1];
      act(() => {
        sheetHandle.dispatchEvent(createTouchEvent('touchstart', 150, 100));
        sheetHandle.dispatchEvent(createTouchEvent('touchmove', 150, 190));
        sheetHandle.dispatchEvent(createTouchEvent('touchend', 150, 190));
      });

      // Action sheet is dismissed
      expect(drawer!.querySelector('[data-testid="action-sheet-add-email-account"]')).toBeNull();
    });
  });
});

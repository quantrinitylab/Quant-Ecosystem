// @vitest-environment jsdom
// ============================================================================
// fix/qm-drive-keyboard-triage-2, CODEX follow-up — W3C APG corrective.
//
// The triage PR (drive-keyboard-triage.test.tsx) proved the *keys* work, but
// the interaction it proved was NOT an APG widget, and its screen-reader
// evidence was overstated:
//
//   - the "highlight" was a visual-only outline class: the highlighted card
//     was never DOM-focused, never tabbable, and carried `aria-selected` on a
//     plain <div> with no role — a screen reader consumed nothing at all.
//     Highlight (where focus is) and selection (what x toggled) were
//     indistinguishable in the accessibility tree.
//   - Escape only cleared the visual ring; focus went nowhere stated.
//   - the recent strip in list view rendered no item nodes at all, so j/k
//     moved an invisible highlight there.
//   - Shift+F/Shift+T opened dialogs whose focus in/out was never proven.
//
// The pattern this surface actually is: a W3C APG **listbox** (not a grid —
// there are no columns, headers, or cell navigation; items are a linear,
// multi-selectable list). Concretely that means:
//   - each navigable group is role="listbox" aria-multiselectable="true",
//     each item is role="option" with aria-selected reflecting ONLY the
//     x-selection set (selectedIds), never the highlight;
//   - the highlight IS real DOM focus via roving tabindex: exactly one
//     navigable item has tabIndex 0 (the focused one, or the first when
//     nothing is focused) and every other has tabIndex -1; j/k move DOM
//     focus, so a screen reader announces the focused option and its
//     selected state with no extra live region for movement;
//   - x toggles are announced through a polite live region that reflects the
//     selection state change (not the key press);
//   - Escape drops the highlight AND returns focus to the element that had
//     focus when keyboard navigation began, or to the Files panel when there
//     was none (focus was on <body>, or on an item card itself);
//   - Shift+F/Shift+T dialogs are the shared-ui Modal: focus into the dialog
//     on open, focus back to the opener on close. That half is Modal's own
//     contract (see the dialog note below the imports); this file proves the
//     hook fires from a focused list card, which is what makes the card the
//     restore target.
//
// HONESTY NOTE (read before citing this file as "SR evidence"): these are
// jsdom DOM-semantics tests — they prove the roles, tabindex roving,
// aria-selected, and focus positions a screen reader consumes. They are NOT
// a screen-reader run. A live NVDA/VoiceOver pass over the real Drive surface
// is still owed to the merge pipeline / QA loop, and this file must not be
// quoted as that pass.
// ============================================================================

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DriveHomeSubView, type DriveItem } from '../components/DriveSubViews';
import { useDriveKeyboard } from '../hooks/useDriveKeyboard';
import { keyboardEngine } from '../lib/keyboard/engine';
import { driveCommand } from '../lib/keyboard/command-registry';
// NOTE on dialog focus: Shift+F/T open the shared-ui Modal, whose focus
// in/out (trap + data-autofocus + restore to the opener) is that component's
// own contract, proved by packages/shared-ui's Modal.test.tsx and
// useFocusTrap.test.tsx suites (run as neighbors, reported with this suite).
// Importing Modal source directly into a quantmail test breaks on two React
// copies (dispatcher null — the reason every other quantmail suite mocks the
// shared-ui barrel), so this file does NOT fake dialog proof with a stub
// dialog: it proves the half this PR owns — the hook fires from a focused
// list card — and names the Modal suites as the dialog half. The page wiring
// (Modal + data-autofocus inputs in apps/quantmail/src/app/drive/page.tsx)
// is unchanged by this fix and was verified by reading it.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const noop = () => {};

const sampleFolders: DriveItem[] = [
  { id: 'folder-1', name: 'Project Docs', type: 'folder', mimeType: '', size: 0, modifiedAt: '2026-10-06T10:00:00Z' },
  { id: 'folder-2', name: 'Assets', type: 'folder', mimeType: '', size: 0, modifiedAt: '2026-10-05T10:00:00Z' },
];

const sampleFiles: DriveItem[] = [
  { id: 'file-1', name: 'notes.txt', type: 'file', mimeType: 'text/plain', size: 128, modifiedAt: '2026-10-07T10:00:00Z' },
  { id: 'file-2', name: 'deck.pdf', type: 'file', mimeType: 'application/pdf', size: 2048, modifiedAt: '2026-10-04T10:00:00Z' },
];

function press(key: string, target: Element | Document = document, extra: KeyboardEventInit = {}) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra }));
  });
}

function focusEl(el: Element | null) {
  act(() => {
    (el as HTMLElement | null)?.focus();
  });
}

function clickEl(el: Element | null) {
  act(() => {
    (el as HTMLElement | null)?.click();
  });
}

describe('drive keyboard APG semantics', () => {
  let detach: (() => void) | null = null;
  const cleanups: Array<() => void> = [];

  beforeAll(() => {
    detach = keyboardEngine.attach();
  });

  afterAll(() => {
    detach?.();
    detach = null;
  });

  afterEach(() => {
    while (cleanups.length) cleanups.pop()!();
  });

  function renderHome(overrides: Record<string, unknown> = {}) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root | null = null;
    act(() => {
      root = createRoot(container);
      root.render(
        <DriveHomeSubView folders={sampleFolders} files={sampleFiles} {...overrides} />,
      );
    });
    const item = (id: string) => container.querySelector(`[data-drive-item-id="${id}"]`);
    const items = () => Array.from(container.querySelectorAll('[data-drive-item-id]'));
    const tabbableItems = () =>
      items().filter((el) => el.getAttribute('tabindex') === '0');
    cleanups.push(() => {
      act(() => {
        root?.unmount();
      });
      container.remove();
    });
    return { container, item, items, tabbableItems };
  }

  /** Stateful harness: the page applies onToggleSelect to selectedIds, so the
   *  selection-announcement effect sees the real state change, not a stale prop. */
  function renderHomeStateful() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root | null = null;
    function Harness() {
      const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
      return (
        <DriveHomeSubView
          folders={sampleFolders}
          files={sampleFiles}
          selectedIds={selectedIds}
          onToggleSelect={(id: string) => {
            setSelectedIds((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            });
          }}
        />
      );
    }
    act(() => {
      root = createRoot(container);
      root.render(<Harness />);
    });
    const item = (id: string) => container.querySelector(`[data-drive-item-id="${id}"]`);
    const announcement = () =>
      container.querySelector('[data-testid="drive-selection-announcement"]')?.textContent ?? '';
    cleanups.push(() => {
      act(() => {
        root?.unmount();
      });
      container.remove();
    });
    return { container, item, announcement };
  }

  it('is a listbox: groups carry role=listbox + aria-multiselectable, items role=option', () => {
    const { container, item } = renderHome();
    const listboxes = container.querySelectorAll('[role="listbox"]');
    // Home view: one listbox for folders, one for the recent strip.
    expect(listboxes.length).toBe(2);
    for (const box of listboxes) {
      expect(box.getAttribute('aria-multiselectable')).toBe('true');
      expect(box.getAttribute('aria-label')).toBeTruthy();
    }
    expect(item('folder-1')?.getAttribute('role')).toBe('option');
    expect(item('file-1')?.getAttribute('role')).toBe('option');
    // The option name is the item name (folders named as folders), so a screen
    // reader announces the item, not the card's button labels.
    expect(item('folder-1')?.getAttribute('aria-label')).toBe('Folder Project Docs');
    expect(item('file-1')?.getAttribute('aria-label')).toBe('notes.txt');
  });

  it('roves tabindex: exactly one item tabbable, and j/k move real DOM focus', () => {
    const { item, tabbableItems } = renderHome();
    // Nothing focused yet: the first navigable item is the single Tab stop.
    expect(tabbableItems().map((el) => el.getAttribute('data-drive-item-id'))).toEqual(['folder-1']);
    press('j');
    expect(document.activeElement).toBe(item('folder-1'));
    expect(tabbableItems().map((el) => el.getAttribute('data-drive-item-id'))).toEqual(['folder-1']);
    press('j');
    expect(document.activeElement).toBe(item('folder-2'));
    expect(tabbableItems().map((el) => el.getAttribute('data-drive-item-id'))).toEqual(['folder-2']);
    // Across the folder/file boundary into the recent strip.
    press('j');
    expect(document.activeElement).toBe(item('file-1'));
    expect(tabbableItems().map((el) => el.getAttribute('data-drive-item-id'))).toEqual(['file-1']);
    press('k');
    expect(document.activeElement).toBe(item('folder-2'));
    // Every other navigable item is explicitly -1, not merely unfocusable.
    const others = ['folder-1', 'file-1', 'file-2'].map((id) => item(id)?.getAttribute('tabindex'));
    expect(others).toEqual(['-1', '-1', '-1']);
  });

  it('Tab entry syncs the highlight, so j continues from the Tabbed-to item', () => {
    const { item } = renderHome();
    focusEl(item('folder-1'));
    expect(document.activeElement).toBe(item('folder-1'));
    press('j');
    // Pre-fix this stayed on folder-1: Tab position was invisible to the
    // engine, which always restarted at the top.
    expect(document.activeElement).toBe(item('folder-2'));
  });

  it('aria-selected reflects ONLY the x-selection set, never the highlight', () => {
    const { item } = renderHome({ selectedIds: new Set(['folder-2']) });
    press('j'); // highlight folder-1, selection stays folder-2
    expect(document.activeElement).toBe(item('folder-1'));
    expect(item('folder-1')?.getAttribute('aria-selected')).toBe('false');
    expect(item('folder-2')?.getAttribute('aria-selected')).toBe('true');
    press('j'); // highlight moves onto the selected item
    expect(document.activeElement).toBe(item('folder-2'));
    expect(item('folder-2')?.getAttribute('aria-selected')).toBe('true');
  });

  it('x toggles are announced with the resulting selection state, not the key', () => {
    const { announcement } = renderHomeStateful();
    press('j');
    press('x');
    expect(announcement()).toBe('Project Docs selected');
    press('x');
    expect(announcement()).toBe('Project Docs deselected');
  });

  it('Escape drops the highlight AND returns focus to the pre-navigation element', () => {
    const { container, item } = renderHome();
    const before = document.createElement('button');
    before.type = 'button';
    before.textContent = 'Before list';
    container.appendChild(before);
    focusEl(before);
    press('j');
    expect(document.activeElement).toBe(item('folder-1'));
    press('Escape');
    expect(document.activeElement).toBe(before);
    // Highlight truly dropped: roving resets to the first item as Tab stop.
    expect(item('folder-1')?.getAttribute('tabindex')).toBe('0');
    expect(item('folder-2')?.getAttribute('tabindex')).toBe('-1');
    press('j');
    expect(document.activeElement).toBe(item('folder-1'));
  });

  it('Escape from a Tab-entered card returns focus to the Files panel', () => {
    const { container, item } = renderHome();
    const panel = container.querySelector('#drive-panel-home');
    expect(panel?.getAttribute('tabindex')).toBe('-1');
    focusEl(item('folder-1'));
    press('j');
    expect(document.activeElement).toBe(item('folder-2'));
    press('Escape');
    // Origin was an item card itself, so the stated fallback is the panel —
    // returning to the card would leave focus on a highlight-less option.
    expect(document.activeElement).toBe(panel);
  });

  it('Escape stays inert inside a text input: highlight and input focus survive', () => {
    const { container, item } = renderHome();
    press('j');
    expect(document.activeElement).toBe(item('folder-1'));
    const input = document.createElement('input');
    input.type = 'text';
    container.appendChild(input);
    focusEl(input);
    press('Escape', input);
    expect(document.activeElement).toBe(input);
    expect(item('folder-1')?.getAttribute('tabindex')).toBe('0');
  });

  it('category drill-down roves tabindex across the full category list', () => {
    const { container, item, tabbableItems } = renderHome();
    clickEl(container.querySelector('[data-testid="category-card-documents"]'));
    // Drilled view: a single listbox holding both documents.
    expect(container.querySelectorAll('[role="listbox"]').length).toBe(1);
    press('j');
    expect(document.activeElement).toBe(item('file-1'));
    expect(tabbableItems().map((el) => el.getAttribute('data-drive-item-id'))).toEqual(['file-1']);
    press('j');
    expect(document.activeElement).toBe(item('file-2'));
    press('k');
    expect(document.activeElement).toBe(item('file-1'));
  });

  it('recent strip in list view is navigable too (not just the grid view)', () => {
    const files: DriveItem[] = Array.from({ length: 10 }, (_, i) => ({
      id: `doc-${i + 1}`,
      name: `doc-${i + 1}.txt`,
      type: 'file' as const,
      mimeType: 'text/plain',
      size: 100,
      // Newest first in recent order: doc-1 newest, doc-10 oldest.
      modifiedAt: `2026-10-${String(20 - i).padStart(2, '0')}T10:00:00Z`,
    }));
    const { item, items } = renderHome({ folders: [], files, viewMode: 'list' });
    expect(items().length).toBe(10);
    for (let n = 0; n < 10; n++) press('j');
    expect(document.activeElement).toBe(item('doc-10'));
    expect(item('doc-10')?.getAttribute('role')).toBe('option');
    expect(item('doc-10')?.getAttribute('tabindex')).toBe('0');
  });

  it('trash drill-down stays non-navigable: j is a no-op, nothing becomes tabbable', () => {
    const { container } = renderHome();
    clickEl(container.querySelector('[data-testid="category-card-trash"]'));
    press('j');
    expect(container.querySelectorAll('[data-drive-item-id]').length).toBe(0);
    expect(container.querySelectorAll('[role="listbox"]').length).toBe(0);
  });

  it('the ? sheet wording documents focus (not just a visual highlight) + focus return', () => {
    expect(driveCommand('drive.nextItem').description).toContain('focus');
    expect(driveCommand('drive.previousItem').description).toContain('focus');
    expect(driveCommand('drive.openItem').description).toContain('focused');
    expect(driveCommand('drive.clearFocus').description).toContain('return focus');
    expect(driveCommand('drive.toggleSelect').description).toContain('focused');
  });
});

describe('useDriveKeyboard create keys from a focused list card', () => {
  let detach: (() => void) | null = null;
  const cleanups: Array<() => void> = [];

  beforeAll(() => {
    detach = keyboardEngine.attach();
  });

  afterAll(() => {
    detach?.();
    detach = null;
  });

  afterEach(() => {
    while (cleanups.length) cleanups.pop()!();
  });

  // The hook's half of the dialog contract: from a DOM-focused list card,
  // Shift+F / Shift+T fire the open callbacks the page wires to the Modal.
  // Focus into the Modal and back to the card on close is Modal's contract
  // (see the header note); the card is the restore target because it holds
  // DOM focus when the dialog opens, which only the APG fix makes true.
  function renderHookHarness(onNewFolder: () => void, onNewDocument: () => void) {
    function Harness() {
      useDriveKeyboard({ onNewFolder, onNewDocument });
      return null;
    }
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root | null = null;
    act(() => {
      root = createRoot(container);
      root.render(<Harness />);
    });
    cleanups.push(() => {
      act(() => {
        root?.unmount();
      });
      container.remove();
    });
  }

  it('Shift+F / Shift+T fire from a focused list card (the Modal restore target)', () => {
    const onNewFolder = vi.fn();
    const onNewDocument = vi.fn();
    renderHookHarness(onNewFolder, onNewDocument);
    // Simulate the post-fix list state: a card holds DOM focus.
    const card = document.createElement('div');
    card.tabIndex = 0;
    document.body.appendChild(card);
    try {
      focusEl(card);
      expect(document.activeElement).toBe(card);
      press('F', document, { shiftKey: true });
      expect(onNewFolder).toHaveBeenCalledTimes(1);
      press('T', document, { shiftKey: true });
      expect(onNewDocument).toHaveBeenCalledTimes(1);
    } finally {
      card.remove();
    }
  });
});

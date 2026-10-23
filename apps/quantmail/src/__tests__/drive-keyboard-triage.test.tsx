// @vitest-environment jsdom
// ============================================================================
// fix/qm-drive-keyboard-triage-2 — Google-Drive-class keyboard triage on /drive.
//
// The finding: the drive file list was mouse-only — no list keydown bindings
// anywhere (page.tsx had only Esc-to-close-menu and Enter-in-input handlers,
// DriveFilesSubView had zero). This pins the fixed behavior through real DOM
// events (jsdom + createRoot + act, no @testing-library/react — the
// apps/quantmail package does not depend on it, and CI installs with
// --frozen-lockfile):
//
//   DriveHomeSubView (the live Files surface):
//   1. `j` highlights the first visible item, repeated `j` walks forward,
//      `k` walks back, edges stay put.
//   2. `x` toggles selection of the highlighted item via onToggleSelect;
//      with nothing highlighted it is a no-op.
//   3. `Enter` enters the highlighted folder / previews the highlighted file.
//   4. `Escape` drops the highlight.
//   5. `j` stays inert while the caret is in a text input (engine default).
//   6. The keys are documented in DRIVE_COMMAND_REFERENCE and the `?` help
//      sheet groups them under a Drive section (single-declaration contract).
//   useDriveKeyboard (page level):
//   7. `shift+f` opens the new-folder dialog, `shift+t` the new-document one.
//
// The engine is attached for real (keyboardEngine.attach) and keys are
// dispatched as genuine KeyboardEvents on the document — the same path a real
// key press takes, including scope resolution.
// ============================================================================

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DriveHomeSubView, type DriveItem } from '../components/DriveSubViews';
import { useDriveKeyboard } from '../hooks/useDriveKeyboard';
import { keyboardEngine } from '../lib/keyboard/engine';
import {
  DRIVE_COMMAND_REFERENCE,
  driveCommand,
  type DriveCommandId,
} from '../lib/keyboard/command-registry';

// React 19's act(...) requires this flag in the test environment.
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

/** Keyboard highlight marker: the accent focus ring class. */
function isHighlighted(el: Element | null): boolean {
  return !!el && el.className.includes('outline-[var(--app-accent)]');
}

describe('drive keyboard triage', () => {
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
    cleanups.push(() => {
      act(() => {
        root?.unmount();
      });
      container.remove();
    });
    return { container, item };
  }

  it('documents every drive key in DRIVE_COMMAND_REFERENCE under the Drive group', () => {
    const ids: DriveCommandId[] = [
      'drive.nextItem',
      'drive.previousItem',
      'drive.toggleSelect',
      'drive.openItem',
      'drive.clearFocus',
      'drive.newFolder',
      'drive.newDocument',
    ];
    for (const id of ids) {
      const ref = driveCommand(id);
      expect(ref.group).toBe('Drive');
      // The reference lookup must resolve — a typo would throw, not drift.
      expect(DRIVE_COMMAND_REFERENCE).toContainEqual(ref);
    }
    const keys = new Map(DRIVE_COMMAND_REFERENCE.map((r) => [Array.isArray(r.keys) ? r.keys[0] : r.keys, r.id]));
    expect(keys.get('j')).toBe('drive.nextItem');
    expect(keys.get('k')).toBe('drive.previousItem');
    expect(keys.get('x')).toBe('drive.toggleSelect');
    expect(keys.get('enter')).toBe('drive.openItem');
    expect(keys.get('escape')).toBe('drive.clearFocus');
    expect(keys.get('shift+f')).toBe('drive.newFolder');
    expect(keys.get('shift+t')).toBe('drive.newDocument');
  });

  it('j highlights the first item and walks forward; k walks back; edges stay put', () => {
    const { item } = renderHome();
    press('j');
    expect(isHighlighted(item('folder-1'))).toBe(true);
    press('j');
    expect(isHighlighted(item('folder-1'))).toBe(false);
    expect(isHighlighted(item('folder-2'))).toBe(true);
    // Forward across the folder/file boundary into the recent strip.
    press('j');
    expect(isHighlighted(item('file-1'))).toBe(true);
    press('k');
    expect(isHighlighted(item('folder-2'))).toBe(true);
    // Bottom edge stays put.
    press('j');
    press('j');
    press('j');
    press('j');
    expect(isHighlighted(item('file-2'))).toBe(true);
    // Top edge stays put.
    press('k');
    press('k');
    press('k');
    press('k');
    expect(isHighlighted(item('folder-1'))).toBe(true);
  });

  it('x toggles selection of the highlighted item and is a no-op with no highlight', () => {
    const onToggleSelect = vi.fn();
    const { item } = renderHome({ onToggleSelect });
    press('x');
    expect(onToggleSelect).not.toHaveBeenCalled();
    press('j');
    press('x');
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(onToggleSelect).toHaveBeenCalledWith('folder-1');
    press('j');
    press('x');
    expect(onToggleSelect).toHaveBeenCalledWith('folder-2');
  });

  it('Enter enters the highlighted folder and previews the highlighted file', () => {
    const onNavigateToFolder = vi.fn();
    const onPreviewItem = vi.fn();
    renderHome({ onNavigateToFolder, onPreviewItem });
    press('j');
    press('Enter');
    expect(onNavigateToFolder).toHaveBeenCalledTimes(1);
    expect(onNavigateToFolder).toHaveBeenCalledWith('folder-1', 'Project Docs');
    press('j');
    press('j');
    press('Enter');
    expect(onPreviewItem).toHaveBeenCalledTimes(1);
    expect(onPreviewItem.mock.calls[0][0].id).toBe('file-1');
  });

  it('Escape drops the highlight', () => {
    const { item } = renderHome();
    press('j');
    expect(isHighlighted(item('folder-1'))).toBe(true);
    press('Escape');
    expect(isHighlighted(item('folder-1'))).toBe(false);
    // After clearing, j starts over at the top.
    press('j');
    expect(isHighlighted(item('folder-1'))).toBe(true);
  });

  it('j stays inert while the caret is in a text input', () => {
    const { container, item } = renderHome();
    const input = document.createElement('input');
    input.type = 'text';
    container.appendChild(input);
    input.focus();
    press('j', input);
    expect(isHighlighted(item('folder-1'))).toBe(false);
  });

  it('marks the highlighted card aria-selected when it is in the selection set', () => {
    const { item } = renderHome({ selectedIds: new Set(['folder-1']) });
    press('j');
    expect(item('folder-1')?.getAttribute('aria-selected')).toBe('true');
    expect(item('folder-2')?.getAttribute('aria-selected')).toBe('false');
  });
});

describe('useDriveKeyboard (page-level create keys)', () => {
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

  function renderHook(onNewFolder: () => void, onNewDocument: () => void) {
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

  it('shift+f opens the new-folder dialog, shift+t the new-document one', () => {
    const onNewFolder = vi.fn();
    const onNewDocument = vi.fn();
    renderHook(onNewFolder, onNewDocument);
    press('F', document, { shiftKey: true });
    expect(onNewFolder).toHaveBeenCalledTimes(1);
    expect(onNewDocument).not.toHaveBeenCalled();
    press('T', document, { shiftKey: true });
    expect(onNewDocument).toHaveBeenCalledTimes(1);
  });

  it('shift+f stays inert while typing a capital F in a text input', () => {
    const onNewFolder = vi.fn();
    renderHook(onNewFolder, noop);
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    try {
      input.focus();
      press('F', input, { shiftKey: true });
      expect(onNewFolder).not.toHaveBeenCalled();
    } finally {
      input.remove();
    }
  });
});

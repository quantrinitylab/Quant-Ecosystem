// @vitest-environment jsdom
// ============================================================================
// fix/qm-drive-folder-colors-2 — FolderColorPicker interaction tests.
//
// Renders the REAL picker into a DOM container and drives the REAL controls:
// 16 swatches render, clicking a swatch calls onSelect with its hex and then
// onClose, "No color" resets with null, Escape closes without selecting.
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FolderColorPicker } from '../app/drive/components/FolderColorPicker';
import { FOLDER_COLORS } from '../lib/folder-colors';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderPicker(props: {
  selected?: string | null;
  onSelect?: (hex: string | null) => void;
  onClose?: () => void;
}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const onSelect = props.onSelect ?? (() => {});
  const onClose = props.onClose ?? (() => {});
  act(() => {
    root!.render(
      <FolderColorPicker
        selected={props.selected ?? null}
        onSelect={onSelect}
        onClose={onClose}
        anchor={{ x: 100, y: 100 }}
        label="Docs"
      />,
    );
  });
  return { onSelect, onClose };
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe('FolderColorPicker', () => {
  it('renders all 16 palette swatches plus the reset button', () => {
    renderPicker({});
    const swatches = container!.querySelectorAll('button[aria-label^="Color "]');
    expect(swatches).toHaveLength(16);
    const reset = Array.from(container!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('No color'),
    );
    expect(reset).toBeTruthy();
  });

  it('clicking a swatch selects its hex and closes', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    renderPicker({ onSelect, onClose });
    const first = container!.querySelector(
      `button[aria-label="Color ${FOLDER_COLORS[0].name}"]`,
    ) as HTMLButtonElement;
    act(() => {
      first.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(FOLDER_COLORS[0].hex);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('"No color" resets with null and closes', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    renderPicker({ selected: FOLDER_COLORS[0].hex, onSelect, onClose });
    const reset = Array.from(container!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('No color'),
    ) as HTMLButtonElement;
    act(() => {
      reset.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('marks the selected swatch as pressed', () => {
    renderPicker({ selected: FOLDER_COLORS[0].hex });
    const first = container!.querySelector(
      `button[aria-label="Color ${FOLDER_COLORS[0].name}"]`,
    ) as HTMLButtonElement;
    expect(first.getAttribute('aria-pressed')).toBe('true');
  });

  it('Escape closes without selecting', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    renderPicker({ onSelect, onClose });
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('Escape after unmount does not call onClose again (negative control)', () => {
    const onClose = vi.fn();
    renderPicker({ onClose });
    act(() => {
      root!.unmount();
    });
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ============================================================================
// PR #1506 deep-fix — focus contract. Every invocation point (context menu,
// hover palette action, breadcrumb control) renders this same component, so
// the contract is proven once here and holds at all three: open moves focus
// into the picker, every close path returns focus to the invoking element,
// arrow keys traverse all 17 controls without trapping or dropping focus,
// and a close whose invoker is already gone is a safe no-op.
// ============================================================================

function OpenCloseHarness({ selected }: { selected?: string | null }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <button type="button" id="opener" onClick={() => setOpen(true)}>
        Open picker
      </button>
      {open && (
        <FolderColorPicker
          selected={selected ?? null}
          onSelect={() => {}}
          onClose={() => setOpen(false)}
          anchor={{ x: 100, y: 100 }}
          label="Docs"
        />
      )}
    </div>
  );
}

function renderHarness(selected?: string | null) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<OpenCloseHarness selected={selected} />);
  });
  const opener = container!.querySelector('#opener') as HTMLButtonElement;
  act(() => {
    opener.focus();
    opener.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  return opener;
}

function pickerButtons() {
  return Array.from(container!.querySelectorAll('button')).filter(
    (b) => b.id !== 'opener',
  ) as HTMLButtonElement[];
}

describe('FolderColorPicker focus', () => {
  it('opening moves focus to the selected swatch, else the first swatch', () => {
    const opener = renderHarness(FOLDER_COLORS[3].hex);
    expect(document.activeElement).toBe(pickerButtons()[3]);
    expect(opener).not.toBe(document.activeElement);
  });

  it('opening with no selection focuses the first swatch', () => {
    renderHarness(null);
    expect(document.activeElement).toBe(pickerButtons()[0]);
  });

  it('Escape closes and returns focus to the invoking element', () => {
    const opener = renderHarness(null);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(container!.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('selection close returns focus to the invoking element', () => {
    const opener = renderHarness(null);
    act(() => {
      pickerButtons()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container!.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('backdrop close returns focus to the invoking element', () => {
    const opener = renderHarness(null);
    act(() => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    expect(container!.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('arrow keys traverse swatches and the reset control without dropping focus', () => {
    renderHarness(null);
    const buttons = pickerButtons();
    expect(buttons).toHaveLength(17);
    expect(document.activeElement).toBe(buttons[0]);
    const press = (key: string) => {
      act(() => {
        (document.activeElement as HTMLElement).dispatchEvent(
          new KeyboardEvent('keydown', { key, bubbles: true }),
        );
      });
    };
    press('ArrowRight');
    expect(document.activeElement).toBe(buttons[1]);
    press('ArrowDown');
    expect(document.activeElement).toBe(buttons[5]);
    press('ArrowLeft');
    expect(document.activeElement).toBe(buttons[4]);
    press('End');
    expect(document.activeElement).toBe(buttons[16]);
    press('ArrowUp');
    expect(document.activeElement).toBe(buttons[12]);
    press('Home');
    expect(document.activeElement).toBe(buttons[0]);
    press('ArrowLeft');
    expect(document.activeElement).toBe(buttons[16]);
    // Focus never left the picker controls during the whole traversal.
    expect(buttons).toContain(document.activeElement);
  });

  it('Tab does not trap: it neither closes the picker nor moves focus by itself', () => {
    renderHarness(null);
    const buttons = pickerButtons();
    act(() => {
      buttons[16].focus();
    });
    act(() => {
      (document.activeElement as HTMLElement).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
      );
    });
    // No focus trap is installed, so Tab leaves focus where it was in
    // jsdom (real Tab order is native DOM order) and the picker stays open.
    expect(container!.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.activeElement).toBe(buttons[16]);
  });

  it('close with the invoking element already unmounted is a safe no-op', () => {
    // Plain-DOM invoker (outside the React tree): focus it, open the
    // picker against it, then detach it before closing.
    const trigger = document.createElement('button');
    trigger.textContent = 'Outside invoker';
    document.body.appendChild(trigger);
    trigger.focus();
    try {
      renderPicker({});
      expect(document.activeElement).not.toBe(trigger);
      trigger.remove();
      act(() => {
        root!.unmount();
      });
      expect(document.activeElement).not.toBe(trigger);
      expect(document.body.contains(trigger)).toBe(false);
    } finally {
      trigger.remove();
    }
  });
});

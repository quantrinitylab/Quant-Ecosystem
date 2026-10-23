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
});

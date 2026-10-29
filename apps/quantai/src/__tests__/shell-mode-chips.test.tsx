// QuantAI web shell — ModeChips unit tests.
// Follows the repo's createRoot + act pattern (see auth-guard-handoff tests).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ModeChips, SHELL_MODES } from '../components/shell/ModeChips';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderChips(props: Partial<Parameters<typeof ModeChips>[0]> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const onSelect = props.onSelect ?? vi.fn();
  act(() => {
    root!.render(
      <ModeChips
        modes={props.modes ?? SHELL_MODES}
        activeId={props.activeId ?? 'chat'}
        onSelect={onSelect}
      />,
    );
  });
  return { onSelect: onSelect as ReturnType<typeof vi.fn> };
}

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

describe('SHELL_MODES', () => {
  it('exposes the five contracted generic modes in order', () => {
    expect(SHELL_MODES).toEqual([
      { id: 'chat', label: 'Chat' },
      { id: 'image', label: 'Create image' },
      { id: 'thinking', label: 'Thinking' },
      { id: 'research', label: 'Deep research' },
      { id: 'web', label: 'Web search' },
    ]);
  });
});

describe('ModeChips', () => {
  it('renders one chip button per mode with the active chip pressed', () => {
    renderChips({ activeId: 'image' });
    const buttons = container!.querySelectorAll('button');
    expect(buttons.length).toBe(5);
    expect(buttons[0].textContent).toBe('Chat');
    expect(buttons[1].textContent).toBe('Create image');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[2].getAttribute('aria-pressed')).toBe('false');
  });

  it('calls onSelect with the clicked chip id', () => {
    const { onSelect } = renderChips({ activeId: 'chat' });
    const buttons = container!.querySelectorAll('button');
    act(() => {
      buttons[3].click();
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('research');
  });

  it('renders a custom modes list verbatim', () => {
    renderChips({
      modes: [
        { id: 'a', label: 'Alpha' },
        { id: 'b', label: 'Beta' },
      ],
      activeId: 'b',
    });
    const buttons = container!.querySelectorAll('button');
    expect(buttons.length).toBe(2);
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
  });
});

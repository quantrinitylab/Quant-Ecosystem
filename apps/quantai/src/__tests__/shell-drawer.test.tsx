// QuantAI web shell — ShellDrawer unit tests.
// next/link is mocked the same way as plan-surface tests; the component
// itself uses the real next/link import.

import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    style,
  }: {
    children: React.ReactNode;
    href: string;
    style?: React.CSSProperties;
  }) => (
    <a href={href} style={style}>
      {children}
    </a>
  ),
}));

import { ShellDrawer } from '../components/shell/ShellDrawer';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderDrawer(open: boolean, onClose: () => void) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<ShellDrawer open={open} onClose={onClose} />);
  });
}

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

const EXPECTED_LINKS: [string, string][] = [
  ['/', 'Home'],
  ['/feed', 'Feed'],
  ['/ideas', 'Ideas'],
  ['/goals', 'Goals'],
  ['/plan', 'Plan'],
  ['/voice', 'Voice'],
  ['/settings', 'Settings'],
];

describe('ShellDrawer', () => {
  it('renders nothing when closed', () => {
    renderDrawer(false, vi.fn());
    expect(container!.innerHTML).toBe('');
  });

  it('renders the brand row and all nav links when open', () => {
    renderDrawer(true, vi.fn());
    expect(container!.textContent).toContain('QuantAI');
    const links = container!.querySelectorAll('a');
    expect(links.length).toBe(EXPECTED_LINKS.length);
    EXPECTED_LINKS.forEach(([href, label], i) => {
      expect(links[i].getAttribute('href')).toBe(href);
      expect(links[i].textContent).toBe(label);
    });
  });

  it('calls onClose when the X button is clicked', () => {
    const onClose = vi.fn();
    renderDrawer(true, onClose);
    const closeButton = container!.querySelector(
      'button[aria-label="Close navigation"]',
    ) as HTMLButtonElement;
    expect(closeButton).not.toBeNull();
    act(() => {
      closeButton.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    renderDrawer(true, onClose);
    const backdrop = container!.querySelector(
      '[data-testid="shell-drawer-backdrop"]',
    ) as HTMLDivElement;
    expect(backdrop).not.toBeNull();
    act(() => {
      backdrop.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

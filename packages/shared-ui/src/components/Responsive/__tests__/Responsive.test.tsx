// @vitest-environment jsdom
// ============================================================================
// Shared UI - Responsive Components Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResponsiveShell } from '../ResponsiveShell';

describe('ResponsiveShell', () => {
  beforeEach(() => {
    // Default to desktop width
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(orientation: landscape)' ? false : false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('renders children correctly', () => {
    render(
      <ResponsiveShell>
        <div>Main content</div>
      </ResponsiveShell>,
    );
    expect(screen.getByText('Main content')).toBeDefined();
  });

  it('renders with sidebar on desktop', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1280, writable: true });
    render(
      <ResponsiveShell sidebar={<div>Sidebar content</div>}>
        <div>Main content</div>
      </ResponsiveShell>,
    );
    expect(screen.getByText('Main content')).toBeDefined();
    expect(screen.getByText('Sidebar content')).toBeDefined();
  });

  it('hides sidebar on mobile and shows bottom nav', () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
    render(
      <ResponsiveShell
        sidebar={<div>Sidebar content</div>}
        bottomNav={<div>Bottom navigation</div>}
      >
        <div>Main content</div>
      </ResponsiveShell>,
    );
    expect(screen.getByText('Main content')).toBeDefined();
    expect(screen.queryByText('Sidebar content')).toBeNull();
    expect(screen.getByText('Bottom navigation')).toBeDefined();
  });

  it('renders AppShell wrapper', () => {
    render(
      <ResponsiveShell aria-label="Test app shell">
        <div>Content</div>
      </ResponsiveShell>,
    );
    expect(screen.getByRole('application')).toBeDefined();
  });

  it('supports safeArea prop', () => {
    const { container } = render(
      <ResponsiveShell safeArea={false}>
        <div>Content</div>
      </ResponsiveShell>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    // When safeArea is false, no padding styles should be applied
    expect(wrapper.style.paddingTop).toBe('');
  });
});

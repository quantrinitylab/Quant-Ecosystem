// @vitest-environment jsdom
// ============================================================================
// Shared UI - Motion Components Tests
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    svg: ({ children, ...props }: any) => <svg {...props}>{children}</svg>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
  useReducedMotion: () => false,
  useMotionValue: (initial: number) => ({ get: () => initial, set: () => {} }),
  useTransform: () => 0,
}));

import { AnimatedPage } from '../AnimatedPage';
import { AnimatedList } from '../AnimatedList';
import { SpringButton } from '../SpringButton';
import { BottomSheet } from '../BottomSheet';
import { SkeletonFade } from '../SkeletonFade';
import { PullToRefresh } from '../PullToRefresh';

describe('AnimatedPage', () => {
  it('renders children correctly', () => {
    render(<AnimatedPage>Page content</AnimatedPage>);
    expect(screen.getByText('Page content')).toBeDefined();
  });

  it('accepts variant prop', () => {
    render(<AnimatedPage variant="slide-left">Slide</AnimatedPage>);
    expect(screen.getByText('Slide')).toBeDefined();
  });

  it('applies className', () => {
    const { container } = render(<AnimatedPage className="custom-class">Content</AnimatedPage>);
    const motionDiv = container.firstElementChild;
    expect(motionDiv?.className).toContain('custom-class');
  });

  it('accepts animated prop', () => {
    render(<AnimatedPage animated={false}>Static Page</AnimatedPage>);
    expect(screen.getByText('Static Page')).toBeDefined();
  });
});

describe('AnimatedList', () => {
  it('renders all children', () => {
    render(
      <AnimatedList>
        <div>Item 1</div>
        <div>Item 2</div>
        <div>Item 3</div>
      </AnimatedList>,
    );
    expect(screen.getByText('Item 1')).toBeDefined();
    expect(screen.getByText('Item 2')).toBeDefined();
    expect(screen.getByText('Item 3')).toBeDefined();
  });

  it('applies className', () => {
    const { container } = render(
      <AnimatedList className="list-wrapper">
        <div>Item</div>
      </AnimatedList>,
    );
    const motionDiv = container.firstElementChild;
    expect(motionDiv?.className).toContain('list-wrapper');
  });

  it('accepts animated prop', () => {
    render(
      <AnimatedList animated={false}>
        <div>Static Item</div>
      </AnimatedList>,
    );
    expect(screen.getByText('Static Item')).toBeDefined();
  });
});

describe('SpringButton', () => {
  it('renders button with children', () => {
    render(<SpringButton>Press me</SpringButton>);
    expect(screen.getByText('Press me')).toBeDefined();
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<SpringButton onClick={handleClick}>Click</SpringButton>);
    screen.getByRole('button').click();
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});

describe('BottomSheet', () => {
  it('renders when open', () => {
    render(
      <BottomSheet open={true} onClose={() => {}}>
        Sheet content
      </BottomSheet>,
    );
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Sheet content')).toBeDefined();
  });

  it('does not render when closed', () => {
    render(
      <BottomSheet open={false} onClose={() => {}}>
        Hidden content
      </BottomSheet>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('has correct aria attributes', () => {
    render(
      <BottomSheet open={true} onClose={() => {}} aria-label="Settings sheet">
        Content
      </BottomSheet>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-label')).toBe('Settings sheet');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('accepts animated prop', () => {
    render(
      <BottomSheet open={true} onClose={() => {}} animated={false}>
        Static Sheet
      </BottomSheet>,
    );
    expect(screen.getByText('Static Sheet')).toBeDefined();
  });
});

describe('SkeletonFade', () => {
  it('shows skeleton when loading', () => {
    render(
      <SkeletonFade loading={true} skeleton={<div>Loading...</div>}>
        <div>Real content</div>
      </SkeletonFade>,
    );
    expect(screen.getByText('Loading...')).toBeDefined();
    expect(screen.queryByText('Real content')).toBeNull();
  });

  it('shows content when not loading', () => {
    render(
      <SkeletonFade loading={false} skeleton={<div>Loading...</div>}>
        <div>Real content</div>
      </SkeletonFade>,
    );
    expect(screen.getByText('Real content')).toBeDefined();
    expect(screen.queryByText('Loading...')).toBeNull();
  });

  it('accepts animated prop', () => {
    render(
      <SkeletonFade loading={true} skeleton={<div>Skeleton</div>} animated={false}>
        <div>Content</div>
      </SkeletonFade>,
    );
    expect(screen.getByText('Skeleton')).toBeDefined();
  });
});

describe('PullToRefresh', () => {
  it('renders children', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <div>Scrollable content</div>
      </PullToRefresh>,
    );
    expect(screen.getByText('Scrollable content')).toBeDefined();
  });

  it('accepts animated prop', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(
      <PullToRefresh onRefresh={onRefresh} animated={false}>
        <div>Static content</div>
      </PullToRefresh>,
    );
    expect(screen.getByText('Static content')).toBeDefined();
  });
});

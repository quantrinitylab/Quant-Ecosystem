// @vitest-environment jsdom
// ============================================================================
// Shared UI - Motion Component Tests
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    nav: ({ children, ...props }: any) => <nav {...props}>{children}</nav>,
    header: ({ children, ...props }: any) => <header {...props}>{children}</header>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    svg: ({ children, ...props }: any) => <svg {...props}>{children}</svg>,
    path: (props: any) => <path {...props} />,
    ul: ({ children, ...props }: any) => <ul {...props}>{children}</ul>,
    ol: ({ children, ...props }: any) => <ol {...props}>{children}</ol>,
    li: ({ children, ...props }: any) => <li {...props}>{children}</li>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
  useReducedMotion: () => false,
}));

import { FadeIn } from '../components/Motion/FadeIn';
import { StaggerList } from '../components/Motion/StaggerList';
import { PageTransition } from '../components/Motion/PageTransition';
import { SpringButton } from '../components/Motion/SpringButton';
import { AnimatedSkeleton } from '../components/Motion/AnimatedSkeleton';
import { SlidePanel } from '../components/Motion/SlidePanel';
import { ScaleOnHover } from '../components/Motion/ScaleOnHover';
import { MotionProvider, useMotionConfig } from '../components/Motion/MotionConfig';
import { LoadingState } from '../components/States/LoadingState';

describe('FadeIn', () => {
  it('renders children correctly', () => {
    render(<FadeIn>Hello World</FadeIn>);
    expect(screen.getByText('Hello World')).toBeDefined();
  });

  it('accepts className', () => {
    const { container } = render(<FadeIn className="test-class">Content</FadeIn>);
    const el = container.firstElementChild;
    expect(el?.className).toContain('test-class');
  });

  it('accepts animated={false} and renders static content', () => {
    const { container } = render(<FadeIn animated={false}>Static</FadeIn>);
    expect(screen.getByText('Static')).toBeDefined();
    // When animated=false, renders a plain div (no motion)
    expect(container.firstElementChild?.tagName).toBe('DIV');
  });
});

describe('StaggerList', () => {
  it('renders children correctly', () => {
    render(
      <StaggerList>
        <span>Item 1</span>
        <span>Item 2</span>
      </StaggerList>,
    );
    expect(screen.getByText('Item 1')).toBeDefined();
    expect(screen.getByText('Item 2')).toBeDefined();
  });

  it('with as="ul" does not produce nested li>li elements', () => {
    const { container } = render(
      <StaggerList as="ul">
        <li>Item A</li>
        <li>Item B</li>
      </StaggerList>,
    );
    // Should not have li > li nesting
    const nestedLi = container.querySelectorAll('li > li');
    expect(nestedLi.length).toBe(0);
    // Items should still be present
    expect(screen.getByText('Item A')).toBeDefined();
    expect(screen.getByText('Item B')).toBeDefined();
  });

  it('accepts animated={false} and renders static content', () => {
    const { container } = render(
      <StaggerList animated={false} as="ul">
        <li>Static Item</li>
      </StaggerList>,
    );
    expect(screen.getByText('Static Item')).toBeDefined();
    expect(container.firstElementChild?.tagName).toBe('UL');
  });
});

describe('PageTransition', () => {
  it('renders children correctly', () => {
    render(<PageTransition>Page Content</PageTransition>);
    expect(screen.getByText('Page Content')).toBeDefined();
  });

  it('accepts animated={false} and renders static content', () => {
    const { container } = render(<PageTransition animated={false}>Static Page</PageTransition>);
    expect(screen.getByText('Static Page')).toBeDefined();
    expect(container.firstElementChild?.tagName).toBe('DIV');
  });
});

describe('SpringButton', () => {
  it('renders children correctly', () => {
    render(<SpringButton>Click Me</SpringButton>);
    expect(screen.getByText('Click Me')).toBeDefined();
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<SpringButton onClick={handleClick}>Click</SpringButton>);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('accepts animated={false} and renders a plain button', () => {
    render(<SpringButton animated={false}>Plain</SpringButton>);
    expect(screen.getByRole('button')).toBeDefined();
    expect(screen.getByText('Plain')).toBeDefined();
  });
});

describe('AnimatedSkeleton', () => {
  it('renders with correct aria attributes', () => {
    render(<AnimatedSkeleton />);
    const skeleton = screen.getByRole('status');
    expect(skeleton).toBeDefined();
    expect(skeleton.getAttribute('aria-busy')).toBe('true');
  });

  it('accepts animated={false} and renders static skeleton', () => {
    render(<AnimatedSkeleton animated={false} />);
    const skeleton = screen.getByRole('status');
    expect(skeleton).toBeDefined();
    expect(skeleton.getAttribute('aria-busy')).toBe('true');
  });
});

describe('SlidePanel', () => {
  it('renders children when isOpen is true', () => {
    render(
      <SlidePanel isOpen={true}>
        <span>Panel Content</span>
      </SlidePanel>,
    );
    expect(screen.getByText('Panel Content')).toBeDefined();
  });

  it('does NOT render children when isOpen is false', () => {
    render(
      <SlidePanel isOpen={false}>
        <span>Panel Content</span>
      </SlidePanel>,
    );
    expect(screen.queryByText('Panel Content')).toBeNull();
  });

  it('accepts animated={false} and renders static panel', () => {
    render(
      <SlidePanel isOpen={true} animated={false}>
        <span>Static Panel</span>
      </SlidePanel>,
    );
    expect(screen.getByText('Static Panel')).toBeDefined();
  });
});

describe('ScaleOnHover', () => {
  it('renders children correctly', () => {
    render(<ScaleOnHover>Hover Me</ScaleOnHover>);
    expect(screen.getByText('Hover Me')).toBeDefined();
  });

  it('accepts animated={false} and renders static content', () => {
    const { container } = render(<ScaleOnHover animated={false}>Static Hover</ScaleOnHover>);
    expect(screen.getByText('Static Hover')).toBeDefined();
    expect(container.firstElementChild?.tagName).toBe('DIV');
  });
});

describe('MotionProvider + useMotionConfig', () => {
  function TestConsumer() {
    const { shouldAnimate } = useMotionConfig();
    return <span data-testid="animate-value">{String(shouldAnimate)}</span>;
  }

  it('provides shouldAnimate context', () => {
    render(
      <MotionProvider>
        <TestConsumer />
      </MotionProvider>,
    );
    const el = screen.getByTestId('animate-value');
    expect(el.textContent).toBe('true');
  });

  it('returns shouldAnimate: true when no provider in tree', () => {
    render(<TestConsumer />);
    const el = screen.getByTestId('animate-value');
    expect(el.textContent).toBe('true');
  });
});

describe('LoadingState reduced-motion', () => {
  it('skeleton variant has no animate-pulse class when shouldAnimate is false', () => {
    // animated={false} forces shouldAnimate to false
    const { container } = render(<LoadingState variant="skeleton" animated={false} />);
    const pulseElements = container.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBe(0);
  });

  it('spinner variant shows static SVG when shouldAnimate is false', () => {
    const { container } = render(<LoadingState variant="spinner" animated={false} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeDefined();
    // Should not have animate-spin class
    expect(svg?.className).not.toContain('animate-spin');
  });
});

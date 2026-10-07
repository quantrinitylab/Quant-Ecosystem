// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuantLiveActionChip } from '../QuantLiveActionChip';

describe('QuantLiveActionChip', () => {
  it('renders null when action is null', () => {
    const { container } = render(<QuantLiveActionChip action={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders label when action provided', () => {
    render(<QuantLiveActionChip action={{ label: 'Searching' }} />);
    expect(screen.getByText('Searching')).toBeDefined();
  });

  it('shows animated dots', () => {
    const { container } = render(<QuantLiveActionChip action={{ label: 'Loading' }} />);
    const dots = container.querySelectorAll('.animate-pulse');
    expect(dots.length).toBe(3);
  });

  it('renders icon when action.icon provided', () => {
    render(<QuantLiveActionChip action={{ label: 'Search', icon: '\u{1F50D}' }} />);
    expect(screen.getByText('\u{1F50D}')).toBeDefined();
  });

  it('has role="status"', () => {
    render(<QuantLiveActionChip action={{ label: 'Working' }} />);
    expect(screen.getByRole('status')).toBeDefined();
  });
});

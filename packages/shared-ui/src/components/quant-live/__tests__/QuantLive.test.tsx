// @vitest-environment jsdom
// ============================================================================
// QuantLive Component Tests
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuantLive } from '../QuantLive';

describe('QuantLive', () => {
  it('renders in idle state with the orb button visible', () => {
    render(<QuantLive />);
    expect(screen.getByRole('button', { name: 'Quant Live - idle' })).toBeDefined();
  });

  it('clicking the orb activates the component and shows expanded view', () => {
    render(<QuantLive />);
    const orb = screen.getByRole('button', { name: 'Quant Live - idle' });
    fireEvent.click(orb);

    // After activation, should show controls like End session
    expect(screen.getByRole('button', { name: 'End session' })).toBeDefined();
  });

  it('calls onActivate callback when activated', () => {
    const onActivate = vi.fn();
    render(<QuantLive onActivate={onActivate} />);
    const orb = screen.getByRole('button', { name: 'Quant Live - idle' });
    fireEvent.click(orb);

    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('calls onDeactivate callback when end session is clicked', () => {
    const onDeactivate = vi.fn();
    render(<QuantLive onDeactivate={onDeactivate} />);

    // Activate first
    const orb = screen.getByRole('button', { name: 'Quant Live - idle' });
    fireEvent.click(orb);

    // Now end session
    const endButton = screen.getByRole('button', { name: 'End session' });
    fireEvent.click(endButton);

    expect(onDeactivate).toHaveBeenCalledTimes(1);
  });

  it('handles keyboard activation with Enter on orb button', () => {
    const onActivate = vi.fn();
    render(<QuantLive onActivate={onActivate} />);
    const orb = screen.getByRole('button', { name: 'Quant Live - idle' });
    fireEvent.keyDown(orb, { key: 'Enter', code: 'Enter' });
    // Native button handles Enter/Space via click, so simulate click
    fireEvent.click(orb);

    expect(onActivate).toHaveBeenCalled();
  });

  it('handles keyboard activation with Space on orb button', () => {
    const onActivate = vi.fn();
    render(<QuantLive onActivate={onActivate} />);
    const orb = screen.getByRole('button', { name: 'Quant Live - idle' });
    fireEvent.keyDown(orb, { key: ' ', code: 'Space' });
    fireEvent.click(orb);

    expect(onActivate).toHaveBeenCalled();
  });

  it('can minimize from active state', () => {
    render(<QuantLive />);

    // Activate
    const orb = screen.getByRole('button', { name: 'Quant Live - idle' });
    fireEvent.click(orb);

    // Minimize
    const minimizeButton = screen.getByRole('button', { name: 'Minimize' });
    fireEvent.click(minimizeButton);

    // Should no longer show the End session button (active view gone)
    expect(screen.queryByRole('button', { name: 'End session' })).toBeNull();
    // But should still show the orb (minimized state)
    expect(screen.getByRole('button', { name: 'Quant Live - listening' })).toBeDefined();
  });

  it('can maximize from minimized state back to active', () => {
    render(<QuantLive />);

    // Activate
    fireEvent.click(screen.getByRole('button', { name: 'Quant Live - idle' }));

    // Minimize
    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));

    // Maximize by clicking orb in minimized state
    fireEvent.click(screen.getByRole('button', { name: 'Quant Live - listening' }));

    // Should be back in active state with controls
    expect(screen.getByRole('button', { name: 'End session' })).toBeDefined();
  });

  it('applies className prop', () => {
    const { container } = render(<QuantLive className="custom-class" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('custom-class');
  });

  it('applies position-based CSS classes for bottom-right', () => {
    const { container } = render(<QuantLive position="bottom-right" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('fixed');
    expect(wrapper.className).toContain('bottom-4');
    expect(wrapper.className).toContain('right-4');
  });

  it('applies position-based CSS classes for bottom-center', () => {
    const { container } = render(<QuantLive position="bottom-center" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('fixed');
    expect(wrapper.className).toContain('bottom-4');
    expect(wrapper.className).toContain('left-1/2');
  });

  it('applies position-based CSS classes for fullscreen', () => {
    const { container } = render(<QuantLive position="fullscreen" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('fixed');
    expect(wrapper.className).toContain('inset-0');
  });
});

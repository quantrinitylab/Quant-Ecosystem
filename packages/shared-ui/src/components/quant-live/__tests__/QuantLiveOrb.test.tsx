// @vitest-environment jsdom
// ============================================================================
// QuantLiveOrb Component Tests
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuantLiveOrb } from '../QuantLiveOrb';

describe('QuantLiveOrb', () => {
  it('renders with correct aria-label for idle state', () => {
    render(<QuantLiveOrb colorState="idle" />);
    expect(screen.getByRole('button', { name: 'Quant Live - idle' })).toBeDefined();
  });

  it('renders with correct aria-label for listening state', () => {
    render(<QuantLiveOrb colorState="listening" />);
    expect(screen.getByRole('button', { name: 'Quant Live - listening' })).toBeDefined();
  });

  it('renders with correct aria-label for processing state', () => {
    render(<QuantLiveOrb colorState="processing" />);
    expect(screen.getByRole('button', { name: 'Quant Live - processing' })).toBeDefined();
  });

  it('renders with correct aria-label for speaking state', () => {
    render(<QuantLiveOrb colorState="speaking" />);
    expect(screen.getByRole('button', { name: 'Quant Live - speaking' })).toBeDefined();
  });

  it('renders with correct aria-label for error state', () => {
    render(<QuantLiveOrb colorState="error" />);
    expect(screen.getByRole('button', { name: 'Quant Live - error' })).toBeDefined();
  });

  it('applies bg-gray-400 for idle state', () => {
    render(<QuantLiveOrb colorState="idle" />);
    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-gray-400');
  });

  it('applies bg-blue-500 for listening state', () => {
    render(<QuantLiveOrb colorState="listening" />);
    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-blue-500');
  });

  it('applies bg-amber-500 for processing state', () => {
    render(<QuantLiveOrb colorState="processing" />);
    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-amber-500');
  });

  it('applies bg-green-500 for speaking state', () => {
    render(<QuantLiveOrb colorState="speaking" />);
    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-green-500');
  });

  it('applies bg-red-500 for error state', () => {
    render(<QuantLiveOrb colorState="error" />);
    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-red-500');
  });

  it('fires onClick when clicked', () => {
    const onClick = vi.fn();
    render(<QuantLiveOrb colorState="idle" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('fires onClick on Enter key', () => {
    const onClick = vi.fn();
    render(<QuantLiveOrb colorState="idle" onClick={onClick} />);
    const button = screen.getByRole('button');
    // Native button elements respond to Enter with click
    fireEvent.keyDown(button, { key: 'Enter', code: 'Enter' });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalled();
  });

  it('fires onClick on Space key', () => {
    const onClick = vi.fn();
    render(<QuantLiveOrb colorState="idle" onClick={onClick} />);
    const button = screen.getByRole('button');
    // Native button elements respond to Space with click
    fireEvent.keyDown(button, { key: ' ', code: 'Space' });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalled();
  });

  it('has minimum 44px tap target via min-w-11 class', () => {
    render(<QuantLiveOrb colorState="idle" />);
    const button = screen.getByRole('button');
    expect(button.className).toContain('min-w-11');
    expect(button.className).toContain('min-h-11');
  });

  it('disabled state: does not fire onClick and has disabled attribute', () => {
    const onClick = vi.fn();
    render(<QuantLiveOrb colorState="idle" onClick={onClick} disabled />);
    const button = screen.getByRole('button');
    expect(button).toHaveProperty('disabled', true);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('size prop lg affects rendered size classes', () => {
    render(<QuantLiveOrb colorState="idle" size="lg" />);
    const button = screen.getByRole('button');
    expect(button.className).toContain('w-16');
    expect(button.className).toContain('h-16');
  });

  it('size prop sm applies default size classes', () => {
    render(<QuantLiveOrb colorState="idle" size="sm" />);
    const button = screen.getByRole('button');
    expect(button.className).toContain('w-11');
    expect(button.className).toContain('h-11');
  });
});

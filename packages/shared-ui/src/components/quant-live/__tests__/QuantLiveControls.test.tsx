// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuantLiveControls } from '../QuantLiveControls';

const baseProps = {
  micMuted: false,
  cameraActive: false,
  screenSharing: false,
  onToggleMic: vi.fn(),
  onEndSession: vi.fn(),
};

describe('QuantLiveControls', () => {
  it('renders mute button', () => {
    render(<QuantLiveControls {...baseProps} />);
    expect(screen.getByRole('button', { name: 'Mute microphone' })).toBeDefined();
  });

  it('calls onToggleMic when mute clicked', () => {
    const onToggleMic = vi.fn();
    render(<QuantLiveControls {...baseProps} onToggleMic={onToggleMic} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mute microphone' }));
    expect(onToggleMic).toHaveBeenCalledTimes(1);
  });

  it('renders end session button', () => {
    render(<QuantLiveControls {...baseProps} />);
    expect(screen.getByRole('button', { name: 'End session' })).toBeDefined();
  });

  it('calls onEndSession when end clicked', () => {
    const onEndSession = vi.fn();
    render(<QuantLiveControls {...baseProps} onEndSession={onEndSession} />);
    fireEvent.click(screen.getByRole('button', { name: 'End session' }));
    expect(onEndSession).toHaveBeenCalledTimes(1);
  });

  it('hides camera button when onToggleCamera not provided', () => {
    render(<QuantLiveControls {...baseProps} />);
    expect(screen.queryByRole('button', { name: /camera/i })).toBeNull();
  });

  it('shows camera button when onToggleCamera provided', () => {
    const onToggleCamera = vi.fn();
    render(<QuantLiveControls {...baseProps} onToggleCamera={onToggleCamera} cameraActive />);
    expect(screen.getByRole('button', { name: 'Turn off camera' })).toBeDefined();
  });

  it('calls onToggleCamera', () => {
    const onToggleCamera = vi.fn();
    render(<QuantLiveControls {...baseProps} onToggleCamera={onToggleCamera} cameraActive />);
    fireEvent.click(screen.getByRole('button', { name: 'Turn off camera' }));
    expect(onToggleCamera).toHaveBeenCalledTimes(1);
  });

  it('calls onToggleScreen', () => {
    const onToggleScreen = vi.fn();
    render(<QuantLiveControls {...baseProps} onToggleScreen={onToggleScreen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Share screen' }));
    expect(onToggleScreen).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment jsdom
// ============================================================================
// Shared UI - VoiceCommandBar Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useVoiceCommands } from '@quant/agentic/voice-commands';
import type { UseVoiceCommandsReturn } from '@quant/agentic/voice-commands';
import { VoiceCommandBar } from './voice-command-bar';

vi.mock('@quant/agentic/voice-commands', () => ({
  useVoiceCommands: vi.fn(),
}));

describe('VoiceCommandBar', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const defaultReturn: UseVoiceCommandsReturn = {
    isListening: false,
    status: 'idle',
    transcript: '',
    error: null,
    recentCommands: [],
    toggleListening: vi.fn(),
    clearTranscript: vi.fn(),
  };

  it('renders in idle state', () => {
    vi.mocked(useVoiceCommands).mockReturnValue(defaultReturn);
    render(<VoiceCommandBar appId="quantneon" userId="user-1" onClose={() => {}} />);

    expect(screen.getByText('Voice Command')).toBeDefined();
    expect(screen.getByText('Idle')).toBeDefined();
    expect(screen.getByLabelText('Start listening')).toBeDefined();
    expect(screen.getByText('No commands yet.')).toBeDefined();
  });

  it('toggles microphone on button click', () => {
    const toggleListening = vi.fn();
    vi.mocked(useVoiceCommands).mockReturnValue({
      ...defaultReturn,
      toggleListening,
    });
    render(<VoiceCommandBar appId="quantneon" userId="user-1" onClose={() => {}} />);

    fireEvent.click(screen.getByLabelText('Start listening'));
    expect(toggleListening).toHaveBeenCalledTimes(1);
  });

  it('shows stop listening label when active', () => {
    vi.mocked(useVoiceCommands).mockReturnValue({
      ...defaultReturn,
      isListening: true,
      status: 'listening',
    });
    render(<VoiceCommandBar appId="quantneon" userId="user-1" onClose={() => {}} />);

    expect(screen.getByLabelText('Stop listening')).toBeDefined();
    expect(screen.getByText('Listening…')).toBeDefined();
  });

  it('displays transcript text', () => {
    vi.mocked(useVoiceCommands).mockReturnValue({
      ...defaultReturn,
      transcript: 'Open quantmail',
    });
    render(<VoiceCommandBar appId="quantneon" userId="user-1" onClose={() => {}} />);

    expect(screen.getByText('Open quantmail')).toBeDefined();
  });

  it('calls onClose handler when close button is clicked', () => {
    const onClose = vi.fn();
    vi.mocked(useVoiceCommands).mockReturnValue(defaultReturn);
    render(<VoiceCommandBar appId="quantneon" userId="user-1" onClose={onClose} />);

    fireEvent.click(screen.getByLabelText('Close voice command bar'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

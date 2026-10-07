import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { ChatInterface, ChatMessage } from '../ChatInterface';

// Mock the AudioWaveformMessage
vi.mock('../../voice/AudioWaveformMessage', () => ({
  AudioWaveformMessage: () => <div data-testid="mock-audio-waveform">Audio Waveform</div>,
}));

describe('ChatInterface - Whoxa Parity', () => {
  const baseMessages: ChatMessage[] = [
    {
      id: 'msg-1',
      senderId: 'user-1',
      content: 'Hello!',
      timestamp: '10:40 AM',
      status: 'sent',
      isOwn: true,
      type: 'text',
    },
    {
      id: 'msg-2',
      senderId: 'user-1',
      content: 'Did you get this?',
      timestamp: '10:41 AM',
      status: 'delivered',
      isOwn: true,
      type: 'text',
    },
    {
      id: 'msg-3',
      senderId: 'user-1',
      content: 'Okay, seen.',
      timestamp: '10:42 AM',
      status: 'seen',
      isOwn: true,
      type: 'text',
    },
    {
      id: 'msg-4',
      senderId: 'user-2',
      content: 'Voice note',
      timestamp: '10:43 AM',
      status: 'seen',
      isOwn: false,
      type: 'voice',
      audioUrl: 'https://example.com/audio.mp3',
    },
  ];

  it('renders double-tick read receipts based on status correctly', () => {
    const html = renderToString(<ChatInterface messages={baseMessages} />);

    // Check sent status (msg-1): single tick ✓ and text-gray-400
    expect(html).toContain('data-testid="status-sent"');
    expect(html).toContain('text-gray-400');
    expect(html).toMatch(/<span[^>]*data-testid="status-sent"[^>]*>✓<\/span>/);

    // Check delivered status (msg-2): double tick ✓✓ and text-gray-400
    expect(html).toContain('data-testid="status-delivered"');
    expect(html).toMatch(/<span[^>]*data-testid="status-delivered"[^>]*>✓✓<\/span>/);

    // Check seen status (msg-3): double tick ✓✓ and text-emerald-500
    expect(html).toContain('data-testid="status-seen"');
    expect(html).toContain('text-emerald-500');
    expect(html).toMatch(/<span[^>]*data-testid="status-seen"[^>]*>✓✓<\/span>/);
  });

  it('renders pinned message banner when provided with snippet and unpinning removes it', () => {
    const pinnedMessage: ChatMessage = {
      id: 'pinned-sync',
      senderId: 'admin-1',
      content: "Don't forget the team sprint sync at 3 PM UTC!",
      timestamp: '10:00 AM',
      status: 'seen',
      isOwn: false,
      type: 'text',
    };

    // Render with pinned message
    const htmlWithPin = renderToString(
      <ChatInterface messages={baseMessages} pinnedMessage={pinnedMessage} isAdmin={true} />,
    );

    expect(htmlWithPin).toContain('data-testid="pinned-message-banner"');
    expect(htmlWithPin).toContain('📌');
    expect(htmlWithPin).toContain('Pinned Message:');
    expect(htmlWithPin).toMatch(/Don(&#x27;|')t forget the team sprint sync at 3 PM UTC!/);
    expect(htmlWithPin).toContain('data-testid="unpin-button"');

    // Unpinning removes pinned message or hides banner
    const htmlWithoutPin = renderToString(
      <ChatInterface messages={baseMessages} pinnedMessage={undefined} isAdmin={true} />,
    );

    expect(htmlWithoutPin).not.toContain('data-testid="pinned-message-banner"');
    expect(htmlWithoutPin).not.toContain('Pinned Message:');
    expect(htmlWithoutPin).not.toContain('data-testid="unpin-button"');
  });

  it('renders AudioWaveformMessage for voice type messages', () => {
    const html = renderToString(<ChatInterface messages={baseMessages} />);
    expect(html).toContain('data-testid="audio-waveform-container"');
    expect(html).toContain('data-testid="mock-audio-waveform"');
    expect(html).toContain('Audio Waveform');
  });

  it('renders action bar with Poll (📊) and Arcade (🎮) buttons', () => {
    const html = renderToString(<ChatInterface messages={baseMessages} />);
    expect(html).toContain('data-testid="poll-button"');
    expect(html).toContain('📊');
    expect(html).toContain('data-testid="arcade-button"');
    expect(html).toContain('🎮');
  });

  it('renders poll dialog when poll dialog is open', () => {
    const html = renderToString(<ChatInterface messages={baseMessages} initialPollOpen={true} />);
    expect(html).toContain('data-testid="poll-dialog"');
    expect(html).toContain('Create Poll');
  });

  it('renders arcade game picker when arcade picker is open', () => {
    const html = renderToString(<ChatInterface messages={baseMessages} initialArcadeOpen={true} />);
    expect(html).toContain('data-testid="arcade-game-picker"');
    expect(html).toContain('Arcade Matchmaking');
    expect(html).toContain('TicTacToe Minimax');
    expect(html).toContain('Coin Wager Duel');
  });
});

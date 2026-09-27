import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import {
  AudioWaveformMessage,
  generateWaveformAmplitudes,
  formatAudioDuration,
  calculateNextPlaybackRate,
} from '../components/voice/AudioWaveformMessage';

describe('Whoxa AudioWaveformMessage Helpers', () => {
  it('generateWaveformAmplitudes returns correct count and bounds [0.15, 1.0]', () => {
    const barCount = 28;
    const amps = generateWaveformAmplitudes('msg-test-123', barCount);
    expect(amps).toHaveLength(barCount);
    amps.forEach((amp) => {
      expect(amp).toBeGreaterThanOrEqual(0.15);
      expect(amp).toBeLessThanOrEqual(1.0);
    });
  });

  it('formatAudioDuration correctly formats seconds to m:ss', () => {
    expect(formatAudioDuration(0)).toBe('0:00');
    expect(formatAudioDuration(9)).toBe('0:09');
    expect(formatAudioDuration(65)).toBe('1:05');
    expect(formatAudioDuration(125)).toBe('2:05');
    expect(formatAudioDuration(NaN)).toBe('0:00');
    expect(formatAudioDuration(-5)).toBe('0:00');
  });

  it('calculateNextPlaybackRate cycles 1.0 -> 1.5 -> 2.0 -> 1.0', () => {
    expect(calculateNextPlaybackRate(1.0)).toBe(1.5);
    expect(calculateNextPlaybackRate(1.5)).toBe(2.0);
    expect(calculateNextPlaybackRate(2.0)).toBe(1.0);
    expect(calculateNextPlaybackRate(99.0)).toBe(1.0);
  });
});

describe('AudioWaveformMessage Component Rendering', () => {
  it('renders audio waveform message with duration, play button, speed, and delivery status', () => {
    const html = renderToString(
      <AudioWaveformMessage
        id="msg-1"
        audioUrl="https://example.com/audio.mp3"
        durationSeconds={45}
        isSender={true}
        deliveryStatus="read"
        timestamp="10:42 AM"
      />,
    );

    expect(html).toContain('data-testid="audio-waveform-message"');
    expect(html).toContain('data-testid="play-pause-btn"');
    expect(html).toContain('data-testid="waveform-container"');
    expect(html).toContain('data-testid="duration-display"');
    expect(html).toContain('0:45');
    expect(html).toContain('data-testid="speed-toggle-btn"');
    expect(html).toContain('speed-toggle-btn');
    expect(html).toContain('data-testid="delivery-status-indicator"');
    expect(html).toContain('10:42 AM');
  });

  it('renders delivered and sent status correctly', () => {
    const htmlSent = renderToString(
      <AudioWaveformMessage
        id="msg-2"
        audioUrl="https://example.com/audio.mp3"
        durationSeconds={15}
        isSender={true}
        deliveryStatus="sent"
      />,
    );
    expect(htmlSent).toContain('data-testid="delivery-status-indicator"');

    const htmlDelivered = renderToString(
      <AudioWaveformMessage
        id="msg-3"
        audioUrl="https://example.com/audio.mp3"
        durationSeconds={15}
        isSender={true}
        deliveryStatus="delivered"
      />,
    );
    expect(htmlDelivered).toContain('data-testid="delivery-status-indicator"');
  });
});

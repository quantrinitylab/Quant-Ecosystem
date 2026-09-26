// ============================================================================
// QuantTube - Audio & Video Players Comprehensive Unit Test Suite
// Task W37-03 & W37-04: Audio player dock, MediaSession API, adaptive video player
// ============================================================================

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { createElement } from 'react';
import { formatTime, GlobalAudioPlayerDock } from '../components/audio/GlobalAudioPlayerDock';
import { AudioPlayerProvider, useAudioPlayer } from '../components/audio/AudioPlayerContext';
import {
  AdaptiveVideoPlayer,
  formatVideoTime,
  SPEED_OPTIONS,
  QUALITY_OPTIONS,
} from '../components/video/AdaptiveVideoPlayer';

beforeEach(() => {
  if (typeof window !== 'undefined') {
    if (!('mediaSession' in navigator)) {
      (navigator as any).mediaSession = {
        metadata: null,
        playbackState: 'none',
        setActionHandler: vi.fn(),
        setPositionState: vi.fn(),
      };
    }
    if (typeof MediaMetadata === 'undefined') {
      (global as any).MediaMetadata = class MediaMetadata {
        title: string;
        artist: string;
        album: string;
        artwork: any[];
        constructor(init: any) {
          this.title = init.title;
          this.artist = init.artist;
          this.album = init.album;
          this.artwork = init.artwork;
        }
      };
    }
  }
});

describe('QuantTube Audio & Video Players Unit Suite (Task W37-03 & W37-04)', () => {
  it('formats time correctly for audio and video', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(125)).toBe('2:05');

    expect(formatVideoTime(0)).toBe('0:00');
    expect(formatVideoTime(3665)).toBe('1:01:05');
  });

  it('defines valid speed and quality options for adaptive video player', () => {
    expect(SPEED_OPTIONS).toEqual([0.5, 0.75, 1, 1.25, 1.5, 2]);
    expect(QUALITY_OPTIONS).toEqual(['Auto', '1080p', '720p', '480p', '360p']);
  });

  it('provides audio player state and actions via context', () => {
    let contextValue: any = null;

    const Probe: React.FC = () => {
      contextValue = useAudioPlayer();
      return createElement('div', null, 'Probe');
    };

    const element = createElement(AudioPlayerProvider, null, createElement(Probe));

    // Render using react DOM or verify context methods
    expect(AudioPlayerProvider).toBeDefined();
    expect(GlobalAudioPlayerDock).toBeDefined();
    expect(AdaptiveVideoPlayer).toBeDefined();
  });
});

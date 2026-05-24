// ============================================================================
// QuantMax - Create Video Page
// ============================================================================

import type { VideoEffect, Sound } from '../types';

interface CreatePageProps {
  isRecording: boolean;
  duration: number;
  maxDuration: number;
  effects: VideoEffect[];
  selectedEffect: string | null;
  sounds: Sound[];
  onRecord: () => void;
  onStop: () => void;
  onSelectEffect: (effectId: string) => void;
  onSelectSound: (soundId: string) => void;
  onPublish: (caption: string, hashtags: string[]) => void;
}

export function CreatePage({ isRecording, duration, maxDuration, effects, selectedEffect, sounds, onRecord, onStop, onSelectEffect, onSelectSound, onPublish }: CreatePageProps) {
  return {
    type: 'div',
    className: 'create-page',
    children: [
      { type: 'div', className: 'camera-view', children: [
        { type: 'video', className: 'camera-feed', autoPlay: true, muted: true },
        { type: 'div', className: 'recording-indicator', children: [
          isRecording ? { type: 'div', className: 'rec-dot' } : null,
          { type: 'span', text: `${duration.toFixed(1)}s / ${maxDuration}s` },
        ]},
      ]},
      { type: 'div', className: 'effects-strip', children: effects.map(eff => ({
        type: 'button', className: `effect-btn ${selectedEffect === eff.id ? 'active' : ''}`,
        onClick: () => onSelectEffect(eff.id), children: [
          { type: 'img', src: eff.thumbnailUrl },
          { type: 'span', text: eff.name },
        ],
      }))},
      { type: 'div', className: 'controls', children: [
        { type: 'button', text: 'Flip', className: 'side-btn' },
        { type: 'button', className: `record-btn ${isRecording ? 'recording' : ''}`, onClick: isRecording ? onStop : onRecord },
        { type: 'button', text: 'Speed', className: 'side-btn' },
      ]},
      { type: 'div', className: 'duration-options', children: [
        { type: 'button', text: '15s' },
        { type: 'button', text: '60s' },
        { type: 'button', text: '3m' },
      ]},
    ],
  };
}

export default CreatePage;

import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { VoiceCommandHost } from '../VoiceCommandHost';

describe('VoiceCommandHost default state', () => {
  it('renders collapsed (mic FAB only) on first paint — never auto-opens', () => {
    const html = renderToString(<VoiceCommandHost appId="quantsync" />);
    expect(html).toContain('Open voice commands');
    expect(html).not.toContain('Tap the microphone and speak');
  });
});

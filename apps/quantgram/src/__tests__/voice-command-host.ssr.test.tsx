import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { VoiceCommandHost } from '../components/VoiceCommandHost';

describe('VoiceCommandHost default state', () => {
  it('renders collapsed (mic FAB only) on first paint', () => {
    const html = renderToString(<VoiceCommandHost appId="quantneon" />);
    expect(html).toContain('Open voice commands');
    expect(html).not.toContain('Tap the microphone and speak');
  });
});

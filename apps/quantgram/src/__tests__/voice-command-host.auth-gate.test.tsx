// QM-UIUX-015 integration regression: through the REAL AuthProvider (no mock),
// a first paint — exactly what an anonymous visitor on the welcome page gets,
// before any session restore completes — must not render the mic FAB.
import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { AuthProvider } from '../providers/auth-provider';
import { VoiceCommandHost } from '../components/VoiceCommandHost';

describe('VoiceCommandHost inside the real AuthProvider', () => {
  it('renders no mic FAB on first paint (anonymous welcome page)', () => {
    const html = renderToString(
      <AuthProvider>
        <VoiceCommandHost appId="quantneon" userId="guest" />
      </AuthProvider>,
    );
    expect(html).not.toContain('Open voice commands');
    expect(html).toBe('');
  });
});

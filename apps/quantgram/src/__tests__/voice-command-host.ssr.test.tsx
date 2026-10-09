import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { VoiceCommandHost } from '../components/VoiceCommandHost';

// Mutable auth state so each case controls what useAuth() returns, following
// the repo's auth-provider mock convention (see creator-login-ui.test.tsx).
const authState = vi.hoisted(() => ({ isAuthenticated: false }));

vi.mock('../providers/auth-provider', () => ({
  useAuth: () => ({
    isAuthenticated: authState.isAuthenticated,
    isLoading: false,
    error: null,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

describe('VoiceCommandHost default state', () => {
  it('renders collapsed (mic FAB only) on first paint for an authenticated user', () => {
    authState.isAuthenticated = true;
    const html = renderToString(<VoiceCommandHost appId="quantneon" />);
    expect(html).toContain('Open voice commands');
    expect(html).not.toContain('Tap the microphone and speak');
  });

  // QM-UIUX-015 regression: the mic FAB must not appear for anonymous users
  // (e.g. on the welcome page before sign-in).
  it('renders nothing for an anonymous user', () => {
    authState.isAuthenticated = false;
    const html = renderToString(<VoiceCommandHost appId="quantneon" />);
    expect(html).toBe('');
    expect(html).not.toContain('Open voice commands');
  });
});

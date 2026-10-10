import { describe, it, expect } from 'vitest';
import { honestStreamErrorContent } from '../hooks/useAIChat';

// P0 (2026-10-10): the assistant bubble must name the real failure reason —
// the canned "Sorry, I encountered an error." hid expired tokens, an
// unreachable backend, and missing AI providers behind one fake message.

describe('honestStreamErrorContent', () => {
  it('never returns the canned fake error bubble', () => {
    const samples = [
      honestStreamErrorContent('Server error: 500', null),
      honestStreamErrorContent('Session not found', 'SESSION_NOT_FOUND'),
      honestStreamErrorContent('AI service unavailable. Please try again in a moment.', 'UPSTREAM_UNAVAILABLE'),
      honestStreamErrorContent('', 'AI_UNAVAILABLE'),
    ];
    for (const s of samples) {
      expect(s).not.toBe('Sorry, I encountered an error.');
      expect(s.length).toBeGreaterThan(0);
    }
  });

  it('names the real reason for ordinary failures', () => {
    const s = honestStreamErrorContent('Session not found', 'SESSION_NOT_FOUND');
    expect(s).toContain('Session not found');
  });

  it('shows the AI_UNAVAILABLE honest disabled state', () => {
    const s = honestStreamErrorContent('anything', 'AI_UNAVAILABLE');
    expect(s).toContain("AI chat isn't available right now");
  });

  it('shows an honest retry message for UPSTREAM_UNAVAILABLE', () => {
    const s = honestStreamErrorContent('Upstream returned 503', 'UPSTREAM_UNAVAILABLE');
    expect(s.toLowerCase()).toContain('unreachable');
  });
});

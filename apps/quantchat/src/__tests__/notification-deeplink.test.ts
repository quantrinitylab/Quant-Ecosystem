import { describe, it, expect } from 'vitest';
import { resolveDeepLink, NOTIFICATION_CATEGORIES } from '../lib/notification-deeplink';

describe('resolveDeepLink (Task 10.5)', () => {
  it('maps MESSAGES to /chat/{id}', () => {
    expect(resolveDeepLink('MESSAGES', 'conv123')).toBe('/chat/conv123');
  });

  it('maps CALLS to /call regardless of id', () => {
    expect(resolveDeepLink('CALLS', 'anything')).toBe('/call');
    expect(resolveDeepLink('CALLS')).toBe('/call');
  });

  it('maps STORIES to /stories/{id}', () => {
    expect(resolveDeepLink('STORIES', 'story9')).toBe('/stories/story9');
  });

  it('maps REELS to /reels/{id}', () => {
    expect(resolveDeepLink('REELS', 'reel7')).toBe('/reels/reel7');
  });

  it('maps STREAKS to the conversation /chat/{id}', () => {
    expect(resolveDeepLink('STREAKS', 'conv5')).toBe('/chat/conv5');
  });

  it('maps SYSTEM and unknown categories to /notifications', () => {
    expect(resolveDeepLink('SYSTEM')).toBe('/notifications');
    expect(resolveDeepLink('WAT' as never)).toBe('/notifications');
  });

  it('always returns an absolute path for every known category', () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      expect(resolveDeepLink(category, 'x').startsWith('/')).toBe(true);
    }
  });

  it('falls back to base routes when no id is provided', () => {
    expect(resolveDeepLink('MESSAGES')).toBe('/chat');
    expect(resolveDeepLink('STORIES')).toBe('/stories');
    expect(resolveDeepLink('REELS')).toBe('/reels');
  });
});

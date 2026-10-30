import { describe, it, expect } from 'vitest';
import { resolveDeepLink, NOTIFICATION_CATEGORIES } from '../lib/notification-deeplink';
import { classifyPath } from '../lib/route-access';

describe('resolveDeepLink (Task 10.5, QC-F-142 map)', () => {
  it('maps MESSAGES to /chat/{id}', () => {
    expect(resolveDeepLink('MESSAGES', 'conv123')).toBe('/chat/conv123');
  });

  it('maps MESSAGES without an id to the chat list / (there is no /chat index route)', () => {
    expect(resolveDeepLink('MESSAGES')).toBe('/');
    expect(resolveDeepLink('MESSAGES', '')).toBe('/');
  });

  it('maps CALLS to the real /calls history page, with or without an id', () => {
    expect(resolveDeepLink('CALLS', 'anything')).toBe('/calls');
    expect(resolveDeepLink('CALLS')).toBe('/calls');
  });

  it('maps STORIES to /stories — the page reads no story id from the URL', () => {
    expect(resolveDeepLink('STORIES', 'story9')).toBe('/stories');
    expect(resolveDeepLink('STORIES')).toBe('/stories');
  });

  it('maps REELS to /reels — the page reads no reel id from the URL', () => {
    expect(resolveDeepLink('REELS', 'reel7')).toBe('/reels');
    expect(resolveDeepLink('REELS')).toBe('/reels');
  });

  it('maps STREAKS to the conversation /chat/{id}, and to / without one', () => {
    expect(resolveDeepLink('STREAKS', 'conv5')).toBe('/chat/conv5');
    expect(resolveDeepLink('STREAKS')).toBe('/');
  });

  it('maps SYSTEM and unknown categories to / (no /notifications page exists)', () => {
    expect(resolveDeepLink('SYSTEM')).toBe('/');
    expect(resolveDeepLink('SYSTEM', 'sys1')).toBe('/');
    expect(resolveDeepLink('WAT' as never)).toBe('/');
    expect(resolveDeepLink('WAT' as never, 'x')).toBe('/');
  });

  it('trims surrounding whitespace from the content id', () => {
    expect(resolveDeepLink('MESSAGES', '  conv123  ')).toBe('/chat/conv123');
    expect(resolveDeepLink('MESSAGES', '   ')).toBe('/');
  });

  it('always returns an absolute path for every known category', () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      expect(resolveDeepLink(category, 'x').startsWith('/')).toBe(true);
    }
  });

  it('every output is a REAL route — classifyPath never reports unknown (QC-F-142 route-existence guard)', () => {
    // Guard is route-existence, not app-only: '/' is a REAL route classified
    // 'public' (Phase-0 landing), so 'app' or 'public' both pass; only
    // 'unknown' (a 404) fails. The resolver's '/' fallback is intended.
    for (const category of NOTIFICATION_CATEGORIES) {
      for (const id of ['x', '', undefined] as const) {
        expect(classifyPath(resolveDeepLink(category, id))).not.toBe('unknown');
      }
    }
    expect(classifyPath(resolveDeepLink('WAT' as never, 'x'))).not.toBe('unknown');
  });

  it('falls back to base routes when no id is provided', () => {
    expect(resolveDeepLink('MESSAGES')).toBe('/');
    expect(resolveDeepLink('STORIES')).toBe('/stories');
    expect(resolveDeepLink('REELS')).toBe('/reels');
  });
});

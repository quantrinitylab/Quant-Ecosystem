// ===========================================================================
// QC-F-142 — backend deep-link resolver parity
// ===========================================================================
//
// The backend copy of the deep-link map (backend/lib/notification-deeplink)
// must agree with the in-app resolver and the service-worker copy. All
// three are pinned to the SHARED vectors in
// test-fixtures/notification-deeplink-vectors.json — if this copy drifts
// back to a dead target ('/notifications', '/chat', '/stories/<id>', ...),
// this suite goes red. The frontend parity suite additionally asserts
// every vector output is a real 'app' route.
// ===========================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveNotificationDeepLink } from '../lib/notification-deeplink';

interface DeepLinkVector {
  category: string;
  contentId: string | null;
  expected: string;
}

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const vectors = JSON.parse(
  readFileSync(join(appRoot, 'test-fixtures', 'notification-deeplink-vectors.json'), 'utf8'),
) as DeepLinkVector[];

describe('QC-F-142 backend deep-link resolver — shared vectors', () => {
  it('matches every shared vector', () => {
    for (const v of vectors) {
      expect(
        resolveNotificationDeepLink(v.category, v.contentId),
        `${v.category}/${v.contentId}`,
      ).toBe(v.expected);
    }
  });

  it('is case-insensitive on the category', () => {
    expect(resolveNotificationDeepLink('messages', 'conv-1')).toBe('/chat/conv-1');
    expect(resolveNotificationDeepLink('calls', 'call-1')).toBe('/calls');
  });

  it('never returns a historically dead target', () => {
    const dead = ['/notifications', '/chat'];
    for (const category of ['MESSAGES', 'CALLS', 'STORIES', 'STREAKS', 'REELS', 'SYSTEM']) {
      for (const id of ['x', '', null] as const) {
        expect(dead).not.toContain(resolveNotificationDeepLink(category, id));
      }
    }
    expect(resolveNotificationDeepLink('STORIES', 'story-9')).not.toBe('/stories/story-9');
    expect(resolveNotificationDeepLink('REELS', 'reel-9')).not.toBe('/reels/reel-9');
  });
});

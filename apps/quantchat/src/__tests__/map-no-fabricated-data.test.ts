// Fake-removal wave — source guard: no fabricated map data, no false E2EE claims.
//
// Asserts that the removed fabrications stay removed:
//   1. src/app/map/page.tsx — no DEMO_FRIENDS seed; friends come only from the
//      real backend (GET /api/map/friends).
//   2. src/app/api/map/friends/route.ts — no hardcoded FRIENDS_LOCATIONS; the
//      route proxies to the real backend.
//   3. src/components/map/HeatmapOverlay.tsx — no FALLBACK_HEATMAP invented
//      activity; the overlay renders nothing when the API is unavailable.
//   4. Legal/support copy — no "end-to-end encrypted" / "cannot read" /
//      "never collect or store message content" assertions (the send path posts
//      raw content and the E2EE engine is not wired into any UI).
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Resolve a repo source file regardless of whether the suite runs with the cwd
// at the quantchat app or at the monorepo root.
function readAppSource(relFromApp: string): string {
  const candidates = [
    resolve(process.cwd(), relFromApp),
    resolve(process.cwd(), 'apps/quantchat', relFromApp),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`Could not locate source file: ${relFromApp}`);
  return readFileSync(found, 'utf8');
}

const mapPageSource = readAppSource('src/app/map/page.tsx');
const mapFriendsRouteSource = readAppSource('src/app/api/map/friends/route.ts');
const heatmapSource = readAppSource('src/components/map/HeatmapOverlay.tsx');
const supportSource = readAppSource('src/app/support/page.tsx');
const privacySource = readAppSource('src/app/privacy/page.tsx');
const termsSource = readAppSource('src/app/terms/page.tsx');

describe('Fake removal: no fabricated map data', () => {
  it('map page does not seed fabricated friends (DEMO_FRIENDS is gone)', () => {
    expect(mapPageSource).not.toContain('DEMO_FRIENDS');
  });

  it('map page loads friends from the real backend, never invented data', () => {
    expect(mapPageSource).toContain('/api/map/friends');
  });

  it('map friends API route does not return hardcoded FRIENDS_LOCATIONS', () => {
    expect(mapFriendsRouteSource).not.toContain('FRIENDS_LOCATIONS');
  });

  it('map friends API route proxies to the real backend', () => {
    expect(mapFriendsRouteSource).toContain('proxyToBackend');
    expect(mapFriendsRouteSource).toContain("'/map/friends'");
  });

  it('heatmap overlay does not render invented fallback activity (FALLBACK_HEATMAP is gone)', () => {
    expect(heatmapSource).not.toContain('FALLBACK_HEATMAP');
  });
});

describe('Fake removal: no false end-to-end-encryption claims', () => {
  const legalSources = [supportSource, privacySource, termsSource];

  it('legal copy does not claim conversations are end-to-end encrypted', () => {
    for (const source of legalSources) {
      expect(source).not.toMatch(/end-to-end encrypted/i);
    }
  });

  it('legal copy does not claim the servers cannot read message content', () => {
    for (const source of legalSources) {
      expect(source).not.toMatch(/cannot read/i);
    }
  });

  it('privacy policy does not claim message content is never collected or stored', () => {
    expect(privacySource).not.toMatch(/never collect or store/i);
  });
});

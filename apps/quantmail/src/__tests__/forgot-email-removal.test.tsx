import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * QM fix — phone-based /forgot-email removal regression tests.
 *
 * Per the locked 2026-10-05 order + 2026-10-11 SSO lock, phone login/OTP is
 * REMOVED: no phone is ever collected at register, and the backend has no
 * POST /auth/recover-email route at all. The deleted /forgot-email page asked
 * for a mobile number ("Enter the mobile number you used when creating your
 * address") and then made a fake success claim ("If a QuantMail address is
 * linked to that number, recovery details are on their way") that could never
 * be fulfilled — a trust-breaking invented promise.
 *
 * The honest fix is deletion, not wiring: the route, its links (login page,
 * help page, AuthGuard public paths), and the dead api-client stub
 * `requestEmailLookup` (POST to a route that does not exist) are removed.
 * The help page's "Signing in" topic now states plainly that email address
 * recovery is not available yet, with no link and no phone copy.
 *
 * These tests pin the removal: the route must not come back, no auth surface
 * may carry phone-based recovery copy, and the dead stub must not reappear.
 */

const SRC_ROOT = fileURLToPath(new URL('../', import.meta.url));

// References to the deleted phone-recovery flow that must never return.
const REMOVED_ROUTE_MARKERS = [
  'forgot-email',
  'forgotEmail',
  'requestEmailLookup',
  'recover-email',
  'recoverEmail',
];

// Phone-remnant / fake-success copy that must not appear on any auth surface.
const PHONE_REMANT_MARKERS = [
  'Mobile number',
  'mobile number',
  'Check your phone',
  'recovery details are on',
  'Find your email address',
  '+91 98765 43210',
  'linked to that number',
];

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

describe('forgot-email phone flow is removed', () => {
  it('the /forgot-email route no longer exists', () => {
    expect(existsSync(path.join(SRC_ROOT, 'app', 'forgot-email'))).toBe(false);
  });

  it('no shipped source references the deleted recovery flow', () => {
    const files = collectSourceFiles(SRC_ROOT);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      for (const marker of REMOVED_ROUTE_MARKERS) {
        expect(content, `${path.relative(SRC_ROOT, file)} must not contain ${marker}`).not.toContain(
          marker,
        );
      }
    }
  });

  it('no auth surface carries phone-recovery copy or fake success claims', () => {
    const surfaces = [
      path.join(SRC_ROOT, 'app', 'login', 'page.tsx'),
      path.join(SRC_ROOT, 'app', 'register', 'page.tsx'),
      path.join(SRC_ROOT, 'app', 'forgot-password', 'page.tsx'),
      path.join(SRC_ROOT, 'app', 'reset-password', 'page.tsx'),
      path.join(SRC_ROOT, 'app', 'help', 'page.tsx'),
      path.join(SRC_ROOT, 'components', 'AuthGuard.tsx'),
    ];
    for (const file of surfaces) {
      if (!existsSync(file)) continue;
      const content = readFileSync(file, 'utf8');
      for (const marker of PHONE_REMANT_MARKERS) {
        expect(content, `${path.relative(SRC_ROOT, file)} must not contain ${marker}`).not.toContain(
          marker,
        );
      }
    }
  });

  it('/forgot-email is no longer a public (signed-out) path in AuthGuard', () => {
    const content = readFileSync(path.join(SRC_ROOT, 'components', 'AuthGuard.tsx'), 'utf8');
    expect(content).not.toContain('forgot-email');
  });

  it('the help page no longer links to phone-based email recovery', () => {
    const content = readFileSync(path.join(SRC_ROOT, 'app', 'help', 'page.tsx'), 'utf8');
    expect(content).not.toContain('/forgot-email');
    // Honest unavailable state must be present instead of the phone promise.
    expect(content).toContain('Email address recovery is not available yet');
  });

  it('the dead recover-email API stub is gone from the client', () => {
    const content = readFileSync(path.join(SRC_ROOT, 'services', 'api-client.ts'), 'utf8');
    expect(content).not.toContain('requestEmailLookup');
    expect(content).not.toContain('/auth/recover-email');
  });
});

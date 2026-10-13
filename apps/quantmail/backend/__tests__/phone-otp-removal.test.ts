// @vitest-environment node
// ============================================================================
// Phone OTP removal pin (fix/qm-phone-otp-removal-3).
//
// Per the locked 2026-10-05 / 2026-10-11 SSO design, phone LOGIN/OTP stays
// removed: OTP is email-based only (real SES dispatch + POST /auth/verify-email
// + /auth/resend-verification), never SMS. The live SMS OTP endpoints
// (POST /auth/phone/send-otp, POST /auth/phone/verify — plus the profile
// surface GET/DELETE /auth/phone, which had zero frontend callers) were
// deleted with the module, unmounted from app.ts, and dropped from the
// Next.js proxy allow-list, so they 404 instead of minting SMS codes.
//
// These tests pin the removal: any re-introduction of a phone OTP route,
// module, or allow-list row fails here.
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ALLOWED_BACKEND_ROUTES } from '../lib/routes-config';

const backendRoot = path.resolve(__dirname, '..');
const appRoot = path.resolve(__dirname, '../../src');

function methodsFor(relPath: string): string[] | undefined {
  return ALLOWED_BACKEND_ROUTES.find(({ pattern }) => pattern.test(relPath))?.methods.slice();
}

describe('phone OTP removal', () => {
  it('exposes no allow-listed method for any /auth/phone path', () => {
    expect(methodsFor('auth/phone')).toBeUndefined();
    expect(methodsFor('auth/phone/send-otp')).toBeUndefined();
    expect(methodsFor('auth/phone/verify')).toBeUndefined();
  });

  it('has no allow-list pattern whose source mentions phone', () => {
    const offenders = ALLOWED_BACKEND_ROUTES.filter(({ pattern }) =>
      /phone/i.test(pattern.source),
    );
    expect(offenders).toEqual([]);
  });

  it('deleted the phone route module and its SMS service', () => {
    expect(fs.existsSync(path.join(backendRoot, 'routes', 'phone.ts'))).toBe(false);
    expect(fs.existsSync(path.join(backendRoot, 'services', 'sms.service.ts'))).toBe(false);
  });

  it('app.ts no longer imports or registers the phone route module', () => {
    const appSource = fs.readFileSync(path.join(backendRoot, 'app.ts'), 'utf8');
    // Import statement for the (deleted) routes/phone module.
    expect(appSource).not.toMatch(/^\s*import\s+\w+\s+from\s+['"]\.\/routes\/phone['"];?\s*$/m);
    // Fastify registration call for the phone routes.
    expect(appSource).not.toMatch(/app\.register\(\s*phone\w*\s*[,)]/i);
  });

  it('has no Next proxy route for auth/phone/*', () => {
    const offenders: string[] = [];
    const apiDir = path.join(appRoot, 'app', 'api');
    if (fs.existsSync(apiDir)) {
      const walk = (dir: string): void => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (/auth[\/\\]phone/i.test(path.relative(apiDir, full))) offenders.push(full);
        }
      };
      walk(apiDir);
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the email OTP paths listed (the sanctioned alternative)', () => {
    expect(methodsFor('auth/verify-email')).toContain('POST');
    expect(methodsFor('auth/resend-verification')).toContain('POST');
  });
});

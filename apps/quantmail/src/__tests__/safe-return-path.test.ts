import { describe, it, expect } from 'vitest';
import { safeReturnPath } from '../lib/safe-return-path';

/**
 * `returnTo` used to flow from the URL straight into `router.push`, which follows
 * an absolute URL. `quantmail.in/login?returnTo=https://attacker.example` would
 * therefore send a user to another origin the instant they finished typing their
 * password — on a link whose host is genuinely ours.
 *
 * These cases pin the guard. The bypasses are the interesting half: several of
 * them start with `/` and are still not paths.
 */
describe('safeReturnPath', () => {
  it('accepts in-app paths', () => {
    expect(safeReturnPath('/')).toBe('/');
    expect(safeReturnPath('/spam')).toBe('/spam');
    expect(safeReturnPath('/invite/abc123')).toBe('/invite/abc123');
    expect(safeReturnPath('/settings?tab=security')).toBe('/settings?tab=security');
    expect(safeReturnPath('/thread/1#reply')).toBe('/thread/1#reply');
  });

  it('rejects absolute URLs', () => {
    expect(safeReturnPath('https://attacker.example/phish')).toBeNull();
    expect(safeReturnPath('http://attacker.example')).toBeNull();
    // A look-alike host is the whole point of the attack, so it is not special.
    expect(safeReturnPath('https://quantmai1.in/login')).toBeNull();
  });

  it('rejects protocol-relative and backslash forms that read as paths', () => {
    // `//host` inherits the current scheme and resolves to another origin.
    expect(safeReturnPath('//attacker.example')).toBeNull();
    expect(safeReturnPath('//attacker.example/inbox')).toBeNull();
    // Browsers normalise the backslash to a slash, so this is `//host` too.
    expect(safeReturnPath('/\\attacker.example')).toBeNull();
    expect(safeReturnPath('/\\/attacker.example')).toBeNull();
  });

  it('rejects non-http schemes', () => {
    expect(safeReturnPath('javascript:alert(1)')).toBeNull();
    expect(safeReturnPath('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeReturnPath('mailto:someone@quantmail.in')).toBeNull();
  });

  it('rejects relative paths that are not rooted', () => {
    // Resolved against `/login`, so it lands somewhere unintended even when it
    // stays on-origin.
    expect(safeReturnPath('spam')).toBeNull();
    expect(safeReturnPath('../admin')).toBeNull();
  });

  it('treats absent and empty values as no destination', () => {
    expect(safeReturnPath(null)).toBeNull();
    expect(safeReturnPath(undefined)).toBeNull();
    expect(safeReturnPath('')).toBeNull();
  });
});

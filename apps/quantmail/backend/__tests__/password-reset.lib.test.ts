/**
 * The password-reset primitives, tested directly.
 *
 * These are the rules that decide whether a reset link is a credential or a
 * formality: how much entropy is in it, that only its digest is ever stored, how
 * long it lives, what a new password has to clear, and what the mail contains.
 * Each is checked here rather than through an HTTP round trip, because a route
 * test that happens to pass tells you nothing about which of these held.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const ses = vi.hoisted(() => ({
  sendViaSes: vi.fn(),
  isSesConfigured: vi.fn(() => true),
}));

vi.mock('../lib/ses-sender', () => ({
  sendViaSes: ses.sendViaSes,
  isSesConfigured: ses.isSesConfigured,
}));

import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  RESET_EMAIL_SUBJECT,
  RESET_TOKEN_BYTES,
  RESET_TOKEN_TTL_SECONDS,
  appUrl,
  generateResetToken,
  hashResetToken,
  isResetTokenExpired,
  looksLikeResetToken,
  passwordComplaint,
  resetEmailHtml,
  resetEmailText,
  resetFrom,
  resetTokenExpiry,
  resetUrl,
  sendPasswordResetEmail,
} from '../lib/password-reset';

const ENV_KEYS = [
  'PASSWORD_RESET_APP_URL',
  'WORKSPACE_APP_URL',
  'NEXT_PUBLIC_APP_URL',
  'PASSWORD_RESET_FROM',
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  ses.isSesConfigured.mockReturnValue(true);
  ses.sendViaSes.mockResolvedValue('ses-message-id');
  for (const key of ENV_KEYS) delete process.env[key];
});

describe('reset token', () => {
  it('carries the full 256 bits it claims to', () => {
    expect(RESET_TOKEN_BYTES).toBe(32);
    // base64url of 32 bytes, unpadded.
    expect(generateResetToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('never repeats across a batch', () => {
    const drawn = new Set(Array.from({ length: 500 }, generateResetToken));

    expect(drawn.size).toBe(500);
  });

  it('is URL-safe, so the emailed link survives being pasted', () => {
    for (let i = 0; i < 100; i += 1) {
      const token = generateResetToken();
      expect(encodeURIComponent(token)).toBe(token);
    }
  });

  it('hashes to a hex sha-256 digest that never contains the token', () => {
    const token = generateResetToken();
    const digest = hashResetToken(token);

    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain(token.slice(0, 8));
  });

  it('hashes the same token to the same digest and a different one differently', () => {
    const token = generateResetToken();

    expect(hashResetToken(token)).toBe(hashResetToken(token));
    expect(hashResetToken(generateResetToken())).not.toBe(hashResetToken(token));
  });

  /** A token pasted out of a mail client arrives with whitespace attached. */
  it('folds surrounding whitespace before hashing', () => {
    const token = generateResetToken();

    expect(hashResetToken(` ${token}\n`)).toBe(hashResetToken(token));
  });

  it('accepts the shape it generates and rejects everything else', () => {
    expect(looksLikeResetToken(generateResetToken())).toBe(true);
    expect(looksLikeResetToken(` ${generateResetToken()} `)).toBe(true);
    expect(looksLikeResetToken('short')).toBe(false);
    expect(looksLikeResetToken(`${generateResetToken()}!`)).toBe(false);
    expect(looksLikeResetToken('a'.repeat(129))).toBe(false);
    expect(looksLikeResetToken('')).toBe(false);
    expect(looksLikeResetToken(null)).toBe(false);
    expect(looksLikeResetToken(undefined)).toBe(false);
    expect(looksLikeResetToken(12345678)).toBe(false);
    expect(looksLikeResetToken({ toString: () => generateResetToken() })).toBe(false);
  });
});

describe('reset token lifetime', () => {
  it('expires an hour after it is issued', () => {
    expect(RESET_TOKEN_TTL_SECONDS).toBe(3_600);
    const now = 1_700_000_000_000;

    expect(resetTokenExpiry(now).getTime()).toBe(now + 3_600_000);
  });

  /** `<=`, not `<`: the instant it expires it is expired. */
  it('treats the expiry instant itself as past', () => {
    const now = 1_700_000_000_000;
    const expiresAt = new Date(now);

    expect(isResetTokenExpired(expiresAt, now - 1)).toBe(false);
    expect(isResetTokenExpired(expiresAt, now)).toBe(true);
    expect(isResetTokenExpired(expiresAt, now + 1)).toBe(true);
  });

  it('is still live for the whole hour it was given', () => {
    const now = 1_700_000_000_000;
    const expiresAt = resetTokenExpiry(now);

    expect(isResetTokenExpired(expiresAt, now + 3_599_000)).toBe(false);
    expect(isResetTokenExpired(expiresAt, now + 3_600_000)).toBe(true);
  });
});

describe('new-password policy', () => {
  it('accepts an ordinary long password', () => {
    expect(passwordComplaint('correct horse battery staple')).toBeNull();
    expect(passwordComplaint('kX7!mqzr2f')).toBeNull();
  });

  it('asks for something when nothing was sent', () => {
    expect(passwordComplaint(undefined)).toBe('Choose a new password.');
    expect(passwordComplaint(null)).toBe('Choose a new password.');
    expect(passwordComplaint('')).toBe('Choose a new password.');
    expect(passwordComplaint(12345678)).toBe('Choose a new password.');
    expect(passwordComplaint({ length: 20 })).toBe('Choose a new password.');
  });

  it('holds the same floor the rest of the app does', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(passwordComplaint('short12')).toBe('Use at least 8 characters.');
    expect(passwordComplaint('exactly8')).toBeNull();
  });

  /** argon2 will hash a megabyte as readily as ten bytes, on our clock. */
  it('caps the length so hashing cost stays bounded', () => {
    expect(MAX_PASSWORD_LENGTH).toBe(200);
    expect(passwordComplaint('a1'.repeat(100))).toBeNull();
    expect(passwordComplaint(`${'a1'.repeat(100)}b`)).toBe('Use 200 characters or fewer.');
  });

  it('rejects one character held down', () => {
    expect(passwordComplaint('aaaaaaaaaaaa')).toBe('Use more than one repeated character.');
    expect(passwordComplaint('............')).toBe('Use more than one repeated character.');
    expect(passwordComplaint('aaaaaaaaaaab')).toBeNull();
  });

  /**
   * Length and a blocklist, and deliberately no composition rules — those
   * reliably produce `Password1!` and nothing else, which is why NIST SP 800-63B
   * stopped recommending them.
   */
  it('rejects the passwords that get tried first, in any casing', () => {
    const breached = 'That password appears on public breach lists. Choose another.';

    expect(passwordComplaint('password')).toBe(breached);
    expect(passwordComplaint('PASSWORD')).toBe(breached);
    expect(passwordComplaint('Password123')).toBe(breached);
    expect(passwordComplaint('qwertyuiop')).toBe(breached);
    expect(passwordComplaint('p@ssw0rd')).toBe(breached);
    expect(passwordComplaint('quantmail123')).toBe(breached);
  });

  it('imposes no composition rule on a password long enough to be fine', () => {
    expect(passwordComplaint('mangoes in the fridge again')).toBeNull();
    expect(passwordComplaint('thecatsatonthemat')).toBeNull();
  });

  it('refuses the account address and username, which are the first guesses', () => {
    const identity = { email: 'Kundan@quantmail.in', username: 'kundan' };
    const complaint = 'Do not use your address or username as your password.';

    expect(passwordComplaint('kundan@quantmail.in', identity)).toBe(complaint);
    expect(passwordComplaint('KUNDAN@QUANTMAIL.IN', identity)).toBe(complaint);
    expect(passwordComplaint(' kundan  ', identity)).toBe(complaint);
    expect(passwordComplaint('kundan-quantmail', identity)).toBeNull();
  });

  it('does not let a two-letter username block half the dictionary', () => {
    expect(passwordComplaint('ab', { username: 'ab' })).toBe('Use at least 8 characters.');
    expect(passwordComplaint('abcdefgh', { username: 'ab' })).toBeNull();
  });

  it('needs no identity at all', () => {
    expect(passwordComplaint('a-fine-password', {})).toBeNull();
    expect(passwordComplaint('a-fine-password', { email: null, username: null })).toBeNull();
  });
});

describe('reset link', () => {
  it('lands on the reset page of the configured app', () => {
    process.env['PASSWORD_RESET_APP_URL'] = 'https://mail.quantrinity.in';

    expect(resetUrl('abc123')).toBe('https://mail.quantrinity.in/reset-password?token=abc123');
  });

  it('falls back through the shared app-url variables to production', () => {
    expect(appUrl()).toBe('https://quantmail.in');

    process.env['NEXT_PUBLIC_APP_URL'] = 'https://next.example';
    expect(appUrl()).toBe('https://next.example');

    process.env['WORKSPACE_APP_URL'] = 'https://workspace.example';
    expect(appUrl()).toBe('https://workspace.example');

    process.env['PASSWORD_RESET_APP_URL'] = 'https://reset.example';
    expect(appUrl()).toBe('https://reset.example');
  });

  it('does not double the slash when the configured url has a trailing one', () => {
    process.env['PASSWORD_RESET_APP_URL'] = 'https://quantmail.in/';

    expect(resetUrl('t')).toBe('https://quantmail.in/reset-password?token=t');
  });

  /** A token is base64url, but escaping it is what keeps a `+`-bearing future
   *  encoding from silently arriving as a space. */
  it('percent-encodes the token rather than pasting it in raw', () => {
    expect(resetUrl('a+b/c=')).toBe('https://quantmail.in/reset-password?token=a%2Bb%2Fc%3D');
  });

  it('sends from the no-reply identity unless told otherwise', () => {
    expect(resetFrom()).toBe('QuantMail <no-reply@quantmail.in>');

    process.env['PASSWORD_RESET_FROM'] = 'QuantMail Security <security@quantmail.in>';
    expect(resetFrom()).toBe('QuantMail Security <security@quantmail.in>');
  });
});

describe('reset mail', () => {
  const url = 'https://quantmail.in/reset-password?token=tok';

  it('says what it is and carries the link twice — button and paste-able text', () => {
    const html = resetEmailHtml({ url, name: 'Kundan' });

    expect(RESET_EMAIL_SUBJECT).toBe('Reset your QuantMail password');
    expect(html).toContain(`href="${url}"`);
    expect(html.split(url).length - 1).toBeGreaterThanOrEqual(2);
    expect(html).toContain('Hi Kundan,');
    expect(html).toContain('60 minutes');
  });

  /**
   * No `<img>` anywhere: Gmail and Outlook strip `<svg>`, and a remote PNG logo
   * is a blocked grey box in every client that defers images. The mark is a
   * styled letterform in the product's own palette.
   */
  it('has no image of any kind and stays on the QuantMail palette', () => {
    const html = resetEmailHtml({ url });

    expect(html).not.toMatch(/<img\b/i);
    expect(html).not.toMatch(/<svg\b/i);
    expect(html).not.toMatch(/\.png|\.jpe?g|\.gif/i);
    for (const token of ['#090A0C', '#111318', '#282C35', '#F5F5F5', '#A1A4AC', '#FF8C42']) {
      expect(html).toContain(token);
    }
    // The invite mail's slate/cyan palette must not leak in here.
    expect(html).not.toContain('#22d3ee');
    expect(html).not.toContain('#0b1120');
  });

  it('escapes a hostile display name instead of rendering it', () => {
    const html = resetEmailHtml({ url, name: '<script>alert(1)</script>' });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('greets a nameless account without a dangling comma', () => {
    const html = resetEmailHtml({ url, name: null });

    expect(html).toContain('Hi,');
    expect(html).not.toContain('Hi null');
  });

  it('has a plain-text half that is actually usable on its own', () => {
    const text = resetEmailText({ url, name: 'Kundan' });

    expect(text).toContain('Hi Kundan,');
    expect(text).toContain(url);
    expect(text).toContain('works once and expires in 60 minutes');
    expect(text).toContain('If this was not you');
    expect(text).not.toMatch(/<[a-z]/i);
  });

  it('tells the reader that ignoring it is safe', () => {
    expect(resetEmailHtml({ url })).toContain('Did not ask for this?');
    expect(resetEmailText({ url })).toContain('you can ignore this message');
  });
});

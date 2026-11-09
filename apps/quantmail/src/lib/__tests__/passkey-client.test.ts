/**
 * Passkey browser-client helpers (src/lib/passkey-client.ts).
 *
 * Only the pure parts are tested here: base64url conversion is the exact
 * place a WebAuthn ceremony silently breaks (one wrong alphabet and the
 * server rejects every assertion), and support detection must answer
 * `false` — never throw — where there is no window at all. The
 * navigator.credentials ceremonies themselves are browser-only and are
 * covered by the login flow, not by a node test pretending to be a browser.
 */

import { describe, expect, it } from 'vitest';
import {
  base64urlToBuffer,
  bufferToBase64url,
  isPasskeySupported,
  PasskeyCancelledError,
} from '../passkey-client';

describe('passkey base64url helpers', () => {
  it('round-trips arbitrary bytes without padding or URL-unsafe characters', () => {
    const original = new Uint8Array([0, 1, 2, 127, 128, 200, 255, 251, 254]);
    const encoded = bufferToBase64url(original.buffer);
    expect(encoded).not.toMatch(/[+/=]/);
    const decoded = new Uint8Array(base64urlToBuffer(encoded));
    expect([...decoded]).toEqual([...original]);
  });

  it('decodes the server-style unpadded form', () => {
    // 'hello' in base64url, padding stripped — the form servers emit.
    const decoded = new Uint8Array(base64urlToBuffer('aGVsbG8'));
    expect(new TextDecoder().decode(decoded)).toBe('hello');
  });

  it('an empty credential field encodes and decodes to empty', () => {
    expect(bufferToBase64url(new Uint8Array([]).buffer)).toBe('');
    expect(new Uint8Array(base64urlToBuffer('')).length).toBe(0);
  });
});

describe('passkey support detection', () => {
  it('answers false (never throws) where there is no window', () => {
    expect(isPasskeySupported()).toBe(false);
  });
});

describe('passkey cancellation', () => {
  it('carries a user-facing message, not a raw DOMException name', () => {
    const error = new PasskeyCancelledError();
    expect(error.name).toBe('PasskeyCancelledError');
    expect(error.message).toMatch(/cancelled/i);
  });
});

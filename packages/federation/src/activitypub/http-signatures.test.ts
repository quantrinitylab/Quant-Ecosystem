import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { signRequest, verifySignature } from './http-signatures.js';

function generateEd25519Keys() {
  return generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

describe('HTTP Signatures', () => {
  it('sign then verify roundtrip succeeds', () => {
    const { publicKey, privateKey } = generateEd25519Keys();
    const method = 'POST';
    const url = 'https://remote.example/users/bob/inbox';
    const headers: Record<string, string> = {
      host: 'remote.example',
      date: new Date().toUTCString(),
    };
    const body = JSON.stringify({ type: 'Follow', actor: 'https://local.example/users/alice' });

    const signed = signRequest(
      privateKey,
      'https://local.example/users/alice#main-key',
      method,
      url,
      headers,
      body,
    );

    const result = verifySignature(publicKey, method, url, signed, body);
    expect(result).toBe(true);
  });

  it('tampered body fails verification', () => {
    const { publicKey, privateKey } = generateEd25519Keys();
    const method = 'POST';
    const url = 'https://remote.example/users/bob/inbox';
    const headers: Record<string, string> = {
      host: 'remote.example',
      date: new Date().toUTCString(),
    };
    const body = JSON.stringify({ type: 'Follow', actor: 'https://local.example/users/alice' });

    const signed = signRequest(
      privateKey,
      'https://local.example/users/alice#main-key',
      method,
      url,
      headers,
      body,
    );

    const tamperedBody = JSON.stringify({
      type: 'Delete',
      actor: 'https://evil.example/users/hacker',
    });
    const result = verifySignature(publicKey, method, url, signed, tamperedBody);
    expect(result).toBe(false);
  });

  it('missing signature header fails', () => {
    const { publicKey } = generateEd25519Keys();
    const method = 'POST';
    const url = 'https://remote.example/users/bob/inbox';
    const headers: Record<string, string> = {
      host: 'remote.example',
      date: new Date().toUTCString(),
    };

    const result = verifySignature(publicKey, method, url, headers);
    expect(result).toBe(false);
  });

  it('Ed25519 works correctly', () => {
    const { publicKey, privateKey } = generateEd25519Keys();
    const method = 'GET';
    const url = 'https://remote.example/users/bob';
    const headers: Record<string, string> = {
      host: 'remote.example',
      date: new Date().toUTCString(),
    };

    const signed = signRequest(
      privateKey,
      'https://local.example/users/alice#main-key',
      method,
      url,
      headers,
    );

    expect(signed['signature']).toContain('algorithm="ed25519"');
    const result = verifySignature(publicKey, method, url, signed);
    expect(result).toBe(true);
  });
});

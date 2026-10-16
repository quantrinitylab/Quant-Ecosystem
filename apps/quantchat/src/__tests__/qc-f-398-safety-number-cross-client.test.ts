// ============================================================================
// QC-F-398 — Cross-client safety-number / fingerprint golden tests
//
// The pinned vectors below are copied byte-identically from the Flutter
// cross-client contract: packages/chat_core/test/safety_number_test.dart in
// Tree A (chat_core/lib/src/crypto/safety_number.dart), whose header declares
// these vectors a contract every client must reproduce byte-identically.
// If a vector ever changes in one file, the other MUST change too — that is
// a brief-amend, never a one-sided edit.
//
// Canonical spec: identity keys are 32 raw bytes in canonical padded
// standard base64. Fingerprint = base64(SHA-256(raw key bytes)).
// Safety number = SHA-512 over the byte-wise sorted raw keys concatenated
// with NO separator, read as 12 x 5-byte big-endian uint40 chunks, each
// contributing the first 5 digits of its zero-padded decimal form.
// This client's computePeerSafetyNumber returns those digits in its spaced
// display form (12 blocks of 5); the digits are the contract.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  computePeerSafetyNumber,
  computePublicKeyFingerprint,
  verifyPeerFingerprints,
  formatSafetyNumberForDisplay,
  isValidSafetyNumberFormat,
  QrContactVerifier,
} from '../services/qr-contact-verifier';

// Pinned identity keys (real 32-byte base64) — Flutter kKeyA / kKeyB / peer C.
const KEY_A = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=';
const KEY_B = '//79/Pv6+fj39vX08/Lx8O/u7ezr6uno5+bl5OPi4eA=';
const KEY_C = 'QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkI=';

// Pinned canonical fingerprints (Flutter kFingerprintA + brief QC-F-398 C5).
const FP_A = 'Yw3NKWbEM2aRElRIu7JbT/QSpJxzLbLIq8G4WBvXEN0=';
const FP_B = 'GGXACDHnP37iP8E8stD1iLnDQYNcp0cvjsA1q6S3idY=';

// Pinned canonical safety numbers (Flutter kSafetyAB for A,B; brief §6.1).
const RAW_AB = '597259694914108105647949082432847397076826563692508767868350';
const SPACED_AB = '59725 96949 14108 10564 79490 82432 84739 70768 26563 69250 87678 68350';
const SPACED_AA = '10526 79484 67121 69237 51644 10065 63356 96582 32420 41307 49208 78738';
const SPACED_AC = '66071 72429 73159 72437 49809 37394 60339 49174 21298 83453 10711 39040';

// The pre-fix fake fixture keys from whoxa-qr-verifier.test.ts — NOT valid
// 32-byte identity keys; a fail-closed implementation must throw on them.
const FAKE_RSA_ALICE = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0alicePublicKeyExample';
const FAKE_RSA_BOB = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1bobPublicKeyExample';

describe('QC-F-398 cross-client safety number & fingerprint contract', () => {
  it('T398-01: pinned pair (A,B) reproduces the Flutter safety number exactly', () => {
    const spaced = computePeerSafetyNumber(KEY_A, KEY_B);
    expect(spaced).toBe(SPACED_AB);
    expect(spaced.replace(/ /g, '')).toBe(RAW_AB);
  });

  it('T398-02: pinned value is order-independent — (B,A) equals (A,B)', () => {
    expect(computePeerSafetyNumber(KEY_B, KEY_A)).toBe(SPACED_AB);
  });

  it('T398-03: self-pair (A,A) reproduces the pinned value', () => {
    expect(computePeerSafetyNumber(KEY_A, KEY_A)).toBe(SPACED_AA);
  });

  it('T398-04: second pair (A,C) pinned; class wrapper delegates to the same value', () => {
    expect(computePeerSafetyNumber(KEY_A, KEY_C)).toBe(SPACED_AC);
    const verifier = new QrContactVerifier('qc-f-398-test-secret');
    expect(verifier.computeSafetyNumber(KEY_A, KEY_C)).toBe(SPACED_AC);
  });

  it('T398-05: fingerprint of A is the pinned base64(SHA-256(raw bytes))', () => {
    expect(computePublicKeyFingerprint(KEY_A)).toBe(FP_A);
  });

  it('T398-06: fingerprint of B is pinned; shape is 44-char padded base64', () => {
    const fp = computePublicKeyFingerprint(KEY_B);
    expect(fp).toBe(FP_B);
    expect(fp).toHaveLength(44);
    expect(fp).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  });

  it('T398-07: fake RSA-shaped fixture keys throw on both functions (fail-closed)', () => {
    expect(() => computePublicKeyFingerprint(FAKE_RSA_ALICE)).toThrow();
    expect(() => computePublicKeyFingerprint(FAKE_RSA_BOB)).toThrow();
    expect(() => computePeerSafetyNumber(FAKE_RSA_ALICE, FAKE_RSA_BOB)).toThrow();
    expect(() => computePeerSafetyNumber(KEY_A, FAKE_RSA_BOB)).toThrow();
  });

  it('T398-08: 31-byte and 33-byte keys throw on both functions (length fail-closed)', () => {
    const key31 = Buffer.alloc(31, 0x07).toString('base64');
    const key33 = Buffer.alloc(33, 0x07).toString('base64');
    expect(() => computePublicKeyFingerprint(key31)).toThrow();
    expect(() => computePublicKeyFingerprint(key33)).toThrow();
    expect(() => computePeerSafetyNumber(key31, KEY_B)).toThrow();
    expect(() => computePeerSafetyNumber(KEY_A, key33)).toThrow();
  });

  it('T398-09: malformed / empty / non-canonical (padding-stripped) keys throw', () => {
    const unpaddedA = KEY_A.replace(/=+$/, '');
    for (const bad of ['!!!not-base64!!!', '', unpaddedA]) {
      expect(() => computePublicKeyFingerprint(bad)).toThrow();
      expect(() => computePeerSafetyNumber(bad, KEY_B)).toThrow();
    }
  });

  it('T398-10: verify WITH keys returns VERIFIED and the canonical safety number', () => {
    const result = verifyPeerFingerprints(FP_A, FP_A, {
      userAPublicKey: KEY_A,
      userBPublicKey: KEY_B,
    });
    expect(result.verified).toBe(true);
    expect(result.status).toBe('VERIFIED');
    expect(result.safetyNumber).toBe(SPACED_AB);
  });

  it('T398-11: verify WITHOUT keys is honest-empty — no number fabricated from fingerprints', () => {
    const matched = verifyPeerFingerprints(FP_A, FP_A);
    expect(matched.verified).toBe(true);
    expect(matched.fingerprintMatch).toBe(true);
    expect(matched.status).toBe('VERIFIED');
    expect(matched.safetyNumber).toBe('');

    const mismatched = verifyPeerFingerprints(FP_A, FP_B);
    expect(mismatched.verified).toBe(false);
    expect(mismatched.status).toBe('MISMATCH');
    expect(mismatched.safetyNumber).toBe('');
  });

  it('T398-12 (control): format helpers agree with the canonical digits', () => {
    expect(isValidSafetyNumberFormat(computePeerSafetyNumber(KEY_A, KEY_B))).toBe(true);
    expect(formatSafetyNumberForDisplay(RAW_AB)).toBe(SPACED_AB);
  });

  it('T398-13 (control): different real pairs give different numbers', () => {
    expect(computePeerSafetyNumber(KEY_A, KEY_B)).not.toBe(computePeerSafetyNumber(KEY_A, KEY_C));
  });
});

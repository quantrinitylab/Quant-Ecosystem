import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { DDoSProtector } from './ddos-protection';

/** Real iterated SHA-256 proof-of-work (the FIXED computeProofOfWork must equal this). */
function powReference(nonce: string, difficulty: number): string {
  let hash = nonce;
  for (let i = 0; i < difficulty; i++) {
    hash = crypto
      .createHash('sha256')
      .update(hash + i.toString())
      .digest('hex');
  }
  return hash.substring(0, difficulty * 2);
}

/** Controlled access to the private PoW routine for a difficulty-independent observation. */
type DDoSInternals = { computeProofOfWork(nonce: string, difficulty: number): string };
function internals(p: DDoSProtector): DDoSInternals {
  return p as unknown as DDoSInternals;
}

// ============================================================================
// Task 18.6 — Fix-check: DDoS proof-of-work equals iterated SHA-256; round-trip (P6)
// Converted from the Phase-1 exploration block. PASSES on FIXED code.
// PBT: seeded random (nonce, difficulty) via inline mulberry32, plus difficulty=0 edge.
// ============================================================================
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomNonce(rng: () => number): string {
  const len = 1 + Math.floor(rng() * 24);
  let s = '';
  for (let i = 0; i < len; i++) {
    s += '0123456789abcdef'[Math.floor(rng() * 16)];
  }
  return s;
}

describe('Bug E2 — fix-check: proof-of-work equals iterated SHA-256 reference (P6)', () => {
  it('computeProofOfWork(nonce, difficulty) === iterated SHA-256 reference for >=100 inputs', () => {
    const ddos = new DDoSProtector();
    const rng = mulberry32(0xd0501);
    for (let i = 0; i < 110; i++) {
      const nonce = randomNonce(rng);
      const difficulty = Math.floor(rng() * 7); // 0..6
      const computed = internals(ddos).computeProofOfWork(nonce, difficulty);
      expect(computed).toBe(powReference(nonce, difficulty));
      expect(computed.length).toBe(difficulty * 2);
    }
  });

  it('handles the difficulty=0 edge (empty answer, matches reference)', () => {
    const ddos = new DDoSProtector();
    expect(internals(ddos).computeProofOfWork('abc', 0)).toBe(powReference('abc', 0));
    expect(internals(ddos).computeProofOfWork('abc', 0)).toBe('');
  });

  it('issueChallenge -> recompute -> verifyChallenge accepts the correct answer', async () => {
    const ddos = new DDoSProtector({ challengeThreshold: 1000 });
    const res = await ddos.processRequest('203.0.113.7', '/api', {});
    expect(res.reason).toBe('challenge_required');
    const challenge = res.challenge!;
    // A client recomputes the answer with a standard library:
    const recomputed = powReference(challenge.solution!, challenge.difficulty);
    expect(recomputed).toBe(challenge.expectedAnswer);
    const accepted = await ddos.verifyChallenge('203.0.113.7', challenge.challengeId, recomputed);
    expect(accepted).toBe(true);
  });

  it('verifyChallenge rejects a tampered answer', async () => {
    const ddos = new DDoSProtector({ challengeThreshold: 1000 });
    const res = await ddos.processRequest('203.0.113.9', '/api', {});
    const challenge = res.challenge!;
    const tampered = `${challenge.expectedAnswer}deadbeef`;
    const rejected = await ddos.verifyChallenge('203.0.113.9', challenge.challengeId, tampered);
    expect(rejected).toBe(false);
  });
});

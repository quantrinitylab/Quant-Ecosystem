import { describe, it, expect, beforeEach } from 'vitest';
import { VoiceSafetyGuardrail } from '../safety/voice-safety.js';
import type { ParsedIntent } from '../voice/voice-intent-parser.js';

describe('VoiceSafetyGuardrail', () => {
  let safety: VoiceSafetyGuardrail;

  beforeEach(() => {
    safety = new VoiceSafetyGuardrail();
  });

  function makeIntent(app: string, action: string): ParsedIntent {
    return {
      app,
      action,
      params: {},
      confidence: 0.9,
      rawText: 'test command',
    };
  }

  it('allows scroll command', () => {
    const result = safety.check(makeIntent('quantneon', 'scroll'));
    expect(result.allowed).toBe(true);
    expect(result.permission).toBe('allow');
    expect(result.requireConfirmation).toBe(false);
  });

  it('allows navigate command', () => {
    const result = safety.check(makeIntent('quantsync', 'navigate'));
    expect(result.allowed).toBe(true);
    expect(result.permission).toBe('allow');
  });

  it('allows media.next command', () => {
    const result = safety.check(makeIntent('*', 'media.next'));
    expect(result.allowed).toBe(true);
    expect(result.permission).toBe('allow');
  });

  it('allows search.query command', () => {
    const result = safety.check(makeIntent('quanttube', 'search.query'));
    expect(result.allowed).toBe(true);
    expect(result.permission).toBe('allow');
  });

  it('requires confirmation for delete command', () => {
    const result = safety.check(makeIntent('quantmail', 'email.delete'));
    expect(result.allowed).toBe(true);
    expect(result.permission).toBe('ask');
    expect(result.requireConfirmation).toBe(true);
  });

  it('requires confirmation for message.send command', () => {
    const result = safety.check(makeIntent('quantsync', 'message.send'));
    expect(result.allowed).toBe(true);
    expect(result.permission).toBe('ask');
    expect(result.requireConfirmation).toBe(true);
  });

  it('requires confirmation for social.share command', () => {
    const result = safety.check(makeIntent('quantneon', 'social.share'));
    expect(result.allowed).toBe(true);
    expect(result.permission).toBe('ask');
    expect(result.requireConfirmation).toBe(true);
  });

  it('denies purchase command', () => {
    const result = safety.check(makeIntent('*', 'purchase'));
    expect(result.allowed).toBe(false);
    expect(result.permission).toBe('deny');
  });

  it('denies payment command', () => {
    const result = safety.check(makeIntent('*', 'payment'));
    expect(result.allowed).toBe(false);
    expect(result.permission).toBe('deny');
  });

  it('allows ai.summarize command on quantmail', () => {
    const result = safety.check(makeIntent('quantmail', 'ai.summarize'));
    expect(result.allowed).toBe(true);
    expect(result.permission).toBe('allow');
  });

  it('allows ai.draft command on quantmail', () => {
    const result = safety.check(makeIntent('quantmail', 'ai.draft'));
    expect(result.allowed).toBe(true);
    expect(result.permission).toBe('allow');
  });

  it('blocks commands when rate limit exceeded (20+ commands in 10s window)', () => {
    for (let i = 0; i < 20; i++) {
      const result = safety.check(makeIntent('quantneon', 'scroll'));
      expect(result.allowed).toBe(true);
    }
    const result = safety.check(makeIntent('quantneon', 'scroll'));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Rate limit');
  });

  it('allows commands up to the rate limit boundary', () => {
    for (let i = 0; i < 19; i++) {
      const result = safety.check(makeIntent('quantneon', 'scroll'));
      expect(result.allowed).toBe(true);
    }
    const twentieth = safety.check(makeIntent('quantneon', 'scroll'));
    expect(twentieth.allowed).toBe(true);
  });
});

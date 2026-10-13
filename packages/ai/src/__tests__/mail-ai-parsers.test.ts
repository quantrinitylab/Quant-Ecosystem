import { describe, it, expect, vi } from 'vitest';
import {
  MailAIService,
  parseCategory,
  parseLabels,
  parsePhishingVerdict,
  parsePriority,
  parseReplySuggestions,
} from '../services/mail-ai';
import type { AIEngine } from '../core/engine';

function serviceAnswering(content: string): MailAIService {
  const engine = { infer: vi.fn().mockResolvedValue({ content }) } as unknown as AIEngine;
  return new MailAIService(engine);
}

describe('parsePhishingVerdict', () => {
  it('reads a clean JSON safe verdict even when the reasoning says "phishing"', () => {
    expect(
      parsePhishingVerdict(
        '{"verdict":"safe","confidence":0.92,"indicators":["No suspicious links; this is not phishing"]}',
      ),
    ).toEqual({ isPhishing: false, confidence: expect.closeTo(0.08, 5), indicators: [] });
  });

  it('reads a fenced JSON phishing verdict with indicators', () => {
    const verdict = parsePhishingVerdict(
      'Result:\n```json\n{"verdict": "Phishing", "confidence": 85, "indicators": ["Fake login link", " ", "Urgent tone"]}\n```',
    );
    expect(verdict).toEqual({
      isPhishing: true,
      confidence: 0.85,
      indicators: ['Fake login link', 'Urgent tone'],
    });
  });

  it('accepts isPhishing booleans and hedged verdict words', () => {
    expect(parsePhishingVerdict('{"isPhishing": true}')?.isPhishing).toBe(true);
    expect(parsePhishingVerdict('{"verdict": "likely phishing"}')?.isPhishing).toBe(true);
    expect(parsePhishingVerdict('{"verdict": "not_phishing"}')?.isPhishing).toBe(false);
  });

  it('falls back to a Verdict line or a bare one-word answer', () => {
    expect(parsePhishingVerdict('Verdict: **Safe** — ordinary lunch invite.')?.isPhishing).toBe(false);
    expect(parsePhishingVerdict('verdict: not phishing')?.isPhishing).toBe(false);
    expect(parsePhishingVerdict('Phishing.')?.isPhishing).toBe(true);
  });

  it('returns null (scan unavailable) instead of guessing from prose', () => {
    expect(parsePhishingVerdict('This email does not appear to be a phishing attempt.')).toBeNull();
    expect(parsePhishingVerdict('')).toBeNull();
  });
});

describe('MailAIService.detectPhishing', () => {
  it('throws when the model gives no readable verdict', async () => {
    await expect(
      serviceAnswering('Looks fine to me, nothing suspicious.').detectPhishing('s', 'b', 'a@b.c', 'u'),
    ).rejects.toThrow(/no readable verdict/);
  });
});

describe('parsePriority', () => {
  it('reads explicit answers', () => {
    expect(parsePriority('Priority: High')).toBe('high');
    expect(parsePriority('priority is low')).toBe('low');
    expect(parsePriority('Priority: normal')).toBe('normal');
  });

  it('ignores substrings and negations', () => {
    expect(parsePriority('Just a follow up, nothing urgent.')).toBe('normal');
    expect(parsePriority('See the notes below.')).toBe('normal');
    expect(parsePriority('This is not high priority; it is normal.')).toBe('normal');
    expect(parsePriority('HIGH — the deadline is today.')).toBe('high');
  });
});

describe('parseCategory / parseLabels', () => {
  it('prefers an explicit Category line', () => {
    expect(parseCategory('It mentions primary topics.\nCategory: Social\nLabels: personal')).toBe('social');
    expect(parseCategory('Category: promotion')).toBe('promotions');
  });

  it('uses the earliest non-negated whole-word mention', () => {
    expect(parseCategory('Not primary — this is a social update.')).toBe('social');
    expect(parseCategory('No category given')).toBe('primary');
  });

  it('reads labels as whole words, from the Labels line when present', () => {
    expect(parseLabels('Category: updates\nLabels: work, finance')).toEqual(['work', 'finance']);
    expect(parseLabels('Network outage notice from your provider.')).toEqual([]);
    expect(parseLabels('Labels: none')).toEqual([]);
  });
});

describe('parseReplySuggestions', () => {
  it('splits the requested blank-line format', () => {
    expect(parseReplySuggestions('Sounds good!\n\nCan we do Friday?\n\nThanks, will review.')).toEqual([
      'Sounds good!',
      'Can we do Friday?',
      'Thanks, will review.',
    ]);
  });

  it('splits a numbered single block and drops the preamble', () => {
    expect(
      parseReplySuggestions(
        'Here are three short replies:\n1. "Sounds good!"\n2. **Can we do Friday?**\n3. Thanks, will review.',
      ),
    ).toEqual(['Sounds good!', 'Can we do Friday?', 'Thanks, will review.']);
  });

  it('keeps real replies that start like a preamble and strips Reply N: labels', () => {
    expect(
      parseReplySuggestions('Reply 1: Sure, Friday works!\nReply 2: Okay, I will send it.\nReply 3: Sure, Friday works!'),
    ).toEqual(['Sure, Friday works!', 'Okay, I will send it.']);
  });

  it('caps at three chips', () => {
    expect(parseReplySuggestions('- a\n- b\n- c\n- d')).toEqual(['a', 'b', 'c']);
  });
});

import { describe, it, expect } from 'vitest';
import {
  DefaultMemoryConflictResolver,
  ResidenceRule,
  EmployerRule,
  FavoriteRule,
  SentimentRule,
  type ExistingMemoryRef,
} from '../core/memory-conflict';

const resolver = new DefaultMemoryConflictResolver();
const ex = (id: string, content: string, kind = 'fact'): ExistingMemoryRef => ({
  id,
  content,
  kind,
});

describe('DefaultMemoryConflictResolver', () => {
  it('supersedes an old residence when a new one arrives', () => {
    const out = resolver.resolve({ content: 'lives in Bangalore', kind: 'fact' }, [
      ex('old', 'lives in Patna'),
    ]);
    expect(out).toEqual([{ existingId: 'old', verdict: 'supersedes' }]);
  });

  it('marks an identical residence as duplicate', () => {
    const out = resolver.resolve({ content: 'lives in Patna', kind: 'fact' }, [
      ex('old', 'lives in Patna'),
    ]);
    expect(out[0]?.verdict).toBe('duplicate');
  });

  it('treats a different slot as unrelated', () => {
    const out = resolver.resolve({ content: 'lives in Patna', kind: 'fact' }, [
      ex('job', 'works at OpenAI'),
    ]);
    expect(out[0]?.verdict).toBe('unrelated');
  });

  it('supersedes a changed favorite (same thing, new value)', () => {
    const out = resolver.resolve({ content: 'favourite language is Rust', kind: 'preference' }, [
      ex('old', 'favourite language is Python', 'preference'),
    ]);
    expect(out[0]?.verdict).toBe('supersedes');
  });

  it('keeps favorites of different things independent', () => {
    const out = resolver.resolve({ content: 'favourite language is Rust', kind: 'preference' }, [
      ex('food', 'favourite food is pizza', 'preference'),
    ]);
    expect(out[0]?.verdict).toBe('unrelated');
  });

  it('contradicts on a sentiment polarity flip (like → dislike)', () => {
    const out = resolver.resolve({ content: 'dislikes coffee', kind: 'preference' }, [
      ex('old', 'likes coffee', 'preference'),
    ]);
    expect(out[0]?.verdict).toBe('contradicts');
  });

  it('supersedes a changed employer', () => {
    const out = resolver.resolve({ content: 'works at OpenAI', kind: 'fact' }, [
      ex('old', 'works at Google'),
    ]);
    expect(out[0]?.verdict).toBe('supersedes');
  });

  it('returns unrelated for candidates no rule recognizes', () => {
    const out = resolver.resolve({ content: 'the sky is blue', kind: 'fact' }, [
      ex('a', 'lives in Patna'),
    ]);
    expect(out[0]?.verdict).toBe('unrelated');
  });

  it('decides per existing memory across a mixed set', () => {
    const out = resolver.resolve({ content: 'lives in Delhi', kind: 'fact' }, [
      ex('a', 'lives in Patna'),
      ex('b', 'works at OpenAI'),
      ex('c', 'lives in Delhi'),
    ]);
    expect(out).toEqual([
      { existingId: 'a', verdict: 'supersedes' },
      { existingId: 'b', verdict: 'unrelated' },
      { existingId: 'c', verdict: 'duplicate' },
    ]);
  });
});

describe('slot rules', () => {
  it('ResidenceRule extracts a normalized city', () => {
    expect(new ResidenceRule().extract('lives in Patna')).toEqual({
      slot: 'residence',
      value: 'patna',
    });
  });
  it('EmployerRule matches at/for', () => {
    expect(new EmployerRule().extract('works for Acme')).toEqual({
      slot: 'employer',
      value: 'acme',
    });
  });
  it('FavoriteRule namespaces the slot by thing', () => {
    expect(new FavoriteRule().extract('favourite language is Rust')).toEqual({
      slot: 'favourite:language',
      value: 'rust',
    });
  });
  it('SentimentRule captures polarity per object and is a contradiction rule', () => {
    const rule = new SentimentRule();
    expect(rule.conflictKind).toBe('contradicts');
    expect(rule.extract('dislikes coffee')).toEqual({
      slot: 'sentiment:coffee',
      value: 'dislikes',
    });
  });
  it('normalizes "now" out of values so "Rust now" == "Rust"', () => {
    expect(new FavoriteRule().extract('favourite language is Rust now')?.value).toBe('rust');
  });
});

import { describe, it, expect } from 'vitest';
import {
  DefaultMemoryConflictResolver,
  recallHintForSlot,
  residenceSlot,
  employerSlot,
  favouriteSlot,
  sentimentSlot,
  type ExistingMemoryRef,
} from '../core/memory-conflict';

const resolver = new DefaultMemoryConflictResolver();
const ex = (id: string, content: string, kind = 'fact'): ExistingMemoryRef => ({
  id,
  content,
  kind,
});

describe('DefaultMemoryConflictResolver — store', () => {
  it('supersedes an old residence when a new one arrives', () => {
    const [d] = resolver.resolve({ content: 'lives in Bangalore', kind: 'fact' }, [
      ex('old', 'lives in Patna'),
    ]);
    expect(d?.verdict).toBe('supersedes');
    expect(d?.confidence).toBe(1);
    expect(d?.reason).toBe('same_slot_newer_value');
  });

  it('marks an identical residence as duplicate', () => {
    const [d] = resolver.resolve({ content: 'lives in Patna', kind: 'fact' }, [
      ex('old', 'lives in Patna'),
    ]);
    expect(d?.verdict).toBe('duplicate');
  });

  it('treats a different slot as unrelated', () => {
    const [d] = resolver.resolve({ content: 'lives in Patna', kind: 'fact' }, [
      ex('job', 'works at OpenAI'),
    ]);
    expect(d?.verdict).toBe('unrelated');
  });

  it('supersedes a changed favorite (same thing, new value)', () => {
    const [d] = resolver.resolve({ content: 'favourite language is Rust', kind: 'preference' }, [
      ex('old', 'favourite language is Python', 'preference'),
    ]);
    expect(d?.verdict).toBe('supersedes');
  });

  it('keeps favorites of different things independent', () => {
    const [d] = resolver.resolve({ content: 'favourite language is Rust', kind: 'preference' }, [
      ex('food', 'favourite food is pizza', 'preference'),
    ]);
    expect(d?.verdict).toBe('unrelated');
  });

  it('contradicts on a sentiment polarity flip (like → dislike)', () => {
    const [d] = resolver.resolve({ content: 'dislikes coffee', kind: 'preference' }, [
      ex('old', 'likes coffee', 'preference'),
    ]);
    expect(d?.verdict).toBe('contradicts');
    expect(d?.reason).toBe('same_slot_polarity_flip');
  });

  it('supersedes a changed employer', () => {
    const [d] = resolver.resolve({ content: 'works at OpenAI', kind: 'fact' }, [
      ex('old', 'works at Google'),
    ]);
    expect(d?.verdict).toBe('supersedes');
  });

  it('decides per existing memory across a mixed set', () => {
    const out = resolver.resolve({ content: 'lives in Delhi', kind: 'fact' }, [
      ex('a', 'lives in Patna'),
      ex('b', 'works at OpenAI'),
      ex('c', 'lives in Delhi'),
    ]);
    expect(out.map((d) => [d.existingId, d.verdict])).toEqual([
      ['a', 'supersedes'],
      ['b', 'unrelated'],
      ['c', 'duplicate'],
    ]);
  });
});

describe('DefaultMemoryConflictResolver — retract', () => {
  it('retracts every existing memory in the target slot', () => {
    const out = resolver.resolve(
      { content: '', kind: 'fact', operation: 'retract', slot: 'residence' },
      [ex('a', 'lives in Patna'), ex('b', 'works at Google')],
    );
    expect(out).toEqual([
      { existingId: 'a', verdict: 'retracts', confidence: 1, reason: 'slot_retracted' },
      { existingId: 'b', verdict: 'unrelated', confidence: 1, reason: 'different_slot' },
    ]);
  });

  it('retracts employer on departure', () => {
    const [d] = resolver.resolve(
      { content: '', kind: 'fact', operation: 'retract', slot: 'employer' },
      [ex('job', 'works at Google')],
    );
    expect(d?.verdict).toBe('retracts');
  });
});

describe('slot registry', () => {
  it('residenceSlot extracts a normalized city', () => {
    expect(residenceSlot.match('lives in Patna')).toEqual({ slot: 'residence', value: 'patna' });
  });
  it('employerSlot matches at/for', () => {
    expect(employerSlot.match('works for Acme')).toEqual({ slot: 'employer', value: 'acme' });
  });
  it('favouriteSlot namespaces the slot by thing', () => {
    expect(favouriteSlot.match('favourite language is Rust')).toEqual({
      slot: 'favourite:language',
      value: 'rust',
    });
  });
  it('sentimentSlot captures polarity per object and is a contradiction slot', () => {
    expect(sentimentSlot.conflictKind).toBe('contradicts');
    expect(sentimentSlot.match('dislikes coffee')).toEqual({
      slot: 'sentiment:coffee',
      value: 'dislikes',
    });
  });
  it('normalizes "now" out so "Rust now" == "rust"', () => {
    expect(favouriteSlot.match('favourite language is Rust now')?.value).toBe('rust');
  });
  it('recallHintForSlot returns the hint for a slot id', () => {
    expect(recallHintForSlot('residence')).toBe('lives in');
    expect(recallHintForSlot('employer')).toBe('works at');
    expect(recallHintForSlot('nope')).toBeNull();
  });
});

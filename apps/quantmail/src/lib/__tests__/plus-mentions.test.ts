import { describe, it, expect } from 'vitest';
import {
  applyPlusMention,
  findPlusMentionTrigger,
  mentionDisplayName,
  type PlusMentionTrigger,
} from '../plus-mentions';
import type { ContactSuggestion } from '../../types';

/**
 * Inline "+" contact mentions in composer bodies (Gmail parity).
 *
 * The trigger contract is the whole feature's safety surface: a false
 * trigger hijacks ordinary typing (math, emails, C++), and a missed trigger
 * makes the feature feel dead. These tests pin both sides.
 */

const ANITA: ContactSuggestion = { email: 'anita@acme-corp.com', name: 'Anita Rao' };
const BOB: ContactSuggestion = { email: 'bob@example.com' };

describe('findPlusMentionTrigger', () => {
  it('finds a trigger at the start of the body', () => {
    expect(findPlusMentionTrigger('+Anita', 6)).toEqual({ start: 0, end: 6, query: 'Anita' });
  });

  it('finds a trigger after whitespace mid-body, with a multi-word query', () => {
    const body = 'Hi +Anita Rao, thanks';
    expect(findPlusMentionTrigger(body, 13)).toEqual({ start: 3, end: 13, query: 'Anita Rao' });
  });

  it('finds a trigger after a newline', () => {
    expect(findPlusMentionTrigger('line1\n+Bob', 10)).toEqual({ start: 6, end: 10, query: 'Bob' });
  });

  it('tracks a caret moved into the middle of the query', () => {
    const body = 'Hi +Anita rest';
    expect(findPlusMentionTrigger(body, 9)).toEqual({ start: 3, end: 9, query: 'Anita' });
  });

  it('allows name punctuation (apostrophe, hyphen, dot) in the query', () => {
    expect(findPlusMentionTrigger("+O'Brien", 8)?.query).toBe("O'Brien");
    expect(findPlusMentionTrigger('+Mary-Jane', 10)?.query).toBe('Mary-Jane');
    expect(findPlusMentionTrigger('+Dr. Rao', 8)?.query).toBe('Dr. Rao');
  });

  it('returns null when there is no "+" before the caret', () => {
    expect(findPlusMentionTrigger('Hello world', 11)).toBeNull();
    expect(findPlusMentionTrigger('', 0)).toBeNull();
  });

  it('rejects "+" glued to a word: email-style a+b and math 2+2 never trigger', () => {
    expect(findPlusMentionTrigger('mail a+b@x.com', 8)).toBeNull();
    expect(findPlusMentionTrigger('2+2=4', 3)).toBeNull();
    expect(findPlusMentionTrigger('C++', 3)).toBeNull();
  });

  it('rejects a bare "+" and a digits-only query', () => {
    expect(findPlusMentionTrigger('Hi +', 4)).toBeNull();
    expect(findPlusMentionTrigger('Hi +123', 7)).toBeNull();
  });

  it('is not a trigger once punctuation ends the query', () => {
    // Caret sits after "!": the scan stops at "!" and that is not "+".
    expect(findPlusMentionTrigger('Hi +John!', 9)).toBeNull();
  });

  it('clamps a caret past the end of the body', () => {
    expect(findPlusMentionTrigger('+Bob', 999)).toEqual({ start: 0, end: 4, query: 'Bob' });
  });

  it('rejects an over-long query', () => {
    const body = '+' + 'a'.repeat(61);
    expect(findPlusMentionTrigger(body, body.length)).toBeNull();
  });
});

describe('mentionDisplayName', () => {
  it('prefers the contact name, falls back to the address', () => {
    expect(mentionDisplayName(ANITA)).toBe('Anita Rao');
    expect(mentionDisplayName(BOB)).toBe('bob@example.com');
  });
});

describe('applyPlusMention', () => {
  it('replaces the trigger range with "@Name " and lands the caret after it', () => {
    const trigger: PlusMentionTrigger = { start: 3, end: 9, query: 'Anita' };
    const applied = applyPlusMention('Hi +Anita, thanks', trigger, ANITA);
    expect(applied.text).toBe('Hi @Anita Rao , thanks');
    expect(applied.caret).toBe(3 + '@Anita Rao '.length);
    expect(applied.text.slice(0, applied.caret)).toBe('Hi @Anita Rao ');
  });

  it('uses the bare address when the contact has no name', () => {
    const trigger: PlusMentionTrigger = { start: 0, end: 4, query: 'Bob' };
    const applied = applyPlusMention('+Bob', trigger, BOB);
    expect(applied.text).toBe('@bob@example.com ');
    expect(applied.caret).toBe('@bob@example.com '.length);
  });

  it('keeps text after the caret untouched', () => {
    const trigger: PlusMentionTrigger = { start: 0, end: 6, query: 'Anita' };
    const applied = applyPlusMention('+Anita rest of message', trigger, ANITA);
    expect(applied.text).toBe('@Anita Rao  rest of message');
  });
});

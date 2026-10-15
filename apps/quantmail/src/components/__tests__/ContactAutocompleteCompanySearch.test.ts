import { describe, it, expect } from 'vitest';
import { rankContactSuggestions } from '../ContactAutocomplete';
import type { ContactSuggestion } from '../../types';

/**
 * Compose autocomplete used to match name+email only, so a contact stored
 * with just a company ("Acme") was unfindable by typing "acme" — Gmail
 * matches names, addresses AND company names. `rankContactSuggestions` is the
 * extracted match+rank: company/phone/tags now match, name/email hits rank
 * above company/phone/tags hits, frequency breaks ties inside a tier.
 */

const CONTACTS: ContactSuggestion[] = [
  { email: 'anita@acme-corp.com', name: 'Anita Rao', company: 'Acme', frequency: 1 },
  { email: 'bob@example.com', name: 'Bob Verma', phone: '+91 98765 43210', frequency: 5 },
  { email: 'cara@example.com', name: 'Cara Lee', tags: ['vendor', 'Acme Partner'], frequency: 2 },
  { email: 'dev@example.com', name: 'Dev Shah', frequency: 9 },
];

const noChips = new Set<string>();

describe('rankContactSuggestions — company/phone/tags are searchable', () => {
  it('finds a contact by company name alone', () => {
    const results = rankContactSuggestions(CONTACTS, 'acme', noChips);
    expect(results.map((c) => c.email)).toContain('anita@acme-corp.com');
    // "acme" also matches cara's tag and anita's email domain — all three match
    expect(results.map((c) => c.email)).toContain('cara@example.com');
  });

  it('matches company case-insensitively', () => {
    const results = rankContactSuggestions(CONTACTS, 'ACME', noChips);
    expect(results.map((c) => c.email)).toContain('anita@acme-corp.com');
  });

  it('finds a contact by a phone-number fragment', () => {
    const results = rankContactSuggestions(CONTACTS, '98765', noChips);
    expect(results.map((c) => c.email)).toEqual(['bob@example.com']);
  });

  it('finds a contact by a tag, case-insensitive substring', () => {
    const results = rankContactSuggestions(CONTACTS, 'vend', noChips);
    expect(results.map((c) => c.email)).toEqual(['cara@example.com']);
  });

  it('still matches name and email', () => {
    expect(
      rankContactSuggestions(CONTACTS, 'anita', noChips).map((c) => c.email),
    ).toContain('anita@acme-corp.com');
    expect(
      rankContactSuggestions(CONTACTS, 'bob@example', noChips).map((c) => c.email),
    ).toContain('bob@example.com');
  });

  it('ranks name/email hits above company-only hits', () => {
    const list: ContactSuggestion[] = [
      { email: 'fan@example.com', name: 'Acme Fan', frequency: 1 },
      { email: 'zed@example.com', name: 'Zed', company: 'Acme Industries', frequency: 50 },
    ];
    const results = rankContactSuggestions(list, 'acme', noChips);
    // The name hit wins despite much lower frequency.
    expect(results.map((c) => c.email)).toEqual(['fan@example.com', 'zed@example.com']);
  });

  it('breaks ties inside a tier by frequency', () => {
    const list: ContactSuggestion[] = [
      { email: 'a@example.com', name: 'A', company: 'Acme', frequency: 1 },
      { email: 'b@example.com', name: 'B', company: 'Acme', frequency: 10 },
    ];
    const results = rankContactSuggestions(list, 'acme', noChips);
    expect(results.map((c) => c.email)).toEqual(['b@example.com', 'a@example.com']);
  });

  it('hides contacts already added as chips (bare-address compare)', () => {
    const chips = new Set(['bob@example.com']);
    const results = rankContactSuggestions(CONTACTS, '98765', chips);
    expect(results).toEqual([]);
  });

  it('returns nothing for a blank query', () => {
    expect(rankContactSuggestions(CONTACTS, '   ', noChips)).toEqual([]);
  });

  it('returns nothing for a non-matching query', () => {
    expect(rankContactSuggestions(CONTACTS, 'zzz-no-such-contact', noChips)).toEqual([]);
  });

  it('caps at the limit', () => {
    const many: ContactSuggestion[] = Array.from({ length: 8 }, (_, i) => ({
      email: `person${i}@acme.com`,
      name: `Person ${i}`,
      frequency: i,
    }));
    expect(rankContactSuggestions(many, 'acme', noChips)).toHaveLength(5);
    expect(rankContactSuggestions(many, 'acme', noChips, 3)).toHaveLength(3);
  });
});

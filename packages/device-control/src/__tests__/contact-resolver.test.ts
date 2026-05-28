import { describe, it, expect, beforeEach } from 'vitest';
import { ContactResolver } from '../contacts/contact-resolver.js';
import { ContactStore } from '../contacts/contact-store.js';
import type { UnifiedContact } from '../contacts/contact-types.js';

function makeContact(overrides: Partial<UnifiedContact> = {}): UnifiedContact {
  return {
    id: '1',
    firstName: 'John',
    lastName: 'Doe',
    displayName: 'John Doe',
    phones: [{ number: '+15551234567', type: 'mobile' }],
    emails: [],
    addresses: [],
    groups: [],
    favorite: false,
    nicknames: [],
    relationships: [],
    ...overrides,
  };
}

describe('ContactResolver', () => {
  let store: ContactStore;
  let resolver: ContactResolver;

  beforeEach(() => {
    store = new ContactStore();
    resolver = new ContactResolver(store);
  });

  it('exact name match', () => {
    store.addContact(makeContact());
    const result = resolver.resolve('John Doe');
    expect('match' in result).toBe(true);
    if ('match' in result) expect(result.match.id).toBe('1');
  });

  it('fuzzy match with typo', () => {
    store.addContact(makeContact());
    const result = resolver.resolve('Jon Doe');
    expect('match' in result).toBe(true);
  });

  it('nickname resolution', () => {
    store.addContact(makeContact({ nicknames: ['Johnny'] }));
    const result = resolver.resolve('Johnny');
    expect('match' in result).toBe(true);
  });

  it('relationship tag resolution', () => {
    store.addContact(
      makeContact({
        id: '1',
        displayName: 'Mary Doe',
        relationships: [{ type: 'family', label: 'mom' }],
      }),
    );
    const result = resolver.resolve('mom');
    expect('match' in result).toBe(true);
    if ('match' in result) expect(result.match.displayName).toBe('Mary Doe');
  });

  it('recency bias prefers recently contacted', () => {
    store.addContact(
      makeContact({ id: '1', displayName: 'John Doa', lastContacted: Date.now() - 1000 }),
    );
    store.addContact(
      makeContact({
        id: '2',
        displayName: 'John Dob',
        lastContacted: Date.now() - 30 * 24 * 60 * 60 * 1000,
      }),
    );
    const result = resolver.resolve('John Doc');
    expect('match' in result).toBe(true);
    if ('match' in result) expect(result.match.id).toBe('1');
  });

  it('disambiguation when multiple equal matches', () => {
    store.addContact(makeContact({ id: '1', displayName: 'John Doe' }));
    store.addContact(makeContact({ id: '2', displayName: 'John Don' }));
    const result = resolver.resolve('John Dox');
    expect('ambiguous' in result).toBe(true);
    if ('ambiguous' in result) expect(result.options.length).toBeGreaterThanOrEqual(2);
  });
});

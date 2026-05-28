import { describe, it, expect, beforeEach } from 'vitest';
import { ContactStore } from '../contacts/contact-store.js';
import type { UnifiedContact } from '../contacts/contact-types.js';

function makeContact(overrides: Partial<UnifiedContact> = {}): UnifiedContact {
  return {
    id: '1',
    firstName: 'John',
    lastName: 'Doe',
    displayName: 'John Doe',
    phones: [{ number: '+15551234567', type: 'mobile' }],
    emails: [{ address: 'john@example.com', type: 'personal' }],
    addresses: [],
    groups: [],
    favorite: false,
    nicknames: [],
    relationships: [],
    ...overrides,
  };
}

describe('ContactStore', () => {
  let store: ContactStore;
  beforeEach(() => {
    store = new ContactStore();
  });

  it('CRUD operations', () => {
    const c = makeContact();
    store.addContact(c);
    expect(store.getContact('1')).toEqual(c);
    store.updateContact('1', { displayName: 'Johnny Doe' });
    expect(store.getContact('1')!.displayName).toBe('Johnny Doe');
    store.deleteContact('1');
    expect(store.getContact('1')).toBeUndefined();
  });

  it('searchByName case-insensitive', () => {
    store.addContact(makeContact());
    store.addContact(makeContact({ id: '2', displayName: 'Jane Smith' }));
    expect(store.searchByName('john')).toHaveLength(1);
    expect(store.searchByName('JANE')).toHaveLength(1);
    expect(store.searchByName('doe')).toHaveLength(1);
  });

  it('searchByPhone normalizes digits', () => {
    store.addContact(makeContact({ phones: [{ number: '+1 (555) 123-4567', type: 'mobile' }] }));
    expect(store.searchByPhone('15551234567')).toHaveLength(1);
  });

  it('resolveNameToPhone returns first phone', () => {
    store.addContact(makeContact());
    expect(store.resolveNameToPhone('John')).toBe('+15551234567');
    expect(store.resolveNameToPhone('Unknown')).toBeUndefined();
  });

  it('mergeDuplicates merges contacts with same phone', () => {
    store.addContact(makeContact({ id: '1', emails: [{ address: 'a@a.com', type: 'personal' }] }));
    store.addContact(makeContact({ id: '2', emails: [{ address: 'b@b.com', type: 'work' }] }));
    store.mergeDuplicates();
    const all = store.getAllContacts();
    expect(all).toHaveLength(1);
    expect(all[0]!.emails).toHaveLength(2);
  });

  it('getRecentlyContacted sorted desc', () => {
    store.addContact(makeContact({ id: '1', lastContacted: 100 }));
    store.addContact(makeContact({ id: '2', lastContacted: 300, displayName: 'B' }));
    store.addContact(makeContact({ id: '3', lastContacted: 200, displayName: 'C' }));
    const recent = store.getRecentlyContacted(2);
    expect(recent[0]!.id).toBe('2');
    expect(recent).toHaveLength(2);
  });
});

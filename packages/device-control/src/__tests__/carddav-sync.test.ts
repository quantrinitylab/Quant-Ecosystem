import { describe, it, expect, vi } from 'vitest';
import { parseVCard, toVCard, CardDAVSync, type CardDAVClient } from '../contacts/carddav-sync.js';
import { ContactStore } from '../contacts/contact-store.js';

const vcard3 = `BEGIN:VCARD
VERSION:3.0
UID:abc123
FN:Jane Doe
N:Doe;Jane;;;
TEL;TYPE=CELL:+15551112222
EMAIL;TYPE=HOME:jane@example.com
ADR;TYPE=HOME:;;123 Main St;Springfield;IL;62704;US
BDAY:1990-05-15
NOTE:Friend from school
NICKNAME:JD
END:VCARD`;

const vcard4 = `BEGIN:VCARD
VERSION:4.0
UID:xyz789
FN:Bob Smith
N:Smith;Bob;;;
TEL;TYPE=work:+15553334444
EMAIL;TYPE=WORK:bob@work.com
END:VCARD`;

describe('CardDAV', () => {
  it('parseVCard v3', () => {
    const c = parseVCard(vcard3);
    expect(c.id).toBe('abc123');
    expect(c.displayName).toBe('Jane Doe');
    expect(c.firstName).toBe('Jane');
    expect(c.lastName).toBe('Doe');
    expect(c.phones[0]!.number).toBe('+15551112222');
    expect(c.emails[0]!.address).toBe('jane@example.com');
    expect(c.addresses[0]!.city).toBe('Springfield');
    expect(c.birthday).toBe('1990-05-15');
    expect(c.notes).toBe('Friend from school');
    expect(c.nicknames).toContain('JD');
  });

  it('parseVCard v4', () => {
    const c = parseVCard(vcard4);
    expect(c.id).toBe('xyz789');
    expect(c.phones[0]!.type).toBe('work');
    expect(c.emails[0]!.type).toBe('work');
  });

  it('toVCard round-trip', () => {
    const c = parseVCard(vcard3);
    const output = toVCard(c);
    expect(output).toContain('VERSION:4.0');
    expect(output).toContain('FN:Jane Doe');
    expect(output).toContain('TEL;TYPE=mobile:+15551112222');
    expect(output).toContain('BDAY:1990-05-15');
  });

  it('syncFromServer adds contacts to store', async () => {
    const client: CardDAVClient = {
      fetchContacts: vi.fn().mockResolvedValue([vcard3]),
      pushContact: vi.fn(),
      deleteContact: vi.fn(),
    };
    const sync = new CardDAVSync(client);
    const store = new ContactStore();
    await sync.syncFromServer(store);
    expect(store.getContact('abc123')).toBeDefined();
  });

  it('conflict resolution - newer wins', async () => {
    const store = new ContactStore();
    store.addContact({
      id: 'abc123',
      firstName: 'Jane',
      lastName: 'Doe',
      displayName: 'Old Name',
      phones: [],
      emails: [],
      addresses: [],
      groups: [],
      favorite: false,
      lastContacted: 500,
      nicknames: [],
      relationships: [],
    });
    const client: CardDAVClient = {
      fetchContacts: vi.fn().mockResolvedValue([vcard3]),
      pushContact: vi.fn(),
      deleteContact: vi.fn(),
    };
    const sync = new CardDAVSync(client);
    await sync.syncFromServer(store);
    // parsed has no lastContacted (0), existing has 500, so existing wins (no update)
    expect(store.getContact('abc123')!.displayName).toBe('Old Name');
  });
});

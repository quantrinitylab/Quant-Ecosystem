import { describe, it, expect, vi } from 'vitest';
import {
  CapacitorContactsBridge,
  type CapacitorContactsPlugin,
} from '../contacts/capacitor-bridge.js';
import { ContactStore } from '../contacts/contact-store.js';

describe('CapacitorContactsBridge', () => {
  it('importFromDevice with mock plugin', async () => {
    const plugin: CapacitorContactsPlugin = {
      getContacts: vi.fn().mockResolvedValue({
        contacts: [
          {
            contactId: 'c1',
            displayName: 'Alice',
            phoneNumbers: [{ number: '+1234' }],
            emails: [{ address: 'a@b.com' }],
          },
        ],
      }),
      createContact: vi.fn().mockResolvedValue({ contactId: 'new1' }),
      deleteContact: vi.fn().mockResolvedValue(undefined),
    };
    const bridge = new CapacitorContactsBridge(plugin);
    const contacts = await bridge.importFromDevice();
    expect(contacts).toHaveLength(1);
    expect(contacts[0]!.displayName).toBe('Alice');
    expect(contacts[0]!.phones[0]!.number).toBe('+1234');
  });

  it('exportToDevice calls createContact', async () => {
    const plugin: CapacitorContactsPlugin = {
      getContacts: vi.fn().mockResolvedValue({ contacts: [] }),
      createContact: vi.fn().mockResolvedValue({ contactId: 'x' }),
      deleteContact: vi.fn(),
    };
    const bridge = new CapacitorContactsBridge(plugin);
    await bridge.exportToDevice([
      {
        id: '1',
        firstName: 'A',
        lastName: 'B',
        displayName: 'A B',
        phones: [{ number: '123', type: 'mobile' }],
        emails: [],
        addresses: [],
        groups: [],
        favorite: false,
        nicknames: [],
        relationships: [],
      },
    ]);
    expect(plugin.createContact).toHaveBeenCalledTimes(1);
  });

  it('syncBidirectional adds device contacts to store', async () => {
    const plugin: CapacitorContactsPlugin = {
      getContacts: vi
        .fn()
        .mockResolvedValue({ contacts: [{ contactId: 'c1', displayName: 'Bob' }] }),
      createContact: vi.fn().mockResolvedValue({ contactId: '' }),
      deleteContact: vi.fn(),
    };
    const bridge = new CapacitorContactsBridge(plugin);
    const store = new ContactStore();
    await bridge.syncBidirectional(store);
    expect(store.getContact('c1')).toBeDefined();
  });

  it('web fallback returns empty', async () => {
    const bridge = new CapacitorContactsBridge();
    const contacts = await bridge.importFromDevice();
    expect(contacts).toHaveLength(0);
  });
});

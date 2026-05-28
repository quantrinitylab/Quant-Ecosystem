import type { UnifiedContact } from './contact-types.js';
import type { ContactStore } from './contact-store.js';

export interface CapacitorContactsPlugin {
  getContacts(): Promise<{
    contacts: {
      contactId: string;
      displayName?: string;
      phoneNumbers?: { number: string }[];
      emails?: { address: string }[];
    }[];
  }>;
  createContact(contact: {
    displayName: string;
    phoneNumbers?: { number: string }[];
    emails?: { address: string }[];
  }): Promise<{ contactId: string }>;
  deleteContact(opts: { contactId: string }): Promise<void>;
}

const noopPlugin: CapacitorContactsPlugin = {
  async getContacts() {
    return { contacts: [] };
  },
  async createContact() {
    return { contactId: '' };
  },
  async deleteContact() {},
};

export class CapacitorContactsBridge {
  private plugin: CapacitorContactsPlugin;
  constructor(plugin?: CapacitorContactsPlugin) {
    this.plugin = plugin ?? noopPlugin;
  }

  async importFromDevice(): Promise<UnifiedContact[]> {
    const { contacts } = await this.plugin.getContacts();
    return contacts.map((c) => ({
      id: c.contactId,
      firstName: '',
      lastName: '',
      displayName: c.displayName ?? '',
      phones: (c.phoneNumbers ?? []).map((p) => ({ number: p.number, type: 'mobile' as const })),
      emails: (c.emails ?? []).map((e) => ({ address: e.address, type: 'personal' as const })),
      addresses: [],
      groups: [],
      favorite: false,
      nicknames: [],
      relationships: [],
    }));
  }

  async exportToDevice(contacts: UnifiedContact[]): Promise<void> {
    for (const c of contacts) {
      await this.plugin.createContact({
        displayName: c.displayName,
        phoneNumbers: c.phones.map((p) => ({ number: p.number })),
        emails: c.emails.map((e) => ({ address: e.address })),
      });
    }
  }

  async syncBidirectional(store: ContactStore): Promise<void> {
    const deviceContacts = await this.importFromDevice();
    for (const dc of deviceContacts) {
      const existing = store.getContact(dc.id);
      if (!existing) {
        store.addContact(dc);
      } else {
        // Only update fields from device data that are non-empty/non-default
        // to avoid overwriting richer store data with sparse Capacitor data.
        // Merge arrays (union) instead of replacing to preserve existing entries.
        const updates: Partial<UnifiedContact> = {};
        if (dc.displayName) updates.displayName = dc.displayName;
        if (dc.firstName) updates.firstName = dc.firstName;
        if (dc.lastName) updates.lastName = dc.lastName;
        if (dc.phones.length > 0) {
          updates.phones = [
            ...existing.phones,
            ...dc.phones.filter(
              (p) =>
                !existing.phones.some(
                  (ep) => ep.number.replace(/\D/g, '') === p.number.replace(/\D/g, ''),
                ),
            ),
          ];
        }
        if (dc.emails.length > 0) {
          updates.emails = [
            ...existing.emails,
            ...dc.emails.filter(
              (e) =>
                !existing.emails.some((ee) => ee.address.toLowerCase() === e.address.toLowerCase()),
            ),
          ];
        }
        if (dc.nicknames.length > 0) updates.nicknames = dc.nicknames;
        if (dc.relationships.length > 0) updates.relationships = dc.relationships;
        store.updateContact(dc.id, updates);
      }
    }
  }
}

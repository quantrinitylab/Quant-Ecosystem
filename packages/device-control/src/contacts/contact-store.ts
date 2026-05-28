import type { UnifiedContact } from './contact-types.js';

export class ContactStore {
  private contacts = new Map<string, UnifiedContact>();

  addContact(contact: UnifiedContact): void {
    this.contacts.set(contact.id, contact);
  }
  getContact(id: string): UnifiedContact | undefined {
    return this.contacts.get(id);
  }
  updateContact(id: string, updates: Partial<UnifiedContact>): void {
    const c = this.contacts.get(id);
    if (c) this.contacts.set(id, { ...c, ...updates });
  }
  deleteContact(id: string): void {
    this.contacts.delete(id);
  }
  getAllContacts(): UnifiedContact[] {
    return [...this.contacts.values()];
  }

  searchByName(query: string): UnifiedContact[] {
    const q = query.toLowerCase();
    return this.getAllContacts().filter((c) => {
      const dn = c.displayName.toLowerCase();
      return dn.includes(q) || dn.startsWith(q);
    });
  }

  searchByPhone(digits: string): UnifiedContact[] {
    const norm = digits.replace(/\D/g, '');
    return this.getAllContacts().filter((c) =>
      c.phones.some((p) => p.number.replace(/\D/g, '') === norm),
    );
  }

  searchByEmail(query: string): UnifiedContact[] {
    const q = query.toLowerCase();
    return this.getAllContacts().filter((c) =>
      c.emails.some((e) => e.address.toLowerCase().includes(q)),
    );
  }

  resolveNameToPhone(name: string): string | undefined {
    const matches = this.searchByName(name);
    if (matches.length === 0) return undefined;
    return matches[0]!.phones[0]?.number;
  }

  mergeDuplicates(): void {
    const byPhone = new Map<string, UnifiedContact[]>();
    for (const c of this.getAllContacts()) {
      for (const p of c.phones) {
        const norm = p.number.replace(/\D/g, '');
        const arr = byPhone.get(norm) ?? [];
        arr.push(c);
        byPhone.set(norm, arr);
      }
    }
    const merged_ids = new Set<string>();
    for (const [, dupes] of byPhone) {
      if (dupes.length < 2) continue;
      const unprocessed = dupes.filter((d) => !merged_ids.has(d.id));
      if (unprocessed.length < 2) continue;
      const merged: UnifiedContact = { ...unprocessed[0]! };
      for (let i = 1; i < unprocessed.length; i++) {
        const d = unprocessed[i]!;
        merged.phones = [
          ...merged.phones,
          ...d.phones.filter(
            (p) =>
              !merged.phones.some(
                (mp) => mp.number.replace(/\D/g, '') === p.number.replace(/\D/g, ''),
              ),
          ),
        ];
        merged.emails = [
          ...merged.emails,
          ...d.emails.filter((e) => !merged.emails.some((me) => me.address === e.address)),
        ];
        merged.addresses = [
          ...merged.addresses,
          ...d.addresses.filter(
            (a) =>
              !merged.addresses.some(
                (ma) => ma.street === a.street && ma.city === a.city && ma.zip === a.zip,
              ),
          ),
        ];
        merged.nicknames = [...new Set([...merged.nicknames, ...d.nicknames])];
        if (d.lastContacted && (!merged.lastContacted || d.lastContacted > merged.lastContacted))
          merged.lastContacted = d.lastContacted;
        merged_ids.add(d.id);
        this.contacts.delete(d.id);
      }
      merged_ids.add(merged.id);
      this.contacts.set(merged.id, merged);
    }
  }

  getRecentlyContacted(limit: number): UnifiedContact[] {
    return this.getAllContacts()
      .filter((c) => c.lastContacted !== undefined)
      .sort((a, b) => (b.lastContacted ?? 0) - (a.lastContacted ?? 0))
      .slice(0, limit);
  }

  getFavorites(): UnifiedContact[] {
    return this.getAllContacts().filter((c) => c.favorite);
  }
  getByGroup(groupId: string): UnifiedContact[] {
    return this.getAllContacts().filter((c) => c.groups.includes(groupId));
  }
}

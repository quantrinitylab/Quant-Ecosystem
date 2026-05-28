import type { UnifiedContact } from './contact-types.js';
import type { ContactStore } from './contact-store.js';

export interface CardDAVClient {
  fetchContacts(): Promise<string[]>;
  pushContact(vcf: string): Promise<void>;
  deleteContact(id: string): Promise<void>;
}

export function parseVCard(vcf: string): UnifiedContact {
  // RFC 6350 3.2: Unfold continuation lines (lines starting with space or tab)
  const unfolded = vcf.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);
  const c: UnifiedContact = {
    id: '',
    firstName: '',
    lastName: '',
    displayName: '',
    phones: [],
    emails: [],
    addresses: [],
    groups: [],
    favorite: false,
    nicknames: [],
    relationships: [],
  };
  for (const line of lines) {
    // Split on first colon only to avoid breaking values that contain colons
    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) continue;
    const propPart = line.substring(0, colonIdx);
    const valuePart = line.substring(colonIdx + 1);
    const propUpper = propPart.toUpperCase();

    if (propUpper === 'FN' || propUpper.startsWith('FN;')) c.displayName = valuePart;
    else if (propUpper === 'N' || propUpper.startsWith('N;')) {
      const parts = valuePart.split(';');
      c.lastName = parts[0] ?? '';
      c.firstName = parts[1] ?? '';
    } else if (propUpper.startsWith('TEL')) {
      const typeLower = propPart.toLowerCase();
      const type = typeLower.includes('work')
        ? 'work'
        : typeLower.includes('home')
          ? 'home'
          : 'mobile';
      const number = valuePart.replace(/^(tel:|sip:)/i, '');
      c.phones.push({ number, type });
    } else if (propUpper.startsWith('EMAIL')) {
      const type = propPart.toLowerCase().includes('work') ? 'work' : 'personal';
      c.emails.push({ address: valuePart, type });
    } else if (propUpper.startsWith('ADR')) {
      const parts = valuePart.split(';');
      c.addresses.push({
        street: parts[2],
        city: parts[3],
        state: parts[4],
        zip: parts[5],
        country: parts[6],
        type: 'home',
      });
    } else if (propUpper === 'BDAY') c.birthday = valuePart;
    else if (propUpper === 'NOTE') c.notes = valuePart;
    else if (propUpper === 'NICKNAME') c.nicknames = valuePart.split(',');
    else if (propUpper === 'UID') c.id = valuePart;
  }
  if (!c.id) c.id = crypto.randomUUID();
  return c;
}

export function toVCard(contact: UnifiedContact): string {
  const lines = ['BEGIN:VCARD', 'VERSION:4.0'];
  lines.push(`FN:${contact.displayName}`);
  lines.push(`N:${contact.lastName};${contact.firstName};;;`);
  if (contact.id) lines.push(`UID:${contact.id}`);
  for (const p of contact.phones) lines.push(`TEL;TYPE=${p.type}:${p.number}`);
  for (const e of contact.emails) lines.push(`EMAIL;TYPE=${e.type}:${e.address}`);
  for (const a of contact.addresses)
    lines.push(
      `ADR;TYPE=${a.type}:;;${a.street ?? ''};${a.city ?? ''};${a.state ?? ''};${a.zip ?? ''};${a.country ?? ''}`,
    );
  if (contact.birthday) lines.push(`BDAY:${contact.birthday}`);
  if (contact.notes) lines.push(`NOTE:${contact.notes}`);
  if (contact.nicknames.length) lines.push(`NICKNAME:${contact.nicknames.join(',')}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

export class CardDAVSync {
  constructor(private client: CardDAVClient) {}

  async syncFromServer(store: ContactStore): Promise<void> {
    const vcards = await this.client.fetchContacts();
    for (const vcf of vcards) {
      const parsed = parseVCard(vcf);
      const existing = store.getContact(parsed.id);
      if (!existing) {
        store.addContact(parsed);
        continue;
      }
      // "Local wins" conflict strategy: parsed vCards don't carry lastContacted,
      // so existing locally-modified entries are always preserved. Server contacts
      // are only added on first sync (new contacts). This prevents overwriting
      // local edits or data enriched via Capacitor/user interaction.
      if ((parsed.lastContacted ?? 0) >= (existing.lastContacted ?? 0))
        store.updateContact(parsed.id, parsed);
    }
  }

  async pushToServer(store: ContactStore): Promise<void> {
    for (const c of store.getAllContacts()) await this.client.pushContact(toVCard(c));
  }
}

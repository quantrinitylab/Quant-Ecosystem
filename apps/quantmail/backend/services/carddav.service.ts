// ============================================================================
// CardDAV Service (RFC 6350 / RFC 6352) — vCard 4.0 Address Book Sync Engine
// ============================================================================

export interface CardDavAddressBook {
  id: string;
  userId: string;
  name: string;
  description: string;
  ctag: string;
  syncToken: string;
}

export interface CardDavContact {
  id: string;
  uid?: string;
  addressBookId: string;
  userId: string;
  fn: string;
  family?: string;
  given?: string;
  email?: string;
  phone?: string;
  org?: string;
  title?: string;
  note?: string;
  etag: string;
  vcardData: string;
  updatedAt: Date;
}

export function escapeVCard(str: string): string {
  return (str || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export function unescapeVCard(str: string): string {
  return (str || '')
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

export function generateVCard4(contact: {
  id: string;
  fn: string;
  family?: string;
  given?: string;
  email?: string;
  phone?: string;
  org?: string;
  title?: string;
  note?: string;
}): string {
  const cleanId = contact.id.replace(/\.vcf$/i, '');
  const lines = [
    'BEGIN:VCARD',
    'VERSION:4.0',
    'PRODID:-//Quant Ecosystem//QuantMail CardDAV RFC 6350//EN',
    `UID:urn:uuid:${cleanId}`,
    `FN:${escapeVCard(contact.fn || 'Unnamed Contact')}`,
  ];

  if (contact.family || contact.given) {
    lines.push(`N:${escapeVCard(contact.family || '')};${escapeVCard(contact.given || '')};;;`);
  } else if (contact.fn) {
    const parts = contact.fn.split(' ');
    if (parts.length > 1) {
      const given = parts[0];
      const family = parts.slice(1).join(' ');
      lines.push(`N:${escapeVCard(family)};${escapeVCard(given)};;;`);
    } else {
      lines.push(`N:${escapeVCard(contact.fn)};;;;`);
    }
  }

  if (contact.email) {
    lines.push(`EMAIL;TYPE=work:${contact.email}`);
  }
  if (contact.phone) {
    lines.push(`TEL;TYPE=cell:${contact.phone}`);
  }
  if (contact.org) {
    lines.push(`ORG:${escapeVCard(contact.org)}`);
  }
  if (contact.title) {
    lines.push(`TITLE:${escapeVCard(contact.title)}`);
  }
  if (contact.note) {
    lines.push(`NOTE:${escapeVCard(contact.note)}`);
  }

  const nowStr = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  lines.push(`REV:${nowStr}`);
  lines.push('END:VCARD');
  return lines.join('\r\n') + '\r\n';
}

export function parseVCard4(vcardData: string): {
  uid?: string;
  fn?: string;
  family?: string;
  given?: string;
  email?: string;
  phone?: string;
  org?: string;
  title?: string;
  note?: string;
} {
  const result: ReturnType<typeof parseVCard4> = {};
  const lines = vcardData.replace(/\r\n[ \t]/g, '').split(/\r?\n/);

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const rawKey = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1);
    const key = rawKey.split(';')[0]?.toUpperCase().trim();

    if (key === 'UID') {
      result.uid = value.replace(/^urn:uuid:/i, '').trim();
    } else if (key === 'FN') {
      result.fn = unescapeVCard(value.trim());
    } else if (key === 'N') {
      const parts = value.split(';');
      result.family = unescapeVCard(parts[0] || '').trim();
      result.given = unescapeVCard(parts[1] || '').trim();
    } else if (key === 'EMAIL') {
      result.email = value.trim();
    } else if (key === 'TEL') {
      result.phone = value.trim();
    } else if (key === 'ORG') {
      result.org = unescapeVCard(value.trim());
    } else if (key === 'TITLE') {
      result.title = unescapeVCard(value.trim());
    } else if (key === 'NOTE') {
      result.note = unescapeVCard(value.trim());
    }
  }

  return result;
}

export interface CardDavMultiStatusResponse {
  href: string;
  propstat: Array<{
    prop: Record<string, string | number | boolean | null | undefined>;
    status: string;
  }>;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function serializeCardDavMultiStatus(responses: CardDavMultiStatusResponse[]): string {
  const xmlLines: string[] = [
    '<?xml version="1.0" encoding="utf-8" ?>',
    '<D:multistatus xmlns:D="DAV:" xmlns:CARD="urn:ietf:params:xml:ns:carddav" xmlns:CS="http://calendarserver.org/ns/">',
  ];

  for (const res of responses) {
    xmlLines.push('  <D:response>');
    xmlLines.push(`    <D:href>${escapeXml(res.href)}</D:href>`);

    for (const stat of res.propstat) {
      xmlLines.push('    <D:propstat>');
      xmlLines.push('      <D:prop>');

      for (const [key, val] of Object.entries(stat.prop)) {
        if (val === undefined) continue;

        if (key === 'resourcetype') {
          if (val === 'addressbook') {
            xmlLines.push(
              '        <D:resourcetype><D:collection/><CARD:addressbook/></D:resourcetype>',
            );
          } else if (val === 'collection') {
            xmlLines.push('        <D:resourcetype><D:collection/></D:resourcetype>');
          } else {
            xmlLines.push('        <D:resourcetype/>');
          }
        } else if (key === 'current-user-principal') {
          xmlLines.push(
            `        <D:current-user-principal><D:href>${escapeXml(String(val))}</D:href></D:current-user-principal>`,
          );
        } else if (key === 'addressbook-home-set') {
          xmlLines.push(
            `        <CARD:addressbook-home-set><D:href>${escapeXml(String(val))}</D:href></CARD:addressbook-home-set>`,
          );
        } else if (key === 'address-data') {
          xmlLines.push(`        <CARD:address-data><![CDATA[${val}]]></CARD:address-data>`);
        } else if (key === 'getetag') {
          xmlLines.push(
            `        <D:getetag>"${escapeXml(String(val).replace(/^"|"$/g, ''))}"</D:getetag>`,
          );
        } else if (key === 'getctag') {
          xmlLines.push(
            `        <CS:getctag>"${escapeXml(String(val).replace(/^"|"$/g, ''))}"</CS:getctag>`,
          );
        } else if (key === 'sync-token') {
          xmlLines.push(`        <D:sync-token>${escapeXml(String(val))}</D:sync-token>`);
        } else if (key === 'displayname') {
          xmlLines.push(`        <D:displayname>${escapeXml(String(val))}</D:displayname>`);
        } else if (key === 'getcontenttype') {
          xmlLines.push(`        <D:getcontenttype>${escapeXml(String(val))}</D:getcontenttype>`);
        } else {
          xmlLines.push(`        <D:${key}>${escapeXml(String(val))}</D:${key}>`);
        }
      }

      xmlLines.push('      </D:prop>');
      xmlLines.push(`      <D:status>${stat.status}</D:status>`);
      xmlLines.push('    </D:propstat>');
    }

    xmlLines.push('  </D:response>');
  }

  xmlLines.push('</D:multistatus>');
  return xmlLines.join('\n');
}

export class CardDavService {
  private readonly memoryBooks = new Map<string, CardDavAddressBook>();
  private readonly memoryContacts = new Map<string, CardDavContact>();

  constructor(private readonly prisma?: any) {}

  async ensureDefaultAddressBook(userId: string): Promise<CardDavAddressBook> {
    const bookId = `default-${userId}`;
    let book = this.memoryBooks.get(bookId);
    if (!book) {
      book = {
        id: 'default',
        userId,
        name: 'Contacts',
        description: 'Personal Address Book',
        ctag: `ctag-book-${Date.now()}`,
        syncToken: `sync-book-${Date.now()}`,
      };
      this.memoryBooks.set(bookId, book);
    }
    return book;
  }

  async getAddressBooks(userId: string): Promise<CardDavAddressBook[]> {
    const defaultBook = await this.ensureDefaultAddressBook(userId);
    return [defaultBook];
  }

  async getAddressBook(userId: string, bookId: string): Promise<CardDavAddressBook | null> {
    const books = await this.getAddressBooks(userId);
    const found = books.find((b) => b.id === bookId || bookId === 'default');
    return found || null;
  }

  async getContacts(userId: string, _bookId: string = 'default'): Promise<CardDavContact[]> {
    if (this.prisma?.contact) {
      try {
        const rows = await this.prisma.contact.findMany({
          where: { userId },
          orderBy: { createdAt: 'asc' },
        });
        if (rows && rows.length > 0) {
          return rows.map((r: any) => this.mapContact(r));
        }
      } catch {
        // Fallback to in-memory store
      }
    }

    const contacts = Array.from(this.memoryContacts.values()).filter((c) => c.userId === userId);
    return contacts;
  }

  async getContact(userId: string, contactId: string): Promise<CardDavContact | null> {
    const cleanId = contactId.replace(/\.vcf$/i, '');

    if (this.prisma?.contact) {
      try {
        const row = await this.prisma.contact.findFirst({
          where: {
            userId,
            OR: [{ id: cleanId }, { id: contactId }],
          },
        });
        if (row) return this.mapContact(row);
      } catch {
        // Fallback to in-memory store
      }
    }

    const key = `${userId}:${cleanId}`;
    const mem = this.memoryContacts.get(key);
    if (mem) return mem;

    for (const c of this.memoryContacts.values()) {
      if (
        c.userId === userId &&
        (c.id === cleanId ||
          c.id === contactId ||
          (c as any).uid === cleanId ||
          (c as any).uid === contactId)
      ) {
        return c;
      }
    }

    return null;
  }

  async createOrUpdateContact(
    userId: string,
    bookId: string,
    contactId: string,
    vcardData: string,
  ): Promise<{ contact: CardDavContact; created: boolean }> {
    const parsed = parseVCard4(vcardData);
    const cleanId = (contactId || parsed.uid || 'contact').replace(/\.vcf$/i, '');
    const uid = parsed.uid || cleanId;
    const now = new Date();
    const fn =
      parsed.fn ||
      (parsed.given || parsed.family
        ? `${parsed.given || ''} ${parsed.family || ''}`.trim()
        : 'Unnamed Contact');
    const email = parsed.email || '';
    const phone = parsed.phone || null;
    const company = parsed.org || null;

    let existing: CardDavContact | null = await this.getContact(userId, cleanId);
    let created = false;

    if (this.prisma?.contact) {
      try {
        if (existing) {
          const updated = await this.prisma.contact.update({
            where: { id: existing.id },
            data: {
              name: fn,
              email: email || existing.email,
              phone: phone || undefined,
              company: company || undefined,
              updatedAt: now,
            },
          });
          return { contact: this.mapContact(updated), created: false };
        } else {
          const newRow = await this.prisma.contact.create({
            data: {
              id: cleanId,
              userId,
              name: fn,
              email: email || `${cleanId}@contact.local`,
              phone,
              company,
              tags: ['carddav'],
              isFavorite: false,
              frequency: 0,
              createdAt: now,
              updatedAt: now,
            },
          });
          return { contact: this.mapContact(newRow), created: true };
        }
      } catch {
        // Fallback to in-memory store on DB failure
      }
    }

    created = !existing;
    const etag = `"${cleanId}-${now.getTime()}"`;
    const vcard =
      vcardData && vcardData.includes('BEGIN:VCARD')
        ? vcardData
        : generateVCard4({
            id: cleanId,
            fn,
            family: parsed.family,
            given: parsed.given,
            email,
            phone: phone || undefined,
            org: company || undefined,
            title: parsed.title,
            note: parsed.note,
          });

    const contact: CardDavContact = {
      id: cleanId,
      uid,
      addressBookId: bookId,
      userId,
      fn,
      family: parsed.family,
      given: parsed.given,
      email,
      phone: phone || undefined,
      org: company || undefined,
      title: parsed.title,
      note: parsed.note,
      etag,
      vcardData: vcard,
      updatedAt: now,
    };

    this.memoryContacts.set(`${userId}:${cleanId}`, contact);
    return { contact, created };
  }

  async deleteContact(userId: string, _bookId: string, contactId: string): Promise<boolean> {
    const cleanId = contactId.replace(/\.vcf$/i, '');

    if (this.prisma?.contact) {
      try {
        const row = await this.prisma.contact.findFirst({
          where: {
            userId,
            OR: [{ id: cleanId }, { id: contactId }],
          },
        });
        if (row) {
          await this.prisma.contact.delete({ where: { id: row.id } });
          return true;
        }
      } catch {
        // Fallback to in-memory store
      }
    }

    const key = `${userId}:${cleanId}`;
    if (this.memoryContacts.has(key)) {
      this.memoryContacts.delete(key);
      return true;
    }

    for (const [k, c] of this.memoryContacts.entries()) {
      if (
        c.userId === userId &&
        (c.id === cleanId ||
          c.id === contactId ||
          (c as any).uid === cleanId ||
          (c as any).uid === contactId)
      ) {
        this.memoryContacts.delete(k);
        return true;
      }
    }

    return false;
  }

  serializeCardDavMultiStatus(responses: CardDavMultiStatusResponse[]): string {
    return serializeCardDavMultiStatus(responses);
  }

  clearStore(): void {
    this.memoryBooks.clear();
    this.memoryContacts.clear();
  }

  private mapContact(r: any): CardDavContact {
    const updatedAt = r.updatedAt instanceof Date ? r.updatedAt : new Date();
    const etag = `"${r.id}-${updatedAt.getTime()}"`;
    const vcardData = generateVCard4({
      id: r.id,
      fn: r.name,
      email: r.email,
      phone: r.phone || undefined,
      org: r.company || undefined,
    });

    return {
      id: r.id,
      addressBookId: 'default',
      userId: r.userId,
      fn: r.name,
      email: r.email,
      phone: r.phone || undefined,
      org: r.company || undefined,
      etag,
      vcardData,
      updatedAt,
    };
  }
}

export const defaultCardDavService = new CardDavService();

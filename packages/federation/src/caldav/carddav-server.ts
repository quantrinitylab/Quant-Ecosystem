import { z } from 'zod';
import { VCardSerializer, VCardSchema } from './vcard-serializer.js';
import type { VCard } from './vcard-serializer.js';

export const AddressBookSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  description: z.string().optional(),
  ownerPrincipal: z.string(),
});

export type AddressBook = z.infer<typeof AddressBookSchema>;

export interface CardDAVResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

export interface CardDAVRequest {
  method: 'PROPFIND' | 'REPORT' | 'PUT' | 'DELETE' | 'GET';
  path: string;
  body?: string;
  headers?: Record<string, string>;
}

export class CardDAVServer {
  private addressBooks: Map<string, AddressBook> = new Map();
  private contacts: Map<string, Map<string, VCard>> = new Map();
  private serializer: VCardSerializer;

  constructor() {
    this.serializer = new VCardSerializer();
  }

  createAddressBook(addressBook: AddressBook): void {
    const parsed = AddressBookSchema.parse(addressBook);
    this.addressBooks.set(parsed.id, parsed);
    this.contacts.set(parsed.id, new Map());
  }

  handle(request: CardDAVRequest): CardDAVResponse {
    switch (request.method) {
      case 'PROPFIND':
        return this.handlePropfind(request.path);
      case 'REPORT':
        return this.handleReport(request.path, request.body);
      case 'PUT':
        return this.handlePut(request.path, request.body);
      case 'DELETE':
        return this.handleDelete(request.path);
      case 'GET':
        return this.handleGet(request.path);
      default:
        return { status: 405, body: 'Method Not Allowed', headers: {} };
    }
  }

  private handlePropfind(path: string): CardDAVResponse {
    const bookId = this.extractBookId(path);

    if (!bookId) {
      const books = [...this.addressBooks.values()].map((b) => ({
        href: `/addressbooks/${b.ownerPrincipal}/${b.id}/`,
        displayName: b.displayName,
        resourceType: 'addressbook',
      }));

      return {
        status: 207,
        body: JSON.stringify({ multistatus: { responses: books } }),
        headers: { 'content-type': 'application/xml; charset=utf-8' },
      };
    }

    const book = this.addressBooks.get(bookId);
    if (!book) {
      return { status: 404, body: 'Address book not found', headers: {} };
    }

    const bookContacts = this.contacts.get(bookId) ?? new Map();
    const resources = [...bookContacts.keys()].map((uid) => ({
      href: `/addressbooks/${book.ownerPrincipal}/${bookId}/${uid}.vcf`,
      etag: `"${uid}"`,
    }));

    return {
      status: 207,
      body: JSON.stringify({
        multistatus: {
          addressBook: { displayName: book.displayName },
          responses: resources,
        },
      }),
      headers: { 'content-type': 'application/xml; charset=utf-8' },
    };
  }

  private handleReport(path: string, body?: string): CardDAVResponse {
    const bookId = this.extractBookId(path);
    if (!bookId) {
      return { status: 400, body: 'Address book ID required', headers: {} };
    }

    const bookContacts = this.contacts.get(bookId);
    if (!bookContacts) {
      return { status: 404, body: 'Address book not found', headers: {} };
    }

    let filteredContacts = [...bookContacts.values()];

    if (body) {
      try {
        const filter = JSON.parse(body) as { search?: string };
        if (filter.search) {
          const term = filter.search.toLowerCase();
          filteredContacts = filteredContacts.filter(
            (c) =>
              c.fullName.toLowerCase().includes(term) ||
              c.email?.some((e) => e.toLowerCase().includes(term)),
          );
        }
      } catch {
        // no filter applied
      }
    }

    const results = filteredContacts.map((contact) => ({
      href: `/addressbooks/${bookId}/${contact.uid}.vcf`,
      data: this.serializer.serialize(contact),
    }));

    return {
      status: 207,
      body: JSON.stringify({ multistatus: { responses: results } }),
      headers: { 'content-type': 'application/xml; charset=utf-8' },
    };
  }

  private handlePut(path: string, body?: string): CardDAVResponse {
    if (!body) {
      return { status: 400, body: 'Request body required', headers: {} };
    }

    const bookId = this.extractBookId(path);
    if (!bookId) {
      return { status: 400, body: 'Address book ID required', headers: {} };
    }

    const bookContacts = this.contacts.get(bookId);
    if (!bookContacts) {
      return { status: 404, body: 'Address book not found', headers: {} };
    }

    const contact = this.serializer.parse(body);
    if (!contact) {
      return { status: 400, body: 'Invalid vCard data', headers: {} };
    }

    const parsed = VCardSchema.safeParse(contact);
    if (!parsed.success) {
      return { status: 400, body: 'Validation failed', headers: {} };
    }

    const isNew = !bookContacts.has(parsed.data.uid);
    bookContacts.set(parsed.data.uid, parsed.data);

    return {
      status: isNew ? 201 : 204,
      body: '',
      headers: { etag: `"${parsed.data.uid}"` },
    };
  }

  private handleDelete(path: string): CardDAVResponse {
    const bookId = this.extractBookId(path);
    const contactUid = this.extractContactUid(path);

    if (!bookId) {
      return { status: 400, body: 'Address book ID required', headers: {} };
    }

    const bookContacts = this.contacts.get(bookId);
    if (!bookContacts) {
      return { status: 404, body: 'Address book not found', headers: {} };
    }

    if (!contactUid || !bookContacts.has(contactUid)) {
      return { status: 404, body: 'Contact not found', headers: {} };
    }

    bookContacts.delete(contactUid);
    return { status: 204, body: '', headers: {} };
  }

  private handleGet(path: string): CardDAVResponse {
    const bookId = this.extractBookId(path);
    const contactUid = this.extractContactUid(path);

    if (!bookId || !contactUid) {
      return { status: 400, body: 'Address book and contact ID required', headers: {} };
    }

    const bookContacts = this.contacts.get(bookId);
    if (!bookContacts) {
      return { status: 404, body: 'Address book not found', headers: {} };
    }

    const contact = bookContacts.get(contactUid);
    if (!contact) {
      return { status: 404, body: 'Contact not found', headers: {} };
    }

    return {
      status: 200,
      body: this.serializer.serialize(contact),
      headers: { 'content-type': 'text/vcard; charset=utf-8' },
    };
  }

  private extractBookId(path: string): string | null {
    const match = /\/addressbooks\/[^/]+\/([^/]+)/.exec(path);
    return match?.[1] ?? null;
  }

  private extractContactUid(path: string): string | null {
    const match = /\/addressbooks\/[^/]+\/[^/]+\/([^/]+)\.vcf/.exec(path);
    return match?.[1] ?? null;
  }

  getAddressBooks(): AddressBook[] {
    return [...this.addressBooks.values()];
  }

  getContacts(bookId: string): VCard[] {
    const bookContacts = this.contacts.get(bookId);
    return bookContacts ? [...bookContacts.values()] : [];
  }
}

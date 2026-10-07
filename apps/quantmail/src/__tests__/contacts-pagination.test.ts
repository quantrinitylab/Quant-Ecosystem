import { describe, expect, it } from 'vitest';
import type { Contact } from '../types';
import {
  createContactsPageQuery,
  getContactPageCorrection,
  readContactsPage,
  type ContactsPageOptions,
  type ContactsPageResponse,
} from '../lib/contacts-pagination';

function pageResponse(page: number, total = 21): ContactsPageResponse {
  const pageSize = 20;
  const offset = (page - 1) * pageSize;
  const count = Math.max(0, Math.min(pageSize, total - offset));
  const data = Array.from({ length: count }, (_, index): Contact => {
    const number = offset + index + 1;
    return {
      id: `contact-${number}`,
      createdAt: new Date('2026-09-09T00:00:00.000Z'),
      updatedAt: new Date('2026-09-09T00:00:00.000Z'),
      userId: 'fixture-user',
      name: `Contact ${number}`,
      email: `person${number}@example.test`,
      addresses: [],
      tags: [],
      socialLinks: {},
      isFavorite: false,
      source: 'manual',
      syncedApps: [],
    };
  });
  return {
    success: true,
    data,
    metadata: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasNext: page < Math.ceil(total / pageSize),
      hasPrev: page > 1,
    },
  };
}

describe('Contacts page response', () => {
  it('keeps the total and navigation metadata alongside the first 20 rows', () => {
    const result = readContactsPage(pageResponse(1));
    expect(result.contacts).toHaveLength(20);
    expect(result.pagination).toEqual({
      total: 21,
      page: 1,
      pageSize: 20,
      totalPages: 2,
      hasNext: true,
      hasPrev: false,
    });
  });

  it('makes contact 21 reachable on page two', () => {
    const result = readContactsPage(pageResponse(2), 2);
    expect(result.contacts.map((contact) => contact.id)).toEqual(['contact-21']);
    expect(result.pagination.hasNext).toBe(false);
    expect(result.pagination.hasPrev).toBe(true);
  });

  it('accepts an empty book without inventing a next page', () => {
    const result = readContactsPage(pageResponse(1, 0));
    expect(result.contacts).toEqual([]);
    expect(result.pagination.totalPages).toBe(0);
    expect(result.pagination.hasNext).toBe(false);
    expect(result.pagination.hasPrev).toBe(false);
  });

  it('derives an omitted totalPages from the established count contract', () => {
    const response = pageResponse(1);
    response.metadata = { total: 21, page: 1, pageSize: 20 };
    expect(readContactsPage(response).pagination.totalPages).toBe(2);
  });

  it('rejects missing metadata rather than silently presenting a complete book', () => {
    expect(() => readContactsPage({ success: true, data: [] })).toThrow('pagination');
  });

  it('rejects missing successful list data', () => {
    expect(() => readContactsPage({ ...pageResponse(1), data: undefined })).toThrow('list');
  });

  for (const [name, value] of [
    ['negative total', { total: -1, page: 1, pageSize: 20 }],
    ['non-numeric total', { total: '21', page: 1, pageSize: 20 }],
    ['non-finite total', { total: Infinity, page: 1, pageSize: 20 }],
    ['fractional page', { total: 21, page: 1.5, pageSize: 20 }],
    ['zero page size', { total: 21, page: 1, pageSize: 0 }],
  ] as const) {
    it(`rejects ${name}`, () => {
      expect(() => readContactsPage({ ...pageResponse(1), metadata: value })).toThrow('pagination');
    });
  }

  it('rejects contradictory page counts', () => {
    expect(() =>
      readContactsPage({
        ...pageResponse(1),
        metadata: { total: 21, page: 1, pageSize: 20, totalPages: 1 },
      }),
    ).toThrow('pagination');
  });

  it('does not accept a repeated first-page response as page two', () => {
    expect(() => readContactsPage(pageResponse(1), 2)).toThrow('pagination');
  });

  it('rejects a list larger than its reported page size', () => {
    expect(() =>
      readContactsPage({
        ...pageResponse(1),
        metadata: { total: 21, page: 1, pageSize: 10, totalPages: 3 },
      }),
    ).toThrow('pagination');
  });
});

describe('Contacts page query', () => {
  it('requests exactly one page and preserves the active filters', async () => {
    const calls: ContactsPageOptions[] = [];
    const query = createContactsPageQuery(
      async (request) => {
        calls.push(request);
        return pageResponse(request.page);
      },
      { q: '  Alex  ', tag: ' Team ', favorites: true, page: 2 },
    );
    expect(calls).toHaveLength(0);
    const result = await query.queryFn();
    expect(calls).toEqual([{ q: 'Alex', tag: 'Team', favorites: true, page: 2 }]);
    expect(result.contacts[0].id).toBe('contact-21');
    expect(query.queryKey).toEqual(['contacts', 'page', calls[0]]);
  });

  it('uses distinct cache entries for each page under the contacts prefix', () => {
    const fetchPage = async (request: ContactsPageOptions) => pageResponse(request.page ?? 1);
    const first = createContactsPageQuery(fetchPage, { page: 1 });
    const second = createContactsPageQuery(fetchPage, { page: 2 });
    expect(first.queryKey[0]).toBe('contacts');
    expect(first.queryKey).not.toEqual(second.queryKey);
  });

  it('normalizes blank filters and defaults to page one', async () => {
    const calls: ContactsPageOptions[] = [];
    const query = createContactsPageQuery(
      async (request) => {
        calls.push(request);
        return pageResponse(request.page, 0);
      },
      { q: ' ', tag: ' ' },
    );
    await query.queryFn();
    expect(calls).toEqual([{ q: undefined, tag: undefined, favorites: undefined, page: 1 }]);
  });

  it('propagates an API error instead of resolving an empty successful page', async () => {
    const query = createContactsPageQuery(async () => ({
      success: false,
      error: { message: 'Please retry the fixture request' },
    }));
    await expect(query.queryFn()).rejects.toThrow('Please retry the fixture request');
  });

  it('propagates rejected fetches', async () => {
    const query = createContactsPageQuery(async () => {
      throw new Error('Offline fixture');
    });
    await expect(query.queryFn()).rejects.toThrow('Offline fixture');
  });

  it('rejects an invalid requested page before fetching', () => {
    let calls = 0;
    expect(() =>
      createContactsPageQuery(
        async () => {
          calls++;
          return pageResponse(1);
        },
        { page: 0 },
      ),
    ).toThrow('positive integer');
    expect(calls).toBe(0);
  });
});

describe('Contacts page correction', () => {
  it('moves back when a deletion removes the last page', () => {
    const result = readContactsPage(pageResponse(3, 30), 3);
    expect(getContactPageCorrection(3, result.pagination)).toBe(2);
  });

  it('returns to page one when the remaining book becomes empty', () => {
    const result = readContactsPage(pageResponse(3, 0), 3);
    expect(getContactPageCorrection(3, result.pagination)).toBe(1);
  });

  it('keeps a valid page unchanged', () => {
    const result = readContactsPage(pageResponse(2, 30), 2);
    expect(getContactPageCorrection(2, result.pagination)).toBe(null);
  });

  it('ignores absent metadata and metadata for a different page', () => {
    expect(getContactPageCorrection(2)).toBe(null);
    expect(getContactPageCorrection(2, readContactsPage(pageResponse(1)).pagination)).toBe(null);
  });
});

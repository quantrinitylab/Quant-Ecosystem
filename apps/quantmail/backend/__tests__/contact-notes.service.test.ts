// @vitest-environment node
// ============================================================================
// Contact notes (fix/qm-contacts-notes-field-r3) — the service layer.
// ============================================================================
//
// The route tests prove notes survive the zod schemas; these prove the
// service does the right thing with them: vCard export folds multi-line
// notes into one NOTE line, import unfolds them back, and a dedup merge
// never silently eats the only copy of a note.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContactService } from '../services/contact.service';

describe('ContactService notes', () => {
  let service: ContactService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      contact: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      dismissedDuplicatePair: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({}),
      },
    };
    service = new ContactService(mockPrisma as any);
  });

  it('exports notes as a single folded NOTE line', async () => {
    mockPrisma.contact.findMany.mockResolvedValue([
      {
        id: 'c1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: null,
        company: null,
        avatar: null,
        tags: [],
        notes: 'Met at Conf\nprefers morning calls',
        isFavorite: false,
      },
    ]);

    const vcard = await service.exportVCard('user-1');
    expect(vcard).toContain('NOTE:Met at Conf\\nprefers morning calls');
    // A raw newline inside the card would split it into garbage lines.
    expect(vcard).not.toContain('NOTE:Met at Conf\nprefers');
  });

  it('omits NOTE entirely when a contact has no notes', async () => {
    mockPrisma.contact.findMany.mockResolvedValue([
      {
        id: 'c1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: null,
        company: null,
        avatar: null,
        tags: [],
        notes: null,
        isFavorite: false,
      },
    ]);

    expect(await service.exportVCard('user-1')).not.toContain('NOTE:');
  });

  it('imports NOTE back, unfolding escaped newlines', async () => {
    mockPrisma.contact.findFirst.mockResolvedValue(null);
    mockPrisma.contact.create.mockImplementation((args: any) =>
      Promise.resolve({ id: 'new-id', ...args.data }),
    );

    const result = await service.importVCard(
      'user-1',
      'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ada Lovelace\r\nEMAIL:ada@example.com\r\nNOTE:Met at Conf\\nprefers morning calls\r\nEND:VCARD\r\n',
    );

    expect(result.imported).toBe(1);
    const data = mockPrisma.contact.create.mock.calls[0]![0].data;
    expect(data.notes).toBe('Met at Conf\nprefers morning calls');
  });

  it('round-trips notes through export then import', async () => {
    mockPrisma.contact.findMany.mockResolvedValue([
      {
        id: 'c1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: null,
        company: null,
        avatar: null,
        tags: [],
        notes: 'Met at Conf, prefers morning calls',
        isFavorite: false,
      },
    ]);
    const vcard = await service.exportVCard('user-1');

    mockPrisma.contact.findFirst.mockResolvedValue(null);
    mockPrisma.contact.create.mockImplementation((args: any) =>
      Promise.resolve({ id: 'new-id', ...args.data }),
    );
    await service.importVCard('user-1', vcard);
    expect(mockPrisma.contact.create.mock.calls[0]![0].data.notes).toBe(
      'Met at Conf, prefers morning calls',
    );
  });

  it('exports notes as the last CSV column, folding newlines like vCard', async () => {
    mockPrisma.contact.findMany.mockResolvedValue([
      {
        id: 'c1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: null,
        company: null,
        avatar: null,
        tags: [],
        notes: 'Met at Conf\nprefers morning calls',
        isFavorite: false,
      },
    ]);

    const csv = await service.exportCsv('user-1');
    expect(csv).toContain('Name,Email,Phone,Company,Tags,IsFavorite,Notes');
    expect(csv).toContain('"Met at Conf\\nprefers morning calls"');
  });

  it('round-trips notes through CSV export then import', async () => {
    mockPrisma.contact.findMany.mockResolvedValue([
      {
        id: 'c1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: null,
        company: null,
        avatar: null,
        tags: [],
        notes: 'Met at Conf, prefers morning calls',
        isFavorite: false,
      },
    ]);
    const csv = await service.exportCsv('user-1');

    mockPrisma.contact.findFirst.mockResolvedValue(null);
    mockPrisma.contact.create.mockImplementation((args: any) =>
      Promise.resolve({ id: 'new-id', ...args.data }),
    );
    const result = await service.importCsv('user-1', csv);
    expect(result.imported).toBe(1);
    expect(mockPrisma.contact.create.mock.calls[0]![0].data.notes).toBe(
      'Met at Conf, prefers morning calls',
    );
  });

  it('merge keeps the primary notes, else the first duplicate that has any', async () => {
    const primary = {
      id: 'c1',
      userId: 'user-1',
      name: 'Ada',
      email: 'ada@example.com',
      phone: null,
      company: null,
      avatar: null,
      tags: [],
      notes: null,
      isFavorite: false,
      frequency: 1,
      lastContactedAt: null,
    };
    const duplicate = { ...primary, id: 'c2', notes: 'Do not call after 9pm' };
    mockPrisma.contact.findUnique.mockImplementation((args: any) =>
      Promise.resolve(args.where.id === 'c1' ? primary : duplicate),
    );
    mockPrisma.contact.update.mockImplementation((args: any) =>
      Promise.resolve({ ...primary, ...args.data }),
    );
    mockPrisma.contact.delete.mockResolvedValue(primary);

    const merged = await service.mergeContacts('user-1', 'c1', ['c2']);
    expect(merged.notes).toBe('Do not call after 9pm');
    expect(mockPrisma.contact.update.mock.calls[0]![0].data.notes).toBe(
      'Do not call after 9pm',
    );
  });
});

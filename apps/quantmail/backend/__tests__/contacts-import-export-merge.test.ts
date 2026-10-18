import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContactService, duplicatePairKey } from '../services/contact.service';

describe('ContactService - Import/Export & Deduplication (Tasks QC-01, QC-02)', () => {
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
      // QM-SCREEN-012: ContactService.findDuplicates now also reads persisted
      // "keep separate" decisions via the dismissedDuplicatePair delegate
      // (migration 0088). This mock has no dismissed pairs.
      dismissedDuplicatePair: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({}),
      },
    };
    service = new ContactService(mockPrisma as any);
  });

  describe('Task QC-01: VCard & CSV Export', () => {
    it('exports contacts as vCard format', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([
        {
          id: 'c1',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          phone: '+1234567890',
          company: 'Analytical Engines Inc',
          tags: ['math', 'computing'],
          isFavorite: true,
        },
      ]);

      const vcard = await service.exportVCard('user-1');
      expect(vcard).toContain('BEGIN:VCARD');
      expect(vcard).toContain('VERSION:3.0');
      expect(vcard).toContain('FN:Ada Lovelace');
      expect(vcard).toContain('EMAIL:ada@example.com');
      expect(vcard).toContain('TEL:+1234567890');
      expect(vcard).toContain('ORG:Analytical Engines Inc');
      expect(vcard).toContain('CATEGORIES:math,computing');
      expect(vcard).toContain('END:VCARD');
    });

    it('exports contacts as CSV format', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([
        {
          id: 'c1',
          name: 'Charles Babbage',
          email: 'charles@example.com',
          phone: '+44123456',
          company: 'Difference Engine Ltd',
          tags: ['engineer'],
          isFavorite: false,
        },
      ]);

      const csv = await service.exportCsv('user-1');
      expect(csv).toContain('Name,Email,Phone,Company,Tags,IsFavorite');
      expect(csv).toContain(
        '"Charles Babbage","charles@example.com","+44123456","Difference Engine Ltd","engineer",false',
      );
    });
  });

  describe('Task QC-01: VCard & CSV Import', () => {
    it('imports contacts from vCard content', async () => {
      mockPrisma.contact.findFirst.mockResolvedValue(null);
      mockPrisma.contact.create.mockImplementation((args: any) =>
        Promise.resolve({ id: 'new-id', ...args.data }),
      );

      const vcardContent = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:Alan Turing',
        'EMAIL:alan@enigma.org',
        'TEL:+44999999',
        'ORG:Bletchley',
        'CATEGORIES:crypto',
        'END:VCARD',
      ].join('\r\n');

      const result = await service.importVCard('user-1', vcardContent);
      expect(result.imported).toBe(1);
      expect(result.duplicates).toBe(0);
      expect(result.errors).toBe(0);
      expect(mockPrisma.contact.create).toHaveBeenCalled();
    });

    it('imports contacts from CSV content', async () => {
      mockPrisma.contact.findFirst.mockResolvedValue(null);
      mockPrisma.contact.create.mockImplementation((args: any) =>
        Promise.resolve({ id: 'new-id', ...args.data }),
      );

      const csvContent = [
        'Name,Email,Phone,Company,Tags,IsFavorite',
        '"Grace Hopper","grace@navy.mil","+15551234","US Navy","compiler;cobol",true',
      ].join('\r\n');

      const result = await service.importCsv('user-1', csvContent);
      expect(result.imported).toBe(1);
      expect(result.duplicates).toBe(0);
      expect(result.errors).toBe(0);
    });
  });

  describe('Task QC-02: Deduplication & Merge Wizard', () => {
    it('finds duplicates by matching email addresses', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([
        { id: 'c1', name: 'John Doe', email: 'john@example.com' },
        { id: 'c2', name: 'John D.', email: 'john@example.com' },
      ]);

      const duplicates = await service.findDuplicates('user-1');
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0]?.reason).toBe('email');
      expect(duplicates[0]?.primaryContact.id).toBe('c1');
      expect(duplicates[0]?.duplicates).toHaveLength(1);
      expect(duplicates[0]?.duplicates[0]?.id).toBe('c2');
    });

    it('merges duplicate contacts into primary contact and deletes duplicates', async () => {
      const primary = {
        id: 'c1',
        userId: 'user-1',
        name: 'John Doe',
        email: 'john@example.com',
        phone: null,
        company: 'Acme',
        tags: ['work'],
        frequency: 5,
        lastContactedAt: new Date(1000),
        isFavorite: false,
      };
      const duplicate = {
        id: 'c2',
        userId: 'user-1',
        name: 'John Doe',
        email: 'john.alt@example.com',
        phone: '+1234567890',
        company: null,
        tags: ['personal'],
        frequency: 10,
        lastContactedAt: new Date(2000),
        isFavorite: true,
      };

      mockPrisma.contact.findUnique.mockImplementation((args: any) => {
        if (args.where.id === 'c1') return Promise.resolve(primary);
        if (args.where.id === 'c2') return Promise.resolve(duplicate);
        return Promise.resolve(null);
      });
      mockPrisma.contact.update.mockResolvedValue({
        ...primary,
        tags: ['work', 'personal'],
        phone: '+1234567890',
        frequency: 15,
      });
      mockPrisma.contact.delete.mockResolvedValue(duplicate);

      const merged = await service.mergeContacts('user-1', 'c1', ['c2']);

      expect(mockPrisma.contact.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: expect.objectContaining({
          tags: expect.arrayContaining(['work', 'personal']),
          phone: '+1234567890',
          frequency: 15,
          isFavorite: true,
        }),
      });
      expect(mockPrisma.contact.delete).toHaveBeenCalledWith({ where: { id: 'c2' } });
      expect(merged).toBeDefined();
    });
  });

  describe('Task QC-02: deduplicateContacts respects "keep separate" dismissals', () => {
    const makeContact = (id: string, overrides: Record<string, unknown> = {}) => ({
      id,
      userId: 'user-1',
      name: 'John Doe',
      email: 'john@example.com',
      phone: null,
      company: null,
      tags: [],
      frequency: 1,
      lastContactedAt: null,
      isFavorite: false,
      createdAt: new Date(1000),
      updatedAt: new Date(1000),
      ...overrides,
    });

    const mockContactsForMerge = (contacts: any[]) => {
      mockPrisma.contact.findMany.mockResolvedValue(contacts);
      mockPrisma.contact.findUnique.mockImplementation((args: any) =>
        Promise.resolve(contacts.find((c) => c.id === args.where.id) ?? null),
      );
      mockPrisma.contact.update.mockImplementation((args: any) =>
        Promise.resolve({
          ...contacts.find((c) => c.id === args.where.id),
          ...args.data,
        }),
      );
      mockPrisma.contact.delete.mockResolvedValue({});
    };

    it('merges email-sharing duplicates when no pair was dismissed', async () => {
      mockContactsForMerge([makeContact('c1'), makeContact('c2')]);
      mockPrisma.dismissedDuplicatePair.findMany.mockResolvedValue([]);

      const result = await service.deduplicateContacts('user-1');

      expect(result.mergedCount).toBe(1);
      expect(mockPrisma.contact.delete).toHaveBeenCalledWith({ where: { id: 'c2' } });
    });

    it('skips a dismissed "keep separate" pair in the bulk Auto-Merge path', async () => {
      // P1 regression: POST /contacts/deduplicate previously union-merged a
      // pair the user had explicitly marked "keep separate" and deleted the
      // record, because it never consulted dismissed_duplicate_pair.
      mockContactsForMerge([makeContact('c1'), makeContact('c2')]);
      mockPrisma.dismissedDuplicatePair.findMany.mockResolvedValue([
        { userId: 'user-1', pairKey: duplicatePairKey('c1', 'c2') },
      ]);

      const result = await service.deduplicateContacts('user-1');

      expect(result.mergedCount).toBe(0);
      expect(mockPrisma.contact.update).not.toHaveBeenCalled();
      expect(mockPrisma.contact.delete).not.toHaveBeenCalled();
    });

    it('never collapses a dismissed pair transitively through a shared third contact', async () => {
      // A keeps-separate-from B; both share an email with C, so union-find
      // puts all three in one group. Merging both A and B into C would still
      // collapse the dismissed pair into one contact — B must survive.
      mockContactsForMerge([makeContact('c1'), makeContact('c2'), makeContact('c3')]);
      mockPrisma.dismissedDuplicatePair.findMany.mockResolvedValue([
        { userId: 'user-1', pairKey: duplicatePairKey('c1', 'c2') },
      ]);

      const result = await service.deduplicateContacts('user-1');

      expect(result.mergedCount).toBe(1);
      const deletedIds = mockPrisma.contact.delete.mock.calls.map(
        (call: any) => call[0].where.id,
      );
      // One of the three survives as a separate contact; the dismissed pair
      // is never union-merged into a single record.
      expect(deletedIds).toHaveLength(1);
      expect(deletedIds[0]).not.toBe('c1');
    });
  });

  describe('Task QC-02: deduplicateContacts merges exactly the wizard groups (P1)', () => {
    const makeContact = (id: string, overrides: Record<string, unknown> = {}) => ({
      id,
      userId: 'user-1',
      name: 'Some Name',
      email: `some-${id}@example.com`,
      phone: null,
      company: null,
      tags: [],
      frequency: 1,
      lastContactedAt: null,
      isFavorite: false,
      createdAt: new Date(1000),
      updatedAt: new Date(1000),
      ...overrides,
    });

    const mockContactsForMerge = (contacts: any[]) => {
      mockPrisma.contact.findMany.mockResolvedValue(contacts);
      mockPrisma.contact.findUnique.mockImplementation((args: any) =>
        Promise.resolve(contacts.find((c) => c.id === args.where.id) ?? null),
      );
      mockPrisma.contact.update.mockImplementation((args: any) =>
        Promise.resolve({
          ...contacts.find((c) => c.id === args.where.id),
          ...args.data,
        }),
      );
      mockPrisma.contact.delete.mockResolvedValue({});
      mockPrisma.dismissedDuplicatePair.findMany.mockResolvedValue([]);
    };

    const deletedIds = () =>
      mockPrisma.contact.delete.mock.calls.map((call: any) => call[0].where.id);

    it('does NOT merge contacts whose phone strings differ but last-10 digits match', async () => {
      // P1 regression: the old bulk union-find normalized phones to digits-only
      // last-10, so these two merged silently even though the wizard (exact
      // phone-string match) never listed them as duplicates.
      mockContactsForMerge([
        makeContact('c1', {
          name: 'John Doe',
          email: 'john@work.com',
          phone: '+1 (555) 123-4567',
        }),
        makeContact('c2', {
          name: 'Jane Smith',
          email: 'jane@work.com',
          phone: '555-123-4567',
        }),
      ]);

      const wizard = await service.findDuplicates('user-1');
      expect(wizard).toHaveLength(0);

      const result = await service.deduplicateContacts('user-1');
      expect(result.mergedCount).toBe(0);
      expect(mockPrisma.contact.delete).not.toHaveBeenCalled();
    });

    it('does NOT merge an A-B/B-C chain the wizard never grouped', async () => {
      // P1 regression: the old transitive union-find merged c3 into c1/c2 via
      // the shared phone with c2, even though the wizard's email phase already
      // claimed c1+c2 and the name phase never grouped c3 with them.
      mockContactsForMerge([
        makeContact('c1', { name: 'John', email: 'shared@example.com' }),
        makeContact('c2', {
          name: 'John',
          email: 'shared@example.com',
          phone: '999-0001',
        }),
        makeContact('c3', {
          name: 'John',
          email: 'other@example.com',
          phone: '999-0001',
        }),
      ]);

      const wizard = await service.findDuplicates('user-1');
      expect(wizard).toHaveLength(1);
      expect(wizard[0]?.duplicates.map((c: any) => c.id)).toEqual(['c2']);

      const result = await service.deduplicateContacts('user-1');
      expect(result.mergedCount).toBe(1);
      // c3 is the contact the wizard never listed — it must survive.
      expect(deletedIds()).toEqual(['c2']);
    });

    it('merges name+company groups the wizard lists (bulk was narrower before)', async () => {
      // The wizard has always grouped same-name + same-company pairs; the old
      // bulk path (email/phone union-find only) silently skipped them. Parity
      // means the bulk path now merges exactly these groups too.
      mockContactsForMerge([
        makeContact('c1', {
          name: 'Bob Ray',
          email: 'bob1@example.com',
          company: 'Acme',
        }),
        makeContact('c2', {
          name: 'Bob Ray',
          email: 'bob2@example.com',
          company: 'acme',
        }),
      ]);

      const wizard = await service.findDuplicates('user-1');
      expect(wizard).toHaveLength(1);
      expect(wizard[0]?.reason).toBe('name');

      const result = await service.deduplicateContacts('user-1');
      expect(result.mergedCount).toBe(1);
      expect(mockPrisma.contact.delete).toHaveBeenCalledWith({ where: { id: 'c2' } });
    });

    it('bulk merges exactly the wizard-listed duplicate ids across mixed groups', async () => {
      mockContactsForMerge([
        makeContact('g1a', { name: 'Amy Lane', email: 'amy@example.com' }),
        makeContact('g1b', { name: 'Amy L.', email: 'AMY@example.com' }),
        makeContact('g2a', {
          name: 'Bob Ray',
          email: 'bob1@example.com',
          phone: '999-0001',
        }),
        makeContact('g2b', {
          name: 'Bob Ray',
          email: 'bob2@example.com',
          phone: '999-0001',
        }),
        makeContact('lone', { name: 'Cara', email: 'cara@example.com' }),
      ]);

      const wizard = await service.findDuplicates('user-1');
      const wizardDuplicateIds = wizard
        .flatMap((g) => g.duplicates.map((c: any) => c.id))
        .sort();
      expect(wizard).toHaveLength(2);
      expect(wizardDuplicateIds).toEqual(['g1b', 'g2b']);

      const result = await service.deduplicateContacts('user-1');
      expect(result.mergedCount).toBe(2);
      expect(deletedIds().sort()).toEqual(wizardDuplicateIds);
    });

    it('never groups contacts on an empty email', async () => {
      mockContactsForMerge([
        makeContact('c1', { name: 'No Mail A', email: '' }),
        makeContact('c2', { name: 'No Mail B', email: '' }),
      ]);

      const wizard = await service.findDuplicates('user-1');
      expect(wizard).toHaveLength(0);

      const result = await service.deduplicateContacts('user-1');
      expect(result.mergedCount).toBe(0);
      expect(mockPrisma.contact.delete).not.toHaveBeenCalled();
    });
  });
});

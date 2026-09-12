import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContactService } from '../services/contact.service';

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
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BrandKitService,
  DEFAULT_COLORS,
  DEFAULT_FONTS,
  type BrandKit,
} from '../services/brand-kit.service';

function createMockPrisma() {
  return {
    editBrandKit: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  };
}

function sampleKit(over: Partial<BrandKit> = {}): BrandKit {
  return {
    id: 'k1',
    userId: 'u1',
    name: 'Brand',
    isDefault: true,
    colors: { ...DEFAULT_COLORS },
    fonts: { ...DEFAULT_FONTS },
    logos: [],
    ...over,
  };
}

describe('BrandKitService', () => {
  let service: BrandKitService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new BrandKitService(prisma as never);
  });

  describe('createKit', () => {
    it("makes the user's first kit the default and fills defaults", async () => {
      prisma.editBrandKit.count.mockResolvedValue(0);
      prisma.editBrandKit.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'k1',
          ...data,
        }),
      );

      const kit = await service.createKit('u1', { name: '  My Brand  ' });

      expect(kit.name).toBe('My Brand');
      expect(kit.isDefault).toBe(true);
      expect(kit.colors).toEqual(DEFAULT_COLORS);
      expect(kit.fonts).toEqual(DEFAULT_FONTS);
    });

    it('does not auto-default a second kit', async () => {
      prisma.editBrandKit.count.mockResolvedValue(1);
      prisma.editBrandKit.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'k2',
          ...data,
        }),
      );

      const kit = await service.createKit('u1', { name: 'Second' });
      expect(kit.isDefault).toBe(false);
    });

    it('rejects a blank name', async () => {
      await expect(service.createKit('u1', { name: '   ' })).rejects.toThrow('name is required');
      expect(prisma.editBrandKit.create).not.toHaveBeenCalled();
    });
  });

  describe('getKit', () => {
    it('throws 404 when not found / not owned', async () => {
      prisma.editBrandKit.findFirst.mockResolvedValue(null);
      await expect(service.getKit('u1', 'missing')).rejects.toThrow('Brand kit not found');
    });
  });

  describe('updateKit', () => {
    it('demotes other kits when promoting one to default', async () => {
      prisma.editBrandKit.findFirst.mockResolvedValue({
        id: 'k2',
        userId: 'u1',
        name: 'B',
        isDefault: false,
        colors: {},
        fonts: {},
        logos: [],
      });
      prisma.editBrandKit.updateMany.mockResolvedValue({});
      prisma.editBrandKit.update.mockResolvedValue({
        id: 'k2',
        userId: 'u1',
        name: 'B',
        isDefault: true,
        colors: {},
        fonts: {},
        logos: [],
      });

      const kit = await service.updateKit('u1', 'k2', { isDefault: true });

      expect(prisma.editBrandKit.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', NOT: { id: 'k2' } },
        data: { isDefault: false },
      });
      expect(kit.isDefault).toBe(true);
    });

    it('merges a partial colors patch over current', async () => {
      prisma.editBrandKit.findFirst.mockResolvedValue({
        id: 'k1',
        userId: 'u1',
        name: 'B',
        isDefault: true,
        colors: { ...DEFAULT_COLORS },
        fonts: {},
        logos: [],
      });
      prisma.editBrandKit.update.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'k1',
          userId: 'u1',
          name: 'B',
          isDefault: true,
          fonts: {},
          logos: [],
          ...data,
        }),
      );

      const kit = await service.updateKit('u1', 'k1', { colors: { primary: '#ff0000' } });
      expect(kit.colors.primary).toBe('#ff0000');
      expect(kit.colors.text).toBe(DEFAULT_COLORS.text); // untouched
    });
  });

  describe('deleteKit', () => {
    it('promotes the next-oldest kit when the default is deleted', async () => {
      prisma.editBrandKit.findFirst
        .mockResolvedValueOnce({
          id: 'k1',
          userId: 'u1',
          name: 'A',
          isDefault: true,
          colors: {},
          fonts: {},
          logos: [],
        }) // getKit
        .mockResolvedValueOnce({ id: 'k2', userId: 'u1', name: 'B' }); // next remaining
      prisma.editBrandKit.delete.mockResolvedValue({});
      prisma.editBrandKit.update.mockResolvedValue({});

      await service.deleteKit('u1', 'k1');

      expect(prisma.editBrandKit.delete).toHaveBeenCalledWith({ where: { id: 'k1' } });
      expect(prisma.editBrandKit.update).toHaveBeenCalledWith({
        where: { id: 'k2' },
        data: { isDefault: true },
      });
    });
  });

  describe('applyToElements', () => {
    it('brands colored/typed elements and skips bare ones', () => {
      const kit = sampleKit({ colors: { ...DEFAULT_COLORS, text: '#222222' } });
      const { applied, skipped, elements } = service.applyToElements(kit, [
        { id: 'a', type: 'text', style: { color: '#999', fontFamily: 'Comic Sans' } },
        { id: 'b', type: 'shape' },
        { id: 'c' },
      ]);

      expect(applied).toBe(1);
      expect(skipped).toBe(2);
      expect(elements[0]!.style!.color).toBe('#222222');
      expect(elements[0]!.style!.fontFamily).toBe(kit.fonts.heading);
    });
  });

  describe('checkConsistency', () => {
    it('flags off-brand colors and fonts', () => {
      const kit = sampleKit();
      const issues = service.checkConsistency(kit, [
        { id: 'a', style: { color: '#123456', fontFamily: 'Wingdings' } },
        { id: 'b', style: { color: kit.colors.primary, fontFamily: kit.fonts.body } },
      ]);

      const elementsWithIssues = new Set(issues.map((i) => i.element));
      expect(elementsWithIssues.has('a')).toBe(true);
      expect(elementsWithIssues.has('b')).toBe(false);
      expect(issues.length).toBe(2); // off-brand color + off-brand font on 'a'
    });
  });
});

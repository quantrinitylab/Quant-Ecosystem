// ============================================================================
// QuantEdits - Brand Kit Service
// ============================================================================
//
// Per-user brand kits (colors / fonts / logos) backing the (previously broken)
// /brand-kits surface. The frontend hook called /api/brand-kits (plural) but no
// such proxy or backend existed, so the whole feature 404'd. This implements
// real persistence + the single-default invariant, plus pure apply/consistency
// helpers used by the editor.
//
// DI'd narrow prisma surface for unit-testability.

import { createAppError } from '@quant/server-core';

export interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

export interface BrandFonts {
  heading: string;
  body: string;
  accent: string;
}

export interface BrandLogo {
  id: string;
  url: string;
  variant: string;
}

export interface BrandKit {
  id: string;
  userId: string;
  name: string;
  isDefault: boolean;
  colors: BrandColors;
  fonts: BrandFonts;
  logos: BrandLogo[];
}

export interface BrandKitPatch {
  name?: string;
  isDefault?: boolean;
  colors?: Partial<BrandColors>;
  fonts?: Partial<BrandFonts>;
  logos?: BrandLogo[];
}

export interface EditorElement {
  id: string;
  type?: string;
  style?: { color?: string; fontFamily?: string };
}

export interface ConsistencyIssue {
  element: string;
  issue: string;
  severity: 'error' | 'warning' | 'info';
  suggestion: string;
}

export interface BrandKitPrisma {
  editBrandKit: {
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
    findFirst: (args: Record<string, unknown>) => Promise<any>;
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<any>;
    updateMany: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<any>;
    delete: (args: { where: Record<string, unknown> }) => Promise<any>;
    count: (args: Record<string, unknown>) => Promise<number>;
  };
}

export const DEFAULT_COLORS: BrandColors = {
  primary: '#fffc00',
  secondary: '#1a1a1a',
  accent: '#00e5ff',
  background: '#ffffff',
  text: '#111111',
};

export const DEFAULT_FONTS: BrandFonts = {
  heading: 'Inter',
  body: 'Inter',
  accent: 'Inter',
};

export class BrandKitService {
  constructor(private readonly prisma: BrandKitPrisma) {}

  async listKits(userId: string): Promise<BrandKit[]> {
    const rows = await this.prisma.editBrandKit.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => this.toKit(r));
  }

  async getKit(userId: string, id: string): Promise<BrandKit> {
    const row = await this.prisma.editBrandKit.findFirst({ where: { id, userId } });
    if (!row) {
      throw createAppError('Brand kit not found', 404, 'BRAND_KIT_NOT_FOUND');
    }
    return this.toKit(row);
  }

  async createKit(
    userId: string,
    input: {
      name: string;
      colors?: Partial<BrandColors>;
      fonts?: Partial<BrandFonts>;
      logos?: BrandLogo[];
    },
  ): Promise<BrandKit> {
    const name = input.name?.trim();
    if (!name) {
      throw createAppError('Brand kit name is required', 400, 'INVALID_NAME');
    }

    // The user's first kit becomes their default automatically.
    const existing = await this.prisma.editBrandKit.count({ where: { userId } });
    const isDefault = existing === 0;

    const row = await this.prisma.editBrandKit.create({
      data: {
        userId,
        name,
        isDefault,
        colors: { ...DEFAULT_COLORS, ...(input.colors ?? {}) },
        fonts: { ...DEFAULT_FONTS, ...(input.fonts ?? {}) },
        logos: input.logos ?? [],
      },
    });
    return this.toKit(row);
  }

  async updateKit(userId: string, id: string, patch: BrandKitPatch): Promise<BrandKit> {
    const current = await this.getKit(userId, id); // ownership + existence

    const data: Record<string, unknown> = {};
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw createAppError('Brand kit name is required', 400, 'INVALID_NAME');
      data['name'] = name;
    }
    if (patch.colors) data['colors'] = { ...current.colors, ...patch.colors };
    if (patch.fonts) data['fonts'] = { ...current.fonts, ...patch.fonts };
    if (patch.logos) data['logos'] = patch.logos;

    // Single-default invariant: promoting this kit demotes all others.
    if (patch.isDefault === true) {
      await this.prisma.editBrandKit.updateMany({
        where: { userId, NOT: { id } },
        data: { isDefault: false },
      });
      data['isDefault'] = true;
    }

    const row = await this.prisma.editBrandKit.update({ where: { id }, data });
    return this.toKit(row);
  }

  async deleteKit(userId: string, id: string): Promise<{ deleted: true }> {
    const kit = await this.getKit(userId, id); // ownership + existence
    await this.prisma.editBrandKit.delete({ where: { id } });

    // If we removed the default, promote the next-oldest remaining kit.
    if (kit.isDefault) {
      const next = await this.prisma.editBrandKit.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });
      if (next) {
        await this.prisma.editBrandKit.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }
    return { deleted: true };
  }

  /**
   * Recolor/retype editor elements to the kit. Text elements adopt the body
   * font; any element carrying a color adopts the kit text color. Returns how
   * many elements were changed vs left untouched (no style to brand).
   */
  applyToElements(
    kit: BrandKit,
    elements: EditorElement[],
  ): { applied: number; skipped: number; elements: EditorElement[] } {
    let applied = 0;
    let skipped = 0;
    const out = elements.map((el) => {
      const style = el.style;
      if (!style || (style.color === undefined && style.fontFamily === undefined)) {
        skipped += 1;
        return el;
      }
      const nextStyle = { ...style };
      if (style.color !== undefined) nextStyle.color = kit.colors.text;
      if (style.fontFamily !== undefined) {
        nextStyle.fontFamily = el.type === 'text' ? kit.fonts.heading : kit.fonts.body;
      }
      applied += 1;
      return { ...el, style: nextStyle };
    });
    return { applied, skipped, elements: out };
  }

  /** Flag elements whose colors/fonts fall outside the brand kit. */
  checkConsistency(kit: BrandKit, elements: EditorElement[]): ConsistencyIssue[] {
    const palette = new Set(Object.values(kit.colors).map((c) => c.toLowerCase()));
    const fonts = new Set(Object.values(kit.fonts));
    const issues: ConsistencyIssue[] = [];

    for (const el of elements) {
      const color = el.style?.color;
      if (color && !palette.has(color.toLowerCase())) {
        issues.push({
          element: el.id,
          issue: `Color ${color} is not in the brand palette`,
          severity: 'warning',
          suggestion: `Use a brand color (e.g. ${kit.colors.primary})`,
        });
      }
      const font = el.style?.fontFamily;
      if (font && !fonts.has(font)) {
        issues.push({
          element: el.id,
          issue: `Font "${font}" is not a brand font`,
          severity: 'warning',
          suggestion: `Use ${kit.fonts.heading} or ${kit.fonts.body}`,
        });
      }
    }
    return issues;
  }

  private toKit(row: Record<string, unknown>): BrandKit {
    const colors = (row['colors'] as Partial<BrandColors>) ?? {};
    const fonts = (row['fonts'] as Partial<BrandFonts>) ?? {};
    const logos = Array.isArray(row['logos']) ? (row['logos'] as BrandLogo[]) : [];
    return {
      id: String(row['id']),
      userId: String(row['userId']),
      name: String(row['name']),
      isDefault: Boolean(row['isDefault']),
      colors: { ...DEFAULT_COLORS, ...colors },
      fonts: { ...DEFAULT_FONTS, ...fonts },
      logos,
    };
  }
}

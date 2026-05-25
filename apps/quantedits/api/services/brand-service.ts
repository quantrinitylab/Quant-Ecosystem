// ============================================================================
// QuantEdits - Brand Service
// Brand kits: logo/color/font storage, apply brand, team sharing, consistency
// ============================================================================

interface BrandKit {
  id: string;
  name: string;
  ownerId: string;
  teamId: string | null;
  logos: BrandLogo[];
  colors: ColorPalette;
  fonts: BrandFont[];
  guidelines: BrandGuidelines;
  createdAt: number;
  updatedAt: number;
  isDefault: boolean;
  sharedWith: SharedAccess[];
}

interface BrandLogo {
  id: string;
  name: string;
  url: string;
  variant: 'primary' | 'secondary' | 'icon' | 'wordmark' | 'monochrome';
  format: 'png' | 'svg' | 'jpg';
  width: number;
  height: number;
  minSize: number;
  clearSpace: number;
  uploadedAt: number;
}

interface ColorPalette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  success: string;
  warning: string;
  error: string;
  custom: NamedColor[];
}

interface NamedColor {
  name: string;
  value: string;
  usage: string;
}

interface BrandFont {
  id: string;
  name: string;
  family: string;
  role: 'heading' | 'body' | 'accent' | 'caption';
  weight: string;
  style: 'normal' | 'italic';
  url: string;
  fallbacks: string[];
  sizeRange: { min: number; max: number };
}

interface BrandGuidelines {
  voice: string;
  tone: string[];
  doList: string[];
  dontList: string[];
  spacing: { unit: number; scale: number[] };
  borderRadius: number;
}

interface SharedAccess {
  userId: string;
  email: string;
  permission: 'view' | 'use' | 'edit' | 'admin';
  addedAt: number;
  addedBy: string;
}

interface ConsistencyCheck {
  element: string;
  issue: string;
  severity: 'error' | 'warning' | 'info';
  suggestion: string;
  autoFixAvailable: boolean;
}

class BrandService {
  private brandKits: Map<string, BrandKit> = new Map();
  private userKits: Map<string, string[]> = new Map();

  async createBrandKit(ownerId: string, name: string, teamId?: string): Promise<BrandKit> {
    const kit: BrandKit = {
      id: `brand-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name,
      ownerId,
      teamId: teamId || null,
      logos: [],
      colors: { primary: '#000000', secondary: '#333333', accent: '#666666', background: '#ffffff', text: '#1a1a1a', success: '#22c55e', warning: '#f59e0b', error: '#ef4444', custom: [] },
      fonts: [],
      guidelines: { voice: '', tone: [], doList: [], dontList: [], spacing: { unit: 8, scale: [0.5, 1, 1.5, 2, 3, 4, 6, 8] }, borderRadius: 8 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDefault: false,
      sharedWith: [],
    };
    this.brandKits.set(kit.id, kit);
    const userKitList = this.userKits.get(ownerId) || [];
    userKitList.push(kit.id);
    this.userKits.set(ownerId, userKitList);
    return kit;
  }

  async getBrandKit(kitId: string): Promise<BrandKit | null> {
    return this.brandKits.get(kitId) || null;
  }

  async getUserBrandKits(userId: string): Promise<BrandKit[]> {
    const kitIds = this.userKits.get(userId) || [];
    const kits: BrandKit[] = [];
    kitIds.forEach(id => {
      const kit = this.brandKits.get(id);
      if (kit) kits.push(kit);
    });
    this.brandKits.forEach(kit => {
      if (kit.sharedWith.some(s => s.userId === userId) && !kits.find(k => k.id === kit.id)) kits.push(kit);
    });
    return kits;
  }

  async updateColors(kitId: string, colors: Partial<ColorPalette>): Promise<BrandKit | null> {
    const kit = this.brandKits.get(kitId);
    if (!kit) return null;
    kit.colors = { ...kit.colors, ...colors };
    kit.updatedAt = Date.now();
    return kit;
  }

  async addLogo(kitId: string, logo: Omit<BrandLogo, 'id' | 'uploadedAt'>): Promise<BrandLogo> {
    const kit = this.brandKits.get(kitId);
    if (!kit) throw new Error('Brand kit not found');
    const newLogo: BrandLogo = { ...logo, id: `logo-${Date.now()}`, uploadedAt: Date.now() };
    kit.logos.push(newLogo);
    kit.updatedAt = Date.now();
    return newLogo;
  }

  async removeLogo(kitId: string, logoId: string): Promise<void> {
    const kit = this.brandKits.get(kitId);
    if (!kit) return;
    kit.logos = kit.logos.filter(l => l.id !== logoId);
    kit.updatedAt = Date.now();
  }

  async addFont(kitId: string, font: Omit<BrandFont, 'id'>): Promise<BrandFont> {
    const kit = this.brandKits.get(kitId);
    if (!kit) throw new Error('Brand kit not found');
    const newFont: BrandFont = { ...font, id: `font-${Date.now()}` };
    kit.fonts.push(newFont);
    kit.updatedAt = Date.now();
    return newFont;
  }

  async removeFont(kitId: string, fontId: string): Promise<void> {
    const kit = this.brandKits.get(kitId);
    if (!kit) return;
    kit.fonts = kit.fonts.filter(f => f.id !== fontId);
    kit.updatedAt = Date.now();
  }

  async updateGuidelines(kitId: string, guidelines: Partial<BrandGuidelines>): Promise<void> {
    const kit = this.brandKits.get(kitId);
    if (!kit) return;
    kit.guidelines = { ...kit.guidelines, ...guidelines };
    kit.updatedAt = Date.now();
  }

  async shareKit(kitId: string, targetUserId: string, email: string, permission: SharedAccess['permission'], addedBy: string): Promise<void> {
    const kit = this.brandKits.get(kitId);
    if (!kit) return;
    const existing = kit.sharedWith.find(s => s.userId === targetUserId);
    if (existing) { existing.permission = permission; }
    else { kit.sharedWith.push({ userId: targetUserId, email, permission, addedAt: Date.now(), addedBy }); }
    kit.updatedAt = Date.now();
  }

  async revokeAccess(kitId: string, targetUserId: string): Promise<void> {
    const kit = this.brandKits.get(kitId);
    if (!kit) return;
    kit.sharedWith = kit.sharedWith.filter(s => s.userId !== targetUserId);
    kit.updatedAt = Date.now();
  }

  async setDefault(userId: string, kitId: string): Promise<void> {
    const userKitIds = this.userKits.get(userId) || [];
    userKitIds.forEach(id => {
      const kit = this.brandKits.get(id);
      if (kit) kit.isDefault = kit.id === kitId;
    });
  }

  async applyBrandToProject(kitId: string, projectElements: Record<string, unknown>[]): Promise<{ applied: number; skipped: number; changes: { element: string; property: string; oldValue: string; newValue: string }[] }> {
    const kit = this.brandKits.get(kitId);
    if (!kit) throw new Error('Brand kit not found');
    const changes: { element: string; property: string; oldValue: string; newValue: string }[] = [];
    let applied = 0;
    let skipped = 0;
    projectElements.forEach(element => {
      const elId = element.id as string;
      const elType = element.type as string;
      if (elType === 'text' && kit.fonts.length > 0) {
        const headingFont = kit.fonts.find(f => f.role === 'heading');
        const bodyFont = kit.fonts.find(f => f.role === 'body');
        const font = (element.fontSize as number) > 24 ? headingFont : bodyFont;
        if (font) {
          changes.push({ element: elId, property: 'fontFamily', oldValue: element.fontFamily as string || '', newValue: font.family });
          applied++;
        }
      }
      if (element.fill && typeof element.fill === 'string' && element.fill !== 'transparent') {
        changes.push({ element: elId, property: 'fill', oldValue: element.fill, newValue: kit.colors.primary });
        applied++;
      } else { skipped++; }
    });
    return { applied, skipped, changes };
  }

  async checkConsistency(kitId: string, projectElements: Record<string, unknown>[]): Promise<ConsistencyCheck[]> {
    const kit = this.brandKits.get(kitId);
    if (!kit) return [];
    const issues: ConsistencyCheck[] = [];
    projectElements.forEach(element => {
      const elId = element.id as string || 'unknown';
      if (element.fontFamily && kit.fonts.length > 0) {
        const isApprovedFont = kit.fonts.some(f => f.family === element.fontFamily);
        if (!isApprovedFont) {
          issues.push({ element: elId, issue: `Font "${element.fontFamily}" is not in brand kit`, severity: 'warning', suggestion: `Use ${kit.fonts[0].family} instead`, autoFixAvailable: true });
        }
      }
      if (element.fill && typeof element.fill === 'string' && element.fill !== 'transparent') {
        const approvedColors = [kit.colors.primary, kit.colors.secondary, kit.colors.accent, kit.colors.background, kit.colors.text, ...kit.colors.custom.map(c => c.value)];
        if (!approvedColors.includes(element.fill as string)) {
          issues.push({ element: elId, issue: `Color "${element.fill}" is not in brand palette`, severity: 'info', suggestion: `Consider using brand primary (${kit.colors.primary})`, autoFixAvailable: true });
        }
      }
    });
    return issues;
  }

  async deleteBrandKit(kitId: string, userId: string): Promise<boolean> {
    const kit = this.brandKits.get(kitId);
    if (!kit || kit.ownerId !== userId) return false;
    this.brandKits.delete(kitId);
    const userKitList = this.userKits.get(userId) || [];
    this.userKits.set(userId, userKitList.filter(id => id !== kitId));
    return true;
  }

  async duplicateKit(kitId: string, userId: string, newName: string): Promise<BrandKit | null> {
    const original = this.brandKits.get(kitId);
    if (!original) return null;
    const duplicate = await this.createBrandKit(userId, newName);
    duplicate.logos = [...original.logos.map(l => ({ ...l, id: `logo-${Date.now()}-${Math.random().toString(36).slice(2)}` }))];
    duplicate.colors = { ...original.colors, custom: [...original.colors.custom] };
    duplicate.fonts = [...original.fonts.map(f => ({ ...f, id: `font-${Date.now()}-${Math.random().toString(36).slice(2)}` }))];
    duplicate.guidelines = { ...original.guidelines };
    this.brandKits.set(duplicate.id, duplicate);
    return duplicate;
  }
}

export const brandService = new BrandService();
export default BrandService;

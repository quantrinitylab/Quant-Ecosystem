// ============================================================================
// QuantEdits - Brand Kit Controller
// ============================================================================

import { brandService } from '../services/brand-service';

interface Request {
  params: Record<string, string>;
  body: Record<string, unknown>;
  userId: string;
}

interface Response {
  status: number;
  body: unknown;
}

class BrandKitController {
  async listKits(req: Request): Promise<Response> {
    const kits = await brandService.getUserBrandKits(req.userId);
    return { status: 200, body: { kits, count: kits.length } };
  }

  async createKit(req: Request): Promise<Response> {
    const { name, teamId } = req.body as { name: string; teamId?: string };
    if (!name) return { status: 400, body: { error: 'Name is required' } };
    const kit = await brandService.createBrandKit(req.userId, name, teamId);
    return { status: 201, body: { kit } };
  }

  async getKit(req: Request): Promise<Response> {
    const kit = await brandService.getBrandKit(req.params.id);
    if (!kit) return { status: 404, body: { error: 'Brand kit not found' } };
    return { status: 200, body: { kit } };
  }

  async updateKit(req: Request): Promise<Response> {
    const kit = await brandService.getBrandKit(req.params.id);
    if (!kit) return { status: 404, body: { error: 'Brand kit not found' } };
    if (kit.ownerId !== req.userId) return { status: 403, body: { error: 'Access denied' } };
    if (req.body.guidelines) await brandService.updateGuidelines(req.params.id, req.body.guidelines as Record<string, unknown>);
    return { status: 200, body: { kit: await brandService.getBrandKit(req.params.id) } };
  }

  async deleteKit(req: Request): Promise<Response> {
    const success = await brandService.deleteBrandKit(req.params.id, req.userId);
    if (!success) return { status: 404, body: { error: 'Not found or unauthorized' } };
    return { status: 200, body: { success: true } };
  }

  async addLogo(req: Request): Promise<Response> {
    const { name, url, variant, format, width, height } = req.body as { name: string; url: string; variant: string; format: string; width: number; height: number };
    if (!name || !url) return { status: 400, body: { error: 'Name and URL required' } };
    const logo = await brandService.addLogo(req.params.id, { name, url, variant: variant as any, format: format as any, width: width || 200, height: height || 200, minSize: 32, clearSpace: 16 });
    return { status: 201, body: { logo } };
  }

  async removeLogo(req: Request): Promise<Response> {
    await brandService.removeLogo(req.params.id, req.params.logoId);
    return { status: 200, body: { success: true } };
  }

  async updateColors(req: Request): Promise<Response> {
    const kit = await brandService.updateColors(req.params.id, req.body as any);
    if (!kit) return { status: 404, body: { error: 'Brand kit not found' } };
    return { status: 200, body: { colors: kit.colors } };
  }

  async addFont(req: Request): Promise<Response> {
    const { name, family, role, weight, url } = req.body as { name: string; family: string; role: string; weight: string; url: string };
    if (!name || !family) return { status: 400, body: { error: 'Name and family required' } };
    const font = await brandService.addFont(req.params.id, { name, family, role: role as any || 'body', weight: weight || '400', style: 'normal', url: url || '', fallbacks: ['sans-serif'], sizeRange: { min: 12, max: 72 } });
    return { status: 201, body: { font } };
  }

  async shareKit(req: Request): Promise<Response> {
    const { userId: targetUserId, email, permission } = req.body as { userId: string; email: string; permission: string };
    if (!email) return { status: 400, body: { error: 'Email required' } };
    await brandService.shareKit(req.params.id, targetUserId || email, email, permission as any || 'view', req.userId);
    return { status: 200, body: { success: true } };
  }

  async applyToProject(req: Request): Promise<Response> {
    const { elements } = req.body as { elements: Record<string, unknown>[] };
    if (!elements || !Array.isArray(elements)) return { status: 400, body: { error: 'Elements array required' } };
    const result = await brandService.applyBrandToProject(req.params.id, elements);
    return { status: 200, body: result };
  }

  async checkConsistency(req: Request): Promise<Response> {
    const { elements } = req.body as { elements: Record<string, unknown>[] };
    if (!elements || !Array.isArray(elements)) return { status: 400, body: { error: 'Elements array required' } };
    const issues = await brandService.checkConsistency(req.params.id, elements);
    return { status: 200, body: { issues, issueCount: issues.length } };
  }
}

export const brandKitController = new BrandKitController();
export default BrandKitController;

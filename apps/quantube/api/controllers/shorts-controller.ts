// ============================================================================
// QuantTube API - Shorts Controller
// ============================================================================

import { shortsService } from '../services/shorts-service';

interface Request {
  params: Record<string, string>;
  query: Record<string, string>;
  body: Record<string, any>;
  user?: { id: string };
}

interface Response {
  status: (code: number) => Response;
  json: (data: any) => void;
}

export class ShortsController {
  async getFeed(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id || 'anonymous';
      const { category, limit, cursor } = req.query;
      const feed = await shortsService.getFeed(userId, {
        category,
        limit: limit ? parseInt(limit) : 20,
        cursor,
      });
      res.status(200).json({ success: true, data: feed, cursor: feed.length > 0 ? feed[feed.length - 1].id : null });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getTrending(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit || '50');
      const trending = await shortsService.getTrending(limit);
      res.status(200).json({ success: true, data: trending });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getShort(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const feed = await shortsService.getFeed('system', { limit: 1 });
      const short = feed.find(s => s.id === id);
      if (!short) {
        res.status(404).json({ success: false, error: 'Short not found' });
        return;
      }
      res.status(200).json({ success: true, data: short });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async createShort(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
      const { videoUrl, thumbnailUrl, title, description, soundId, duration, tags } = req.body;
      const short = await shortsService.createShort({
        creatorId: userId, videoUrl, thumbnailUrl, title, description, soundId, duration, tags: tags || [],
      });
      res.status(201).json({ success: true, data: short });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async deleteShort(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
      await shortsService.deleteShort(req.params.id, userId);
      res.status(200).json({ success: true });
    } catch (error: any) {
      res.status(error.message === 'Unauthorized' ? 403 : 500).json({ success: false, error: error.message });
    }
  }

  async toggleLike(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
      const result = await shortsService.toggleLike(req.params.id, userId);
      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async addComment(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
      const result = await shortsService.addComment(req.params.id, userId, req.body.text);
      res.status(201).json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async shareShort(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
      const result = await shortsService.share(req.params.id, userId, req.body.platform || 'link');
      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async recordView(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id || 'anonymous';
      await shortsService.recordView(req.params.id, userId);
      res.status(200).json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getSoundLibrary(req: Request, res: Response): Promise<void> {
    try {
      const { category, limit } = req.query;
      const sounds = await shortsService.getSoundLibrary(category, limit ? parseInt(limit) : 50);
      res.status(200).json({ success: true, data: sounds });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getSound(req: Request, res: Response): Promise<void> {
    try {
      res.status(200).json({ success: true, data: { id: req.params.id, name: 'Sound', artist: 'Artist' } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

export default ShortsController;

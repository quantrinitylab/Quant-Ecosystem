// ============================================================================
// QuantNeon API - Highlights Controller
// ============================================================================

import { highlightsService } from '../services/highlights-service';

interface Request { params: Record<string, string>; query: Record<string, string>; body: Record<string, any>; user?: { id: string }; }
interface Response { status: (code: number) => Response; json: (data: any) => void; }

export class HighlightsController {
  async getUserHighlights(req: Request, res: Response): Promise<void> {
    try {
      const highlights = await highlightsService.getUserHighlights(req.params.userId);
      res.status(200).json({ success: true, data: highlights });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }

  async getStories(req: Request, res: Response): Promise<void> {
    try {
      const stories = await highlightsService.getHighlightStories(req.params.id);
      res.status(200).json({ success: true, data: stories });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }

  async createHighlight(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const highlight = await highlightsService.createHighlight(userId, req.body);
      res.status(201).json({ success: true, data: highlight });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }

  async updateHighlight(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const highlight = await highlightsService.updateHighlight(req.params.id, userId, req.body);
      res.status(200).json({ success: true, data: highlight });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }

  async deleteHighlight(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
      await highlightsService.deleteHighlight(req.params.id, userId);
      res.status(200).json({ success: true });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }

  async addStories(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const highlight = await highlightsService.addStories(req.params.id, userId, req.body.storyIds);
      res.status(200).json({ success: true, data: highlight });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }

  async removeStory(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const highlight = await highlightsService.removeStory(req.params.id, userId, req.params.storyId);
      res.status(200).json({ success: true, data: highlight });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }

  async reorder(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
      await highlightsService.reorderHighlights(userId, req.body.orderedIds);
      res.status(200).json({ success: true });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }

  async setCover(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const highlight = await highlightsService.setCover(req.params.id, userId, req.body.coverUrl);
      res.status(200).json({ success: true, data: highlight });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }
}

export default HighlightsController;

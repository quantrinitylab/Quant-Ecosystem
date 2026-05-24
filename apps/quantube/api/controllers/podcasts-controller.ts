// ============================================================================
// QuantTube API - Podcasts Controller
// ============================================================================

import { podcastService } from '../services/podcast-service';

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

export class PodcastsController {
  async browse(req: Request, res: Response): Promise<void> {
    try {
      const { category, limit } = req.query;
      const podcasts = await podcastService.browse(category || 'Technology', limit ? parseInt(limit) : 20);
      res.status(200).json({ success: true, data: podcasts });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async search(req: Request, res: Response): Promise<void> {
    try {
      const { q, category } = req.query;
      const results = await podcastService.search(q || '', category);
      res.status(200).json({ success: true, data: results });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getPodcast(req: Request, res: Response): Promise<void> {
    try {
      const podcast = await podcastService.getPodcast(req.params.id);
      if (!podcast) { res.status(404).json({ success: false, error: 'Podcast not found' }); return; }
      res.status(200).json({ success: true, data: podcast });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getEpisodes(req: Request, res: Response): Promise<void> {
    try {
      const { limit, offset } = req.query;
      const episodes = await podcastService.getEpisodes(req.params.id, limit ? parseInt(limit) : 20, offset ? parseInt(offset) : 0);
      res.status(200).json({ success: true, data: episodes });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async importRSS(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
      const { rssUrl } = req.body;
      if (!rssUrl) { res.status(400).json({ success: false, error: 'RSS URL required' }); return; }
      const podcast = await podcastService.importFromRSS(rssUrl, userId);
      res.status(201).json({ success: true, data: podcast });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async subscribe(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
      const sub = await podcastService.subscribe(userId, req.params.id);
      res.status(200).json({ success: true, data: sub });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async unsubscribe(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
      await podcastService.unsubscribe(userId, req.params.id);
      res.status(200).json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getSubscriptions(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
      const subs = await podcastService.getSubscriptions(userId);
      res.status(200).json({ success: true, data: subs });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async recordPlay(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
      await podcastService.recordPlay(req.params.id, userId);
      res.status(200).json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async generateTranscription(req: Request, res: Response): Promise<void> {
    try {
      const transcription = await podcastService.generateTranscription(req.params.id);
      res.status(200).json({ success: true, data: { transcription } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async generateChapters(req: Request, res: Response): Promise<void> {
    try {
      const chapters = await podcastService.generateChapters(req.params.id);
      res.status(200).json({ success: true, data: chapters });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

export default PodcastsController;

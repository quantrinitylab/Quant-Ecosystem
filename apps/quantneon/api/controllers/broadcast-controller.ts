// ============================================================================
// QuantNeon API - Broadcast Controller
// ============================================================================

import { broadcastService } from '../services/broadcast-service';

interface Request { params: Record<string, string>; query: Record<string, string>; body: Record<string, any>; user?: { id: string }; }
interface Response { status: (code: number) => Response; json: (data: any) => void; }

export class BroadcastController {
  async getChannels(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const owned = await broadcastService.getUserChannels(userId);
      const subscribed = await broadcastService.getSubscribedChannels(userId);
      res.status(200).json({ success: true, data: { owned, subscribed } });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }

  async getChannel(req: Request, res: Response): Promise<void> {
    try {
      const channel = await broadcastService.getChannel(req.params.id);
      if (!channel) { res.status(404).json({ error: 'Not found' }); return; }
      res.status(200).json({ success: true, data: channel });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }

  async createChannel(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const channel = await broadcastService.createChannel(userId, req.body);
      res.status(201).json({ success: true, data: channel });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }

  async deleteChannel(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
      await broadcastService.deleteChannel(req.params.id, userId);
      res.status(200).json({ success: true });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }

  async subscribe(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const sub = await broadcastService.subscribe(userId, req.params.id);
      res.status(200).json({ success: true, data: sub });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }

  async unsubscribe(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
      await broadcastService.unsubscribe(userId, req.params.id);
      res.status(200).json({ success: true });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }

  async getMessages(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit || '50');
      const messages = await broadcastService.getMessages(req.params.id, limit);
      res.status(200).json({ success: true, data: messages });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }

  async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const message = await broadcastService.sendMessage(req.params.id, userId, req.body);
      res.status(201).json({ success: true, data: message });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }

  async addReaction(req: Request, res: Response): Promise<void> {
    try {
      await broadcastService.addReaction(req.params.id, req.body.channelId, req.body.emoji);
      res.status(200).json({ success: true });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }
}

export default BroadcastController;

// ============================================================================
// QuantNeon API - Collab Controller
// ============================================================================

import { collabService } from '../services/collab-service';

interface Request { params: Record<string, string>; query: Record<string, string>; body: Record<string, any>; user?: { id: string }; }
interface Response { status: (code: number) => Response; json: (data: any) => void; }

export class CollabController {
  async getUserCollabs(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const collabs = await collabService.getUserCollabs(userId);
      res.status(200).json({ success: true, data: collabs });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }

  async getPendingInvites(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const invites = await collabService.getPendingInvites(userId);
      res.status(200).json({ success: true, data: invites });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }

  async getSentInvites(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const invites = await collabService.getSentInvites(userId);
      res.status(200).json({ success: true, data: invites });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }

  async createInvite(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const invite = await collabService.createInvite({ fromUserId: userId, ...req.body });
      res.status(201).json({ success: true, data: invite });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }

  async acceptInvite(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const collab = await collabService.acceptInvite(req.params.id, userId);
      res.status(200).json({ success: true, data: collab });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }

  async declineInvite(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
      await collabService.declineInvite(req.params.id, userId);
      res.status(200).json({ success: true });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }

  async deleteCollab(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
      await collabService.deleteCollab(req.params.id, userId);
      res.status(200).json({ success: true });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }
}

export default CollabController;

// ============================================================================
// QuantNeon API - Notes Controller
// ============================================================================

import { notesService } from '../services/notes-service';

interface Request { params: Record<string, string>; query: Record<string, string>; body: Record<string, any>; user?: { id: string }; }
interface Response { status: (code: number) => Response; json: (data: any) => void; }

export class NotesController {
  async getFeedNotes(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const followingIds = (req.query.following || '').split(',').filter(Boolean);
      const notes = await notesService.getFeedNotes(userId, followingIds);
      res.status(200).json({ success: true, data: notes });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }

  async getMyNote(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const note = await notesService.getUserNote(userId);
      res.status(200).json({ success: true, data: note });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }

  async createNote(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const note = await notesService.createNote(userId, req.body);
      res.status(201).json({ success: true, data: note });
    } catch (error: any) { res.status(400).json({ success: false, error: error.message }); }
  }

  async deleteNote(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
      await notesService.deleteNote(userId);
      res.status(200).json({ success: true });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }

  async replyToNote(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const reply = await notesService.replyToNote(req.params.id, userId, req.body.text);
      res.status(201).json({ success: true, data: reply });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }

  async getReplies(req: Request, res: Response): Promise<void> {
    try {
      const replies = await notesService.getNoteReplies(req.params.id);
      res.status(200).json({ success: true, data: replies });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }

  async recordView(req: Request, res: Response): Promise<void> {
    try {
      await notesService.recordView(req.params.id);
      res.status(200).json({ success: true });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  }
}

export default NotesController;

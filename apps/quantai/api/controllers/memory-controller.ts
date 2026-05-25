// ============================================================================
// QuantAI - Memory Controller
// ============================================================================

import type { Request, Response } from '@quant/server';
import memoryService from '../services/memory-service';

export class MemoryController {
  async list(req: Request, res: Response): Promise<void> {
    const userId = req.headers['x-user-id'] as string || 'default';
    const category = req.query?.category as string | undefined;
    const memories = await memoryService.listMemories(userId, category);
    res.status(200).json({ memories });
  }

  async create(req: Request, res: Response): Promise<void> {
    const userId = req.headers['x-user-id'] as string || 'default';
    const { text, category, source } = req.body;
    if (!text || !category) {
      res.status(400).json({ error: 'Text and category are required' });
      return;
    }
    const memory = await memoryService.addMemory(userId, text, category, source);
    res.status(201).json({ memory });
  }

  async search(req: Request, res: Response): Promise<void> {
    const userId = req.headers['x-user-id'] as string || 'default';
    const query = req.query?.q as string;
    if (!query) { res.status(400).json({ error: 'Query parameter q is required' }); return; }
    const results = await memoryService.searchMemories(userId, query);
    res.status(200).json({ results });
  }

  async stats(req: Request, res: Response): Promise<void> {
    const userId = req.headers['x-user-id'] as string || 'default';
    const stats = await memoryService.getStats(userId);
    res.status(200).json({ stats });
  }

  async update(req: Request, res: Response): Promise<void> {
    const userId = req.headers['x-user-id'] as string || 'default';
    const { id } = req.params;
    const { text } = req.body;
    if (!text) { res.status(400).json({ error: 'Text is required' }); return; }
    const memory = await memoryService.updateMemory(id, userId, text);
    if (!memory) { res.status(404).json({ error: 'Memory not found' }); return; }
    res.status(200).json({ memory });
  }

  async delete(req: Request, res: Response): Promise<void> {
    const userId = req.headers['x-user-id'] as string || 'default';
    const { id } = req.params;
    const deleted = await memoryService.deleteMemory(id, userId);
    if (!deleted) { res.status(404).json({ error: 'Memory not found' }); return; }
    res.status(204).json({});
  }

  async setPrivacy(req: Request, res: Response): Promise<void> {
    const userId = req.headers['x-user-id'] as string || 'default';
    const { id } = req.params;
    const { level } = req.body;
    if (!level || !['share', 'app-only', 'never'].includes(level)) {
      res.status(400).json({ error: 'Valid privacy level is required' });
      return;
    }
    const result = await memoryService.setPrivacyLevel(id, userId, level);
    if (!result) { res.status(404).json({ error: 'Memory not found' }); return; }
    res.status(200).json({ success: true });
  }

  async clearAll(req: Request, res: Response): Promise<void> {
    const userId = req.headers['x-user-id'] as string || 'default';
    const count = await memoryService.clearAllMemories(userId);
    res.status(200).json({ deleted: count });
  }

  async importMemories(req: Request, res: Response): Promise<void> {
    const userId = req.headers['x-user-id'] as string || 'default';
    const { data } = req.body;
    if (!Array.isArray(data)) { res.status(400).json({ error: 'Data array is required' }); return; }
    const count = await memoryService.importMemories(userId, data);
    res.status(200).json({ imported: count });
  }

  async exportMemories(req: Request, res: Response): Promise<void> {
    const userId = req.headers['x-user-id'] as string || 'default';
    const data = await memoryService.exportMemories(userId);
    res.status(200).json({ data });
  }
}

export default MemoryController;

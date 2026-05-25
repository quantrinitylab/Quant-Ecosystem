// ============================================================================
// QuantAI - Personas Controller
// ============================================================================

import type { Request, Response } from '@quant/server';
import personaService from '../services/persona-service';

export class PersonasController {
  async list(req: Request, res: Response): Promise<void> {
    const userId = req.headers['x-user-id'] as string || 'default';
    const personas = await personaService.listPersonas(userId);
    res.status(200).json({ personas });
  }

  async create(req: Request, res: Response): Promise<void> {
    const userId = req.headers['x-user-id'] as string || 'default';
    const { name, avatar, description, personality, tone, knowledgeFiles, isShared } = req.body;
    if (!name || !description || !personality) {
      res.status(400).json({ error: 'Name, description, and personality are required' });
      return;
    }
    const persona = await personaService.createPersona(userId, { name, avatar, description, personality, tone, knowledgeFiles, isShared });
    res.status(201).json({ persona });
  }

  async get(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const persona = await personaService.getPersona(id);
    if (!persona) { res.status(404).json({ error: 'Persona not found' }); return; }
    res.status(200).json({ persona });
  }

  async update(req: Request, res: Response): Promise<void> {
    const userId = req.headers['x-user-id'] as string || 'default';
    const { id } = req.params;
    const persona = await personaService.updatePersona(id, userId, req.body);
    if (!persona) { res.status(404).json({ error: 'Persona not found or not authorized' }); return; }
    res.status(200).json({ persona });
  }

  async delete(req: Request, res: Response): Promise<void> {
    const userId = req.headers['x-user-id'] as string || 'default';
    const { id } = req.params;
    const deleted = await personaService.deletePersona(id, userId);
    if (!deleted) { res.status(404).json({ error: 'Persona not found or not authorized' }); return; }
    res.status(204).json({});
  }

  async chat(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { message } = req.body;
    if (!message) { res.status(400).json({ error: 'Message is required' }); return; }
    try {
      const response = await personaService.chatWithPersona(id, message);
      res.status(200).json({ response });
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  }

  async uploadKnowledge(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { fileName, content } = req.body;
    const result = await personaService.uploadKnowledge(id, fileName, content);
    if (!result) { res.status(404).json({ error: 'Persona not found' }); return; }
    res.status(200).json({ success: true });
  }

  async toggleShare(req: Request, res: Response): Promise<void> {
    const userId = req.headers['x-user-id'] as string || 'default';
    const { id } = req.params;
    const result = await personaService.toggleShare(id, userId);
    if (!result) { res.status(404).json({ error: 'Persona not found or not authorized' }); return; }
    res.status(200).json({ success: true });
  }
}

export default PersonasController;

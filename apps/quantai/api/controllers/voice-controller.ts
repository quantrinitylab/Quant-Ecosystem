// ============================================================================
// QuantAI - Voice Controller
// ============================================================================

import type { Request, Response } from '@quant/server';
import voiceService from '../services/voice-service';

export class VoiceController {
  async getConfig(req: Request, res: Response): Promise<void> {
    const userId = req.headers['x-user-id'] as string || 'default';
    const config = await voiceService.getConfig(userId);
    res.status(200).json({ config });
  }

  async updateConfig(req: Request, res: Response): Promise<void> {
    const userId = req.headers['x-user-id'] as string || 'default';
    const config = await voiceService.updateConfig(userId, req.body);
    res.status(200).json({ config });
  }

  async transcribe(req: Request, res: Response): Promise<void> {
    const { language } = req.body;
    const audioData = Buffer.from(req.body.audio || '', 'base64');
    const result = await voiceService.transcribe(audioData, language);
    res.status(200).json({ result });
  }

  async synthesize(req: Request, res: Response): Promise<void> {
    const userId = req.headers['x-user-id'] as string || 'default';
    const { text } = req.body;
    if (!text) { res.status(400).json({ error: 'Text is required' }); return; }
    const result = await voiceService.synthesize(text, userId);
    res.status(200).json({ result });
  }

  async parseCommand(req: Request, res: Response): Promise<void> {
    const { text } = req.body;
    if (!text) { res.status(400).json({ error: 'Text is required' }); return; }
    const command = await voiceService.parseCommand(text);
    res.status(200).json({ command });
  }

  async getHistory(req: Request, res: Response): Promise<void> {
    const userId = req.headers['x-user-id'] as string || 'default';
    const limit = parseInt(req.query?.limit as string) || 50;
    const history = await voiceService.getCommandHistory(userId, limit);
    res.status(200).json({ history });
  }

  async listVoices(req: Request, res: Response): Promise<void> {
    const voices = await voiceService.getAvailableVoices();
    res.status(200).json({ voices });
  }

  async previewVoice(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const url = await voiceService.getVoicePreview(id);
    res.status(200).json({ previewUrl: url });
  }
}

export default VoiceController;

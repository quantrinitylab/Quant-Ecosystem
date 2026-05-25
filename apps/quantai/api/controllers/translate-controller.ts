// ============================================================================
// QuantAI - Translate Controller
// ============================================================================

import type { Request, Response } from '@quant/server';
import translationService from '../services/translation-service';

export class TranslateController {
  async translate(req: Request, res: Response): Promise<void> {
    const userId = req.headers['x-user-id'] as string || 'default';
    const { text, sourceLang, targetLang } = req.body;
    if (!text || !sourceLang || !targetLang) {
      res.status(400).json({ error: 'Text, source language, and target language are required' });
      return;
    }
    const result = await translationService.translate(userId, { text, sourceLang, targetLang });
    res.status(200).json({ result });
  }

  async detectLanguage(req: Request, res: Response): Promise<void> {
    const { text } = req.body;
    if (!text) { res.status(400).json({ error: 'Text is required' }); return; }
    const detection = await translationService.detectLanguage(text);
    res.status(200).json({ detection });
  }

  async translateConversation(req: Request, res: Response): Promise<void> {
    const userId = req.headers['x-user-id'] as string || 'default';
    const { speaker, text, langA, langB } = req.body;
    if (!speaker || !text || !langA || !langB) {
      res.status(400).json({ error: 'Speaker, text, langA, and langB are required' });
      return;
    }
    const turn = await translationService.translateConversation(userId, speaker, text, langA, langB);
    res.status(200).json({ turn });
  }

  async ocrTranslate(req: Request, res: Response): Promise<void> {
    const userId = req.headers['x-user-id'] as string || 'default';
    const { imageData, targetLang } = req.body;
    if (!targetLang) { res.status(400).json({ error: 'Target language is required' }); return; }
    const result = await translationService.ocrTranslate(userId, Buffer.from(imageData || '', 'base64'), targetLang);
    res.status(200).json({ result });
  }

  async batchTranslate(req: Request, res: Response): Promise<void> {
    const userId = req.headers['x-user-id'] as string || 'default';
    const { texts, sourceLang, targetLang } = req.body;
    if (!Array.isArray(texts) || !sourceLang || !targetLang) {
      res.status(400).json({ error: 'Texts array, source language, and target language are required' });
      return;
    }
    const results = await translationService.batchTranslate(userId, texts, sourceLang, targetLang);
    res.status(200).json({ results });
  }

  async getHistory(req: Request, res: Response): Promise<void> {
    const userId = req.headers['x-user-id'] as string || 'default';
    const limit = parseInt(req.query?.limit as string) || 50;
    const history = await translationService.getHistory(userId, limit);
    res.status(200).json({ history });
  }

  async getLanguages(req: Request, res: Response): Promise<void> {
    const languages = await translationService.getSupportedLanguages();
    res.status(200).json({ languages });
  }

  async getConversation(req: Request, res: Response): Promise<void> {
    const userId = req.headers['x-user-id'] as string || 'default';
    const conversation = await translationService.getConversation(userId);
    res.status(200).json({ conversation });
  }

  async clearConversation(req: Request, res: Response): Promise<void> {
    const userId = req.headers['x-user-id'] as string || 'default';
    await translationService.clearConversation(userId);
    res.status(204).json({});
  }
}

export default TranslateController;

// ============================================================================
// QuantAI - Code Controller
// ============================================================================

import type { Request, Response } from '@quant/server';
import codeService from '../services/code-service';

export class CodeController {
  async execute(req: Request, res: Response): Promise<void> {
    const { code, language } = req.body;
    if (!code || !language) {
      res.status(400).json({ error: 'Code and language are required' });
      return;
    }
    const result = await codeService.executeCode(code, language);
    res.status(200).json({ result });
  }

  async generate(req: Request, res: Response): Promise<void> {
    const { prompt, language } = req.body;
    if (!prompt || !language) {
      res.status(400).json({ error: 'Prompt and language are required' });
      return;
    }
    const result = await codeService.generateCode(prompt, language);
    res.status(200).json({ result });
  }

  async explain(req: Request, res: Response): Promise<void> {
    const { code, language } = req.body;
    if (!code || !language) {
      res.status(400).json({ error: 'Code and language are required' });
      return;
    }
    const explanation = await codeService.explainCode(code, language);
    res.status(200).json({ explanation });
  }

  async debug(req: Request, res: Response): Promise<void> {
    const { code, language, errorMessage } = req.body;
    if (!code || !language) {
      res.status(400).json({ error: 'Code and language are required' });
      return;
    }
    const result = await codeService.debugCode(code, language, errorMessage);
    res.status(200).json({ result });
  }

  async autocomplete(req: Request, res: Response): Promise<void> {
    const { code, cursorPosition, language } = req.body;
    if (!code || cursorPosition === undefined || !language) {
      res.status(400).json({ error: 'Code, cursor position, and language are required' });
      return;
    }
    const suggestions = await codeService.getAutocompleteSuggestions(code, cursorPosition, language);
    res.status(200).json({ suggestions });
  }
}

export default CodeController;

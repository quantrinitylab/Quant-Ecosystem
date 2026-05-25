// ============================================================================
// QuantAI - Image Generation Controller
// ============================================================================

import type { Request, Response } from '@quant/server';
import imageGenService from '../services/image-gen-service';

export class ImageGenController {
  async generate(req: Request, res: Response): Promise<void> {
    const userId = req.headers['x-user-id'] as string || 'default';
    const { prompt, negativePrompt, style, aspectRatio, seed, steps, guidanceScale } = req.body;
    if (!prompt || !style || !aspectRatio) {
      res.status(400).json({ error: 'Prompt, style, and aspect ratio are required' });
      return;
    }
    const image = await imageGenService.generate(userId, { prompt, negativePrompt, style, aspectRatio, seed, steps, guidanceScale });
    res.status(201).json({ image });
  }

  async variations(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { count } = req.body;
    try {
      const variations = await imageGenService.generateVariations(id, count || 4);
      res.status(200).json({ variations });
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  }

  async upscale(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { factor } = req.body;
    if (factor !== 2 && factor !== 4) {
      res.status(400).json({ error: 'Factor must be 2 or 4' });
      return;
    }
    try {
      const result = await imageGenService.upscale(id, factor);
      res.status(200).json({ result });
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  }

  async inpaint(req: Request, res: Response): Promise<void> {
    const userId = req.headers['x-user-id'] as string || 'default';
    const { id } = req.params;
    const { mask, prompt } = req.body;
    if (!mask || !prompt) {
      res.status(400).json({ error: 'Mask and prompt are required' });
      return;
    }
    try {
      const result = await imageGenService.inpaint(userId, { imageId: id, mask, prompt });
      res.status(200).json({ result });
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  }

  async list(req: Request, res: Response): Promise<void> {
    const userId = req.headers['x-user-id'] as string || 'default';
    const limit = parseInt(req.query?.limit as string) || 50;
    const images = await imageGenService.listImages(userId, limit);
    res.status(200).json({ images });
  }

  async get(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const image = await imageGenService.getImage(id);
    if (!image) { res.status(404).json({ error: 'Image not found' }); return; }
    res.status(200).json({ image });
  }

  async delete(req: Request, res: Response): Promise<void> {
    const userId = req.headers['x-user-id'] as string || 'default';
    const { id } = req.params;
    const deleted = await imageGenService.deleteImage(id, userId);
    if (!deleted) { res.status(404).json({ error: 'Image not found or not authorized' }); return; }
    res.status(204).json({});
  }
}

export default ImageGenController;

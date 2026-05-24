// ============================================================================
// QuantEdits - AI Controller
// Business logic for AI editing operations
// ============================================================================

import { aiEditingService } from '../services/ai-service';
import type { AIEditRequest, AIEditResult } from '../../src/types';

export class AIController {
  async processRequest(request: AIEditRequest): Promise<AIEditResult> {
    return aiEditingService.processRequest(request);
  }

  async removeBackground(imageUrl: string): Promise<AIEditResult> {
    return aiEditingService.removeBackground(imageUrl);
  }

  async upscale(imageUrl: string, scale: number): Promise<AIEditResult> {
    return aiEditingService.upscaleImage(imageUrl, scale);
  }

  async styleTransfer(imageUrl: string, style: string): Promise<AIEditResult> {
    return aiEditingService.styleTransfer(imageUrl, style);
  }

  async autoCaption(videoUrl: string, language: string): Promise<AIEditResult> {
    return aiEditingService.autoCaption(videoUrl, language);
  }

  async voiceClone(audioUrl: string, text: string): Promise<AIEditResult> {
    return aiEditingService.voiceClone(audioUrl, text);
  }

  async objectRemoval(imageUrl: string, mask: { x: number; y: number; w: number; h: number }): Promise<AIEditResult> {
    return aiEditingService.removeObject(imageUrl, mask);
  }

  async colorGrade(imageUrl: string, mood: string): Promise<AIEditResult> {
    return aiEditingService.autoColorGrade(imageUrl, mood);
  }

  async autoEdit(projectId: string, prompt: string): Promise<AIEditResult> {
    return aiEditingService.autoEdit(projectId, prompt);
  }

  async enhance(imageUrl: string): Promise<AIEditResult> {
    return aiEditingService.enhanceImage(imageUrl);
  }

  getAvailableModels() {
    return aiEditingService.getAvailableModels();
  }

  getResult(resultId: string): AIEditResult | null {
    return aiEditingService.getResult(resultId);
  }
}

export const aiController = new AIController();

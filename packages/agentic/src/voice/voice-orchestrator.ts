import { AppController } from '../cross-app/app-controller.js';
import { VoiceCommandRouter, type VoiceCommandInput } from './voice-command-router.js';
import type { CommandResult } from '../cross-app/command-bus.js';
import type { UnifiedAIService } from '@quant/ai';

export class VoiceOrchestrator {
  private router: VoiceCommandRouter;
  private controller: AppController;

  constructor(controller?: AppController, aiService?: UnifiedAIService) {
    this.controller = controller ?? new AppController();
    this.router = new VoiceCommandRouter(this.controller, aiService);
  }

  async processCommand(input: VoiceCommandInput): Promise<CommandResult[]> {
    return this.router.handle(input);
  }

  async processText(text: string, userId: string): Promise<CommandResult[]> {
    return this.processCommand({
      transcript: text,
      userId,
    });
  }

  getController(): AppController {
    return this.controller;
  }

  getRouter(): VoiceCommandRouter {
    return this.router;
  }
}

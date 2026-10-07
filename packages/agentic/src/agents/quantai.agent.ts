import { Agent } from '../core/agent.js';
import { UnifiedAIService } from '@quant/ai/unified-ai-service';
import { logger } from '@quant/common';
import { VoiceOrchestrator } from '../voice/voice-orchestrator.js';

export class QuantAIAgent extends Agent {
  private aiService: UnifiedAIService;
  private voiceOrchestrator: VoiceOrchestrator;

  constructor(aiService?: UnifiedAIService, voiceOrchestrator?: VoiceOrchestrator) {
    super({
      id: 'quantai-agent',
      name: 'QuantAI Agent',
      personality: 'Intelligent, multi-model, reasoning-focused AI assistant',
      capabilities: [
        'multi_model_chat',
        'reasoning',
        'tool_use',
        'web_search',
        'code_generation',
        'analysis',
        'voice_control',
      ],
    });

    this.aiService = aiService ?? new UnifiedAIService();
    this.voiceOrchestrator = voiceOrchestrator ?? new VoiceOrchestrator();

    this.registerAITools();
  }

  private registerAITools() {
    this.addTool({
      name: 'quantai_chat',
      description: 'Chat with multi-model AI',
      parameters: {
        message: 'string',
        model: 'string',
        temperature: 'number',
      },
      execute: async (params: any) => {
        logger.log('[QuantAIAgent] Processing chat:', params);
        const result = await this.aiService.generateText(params.message, {
          model: params.model,
          temperature: params.temperature,
        });
        return {
          response: result.content,
          model: result.model,
        };
      },
    });

    this.addTool({
      name: 'quantai_reason',
      description: 'Perform complex reasoning',
      parameters: {
        problem: 'string',
        context: 'object',
      },
      execute: async (_params: any) => {
        return {
          reasoning: 'Step-by-step reasoning would go here',
          conclusion: 'Final conclusion based on reasoning',
        };
      },
    });

    this.addTool({
      name: 'quantai_voice_command',
      description: 'Execute a cross-app voice command',
      parameters: {
        command: 'string',
      },
      execute: async (params: { command: string }) => {
        const results = await this.voiceOrchestrator.processText(params.command, 'quantai-user');
        return {
          results: results.map((r) => ({
            success: r.success,
            app: r.app,
            message: r.message,
          })),
        };
      },
    });
  }
}

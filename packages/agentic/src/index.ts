import { QuantOrchestrator } from './orchestrator/orchestrator';
import { IntelligentOrchestrator } from './orchestrator/intelligent-orchestrator';
import { QuantMailAgent } from './agents/quantmail.agent';
import { QuantChatAgent } from './agents/quantchat.agent';
import { QuantAIAgent } from './agents/quantai.agent';
import { QuantDriveAgent } from './agents/quantdrive.agent';
import { QuantMeetAgent } from './agents/quantmeet.agent';
import { QuantSyncAgent } from './agents/quantsync.agent';
import { PersonalAgent } from './agents/personal.agent';

export * from './core/agent';
export * from './memory/memory-store';
export * from './tools/tool-registry';
export * from './planning/planner';
export * from './execution/executor';
export * from './orchestrator/orchestrator';
export * from './orchestrator/intelligent-orchestrator';
export * from './swarm/swarm-intelligence';
export * from './agents/quantmail.agent';
export * from './agents/quantchat.agent';
export * from './agents/quantai.agent';
export * from './agents/quantdrive.agent';
export * from './agents/quantmeet.agent';
export * from './agents/quantsync.agent';
export * from './agents/personal.agent';

export function createQuantEcosystemOrchestrator(useIntelligent: boolean = true) {
  if (useIntelligent) {
    const orchestrator = new IntelligentOrchestrator({
      maxConcurrentAgents: 25,
      defaultModel: 'gpt-4o',
      enableSelfHealing: true,
      enableFederation: true,
    });

    // Register all agents with capabilities
    orchestrator.registerAgent(new QuantMailAgent(), ['email', 'communication']);
    orchestrator.registerAgent(new QuantChatAgent(), ['chat', 'realtime']);
    orchestrator.registerAgent(new QuantAIAgent(), ['analysis', 'reasoning']);
    orchestrator.registerAgent(new QuantDriveAgent(), ['storage', 'files']);
    orchestrator.registerAgent(new QuantMeetAgent(), ['video', 'meeting']);
    orchestrator.registerAgent(new QuantSyncAgent(), ['sync', 'collaboration']);
    orchestrator.registerAgent(new PersonalAgent(), ['personal', 'memory']);

    return orchestrator;
  }

  // Fallback to original
  const orchestrator = new QuantOrchestrator({
    maxConcurrentAgents: 20,
    defaultModel: 'gpt-4o',
  });

  orchestrator.registerAgent(new QuantMailAgent());
  orchestrator.registerAgent(new QuantChatAgent());
  orchestrator.registerAgent(new QuantAIAgent());
  orchestrator.registerAgent(new QuantDriveAgent());
  orchestrator.registerAgent(new QuantMeetAgent());
  orchestrator.registerAgent(new QuantSyncAgent());

  return orchestrator;
}

export const orchestrator = createQuantEcosystemOrchestrator(true);

// v2.1+ Advanced exports
export { IntelligentOrchestrator } from './orchestrator/intelligent-orchestrator';
export { SwarmIntelligence } from './swarm/swarm-intelligence';

export * from './federation/cross-app-federation';
export { CrossAppFederation } from './federation/cross-app-federation';

export * from './marketplace/agent-marketplace-v2';
export { AgentMarketplaceV2 } from './marketplace/agent-marketplace-v2';

export * from './training/agent-training-system';
export { AgentTrainingSystem } from './training/agent-training-system';
export const QUANT_ECOSYSTEM_VERSION = '2.4.0';

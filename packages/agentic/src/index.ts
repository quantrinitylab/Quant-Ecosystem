import { QuantOrchestrator } from './orchestrator/orchestrator.js';
import { IntelligentOrchestrator } from './orchestrator/intelligent-orchestrator.js';
import { QuantMailAgent } from './agents/quantmail.agent.js';
import { QuantChatAgent } from './agents/quantchat.agent.js';
import { QuantAIAgent } from './agents/quantai.agent.js';
import { QuantDriveAgent } from './agents/quantdrive.agent.js';
import { QuantMeetAgent } from './agents/quantmeet.agent.js';
import { QuantSyncAgent } from './agents/quantsync.agent.js';
import { PersonalAgent } from './agents/personal.agent.js';

export * from './core/agent.js';
export * from './memory/memory-store.js';
export * from './tools/tool-registry.js';
export * from './planning/planner.js';
export * from './execution/executor.js';
export * from './orchestrator/orchestrator.js';
export * from './orchestrator/intelligent-orchestrator.js';
export * from './swarm/swarm-intelligence.js';
export * from './agents/quantmail.agent.js';
export * from './agents/quantchat.agent.js';
export * from './agents/quantai.agent.js';
export * from './agents/quantdrive.agent.js';
export * from './agents/quantmeet.agent.js';
export * from './agents/quantsync.agent.js';
export * from './agents/personal.agent.js';
export * from './monitoring/agent-health.js';
export * from './logging/agent-logs.js';
export * from './workflows/workflow-engine.js';
export * from './collaboration/agent-collaboration.js';
export * from './permissions/agent-permissions.js';
export * from './analytics/agent-analytics.js';
export * from './federation/agent-federation.js';
export * from './marketplace/agent-marketplace.js';
export * from './swarm/agent-swarm.js';
export * from './templates/agent-templates.js';
export * from './training/agent-training.js';
export * from './versioning/agent-versioning.js';
export * from './voice/agent-voice.js';
export * from './voice/voice-intent-parser.js';
export * from './voice/voice-command-router.js';
export * from './voice/voice-orchestrator.js';
export * from './cross-app/command-bus.js';
export * from './cross-app/app-controller.js';
export * from './safety/voice-safety.js';
export * from './hooks/use-voice-command.js';

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
    orchestrator.registerAgent(new PersonalAgent('system', 'System'), ['personal', 'memory']);

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
export { IntelligentOrchestrator } from './orchestrator/intelligent-orchestrator.js';
export { SwarmIntelligence } from './swarm/swarm-intelligence.js';

export * from './federation/cross-app-federation.js';
export { CrossAppFederation } from './federation/cross-app-federation.js';

export * from './marketplace/agent-marketplace-v2.js';
export { AgentMarketplaceV2 } from './marketplace/agent-marketplace-v2.js';

export * from './training/agent-training-system.js';
export { AgentTrainingSystem } from './training/agent-training-system.js';

export * from './economy/agent-economy.js';
export { AgentEconomy } from './economy/agent-economy.js';

export * from './ml/ml-powered-intelligence.js';
export { MLPoweredIntelligence } from './ml/ml-powered-intelligence.js';

export * from './reputation/agent-reputation.js';
export { AgentReputationSystem } from './reputation/agent-reputation.js';

export * from './sandbox/agent-sandbox.js';
export { AgentSandbox } from './sandbox/agent-sandbox.js';

export { GlobalFederationNetwork } from './network/global-federation-network.js';

export * from './monitoring/production-monitoring.js';
export { ProductionMonitoring } from './monitoring/production-monitoring.js';

export * from './ml/real-ml-integration.js';
export { RealMLIntegration } from './ml/real-ml-integration.js';

export * from './payments/agent-economy-payments.js';
export { AgentEconomyPayments } from './payments/agent-economy-payments.js';

export * from './deployment/production-deployment.js';
export { ProductionDeployment } from './deployment/production-deployment.js';

export const QUANT_ECOSYSTEM_VERSION = '3.3.0';
export type { OrchestratorConfig } from './orchestrator/orchestrator.js';
export type { TrainingSession } from './training/agent-training-system.js';
export * from './voice/use-voice-commands.js';

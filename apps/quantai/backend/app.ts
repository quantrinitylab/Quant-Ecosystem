import { createApp } from '@quant/server-core';
import type { AppConfig } from '@quant/server-core';
import chatRoutes from './routes/chat';
import agentsRoutes from './routes/agents';
import sessionsRoutes from './routes/sessions';
import messagesRoutes from './routes/messages';
import orchestrationRoutes from './routes/orchestration';
import toolsRoutes from './routes/tools';
import memoryRoutes from './routes/memory';
import usageRoutes from './routes/usage';
import agenticRoutes from './routes/agentic';
import quantosRoutes from './routes/quantos';
import personalAgentRoutes from './routes/personal-agent';
import healthRoutes from './routes/health';
import marketplaceRoutes from './routes/marketplace';
import templatesRoutes from './routes/templates';
import analyticsRoutes from './routes/analytics';
import versioningRoutes from './routes/versioning';
import permissionsRoutes from './routes/permissions';
import collaborationRoutes from './routes/collaboration';
import trainingRoutes from './routes/training';
import federationRoutes from './routes/federation';
import agentHealthRoutes from './routes/agent-health';
import agentLogsRoutes from './routes/agent-logs';
import voiceRoutes from './routes/voice';
import swarmRoutes from './routes/swarm';
import recommendationRoutes from './routes/recommendations';
import moderationRoutes from './routes/moderation';
import paymentRoutes from './routes/payments';
import cacheRoutes from './routes/cache';
import cdnRoutes from './routes/cdn';
import scalingRoutes from './routes/scaling';
import mlRoutes from './routes/ml';
import abTestingRoutes from './routes/ab-testing';
import eventsRoutes from './routes/events';
import agentRuntimeRoutes from './routes/agent-runtime';
import agentSwarmRoutes from './routes/agent-swarm';
import quantToolsRoutes from './routes/quant-tools';
import browserAgentRoutes from './routes/browser-agent';
import codeAgentRoutes from './routes/code-agent';
import userOwnedAiRoutes from './routes/user-owned-ai';
import { AIEngine } from './services/ai-engine';
import { Orchestrator } from '@quant/agent-runtime';
import { SwarmOrchestrator } from '@quant/agent-swarm';
import { CrossAppOrchestrator, allTools } from '@quant/quant-tools';
import { SessionManager } from '@quant/browser-agent';
import { CodeAnalyzer } from '@quant/code-agent';
import { ModelRegistry } from '@quant/user-owned-ai';
import { AIEngine as CoreAIEngine } from '@quant/ai';

export function getConfig(): AppConfig {
  const env = (process.env['NODE_ENV'] as AppConfig['env']) ?? 'development';

  if (env === 'production' && !process.env['JWT_SECRET']) {
    throw new Error('JWT_SECRET environment variable is required in production');
  }

  return {
    port: Number(process.env['PORT'] ?? 3004),
    host: process.env['HOST'] ?? '0.0.0.0',
    logLevel: process.env['LOG_LEVEL'] ?? 'info',
    corsOrigins: (process.env['CORS_ORIGINS'] ?? 'http://localhost:3000').split(','),
    rateLimitMax: Number(process.env['RATE_LIMIT_MAX'] ?? 100),
    rateLimitWindow: process.env['RATE_LIMIT_WINDOW'] ?? '1 minute',
    redisUrl: process.env['REDIS_URL'],
    jwtSecret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production',
    jwtIssuer: process.env['JWT_ISSUER'] ?? 'quantai',
    jwtAudience: process.env['JWT_AUDIENCE'] ?? 'quant-ecosystem',
    env,
  };
}

export async function buildApp(config?: AppConfig) {
  const appConfig = config ?? getConfig();
  const app = await createApp(appConfig);

  // AI Engine
  const aiEngine = new AIEngine();
  (app as any).aiEngine = aiEngine;

  // Agent runtime engine (per-app lane, Stage 2). The orchestrator's only
  // construction dependency is an AI inference adapter, so we wire it to the
  // shared @quant/ai engine (`infer(prompt) -> content`). `app.prisma` is the
  // injected singleton available for engine collaborators that need it; the
  // Orchestrator itself does not require database access (Req 1.3 is
  // conditional). Constructed once at boot and decorated as a singleton.
  const coreAi = new CoreAIEngine();
  const agentRuntime = new Orchestrator({
    infer: async (prompt: string): Promise<string> => {
      const response = await coreAi.infer({
        prompt,
        userId: 'system',
        app: 'quantai',
        feature: 'agent-runtime',
      });
      return response.content;
    },
  });
  app.decorate('agentRuntime', agentRuntime);

  // Stage-2 agent engines that depend on agent-runtime (dependsOn honored: the
  // Orchestrator above is constructed/decorated first). Each is a per-app
  // decorated singleton constructed at boot — never per-request.
  //  - agent-swarm:   multi-agent goal decomposition over the runtime.
  //  - quant-tools:   cross-app NL→tool-plan orchestration (full tool catalog).
  //  - browser-agent: authenticated, time-bounded browsing-session lifecycle.
  //  - code-agent:    repo-model analysis (CodeAnalyzer — its sandbox-bound
  //                   TaskExecutor needs an external sandbox, so is not wired).
  //  - user-owned-ai: bring-your-own-model catalog (ModelRegistry singleton).
  app.decorate('agentSwarm', new SwarmOrchestrator());
  app.decorate('quantTools', new CrossAppOrchestrator(allTools));
  app.decorate('browserAgent', new SessionManager());
  app.decorate('codeAgent', new CodeAnalyzer());
  app.decorate('userOwnedAi', new ModelRegistry());

  await app.register(chatRoutes, { prefix: '/chat' });
  await app.register(agentsRoutes, { prefix: '/agents' });
  await app.register(agentRuntimeRoutes, { prefix: '/agents' });
  await app.register(agentSwarmRoutes, { prefix: '/agents/swarm' });
  await app.register(quantToolsRoutes, { prefix: '/tools' });
  await app.register(browserAgentRoutes, { prefix: '/agents/browser' });
  await app.register(codeAgentRoutes, { prefix: '/agents/code' });
  await app.register(userOwnedAiRoutes, { prefix: '/agents/owned' });
  await app.register(sessionsRoutes, { prefix: '/sessions' });
  await app.register(messagesRoutes, { prefix: '/sessions' });
  await app.register(orchestrationRoutes, { prefix: '/orchestration' });
  await app.register(toolsRoutes, { prefix: '/tools' });
  await app.register(memoryRoutes, { prefix: '/memory' });
  await app.register(usageRoutes, { prefix: '/usage' });
  await app.register(agenticRoutes, { prefix: '/agentic' });
  await app.register(quantosRoutes, { prefix: '/quantos' });
  await app.register(personalAgentRoutes, { prefix: '/personal-agent' });
  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(marketplaceRoutes, { prefix: '/marketplace' });
  await app.register(templatesRoutes, { prefix: '/templates' });
  await app.register(analyticsRoutes, { prefix: '/analytics' });
  await app.register(versioningRoutes, { prefix: '/versioning' });
  await app.register(permissionsRoutes, { prefix: '/permissions' });
  await app.register(collaborationRoutes, { prefix: '/collaboration' });
  await app.register(trainingRoutes, { prefix: '/training' });
  await app.register(federationRoutes, { prefix: '/federation' });
  await app.register(agentHealthRoutes, { prefix: '/agent-health' });
  await app.register(agentLogsRoutes, { prefix: '/agent-logs' });
  await app.register(voiceRoutes, { prefix: '/voice' });
  await app.register(swarmRoutes, { prefix: '/swarm' });
  await app.register(recommendationRoutes, { prefix: '/recommendations' });
  await app.register(moderationRoutes, { prefix: '/moderation' });
  await app.register(paymentRoutes, { prefix: '/payments' });
  await app.register(cacheRoutes, { prefix: '/cache' });
  await app.register(cdnRoutes, { prefix: '/cdn' });
  await app.register(scalingRoutes, { prefix: '/scaling' });
  await app.register(mlRoutes, { prefix: '/ml' });
  await app.register(abTestingRoutes, { prefix: '/ab-testing' });
  await app.register(eventsRoutes, { prefix: '/events' });

  return app;
}

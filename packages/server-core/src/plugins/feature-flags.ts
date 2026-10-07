import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { FeatureFlagService, InMemoryFlagStore } from '@quant/feature-flags';

declare module 'fastify' {
  interface FastifyInstance {
    flags: FeatureFlagService;
  }
}

async function featureFlagsPlugin(fastify: FastifyInstance) {
  const store = new InMemoryFlagStore();
  const service = new FeatureFlagService({ store });

  fastify.decorate('flags', service);

  // Refresh flags every 30 seconds
  const interval = setInterval(() => {
    service.refresh();
  }, 30_000);

  fastify.addHook('onClose', () => {
    clearInterval(interval);
  });
}

export default fp(featureFlagsPlugin, {
  name: 'feature-flags',
});

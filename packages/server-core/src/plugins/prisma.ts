import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@quant/database';
import type { PrismaClient } from '@quant/database';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

async function prismaPlugin(fastify: FastifyInstance) {
  fastify.decorate('prisma', prisma);

  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
}

export default fp(prismaPlugin, {
  name: 'prisma',
});

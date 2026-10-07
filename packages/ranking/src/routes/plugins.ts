// ============================================================================
// Plugin Routes - Fastify plugin for custom ranking plugin CRUD
// ============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { PluginSystem } from '../plugin-system.js';

const pluginManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  wasmUrl: z.string().url(),
  version: z.string().min(1),
  author: z.string().min(1),
});

const updatePluginSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  wasmUrl: z.string().url().optional(),
  version: z.string().min(1).optional(),
});

export interface PluginRouteDeps {
  pluginSystem: PluginSystem;
}

export default function pluginRoutes(deps: PluginRouteDeps) {
  return async function (fastify: FastifyInstance) {
    fastify.post('/plugins', async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
      if (!userId) {
        return reply.status(401).send({ success: false, error: 'Authentication required' });
      }

      const parseResult = pluginManifestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ success: false, error: parseResult.error.format() });
      }

      const manifest = parseResult.data;
      await deps.pluginSystem.loadPlugin(manifest);

      return reply.status(201).send({ success: true, data: manifest });
    });

    fastify.get('/plugins', async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
      if (!userId) {
        return reply.status(401).send({ success: false, error: 'Authentication required' });
      }

      const plugins = deps.pluginSystem.listPlugins();
      return reply.send({ success: true, data: plugins });
    });

    fastify.get(
      '/plugins/:id',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
        if (!userId) {
          return reply.status(401).send({ success: false, error: 'Authentication required' });
        }

        const plugin = deps.pluginSystem.getPlugin(request.params.id);
        if (!plugin) {
          return reply.status(404).send({ success: false, error: 'Plugin not found' });
        }
        return reply.send({ success: true, data: plugin });
      },
    );

    fastify.put(
      '/plugins/:id',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
        if (!userId) {
          return reply.status(401).send({ success: false, error: 'Authentication required' });
        }

        const parseResult = updatePluginSchema.safeParse(request.body);
        if (!parseResult.success) {
          return reply.status(400).send({ success: false, error: parseResult.error.format() });
        }

        const existing = deps.pluginSystem.getPlugin(request.params.id);
        if (!existing) {
          return reply.status(404).send({ success: false, error: 'Plugin not found' });
        }

        const updated = { ...existing, ...parseResult.data };
        await deps.pluginSystem.loadPlugin(updated);

        return reply.send({ success: true, data: updated });
      },
    );

    fastify.delete(
      '/plugins/:id',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
        if (!userId) {
          return reply.status(401).send({ success: false, error: 'Authentication required' });
        }

        const existing = deps.pluginSystem.getPlugin(request.params.id);
        if (!existing) {
          return reply.status(404).send({ success: false, error: 'Plugin not found' });
        }

        deps.pluginSystem.unloadPlugin(request.params.id);
        return reply.send({ success: true, data: { deleted: request.params.id } });
      },
    );
  };
}

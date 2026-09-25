// ============================================================================
// QuantAI — Fastify Routes: Ecosystem Plugins & MCP Connectors Directory
//
// Endpoints for listing verified MCP connectors, installing user configurations,
// uninstalling connectors, and performing live connection test healthchecks.
// ============================================================================

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  McpConnectorsService,
  type McpConnectorCategory,
} from '../services/mcp-connectors.service';

const installConnectorSchema = z.object({
  config: z.record(z.unknown()).optional(),
});

const testConnectorSchema = z.object({
  config: z.record(z.unknown()).optional(),
});

const queryConnectorsSchema = z.object({
  category: z.enum(['Productivity', 'Developer Tools', 'Databases', 'Design', 'Media']).optional(),
  installedOnly: z.enum(['true', 'false']).optional(),
  search: z.string().optional(),
});

export default async function mcpConnectorsRoutes(fastify: FastifyInstance) {
  function getService(): McpConnectorsService {
    let service = (fastify as unknown as { mcpConnectorsService?: McpConnectorsService })
      .mcpConnectorsService;
    if (!service) {
      service = new McpConnectorsService();
      (fastify as unknown as { mcpConnectorsService: McpConnectorsService }).mcpConnectorsService =
        service;
    }
    return service;
  }

  function getAuthenticatedUserId(request: FastifyRequest): string {
    const auth = (request as unknown as { auth?: { userId?: string } }).auth;
    if (auth?.userId) {
      return auth.userId;
    }
    const headerUserId = request.headers['x-user-id'] as string;
    if (headerUserId) {
      return headerUserId;
    }
    return 'user-default';
  }

  // GET / or /connectors — List all connectors with user installation state
  const listHandler = async (request: FastifyRequest, reply: any) => {
    const userId = getAuthenticatedUserId(request);
    const parsedQuery = queryConnectorsSchema.safeParse(request.query);
    if (!parsedQuery.success) {
      throw parsedQuery.error;
    }

    let connectors = getService().listConnectors(userId);

    const { category, installedOnly, search } = parsedQuery.data;

    if (category) {
      connectors = connectors.filter((c) => c.category === category);
    }
    if (installedOnly === 'true') {
      connectors = connectors.filter((c) => c.isInstalled);
    }
    if (search) {
      const q = search.toLowerCase();
      connectors = connectors.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q) ||
          c.supportedTools.some((t) => t.toLowerCase().includes(q)),
      );
    }

    return reply.send({ success: true, data: connectors });
  };

  fastify.get('/', listHandler);
  fastify.get('/connectors', listHandler);

  // GET /:id or /connectors/:id — Get details of a single connector
  const getSingleHandler = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: any,
  ) => {
    const userId = getAuthenticatedUserId(request);
    const connector = getService().getConnector(request.params.id, userId);
    return reply.send({ success: true, data: connector });
  };

  fastify.get<{ Params: { id: string } }>('/:id', getSingleHandler);
  fastify.get<{ Params: { id: string } }>('/connectors/:id', getSingleHandler);

  // POST /:id/install or /connectors/:id/install — Install connector configuration
  const installHandler = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: any,
  ) => {
    const userId = getAuthenticatedUserId(request);
    const connectorId = request.params.id;

    const parsed = installConnectorSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw parsed.error;
    }

    // Support payload passed either inside `{ config: { ... } }` or raw body
    const rawBody = (request.body as Record<string, unknown>) ?? {};
    const config =
      parsed.data.config && Object.keys(parsed.data.config).length > 0
        ? parsed.data.config
        : rawBody.config
          ? (rawBody.config as Record<string, unknown>)
          : rawBody;

    const installed = getService().installConnector(userId, connectorId, config);
    return reply.status(200).send({ success: true, data: installed });
  };

  fastify.post<{ Params: { id: string } }>('/:id/install', installHandler);
  fastify.post<{ Params: { id: string } }>('/connectors/:id/install', installHandler);

  // DELETE /:id or /connectors/:id — Uninstall connector and clear credentials
  const deleteHandler = async (request: FastifyRequest<{ Params: { id: string } }>, reply: any) => {
    const userId = getAuthenticatedUserId(request);
    const connectorId = request.params.id;

    const result = getService().uninstallConnector(userId, connectorId);
    return reply.send({ success: true, data: result });
  };

  fastify.delete<{ Params: { id: string } }>('/:id', deleteHandler);
  fastify.delete<{ Params: { id: string } }>('/connectors/:id', deleteHandler);

  // POST /:id/test or /connectors/:id/test — Test connector connection
  const testHandler = async (request: FastifyRequest<{ Params: { id: string } }>, reply: any) => {
    const userId = getAuthenticatedUserId(request);
    const connectorId = request.params.id;

    const parsed = testConnectorSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw parsed.error;
    }

    const rawBody = (request.body as Record<string, unknown>) ?? {};
    let config =
      parsed.data?.config && Object.keys(parsed.data.config).length > 0
        ? parsed.data.config
        : rawBody.config
          ? (rawBody.config as Record<string, unknown>)
          : rawBody;

    // If config is empty, fallback to installed credentials for this user
    if (!config || Object.keys(config).length === 0) {
      const installed = getService().getInstallation(userId, connectorId);
      if (installed) {
        config = installed.config;
      }
    }

    const result = await getService().testConnection(connectorId, config);
    const statusCode = result.success ? 200 : 400;
    return reply.status(statusCode).send({ success: result.success, data: result });
  };

  fastify.post<{ Params: { id: string } }>('/:id/test', testHandler);
  fastify.post<{ Params: { id: string } }>('/connectors/:id/test', testHandler);
}

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { RepoStorageService } from '../services/repo-storage.js';

const CreateRepoSchema = z.object({
  owner: z.string().min(1).max(100),
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9._-]+$/),
  description: z.string().max(1000).optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE', 'INTERNAL']).default('PUBLIC'),
});

const UpdateRepoSchema = z.object({
  description: z.string().max(1000).optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE', 'INTERNAL']).optional(),
  isArchived: z.boolean().optional(),
  defaultBranch: z.string().min(1).max(255).optional(),
});

export default async function apiRoutes(fastify: FastifyInstance): Promise<void> {
  const basePath = process.env['GIT_REPOS_PATH'] ?? '/tmp/git-repos';
  const repoStorage = new RepoStorageService(basePath);

  // In-memory repository metadata store (would be Prisma in production)
  const repos = new Map<
    string,
    {
      owner: string;
      name: string;
      description?: string;
      visibility: string;
      defaultBranch: string;
      isArchived: boolean;
      createdAt: string;
      updatedAt: string;
    }
  >();

  // POST /repos - create repository
  fastify.post('/repos', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = CreateRepoSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    const { owner, name, description, visibility } = parsed.data;
    const key = `${owner}/${name}`;

    if (repos.has(key)) {
      return reply.code(409).send({ error: 'Repository already exists' });
    }

    const storagePath = await repoStorage.initBareRepo(owner, name);
    const now = new Date().toISOString();

    const repo = {
      owner,
      name,
      description,
      visibility,
      defaultBranch: 'main',
      isArchived: false,
      storagePath,
      createdAt: now,
      updatedAt: now,
    };

    repos.set(key, repo);
    return reply.code(201).send(repo);
  });

  // GET /repos/:owner/:name - get repository
  fastify.get<{
    Params: { owner: string; name: string };
  }>(
    '/repos/:owner/:name',
    async (
      request: FastifyRequest<{
        Params: { owner: string; name: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { owner, name } = request.params;
      const key = `${owner}/${name}`;

      const repo = repos.get(key);
      if (!repo) {
        return reply.code(404).send({ error: 'Repository not found' });
      }

      return reply.send(repo);
    },
  );

  // DELETE /repos/:owner/:name - delete repository
  fastify.delete<{
    Params: { owner: string; name: string };
  }>(
    '/repos/:owner/:name',
    async (
      request: FastifyRequest<{
        Params: { owner: string; name: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { owner, name } = request.params;
      const key = `${owner}/${name}`;

      const repo = repos.get(key);
      if (!repo) {
        return reply.code(404).send({ error: 'Repository not found' });
      }

      await repoStorage.deleteRepo(owner, name);
      repos.delete(key);

      return reply.code(204).send();
    },
  );

  // PATCH /repos/:owner/:name - update repository
  fastify.patch<{
    Params: { owner: string; name: string };
  }>(
    '/repos/:owner/:name',
    async (
      request: FastifyRequest<{
        Params: { owner: string; name: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { owner, name } = request.params;
      const key = `${owner}/${name}`;

      const repo = repos.get(key);
      if (!repo) {
        return reply.code(404).send({ error: 'Repository not found' });
      }

      const parsed = UpdateRepoSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Validation failed', details: parsed.error.issues });
      }

      const updates = parsed.data;
      if (updates.description !== undefined) repo.description = updates.description;
      if (updates.visibility !== undefined) repo.visibility = updates.visibility;
      if (updates.isArchived !== undefined) repo.isArchived = updates.isArchived;
      if (updates.defaultBranch !== undefined) repo.defaultBranch = updates.defaultBranch;
      repo.updatedAt = new Date().toISOString();

      repos.set(key, repo);
      return reply.send(repo);
    },
  );
}

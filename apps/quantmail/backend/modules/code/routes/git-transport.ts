import type { FastifyInstance } from 'fastify';
import type { PrismaClient, Repository } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import {
  GitReceivePackService,
  GitUploadPackService,
  RECEIVE_PACK_ADV_CONTENT_TYPE,
  RECEIVE_PACK_CONTENT_TYPE,
  RepoStorageService,
  UPLOAD_PACK_ADV_CONTENT_TYPE,
  UPLOAD_PACK_CONTENT_TYPE,
  formatSmartHttpHeader,
} from '../services/git-transport';

type GitRouteParams = { owner: string; name: string };
type GitInfoRefsQuery = { service?: string };
type RepositoryAccess = Pick<Repository, 'ownerId' | 'name' | 'visibility'>;

function getOptionalUserId(request: unknown): string | undefined {
  return (request as { auth?: { userId?: string } }).auth?.userId;
}

function requireWriteAccess(request: unknown, repo: RepositoryAccess): void {
  const userId = getOptionalUserId(request);
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  if (repo.ownerId !== userId) {
    throw createAppError('Write access required', 403, 'FORBIDDEN');
  }
}

function requireReadAccess(request: unknown, repo: RepositoryAccess): void {
  if (String(repo.visibility).toUpperCase() === 'PUBLIC') return;

  const userId = getOptionalUserId(request);
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  const isPrivate = String(repo.visibility).toUpperCase() === 'PRIVATE';
  if (isPrivate && repo.ownerId !== userId) {
    throw createAppError('Read access required', 403, 'FORBIDDEN');
  }
}

function stripGitSuffix(name: string): string {
  return name.replace(/\.git$/, '');
}

function requestBodyBuffer(body: unknown): Buffer {
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string' || body instanceof Uint8Array) return Buffer.from(body);
  throw createAppError('Git request body must be a buffer', 400, 'INVALID_GIT_BODY');
}

export default async function gitTransportRoutes(fastify: FastifyInstance): Promise<void> {
  const prisma = (fastify as unknown as { prisma?: PrismaClient }).prisma ?? null;
  if (!prisma) {
    throw new Error(
      'PrismaClient is not available. Register the prisma plugin before git transport routes.',
    );
  }

  const repoStorage = new RepoStorageService();
  const uploadPack = new GitUploadPackService();
  const receivePack = new GitReceivePackService();

  const parseBuffer = (_request: unknown, body: Buffer, done: (error: Error | null, value?: Buffer) => void) => {
    done(null, body);
  };

  fastify.addContentTypeParser(
    'application/x-git-upload-pack-request',
    { parseAs: 'buffer' },
    parseBuffer,
  );
  fastify.addContentTypeParser(
    'application/x-git-receive-pack-request',
    { parseAs: 'buffer' },
    parseBuffer,
  );
  fastify.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, parseBuffer);

  async function findRepository(owner: string, name: string): Promise<Repository> {
    const repo = await prisma.repository.findFirst({
      where: { ownerId: owner, name },
    });

    if (!repo) {
      throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
    }

    return repo;
  }

  async function requireDiskRepository(owner: string, name: string): Promise<string> {
    if (!(await repoStorage.repoExists(owner, name))) {
      throw createAppError('Repository not found on disk', 404, 'GIT_REPO_NOT_FOUND');
    }
    return repoStorage.getRepoPath(owner, name);
  }

  fastify.get<{ Params: GitRouteParams; Querystring: GitInfoRefsQuery }>(
    '/repos/:owner/:name/info/refs',
    async (request, reply) => {
      const service = request.query.service;
      if (service !== 'git-upload-pack' && service !== 'git-receive-pack') {
        return reply.code(400).send({ error: 'Invalid service parameter' });
      }

      const owner = request.params.owner;
      const name = stripGitSuffix(request.params.name);
      const repo = await findRepository(owner, name);

      if (service === 'git-receive-pack') {
        requireWriteAccess(request, repo);
      } else {
        requireReadAccess(request, repo);
      }

      const repoPath = (await repoStorage.repoExists(owner, name))
        ? repoStorage.getRepoPath(owner, name)
        : await repoStorage.initBareRepo(owner, name);

      const refs =
        service === 'git-upload-pack'
          ? await uploadPack.advertiseRefs(repoPath)
          : await receivePack.advertiseRefs(repoPath);
      const contentType =
        service === 'git-upload-pack'
          ? UPLOAD_PACK_ADV_CONTENT_TYPE
          : RECEIVE_PACK_ADV_CONTENT_TYPE;

      return reply
        .header('Content-Type', contentType)
        .header('Cache-Control', 'no-cache')
        .send(formatSmartHttpHeader(service) + refs);
    },
  );

  fastify.post<{ Params: GitRouteParams }>(
    '/repos/:owner/:name/git-upload-pack',
    async (request, reply) => {
      const owner = request.params.owner;
      const name = stripGitSuffix(request.params.name);
      const repo = await findRepository(owner, name);
      requireReadAccess(request, repo);

      const repoPath = await requireDiskRepository(owner, name);
      const result = await uploadPack.execute(repoPath, requestBodyBuffer(request.body));

      return reply
        .header('Content-Type', UPLOAD_PACK_CONTENT_TYPE)
        .header('Cache-Control', 'no-cache')
        .send(result);
    },
  );

  fastify.post<{ Params: GitRouteParams }>(
    '/repos/:owner/:name/git-receive-pack',
    async (request, reply) => {
      const owner = request.params.owner;
      const name = stripGitSuffix(request.params.name);
      const repo = await findRepository(owner, name);
      requireWriteAccess(request, repo);

      const repoPath = await requireDiskRepository(owner, name);
      const result = await receivePack.execute(repoPath, requestBodyBuffer(request.body));

      return reply
        .header('Content-Type', RECEIVE_PACK_CONTENT_TYPE)
        .header('Cache-Control', 'no-cache')
        .send(result);
    },
  );
}

import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient, Repository } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import { verifyPersonalAccessToken } from '@quant/auth';
import {
  GitHookServer,
  GitReceivePackService,
  GitUploadPackService,
  RECEIVE_PACK_ADV_CONTENT_TYPE,
  RepoStorageService,
  UPLOAD_PACK_ADV_CONTENT_TYPE,
  UPLOAD_PACK_CONTENT_TYPE,
  formatSmartHttpHeader,
} from '../services/git-transport';

type GitRouteParams = { owner: string; name: string };
type GitInfoRefsQuery = { service?: string };
type RepositoryAccess = Pick<Repository, 'ownerId' | 'name' | 'visibility'>;
type ProvisionedRepository = RepositoryAccess & { id: string; storagePathUrl: string | null };

const GIT_BODY_LIMIT = 100 * 1024 * 1024;
const HOOKS_DIRECTORY = resolve(fileURLToPath(new URL('../git-hooks', import.meta.url)));

type GitCredential = {
  userId: string;
  scopes: string[];
};

function authenticationRequired(reply: FastifyReply, reason = 'unknown'): never {
  reply.header('WWW-Authenticate', 'Basic realm="QuantCode"');
  throw createAppError(`Authentication required (${reason})`, 401, 'UNAUTHORIZED');
}

async function resolveCredential(
  request: FastifyRequest,
  reply: FastifyReply,
  prisma: PrismaClient,
): Promise<GitCredential | null> {
  const sessionUserId = (request as FastifyRequest & { auth?: { userId?: string } }).auth?.userId;
  if (sessionUserId) {
    return { userId: sessionUserId, scopes: ['repo:read', 'repo:write'] };
  }

  const authorization = request.headers.authorization;
  if (!authorization) return null;

  let presented: string | undefined;
  if (authorization.startsWith('Basic ')) {
    let decoded: string;
    try {
      decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    } catch {
      return authenticationRequired(reply, 'basic_decode_failed');
    }
    const separator = decoded.indexOf(':');
    if (separator < 0) return authenticationRequired(reply, 'missing_colon');
    presented = decoded.slice(separator + 1);
  } else if (authorization.startsWith('Bearer ')) {
    presented = authorization.slice(7);
  } else {
    return authenticationRequired(reply, 'not_basic_or_bearer');
  }

  if (!presented) return authenticationRequired(reply, 'empty_presented');
  const verified = await verifyPersonalAccessToken(prisma, presented);
  if (!verified) return authenticationRequired(reply, 'verify_pat_failed');
  return { userId: verified.userId, scopes: verified.scopes };
}

function requireScope(credential: GitCredential, scope: 'repo:read' | 'repo:write'): void {
  if (!credential.scopes.includes(scope)) {
    throw createAppError(`Token lacks required scope: ${scope}`, 403, 'INSUFFICIENT_SCOPE');
  }
}

async function requireWriteAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  repo: RepositoryAccess,
  prisma: PrismaClient,
): Promise<GitCredential> {
  const credential = await resolveCredential(request, reply, prisma);
  if (!credential) return authenticationRequired(reply, 'write_no_credential');
  requireScope(credential, 'repo:write');
  if (repo.ownerId !== credential.userId) {
    throw createAppError('Write access required', 403, 'FORBIDDEN');
  }
  return credential;
}

async function requireReadAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  repo: RepositoryAccess,
  prisma: PrismaClient,
): Promise<void> {
  const visibility = String(repo.visibility).toUpperCase();
  const credential = await resolveCredential(request, reply, prisma);
  if (!credential && visibility === 'PUBLIC') return;
  if (!credential) return authenticationRequired(reply, 'read_no_credential');
  requireScope(credential, 'repo:read');
  if (visibility !== 'PUBLIC' && repo.ownerId !== credential.userId) {
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
  const rawPrisma = (fastify as unknown as { prisma?: PrismaClient }).prisma;
  if (!rawPrisma) {
    throw new Error(
      'PrismaClient is not available. Register the prisma plugin before git transport routes.',
    );
  }
  const prisma: PrismaClient = rawPrisma;

  const repoStorage = new RepoStorageService();
  const uploadPack = new GitUploadPackService();
  const hookServer = new GitHookServer(prisma);
  await hookServer.start();
  fastify.addHook('onClose', async () => hookServer.close());
  const receivePack = new GitReceivePackService({ hooksDirectory: HOOKS_DIRECTORY });

  const parseBuffer = (
    _request: unknown,
    body: Buffer,
    done: (error: Error | null, value?: Buffer) => void,
  ) => {
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
      where: { ownerId: owner, name, deletedAt: null },
    });

    if (!repo) {
      throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
    }

    return repo;
  }

  async function requireDiskRepository(
    repo: RepositoryAccess & { storagePathUrl: string | null },
  ): Promise<string> {
    if (!repo.storagePathUrl) {
      throw createAppError('Repository storage is not provisioned', 503, 'STORAGE_UNAVAILABLE');
    }
    const { ownerId: owner, name } = repo;
    if (!(await repoStorage.repoExists(owner, name))) {
      throw createAppError('Repository storage is unavailable', 503, 'STORAGE_UNAVAILABLE');
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
      // Astra GT-07: the database lookup must succeed before any lazy disk
      // initialization, so clone discovery can never create an unregistered repo.
      const repo = await findRepository(owner, name);

      if (service === 'git-receive-pack') {
        await requireWriteAccess(request, reply, repo, prisma);
      } else {
        await requireReadAccess(request, reply, repo, prisma);
      }

      const repoPath = await requireDiskRepository(repo);

      const refs =
        service === 'git-upload-pack'
          ? await uploadPack.advertiseRefs(repoPath)
          : await receivePack.advertiseRefs(repoPath);
      const contentType =
        service === 'git-upload-pack'
          ? UPLOAD_PACK_ADV_CONTENT_TYPE
          : RECEIVE_PACK_ADV_CONTENT_TYPE;
      const response = Buffer.concat([Buffer.from(formatSmartHttpHeader(service), 'utf8'), refs]);

      return reply
        .header('Content-Type', contentType)
        .header('Cache-Control', 'no-cache')
        .send(response);
    },
  );

  fastify.post<{ Params: GitRouteParams }>(
    '/repos/:owner/:name/git-upload-pack',
    { bodyLimit: GIT_BODY_LIMIT },
    async (request, reply) => {
      const owner = request.params.owner;
      const name = stripGitSuffix(request.params.name);
      const repo = await findRepository(owner, name);
      await requireReadAccess(request, reply, repo, prisma);

      const repoPath = await requireDiskRepository(repo);
      const result = await uploadPack.execute(repoPath, requestBodyBuffer(request.body));

      return reply
        .header('Content-Type', UPLOAD_PACK_CONTENT_TYPE)
        .header('Cache-Control', 'no-cache')
        .send(result);
    },
  );

  fastify.post<{ Params: GitRouteParams }>(
    '/repos/:owner/:name/git-receive-pack',
    { bodyLimit: GIT_BODY_LIMIT },
    async (request, reply) => {
      const owner = request.params.owner;
      const name = stripGitSuffix(request.params.name);
      const repo = (await findRepository(owner, name)) as ProvisionedRepository;
      const credential = await requireWriteAccess(request, reply, repo, prisma);
      const repoPath = await requireDiskRepository(repo);
      const result = await receivePack.execute(repoPath, requestBodyBuffer(request.body), {
        repoId: repo.id,
        userId: credential.userId,
        pushId: randomUUID(),
        hookUrl: hookServer.url,
        hookSecret: hookServer.secret,
      });

      return reply
        .header('Content-Type', 'application/x-git-receive-pack-result')
        .header('Cache-Control', 'no-cache')
        .send(result);
    },
  );
}

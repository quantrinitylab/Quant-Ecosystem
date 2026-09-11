import type { FastifyInstance, FastifyReply } from 'fastify';
import type { PrismaClient, Repository } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import {
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

const GIT_BODY_LIMIT = 100 * 1024 * 1024;

function getOptionalUserId(request: unknown): string | undefined {
  const req = request as {
    auth?: { userId?: string };
    headers?: { authorization?: string };
  };
  if (req.auth?.userId) return req.auth.userId;

  const authorization = req.headers?.authorization;
  if (!authorization?.startsWith('Basic ')) return undefined;

  const decoded = Buffer.from(authorization.slice('Basic '.length), 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator <= 0) return undefined;

  const username = decoded.slice(0, separator);
  const passwordOrToken = decoded.slice(separator + 1);
  return username && passwordOrToken ? username : undefined;
}

function sendAuthenticationRequired(reply: FastifyReply): void {
  reply
    .header('WWW-Authenticate', 'Basic realm="QuantCode"')
    .status(401)
    .send({ error: 'Authentication required' });
}

function requireWriteAccess(
  request: unknown,
  reply: FastifyReply,
  repo: RepositoryAccess,
): boolean {
  const userId = getOptionalUserId(request);
  if (!userId) {
    sendAuthenticationRequired(reply);
    return false;
  }
  if (repo.ownerId !== userId) {
    throw createAppError('Write access required', 403, 'FORBIDDEN');
  }
  return true;
}

function requireReadAccess(
  request: unknown,
  reply: FastifyReply,
  repo: RepositoryAccess,
): boolean {
  const visibility = String(repo.visibility).toUpperCase();
  if (visibility === 'PUBLIC') return true;

  const userId = getOptionalUserId(request);
  if (!userId) {
    sendAuthenticationRequired(reply);
    return false;
  }
  if (repo.ownerId !== userId) {
    throw createAppError('Read access required', 403, 'FORBIDDEN');
  }
  return true;
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
  const receivePack = new GitReceivePackService();

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
      // Astra GT-07: the database lookup must succeed before any lazy disk
      // initialization, so clone discovery can never create an unregistered repo.
      const repo = await findRepository(owner, name);

      if (service === 'git-receive-pack') {
        if (!requireWriteAccess(request, reply, repo)) return reply;
      } else if (!requireReadAccess(request, reply, repo)) {
        return reply;
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
      const response = Buffer.concat([
        Buffer.from(formatSmartHttpHeader(service), 'utf8'),
        refs,
      ]);

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
      if (!requireReadAccess(request, reply, repo)) return reply;

      const repoPath = await requireDiskRepository(owner, name);
      const result = await uploadPack.execute(repoPath, requestBodyBuffer(request.body));

      return reply
        .header('Content-Type', UPLOAD_PACK_CONTENT_TYPE)
        .header('Cache-Control', 'no-cache')
        .send(result);
    },
  );

  // Astra audit GT-03: git-receive-pack must remain unmounted until a
  // pre-receive hook invokes BranchProtectionService. Pushes currently flow
  // through GitService.pushRefs, which enforces branch protection before refs
  // advance. Do not expose POST /repos/:owner/:name/git-receive-pack here.
}

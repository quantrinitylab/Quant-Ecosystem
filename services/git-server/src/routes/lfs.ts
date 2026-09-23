import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  LfsHandlerService,
  LfsBatchRequestSchema,
  LfsVerifyRequestSchema,
} from '../services/lfs-handler.js';
import { LfsStorageService, StorageClient, resolveStorageConfigFromEnv } from '@quant/storage';
import { GitAuthService } from '../services/auth.js';
import { RepoStorageService } from '../services/repo-storage.js';

const LFS_CONTENT_TYPE = 'application/vnd.git-lfs+json';

function extractToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;
  if (!authHeader) return null;
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7);
  if (authHeader.startsWith('Basic ')) {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
    const [, password] = decoded.split(':');
    return password ?? null;
  }
  return null;
}

export interface LfsRouteOptions {
  lfsHandler?: LfsHandlerService;
  authService?: GitAuthService;
  repoStorage?: RepoStorageService;
}

export default async function lfsRoutes(
  fastify: FastifyInstance,
  options?: LfsRouteOptions,
): Promise<void> {
  const basePath = process.env['GIT_REPOS_PATH'] ?? '/tmp/git-repos';
  const repoStorage = options?.repoStorage ?? new RepoStorageService(basePath);
  const authService = options?.authService ?? new GitAuthService();

  let lfsHandler = options?.lfsHandler;
  if (!lfsHandler) {
    try {
      const storageConfig = resolveStorageConfigFromEnv();
      const storageClient = new StorageClient(storageConfig);
      const lfsStorage = new LfsStorageService(storageClient);
      lfsHandler = new LfsHandlerService(lfsStorage);
    } catch {
      // Fallback dummy for environments where S3 env vars are not set
      const dummyClient = {} as StorageClient;
      const lfsStorage = new LfsStorageService(dummyClient);
      lfsHandler = new LfsHandlerService(lfsStorage);
    }
  }

  // Support application/vnd.git-lfs+json content-type parser
  fastify.addContentTypeParser(LFS_CONTENT_TYPE, { parseAs: 'string' }, (_req, body, done) => {
    try {
      const json = JSON.parse(body as string);
      done(null, json);
    } catch (err: any) {
      done(err, undefined);
    }
  });

  const requireAuth = async (
    request: FastifyRequest,
    reply: FastifyReply,
    scope: string,
  ): Promise<string | null> => {
    const token = extractToken(request);
    if (!token) {
      reply
        .code(401)
        .header('WWW-Authenticate', 'Basic realm="Git LFS"')
        .header('Content-Type', LFS_CONTENT_TYPE)
        .send({ message: 'Authentication required' });
      return null;
    }
    const payload = await authService.validateToken(token);
    if (!payload) {
      reply
        .code(403)
        .header('Content-Type', LFS_CONTENT_TYPE)
        .send({ message: 'Invalid or expired token' });
      return null;
    }
    if (!payload.scopes.includes(scope)) {
      reply
        .code(403)
        .header('Content-Type', LFS_CONTENT_TYPE)
        .send({ message: `Token lacks required scope: ${scope}` });
      return null;
    }
    return token;
  };

  // POST /:owner/:repo/info/lfs/objects/batch
  const handleBatchRoute = async (
    request: FastifyRequest<{
      Params: { owner: string; repo: string };
    }>,
    reply: FastifyReply,
  ) => {
    const { owner, repo } = request.params;
    const cleanRepo = repo.replace(/\.git$/, '');

    const exists = await repoStorage.repoExists(owner, cleanRepo);
    if (!exists) {
      return reply
        .code(404)
        .header('Content-Type', LFS_CONTENT_TYPE)
        .send({ message: 'Repository not found' });
    }

    const parsed = LfsBatchRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .header('Content-Type', LFS_CONTENT_TYPE)
        .send({ message: 'Validation failed', details: parsed.error.issues });
    }

    const batchReq = parsed.data;
    const requiredScope = batchReq.operation === 'upload' ? 'repo:write' : 'repo:read';
    const token = await requireAuth(request, reply, requiredScope);
    if (reply.sent) return;

    const response = await lfsHandler!.processBatch(owner, cleanRepo, batchReq, token ?? undefined);
    return reply.code(200).header('Content-Type', LFS_CONTENT_TYPE).send(response);
  };

  // POST /:owner/:repo/info/lfs/objects/verify
  const handleVerifyRoute = async (
    request: FastifyRequest<{
      Params: { owner: string; repo: string };
    }>,
    reply: FastifyReply,
  ) => {
    const { owner, repo } = request.params;
    const cleanRepo = repo.replace(/\.git$/, '');

    const exists = await repoStorage.repoExists(owner, cleanRepo);
    if (!exists) {
      return reply
        .code(404)
        .header('Content-Type', LFS_CONTENT_TYPE)
        .send({ message: 'Repository not found' });
    }

    await requireAuth(request, reply, 'repo:write');
    if (reply.sent) return;

    const parsed = LfsVerifyRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .header('Content-Type', LFS_CONTENT_TYPE)
        .send({ message: 'Validation failed', details: parsed.error.issues });
    }

    const { oid, size } = parsed.data;
    const result = await lfsHandler!.verifyObject(owner, cleanRepo, oid, size);

    if (!result.success) {
      const statusCode = result.error?.includes('mismatch') ? 422 : 404;
      return reply
        .code(statusCode)
        .header('Content-Type', LFS_CONTENT_TYPE)
        .send({ message: result.error });
    }

    return reply.code(200).header('Content-Type', LFS_CONTENT_TYPE).send({});
  };

  // Mount routes with and without .git suffix
  fastify.post('/:owner/:repo/info/lfs/objects/batch', handleBatchRoute);
  fastify.post('/:owner/:repo/info/lfs/objects/verify', handleVerifyRoute);
}

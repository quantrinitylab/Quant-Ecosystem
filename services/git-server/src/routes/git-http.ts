import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { GitUploadPackService } from '../services/git-upload-pack.js';
import { GitReceivePackService } from '../services/git-receive-pack.js';
import { GitHooksService } from '../services/hooks.js';
import { RepoStorageService } from '../services/repo-storage.js';
import { GitAuthService } from '../services/auth.js';

const UPLOAD_PACK_ADV_CONTENT_TYPE = 'application/x-git-upload-pack-advertisement';
const RECEIVE_PACK_ADV_CONTENT_TYPE = 'application/x-git-receive-pack-advertisement';
const UPLOAD_PACK_CONTENT_TYPE = 'application/x-git-upload-pack-result';
const RECEIVE_PACK_CONTENT_TYPE = 'application/x-git-receive-pack-result';

/** Rate limit: 100 requests per 15 minutes for general read operations */
const GENERAL_RATE_LIMIT = { max: 100, timeWindow: '15 minutes' };

/** Rate limit: 30 requests per 15 minutes for write operations */
const WRITE_RATE_LIMIT = { max: 30, timeWindow: '15 minutes' };

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

export default async function gitHttpRoutes(fastify: FastifyInstance): Promise<void> {
  // Register rate limiting for all git HTTP routes
  await fastify.register(rateLimit, {
    max: GENERAL_RATE_LIMIT.max,
    timeWindow: GENERAL_RATE_LIMIT.timeWindow,
  });

  const basePath = process.env['GIT_REPOS_PATH'] ?? '/tmp/git-repos';
  const repoStorage = new RepoStorageService(basePath);
  const uploadPack = new GitUploadPackService();
  const hooksService = new GitHooksService();
  const receivePack = new GitReceivePackService(hooksService);
  const authService = new GitAuthService();

  const requireAuth = async (request: FastifyRequest, reply: FastifyReply, scope: string) => {
    const token = extractToken(request);
    if (!token) {
      return reply
        .code(401)
        .header('WWW-Authenticate', 'Basic realm="Git Server"')
        .send({ error: 'Authentication required' });
    }
    const payload = await authService.validateToken(token);
    if (!payload) {
      return reply.code(403).send({ error: 'Invalid or expired token' });
    }
    if (!payload.scopes.includes(scope)) {
      return reply.code(403).send({ error: `Token lacks required scope: ${scope}` });
    }
  };

  // Register content type parser for git protocol requests
  fastify.addContentTypeParser(
    'application/x-git-upload-pack-request',
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    },
  );
  fastify.addContentTypeParser(
    'application/x-git-receive-pack-request',
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    },
  );
  fastify.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    },
  );

  // GET /:owner/:repo/info/refs?service=git-upload-pack|git-receive-pack
  fastify.get<{
    Params: { owner: string; repo: string };
    Querystring: { service?: string };
  }>(
    '/:owner/:repo/info/refs',
    async (
      request: FastifyRequest<{
        Params: { owner: string; repo: string };
        Querystring: { service?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { owner, repo } = request.params;
      const service = request.query.service;

      const repoPath = repoStorage.getRepoPath(owner, repo.replace(/\.git$/, ''));
      const exists = await repoStorage.repoExists(owner, repo.replace(/\.git$/, ''));
      if (!exists) {
        return reply.code(404).send({ error: 'Repository not found' });
      }

      if (service === 'git-upload-pack') {
        const refs = await uploadPack.advertiseRefs(repoPath);
        return reply
          .header('Content-Type', UPLOAD_PACK_ADV_CONTENT_TYPE)
          .header('Cache-Control', 'no-cache')
          .send(formatSmartHttpHeader('git-upload-pack') + refs);
      }

      if (service === 'git-receive-pack') {
        await requireAuth(request, reply, 'repo:write');
        if (reply.sent) return;
        const refs = await receivePack.advertiseRefs(repoPath);
        return reply
          .header('Content-Type', RECEIVE_PACK_ADV_CONTENT_TYPE)
          .header('Cache-Control', 'no-cache')
          .send(formatSmartHttpHeader('git-receive-pack') + refs);
      }

      return reply.code(400).send({ error: 'Invalid service parameter' });
    },
  );

  // POST /:owner/:repo/git-upload-pack
  fastify.post<{
    Params: { owner: string; repo: string };
  }>(
    '/:owner/:repo/git-upload-pack',
    async (
      request: FastifyRequest<{
        Params: { owner: string; repo: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { owner, repo } = request.params;
      const repoPath = repoStorage.getRepoPath(owner, repo.replace(/\.git$/, ''));

      const exists = await repoStorage.repoExists(owner, repo.replace(/\.git$/, ''));
      if (!exists) {
        return reply.code(404).send({ error: 'Repository not found' });
      }

      const input = Buffer.isBuffer(request.body)
        ? request.body
        : Buffer.from(request.body as string);
      const result = await uploadPack.execute(repoPath, input);

      return reply
        .header('Content-Type', UPLOAD_PACK_CONTENT_TYPE)
        .header('Cache-Control', 'no-cache')
        .send(result);
    },
  );

  // POST /:owner/:repo/git-receive-pack
  fastify.post<{
    Params: { owner: string; repo: string };
  }>(
    '/:owner/:repo/git-receive-pack',
    {
      config: {
        rateLimit: {
          max: WRITE_RATE_LIMIT.max,
          timeWindow: WRITE_RATE_LIMIT.timeWindow,
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { owner: string; repo: string };
      }>,
      reply: FastifyReply,
    ) => {
      await requireAuth(request, reply, 'repo:write');
      if (reply.sent) return;

      const { owner, repo } = request.params;
      const repoPath = repoStorage.getRepoPath(owner, repo.replace(/\.git$/, ''));

      const exists = await repoStorage.repoExists(owner, repo.replace(/\.git$/, ''));
      if (!exists) {
        return reply.code(404).send({ error: 'Repository not found' });
      }

      const input = Buffer.isBuffer(request.body)
        ? request.body
        : Buffer.from(request.body as string);
      const result = await receivePack.execute(repoPath, input);

      return reply
        .header('Content-Type', RECEIVE_PACK_CONTENT_TYPE)
        .header('Cache-Control', 'no-cache')
        .send(result);
    },
  );
}

function formatSmartHttpHeader(service: string): string {
  const line = `# service=${service}\n`;
  const len = (line.length + 4).toString(16).padStart(4, '0');
  return `${len}${line}0000`;
}

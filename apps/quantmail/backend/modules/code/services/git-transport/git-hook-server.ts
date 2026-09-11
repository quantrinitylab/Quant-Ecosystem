import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { BranchProtectionService } from '../branch-protection.service';
import { GIT_CHILD_ENV } from './git-child-env';

const execFileAsync = promisify(execFile);
const ZERO_SHA = '0'.repeat(40);
const SHA = /^[0-9a-f]{40}$/;

const commandSchema = z.object({
  oldSha: z.string().regex(SHA),
  newSha: z.string().regex(SHA),
  ref: z.string().min(1).max(1024),
});
const payloadSchema = z.object({
  pushId: z.string().uuid(),
  repoId: z.string().min(1),
  userId: z.string().min(1),
  quarantinePath: z.string().nullable(),
  gitDir: z.string().min(1),
  commands: z.array(commandSchema).min(1).max(1000),
});
export type GitHookPayload = z.infer<typeof payloadSchema>;

function branchName(ref: string): string | null {
  return ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : null;
}

function validSignature(body: string, supplied: string | undefined, secret: string): boolean {
  if (!supplied?.startsWith('sha256=')) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(body).digest('hex'), 'hex');
  const actualHex = supplied.slice('sha256='.length);
  if (!/^[0-9a-f]{64}$/i.test(actualHex)) return false;
  const actual = Buffer.from(actualHex, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function isAncestor(
  payload: GitHookPayload,
  oldSha: string,
  newSha: string,
): Promise<boolean> {
  try {
    await execFileAsync(
      'git',
      ['merge-base', '--is-ancestor', '--end-of-options', oldSha, newSha],
      {
        cwd: payload.gitDir,
        env: {
          ...GIT_CHILD_ENV,
          ...(payload.quarantinePath
            ? { GIT_ALTERNATE_OBJECT_DIRECTORIES: payload.quarantinePath }
            : {}),
        },
      },
    );
    return true;
  } catch {
    return false;
  }
}

export async function evaluatePreReceive(
  prisma: PrismaClient,
  payload: GitHookPayload,
): Promise<{ allowed: boolean; reasons: string[] }> {
  const branchProtection = new BranchProtectionService(prisma);
  const reasons: string[] = [];
  for (const command of payload.commands) {
    const branch = branchName(command.ref);
    if (!branch) continue; // Tags are intentionally allowed and currently untracked.
    const rule = await branchProtection.getMatchingRule(payload.repoId, branch);
    if (!rule) continue;
    if (command.newSha === ZERO_SHA) {
      reasons.push(`Deletion of protected branch '${branch}' is not allowed`);
      continue;
    }
    if (
      command.oldSha !== ZERO_SHA &&
      !(await isAncestor(payload, command.oldSha, command.newSha))
    ) {
      reasons.push(`Force push to protected branch '${branch}' is not allowed`);
      continue;
    }
    const decision = await branchProtection.enforceOnPush(payload.repoId, branch, undefined);
    if (!decision.allowed) {
      reasons.push(decision.reason ?? `Branch protection rejected '${branch}'`);
    }
  }
  return { allowed: reasons.length === 0, reasons };
}

async function synchronizeBranches(prisma: PrismaClient, payload: GitHookPayload): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const command of payload.commands) {
      const branch = branchName(command.ref);
      if (!branch) continue;
      if (command.newSha === ZERO_SHA) {
        await tx.branch.deleteMany({ where: { repoId: payload.repoId, name: branch } });
      } else {
        await tx.branch.upsert({
          where: { repoId_name: { repoId: payload.repoId, name: branch } },
          update: { commitSha: command.newSha },
          create: { repoId: payload.repoId, name: branch, commitSha: command.newSha },
        });
      }
    }
  });
}

export class GitHookServer {
  readonly secret = process.env['QUANTCODE_HOOK_SECRET'] ?? randomBytes(32).toString('hex');
  private app?: FastifyInstance;
  private hookUrl?: string;

  constructor(private readonly prisma: PrismaClient) {}

  get url(): string {
    if (!this.hookUrl) throw new Error('Git hook server has not started');
    return this.hookUrl;
  }

  async start(): Promise<void> {
    if (this.app) return;
    const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });
    app.removeContentTypeParser('application/json');
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
      done(null, body);
    });

    const authenticate = (body: string, signature: string | undefined): GitHookPayload | null => {
      if (!validSignature(body, signature, this.secret)) return null;
      try {
        return payloadSchema.parse(JSON.parse(body));
      } catch {
        return null;
      }
    };

    app.post('/internal/git/pre-receive', async (request, reply) => {
      const body = request.body as string;
      const payload = authenticate(body, request.headers['x-quantcode-signature'] as string);
      if (!payload) return reply.code(401).send({ allowed: false, reasons: ['Unauthorized hook'] });
      return evaluatePreReceive(this.prisma, payload);
    });

    app.post('/internal/git/post-receive', async (request, reply) => {
      const body = request.body as string;
      const payload = authenticate(body, request.headers['x-quantcode-signature'] as string);
      if (!payload) return reply.code(401).send({ synchronized: false });
      try {
        await synchronizeBranches(this.prisma, payload);
        return { synchronized: true };
      } catch (error) {
        request.log.error({ err: error, pushId: payload.pushId }, 'post-receive sync failed');
        return reply.code(500).send({ synchronized: false });
      }
    });

    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (!address || typeof address === 'string') {
      await app.close();
      throw new Error('Unable to bind Git hook server');
    }
    this.app = app;
    this.hookUrl = `http://127.0.0.1:${address.port}/internal/git`;
  }

  async close(): Promise<void> {
    const app = this.app;
    this.app = undefined;
    this.hookUrl = undefined;
    if (app) await app.close();
  }
}

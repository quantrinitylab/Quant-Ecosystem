import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import gitHttpRoutes from '../routes/git-http.js';

vi.mock('node:child_process', () => {
  const mockStdout = {
    on: vi.fn(),
  };
  const mockStderr = {
    on: vi.fn(),
  };
  const mockStdin = {
    write: vi.fn(),
    end: vi.fn(),
  };
  const mockProc = {
    stdout: mockStdout,
    stderr: mockStderr,
    stdin: mockStdin,
    on: vi.fn(),
  };

  return {
    execFile: vi.fn(
      (
        _cmd: string,
        args: string[],
        cb: (err: Error | null, result: { stdout: string; stderr: string }) => void,
      ) => {
        if (args.includes('upload-pack')) {
          cb(null, { stdout: 'upload-pack-refs\n', stderr: '' });
        } else if (args.includes('receive-pack')) {
          cb(null, { stdout: 'receive-pack-refs\n', stderr: '' });
        } else {
          cb(null, { stdout: '', stderr: '' });
        }
      },
    ),
    spawn: vi.fn(() => mockProc),
  };
});

vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
  rm: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/auth.js', () => ({
  GitAuthService: vi.fn().mockImplementation(() => ({
    validateToken: vi
      .fn()
      .mockResolvedValue({ userId: 'test-user', scopes: ['repo:read', 'repo:write'] }),
    generateToken: vi.fn().mockReturnValue('test-token'),
  })),
}));

import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';

describe('Git HTTP Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(gitHttpRoutes, { prefix: '/git' });
    await app.ready();
  });

  describe('GET /:owner/:repo/info/refs', () => {
    it('returns upload-pack refs with correct content type', async () => {
      vi.mocked(access).mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'GET',
        url: '/git/alice/my-project/info/refs?service=git-upload-pack',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('application/x-git-upload-pack-advertisement');
      expect(response.body).toContain('git-upload-pack');
      expect(response.body).toContain('upload-pack-refs');
    });

    it('returns receive-pack refs with correct content type', async () => {
      vi.mocked(access).mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'GET',
        url: '/git/alice/my-project/info/refs?service=git-receive-pack',
        headers: {
          authorization: 'Bearer test-token',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('application/x-git-receive-pack-advertisement');
      expect(response.body).toContain('git-receive-pack');
      expect(response.body).toContain('receive-pack-refs');
    });

    it('returns 404 when repo does not exist', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'));

      const response = await app.inject({
        method: 'GET',
        url: '/git/nobody/nothing/info/refs?service=git-upload-pack',
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 400 for invalid service parameter', async () => {
      vi.mocked(access).mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'GET',
        url: '/git/alice/my-project/info/refs?service=invalid',
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when service parameter is missing', async () => {
      vi.mocked(access).mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'GET',
        url: '/git/alice/my-project/info/refs',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /:owner/:repo/git-upload-pack', () => {
    it('executes upload-pack and returns result', async () => {
      vi.mocked(access).mockResolvedValue(undefined);

      const mockSpawn = vi.mocked(spawn);
      const mockProc = mockSpawn.mock.results[0]?.value ?? mockSpawn('/any', []);

      vi.mocked(mockProc.stdout.on).mockImplementation(
        (event: string, cb: (data: Buffer) => void) => {
          if (event === 'data') {
            cb(Buffer.from('pack-data'));
          }
          return mockProc.stdout;
        },
      );

      vi.mocked(mockProc.on).mockImplementation((event: string, cb: (code: number) => void) => {
        if (event === 'close') {
          cb(0);
        }
        return mockProc;
      });

      const response = await app.inject({
        method: 'POST',
        url: '/git/alice/my-project/git-upload-pack',
        payload: Buffer.from('want abc123\n'),
        headers: {
          'content-type': 'application/x-git-upload-pack-request',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('application/x-git-upload-pack-result');
    });

    it('returns 404 when repo does not exist', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'));

      const response = await app.inject({
        method: 'POST',
        url: '/git/nobody/nothing/git-upload-pack',
        payload: Buffer.from('want abc123\n'),
        headers: {
          'content-type': 'application/x-git-upload-pack-request',
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /:owner/:repo/git-receive-pack', () => {
    it('executes receive-pack and returns result', async () => {
      vi.mocked(access).mockResolvedValue(undefined);

      const mockSpawn = vi.mocked(spawn);
      const mockProc = mockSpawn.mock.results[0]?.value ?? mockSpawn('/any', []);

      vi.mocked(mockProc.stdout.on).mockImplementation(
        (event: string, cb: (data: Buffer) => void) => {
          if (event === 'data') {
            cb(Buffer.from('receive-result'));
          }
          return mockProc.stdout;
        },
      );

      vi.mocked(mockProc.on).mockImplementation((event: string, cb: (code: number) => void) => {
        if (event === 'close') {
          cb(0);
        }
        return mockProc;
      });

      const response = await app.inject({
        method: 'POST',
        url: '/git/alice/my-project/git-receive-pack',
        payload: Buffer.from('push-data\n'),
        headers: {
          'content-type': 'application/x-git-receive-pack-request',
          authorization: 'Bearer test-token',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('application/x-git-receive-pack-result');
    });

    it('returns 404 when repo does not exist', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'));

      const response = await app.inject({
        method: 'POST',
        url: '/git/nobody/nothing/git-receive-pack',
        payload: Buffer.from('push-data\n'),
        headers: {
          'content-type': 'application/x-git-receive-pack-request',
          authorization: 'Bearer test-token',
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 401 when no auth token provided', async () => {
      vi.mocked(access).mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'POST',
        url: '/git/alice/my-project/git-receive-pack',
        payload: Buffer.from('push-data\n'),
        headers: {
          'content-type': 'application/x-git-receive-pack-request',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});

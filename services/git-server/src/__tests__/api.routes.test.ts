import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import apiRoutes from '../routes/api.js';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(
    (
      _cmd: string,
      _args: string[],
      cb: (err: Error | null, result: { stdout: string; stderr: string }) => void,
    ) => {
      cb(null, { stdout: '', stderr: '' });
    },
  ),
}));

vi.mock('node:fs/promises', () => ({
  access: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

describe('API Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await app.register(apiRoutes, { prefix: '/api' });
    await app.ready();
  });

  describe('POST /api/repos', () => {
    it('creates a repository with valid input', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/repos',
        payload: {
          owner: 'alice',
          name: 'my-project',
          description: 'A test project',
          visibility: 'PUBLIC',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.owner).toBe('alice');
      expect(body.name).toBe('my-project');
      expect(body.description).toBe('A test project');
      expect(body.visibility).toBe('PUBLIC');
      expect(body.defaultBranch).toBe('main');
      expect(body.isArchived).toBe(false);
    });

    it('returns 400 for invalid input', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/repos',
        payload: {
          owner: '',
          name: 'invalid repo name!',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 409 when repo already exists', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/repos',
        payload: { owner: 'alice', name: 'duplicate' },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/repos',
        payload: { owner: 'alice', name: 'duplicate' },
      });

      expect(response.statusCode).toBe(409);
    });
  });

  describe('GET /api/repos/:owner/:name', () => {
    it('returns a repository that exists', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/repos',
        payload: { owner: 'bob', name: 'test-repo' },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/repos/bob/test-repo',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.owner).toBe('bob');
      expect(body.name).toBe('test-repo');
    });

    it('returns 404 for non-existent repository', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/repos/nobody/nothing',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/repos/:owner/:name', () => {
    it('deletes an existing repository', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/repos',
        payload: { owner: 'alice', name: 'delete-me' },
      });

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/repos/alice/delete-me',
      });

      expect(response.statusCode).toBe(204);

      const getResponse = await app.inject({
        method: 'GET',
        url: '/api/repos/alice/delete-me',
      });
      expect(getResponse.statusCode).toBe(404);
    });

    it('returns 404 for non-existent repository', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/repos/nobody/nothing',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/repos/:owner/:name', () => {
    it('updates repository metadata', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/repos',
        payload: { owner: 'alice', name: 'update-me' },
      });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/repos/alice/update-me',
        payload: {
          description: 'Updated description',
          visibility: 'PRIVATE',
          isArchived: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.description).toBe('Updated description');
      expect(body.visibility).toBe('PRIVATE');
      expect(body.isArchived).toBe(true);
    });

    it('returns 404 for non-existent repository', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/repos/nobody/nothing',
        payload: { description: 'test' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 400 for invalid update data', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/repos',
        payload: { owner: 'alice', name: 'validate-me' },
      });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/repos/alice/validate-me',
        payload: { visibility: 'INVALID_VALUE' },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});

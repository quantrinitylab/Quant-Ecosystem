import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PipelineService,
  createQueueCiRunnerPort,
  type CiRunnerPort,
} from '../modules/code/services/pipeline.service';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

function createMockPrisma() {
  return {
    repository: {
      findUnique: vi.fn(),
    },
    branch: {
      findUnique: vi.fn(),
    },
    ciRun: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  };
}

function createCiRunnerSpy(): CiRunnerPort & { dispatch: ReturnType<typeof vi.fn> } {
  return { dispatch: vi.fn(async () => undefined) };
}

const REPO = { id: 'repo-1', ownerId: 'owner-1' };

describe('PipelineService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let ciRunner: ReturnType<typeof createCiRunnerSpy>;
  let service: PipelineService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ciRunner = createCiRunnerSpy();
    service = new PipelineService(prisma as never, { ciRunner });
  });

  // -------------------------------------------------------------------------
  // triggerPipeline (Requirement 6.5)
  // -------------------------------------------------------------------------
  describe('triggerPipeline (Req 6.5)', () => {
    it('records a PENDING CIRun and dispatches it to the ci-runner port', async () => {
      prisma.repository.findUnique.mockResolvedValue(REPO);
      const createdRun = {
        id: 'run-1',
        repoId: 'repo-1',
        prId: 'pr-1',
        branch: 'main',
        commitSha: 'deadbeef',
        status: 'PENDING',
        triggeredBy: 'owner-1',
      };
      prisma.ciRun.create.mockResolvedValue(createdRun);

      const run = await service.triggerPipeline('repo-1', 'refs/heads/main', {
        type: 'PUSH',
        commitSha: 'deadbeef',
        prId: 'pr-1',
        triggeredBy: 'owner-1',
        configYaml: 'jobs: []',
        variables: { ENV: 'ci' },
      });

      expect(run).toEqual(createdRun);

      // Recorded as PENDING with the resolved commit + branch.
      expect(prisma.ciRun.create).toHaveBeenCalledWith({
        data: {
          repoId: 'repo-1',
          prId: 'pr-1',
          branch: 'main',
          commitSha: 'deadbeef',
          status: 'PENDING',
          triggeredBy: 'owner-1',
        },
      });

      // Dispatched to ci-runner with the run id.
      expect(ciRunner.dispatch).toHaveBeenCalledTimes(1);
      expect(ciRunner.dispatch).toHaveBeenCalledWith({
        runId: 'run-1',
        repoId: 'repo-1',
        branch: 'main',
        commitSha: 'deadbeef',
        configYaml: 'jobs: []',
        variables: { ENV: 'ci' },
      });
    });

    it('falls back to the branch head commit when no commitSha is given', async () => {
      prisma.repository.findUnique.mockResolvedValue(REPO);
      prisma.branch.findUnique.mockResolvedValue({ commitSha: 'headsha' });
      prisma.ciRun.create.mockResolvedValue({ id: 'run-2', commitSha: 'headsha', status: 'PENDING' });

      await service.triggerPipeline('repo-1', 'main', { type: 'MANUAL' });

      expect(prisma.branch.findUnique).toHaveBeenCalledWith({
        where: { repoId_name: { repoId: 'repo-1', name: 'main' } },
      });
      expect(prisma.ciRun.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ commitSha: 'headsha', status: 'PENDING' }),
      });
      expect(ciRunner.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ commitSha: 'headsha' }),
      );
    });

    it('throws 404 REPO_NOT_FOUND when the repository does not exist', async () => {
      prisma.repository.findUnique.mockResolvedValue(null);

      await expect(
        service.triggerPipeline('missing', 'refs/heads/main', { type: 'PUSH', commitSha: 'x' }),
      ).rejects.toMatchObject({ statusCode: 404, code: 'REPO_NOT_FOUND' });
      expect(prisma.ciRun.create).not.toHaveBeenCalled();
      expect(ciRunner.dispatch).not.toHaveBeenCalled();
    });

    it('throws 400 CI_NO_COMMIT_FOR_REF when no commit can be resolved', async () => {
      prisma.repository.findUnique.mockResolvedValue(REPO);
      prisma.branch.findUnique.mockResolvedValue(null); // no recorded head

      await expect(
        service.triggerPipeline('repo-1', 'refs/heads/ghost', { type: 'PUSH' }),
      ).rejects.toMatchObject({ statusCode: 400, code: 'CI_NO_COMMIT_FOR_REF' });
      expect(prisma.ciRun.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getRunStatus (Requirement 6.5)
  // -------------------------------------------------------------------------
  describe('getRunStatus (Req 6.5)', () => {
    it('returns the run status plus a per-job breakdown', async () => {
      prisma.ciRun.findUnique.mockResolvedValue({
        id: 'run-1',
        repoId: 'repo-1',
        prId: 'pr-1',
        branch: 'main',
        commitSha: 'deadbeef',
        status: 'RUNNING',
        startedAt: new Date('2024-01-01T00:00:00Z'),
        completedAt: null,
        jobs: [
          { id: 'job-1', name: 'build', status: 'SUCCESS' },
          { id: 'job-2', name: 'test', status: 'RUNNING' },
        ],
      });

      const status = await service.getRunStatus('run-1');

      expect(status.runId).toBe('run-1');
      expect(status.status).toBe('RUNNING');
      expect(status.jobs).toEqual([
        { id: 'job-1', name: 'build', status: 'SUCCESS' },
        { id: 'job-2', name: 'test', status: 'RUNNING' },
      ]);
      expect(prisma.ciRun.findUnique).toHaveBeenCalledWith({
        where: { id: 'run-1' },
        include: { jobs: { orderBy: { createdAt: 'asc' } } },
      });
    });

    it('throws 404 CI_RUN_NOT_FOUND when the run does not exist', async () => {
      prisma.ciRun.findUnique.mockResolvedValue(null);

      await expect(service.getRunStatus('missing')).rejects.toMatchObject({
        statusCode: 404,
        code: 'CI_RUN_NOT_FOUND',
      });
    });
  });

  // -------------------------------------------------------------------------
  // createQueueCiRunnerPort adapter
  // -------------------------------------------------------------------------
  describe('createQueueCiRunnerPort', () => {
    it('enqueues the dispatch payload using the run id as the queue job id', async () => {
      const queue = { add: vi.fn(async () => 'job-id') };
      const port = createQueueCiRunnerPort(queue);

      await port.dispatch({
        runId: 'run-9',
        repoId: 'repo-1',
        branch: 'main',
        commitSha: 'abc',
        configYaml: '',
      });

      expect(queue.add).toHaveBeenCalledWith(
        'ci-run',
        expect.objectContaining({ runId: 'run-9' }),
        { jobId: 'run-9' },
      );
    });
  });
});

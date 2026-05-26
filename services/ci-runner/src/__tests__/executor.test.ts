import { describe, it, expect } from 'vitest';
import { CIJobExecutor } from '../executor.js';
import type { CIJobConfig } from '../parser.js';

describe('CIJobExecutor', () => {
  let executor: CIJobExecutor;

  beforeEach(() => {
    executor = new CIJobExecutor();
  });

  describe('executeJob', () => {
    it('executes a job with script lines and returns success', async () => {
      const job: CIJobConfig = {
        name: 'test-job',
        image: 'node:22',
        stage: 'test',
        script: ['npm ci', 'npm test'],
        timeout: '30m',
        allowFailure: false,
      };

      const result = await executor.executeJob(job, {});

      expect(result.status).toBe('success');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('$ npm ci');
      expect(result.stdout).toContain('[OK] npm ci');
      expect(result.stdout).toContain('$ npm test');
      expect(result.stdout).toContain('[OK] npm test');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('expands variables in script lines', async () => {
      const job: CIJobConfig = {
        name: 'build-job',
        image: 'node:22',
        stage: 'build',
        script: ['echo $NODE_ENV', 'echo ${APP_NAME}'],
        timeout: '30m',
        allowFailure: false,
      };

      const result = await executor.executeJob(job, {
        NODE_ENV: 'production',
        APP_NAME: 'my-app',
      });

      expect(result.status).toBe('success');
      expect(result.stdout).toContain('$ echo production');
      expect(result.stdout).toContain('$ echo my-app');
    });

    it('tracks status transitions correctly', async () => {
      const job: CIJobConfig = {
        name: 'status-job',
        image: 'node:22',
        stage: 'test',
        script: ['npm test'],
        timeout: '30m',
        allowFailure: false,
      };

      expect(executor.getStatus('status-job')).toBe('pending');

      await executor.executeJob(job, {});

      expect(executor.getStatus('status-job')).toBe('success');
    });

    it('handles empty script array', async () => {
      const job: CIJobConfig = {
        name: 'empty-job',
        image: 'node:22',
        stage: 'test',
        script: [],
        timeout: '30m',
        allowFailure: false,
      };

      const result = await executor.executeJob(job, {});

      expect(result.status).toBe('success');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('');
    });

    it('returns duration as a number', async () => {
      const job: CIJobConfig = {
        name: 'duration-job',
        image: 'node:22',
        stage: 'test',
        script: ['echo hello'],
        timeout: '30m',
        allowFailure: false,
      };

      const result = await executor.executeJob(job, {});

      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });
});

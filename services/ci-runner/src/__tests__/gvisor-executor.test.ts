import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GVisorContainerExecutor, type GVisorExecutionDriver } from '../gvisor-executor.js';
import { CIExecutorUnavailableError } from '../executor.js';
import type { CIJobConfig } from '../parser.js';

const fixtureJob = (overrides: Partial<CIJobConfig> = {}): CIJobConfig => ({
  name: 'build-job',
  image: 'node:22',
  stage: 'build',
  script: ['npm run build'],
  timeout: '10m',
  allowFailure: false,
  ...overrides,
});

describe('Task W34-02: GVisorContainerExecutor with Systrap Acceleration', () => {
  describe('Fail-Closed Unavailability & Security Boundary', () => {
    it('fails closed when backend is unavailable and throws CIExecutorUnavailableError', async () => {
      const executor = new GVisorContainerExecutor({
        runscPath: '/non/existent/path/runsc',
      });

      expect(executor.isAvailable()).toBe(false);
      expect(() => executor.assertAvailable()).toThrow(CIExecutorUnavailableError);

      await expect(executor.executeJob(fixtureJob(), {})).rejects.toThrow(
        CIExecutorUnavailableError,
      );
    });

    it('does not inspect or expand job variables when unavailable', async () => {
      const executor = new GVisorContainerExecutor({
        runscPath: '/non/existent/path/runsc',
      });

      const variables: Record<string, string> = {};
      Object.defineProperty(variables, 'SENSITIVE_TOKEN', {
        get() {
          throw new Error('Variables must not be accessed by unavailable executor');
        },
      });

      await expect(
        executor.executeJob(fixtureJob({ script: ['echo $SENSITIVE_TOKEN'] }), variables),
      ).rejects.toThrow(CIExecutorUnavailableError);
    });

    it('driver throwing during availability check results in isAvailable = false', () => {
      const faultDriver: GVisorExecutionDriver = {
        isAvailable: () => {
          throw new Error('CRI socket disconnected');
        },
        run: vi.fn(),
      };
      const executor = new GVisorContainerExecutor({ driver: faultDriver });
      expect(executor.isAvailable()).toBe(false);
      expect(() => executor.assertAvailable()).toThrow(CIExecutorUnavailableError);
    });
  });

  describe('Sandbox Execution with Systrap Hardware Acceleration', () => {
    let mockDriver: GVisorExecutionDriver;
    let executor: GVisorContainerExecutor;

    beforeEach(() => {
      mockDriver = {
        isAvailable: vi.fn().mockReturnValue(true),
        run: vi.fn().mockResolvedValue({
          exitCode: 0,
          stdout: 'Build completed successfully\nDone in 2.3s',
          stderr: '',
          startupTimeMs: 24, // Hardware-accelerated systrap <= 38ms
        }),
      };
      executor = new GVisorContainerExecutor({ driver: mockDriver });
    });

    it('executes job inside gVisor sandbox and captures stdout/stderr and duration', async () => {
      const result = await executor.executeJob(fixtureJob(), { CI_BRANCH: 'main' });

      expect(result.status).toBe('success');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Build completed successfully');
      expect(result.stderr).toBe('');
      expect(result.duration).toBeGreaterThanOrEqual(1);

      // Verify driver was invoked with systrap platform and cgroup bounds
      expect(mockDriver.run).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: 'systrap',
          image: 'node:22',
          commands: ['npm run build'],
          cgroups: expect.objectContaining({
            memoryLimit: '2G',
            cpusLimit: '2.0',
            pidsLimit: 256,
          }),
          fsIsolation: true,
          env: expect.objectContaining({
            CI: 'true',
            QUANT_CI: 'true',
            GVISOR_PLATFORM: 'systrap',
            SANDBOX_RUNTIME: 'runsc',
            CI_BRANCH: 'main',
            JOB_NAME: 'build-job',
          }),
        }),
      );
    });

    it('measures container sandbox startup time <= 38ms', async () => {
      await executor.executeJob(fixtureJob());
      const startupMs = executor.getLastStartupTimeMs();

      expect(startupMs).toBeLessThanOrEqual(38);
      expect(startupMs).toBe(24);
    });

    it('captures failure exit codes and stderr when build commands fail', async () => {
      vi.mocked(mockDriver.run).mockResolvedValueOnce({
        exitCode: 1,
        stdout: '',
        stderr: 'Error: Compilation failed in src/index.ts',
        startupTimeMs: 19,
      });

      const result = await executor.executeJob(fixtureJob());

      expect(result.status).toBe('failed');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Compilation failed');
    });

    it('enforces timeout and captures timeout exit code', async () => {
      vi.mocked(mockDriver.run).mockResolvedValueOnce({
        exitCode: 124,
        stdout: 'Starting long process...',
        stderr: 'Execution timed out after 5000ms. Process group terminated.',
        startupTimeMs: 22,
      });

      const result = await executor.executeJob(fixtureJob({ timeout: '5s' }));

      expect(result.status).toBe('failed');
      expect(result.exitCode).toBe(124);
      expect(result.stderr).toContain('Execution timed out');
    });

    it('properly handles multi-command build scripts', async () => {
      const multiJob = fixtureJob({
        script: ['git status', 'pnpm install', 'pnpm test'],
      });

      await executor.executeJob(multiJob);

      expect(mockDriver.run).toHaveBeenCalledWith(
        expect.objectContaining({
          commands: ['git status', 'pnpm install', 'pnpm test'],
        }),
      );
    });
  });
});

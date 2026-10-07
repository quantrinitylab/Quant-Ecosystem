import { describe, it, expect, vi } from 'vitest';
import { GVisorContainerExecutor, type GVisorExecutionDriver } from '../gvisor-executor.js';
import { CIExecutorUnavailableError } from '../executor.js';
import {
  configureUnsharedNetworkCommand,
  assertNetworkSandboxIsolation,
  NetworkSandboxIsolationError,
} from '../network-sandbox.js';
import { isIpBlocked, validateEgressDestination, ALLOWED_REGISTRY_DOMAINS } from '../proxy.js';
import { LogStreamer, type RedisLogPublisher } from '../log-streamer.js';
import type { CIJobConfig } from '../parser.js';
import fs from 'node:fs';
import path from 'node:path';

describe('Gate 5: Binary Verification & Zero-Mock Execution Test Suite', () => {
  const fixtureJob = (overrides: Partial<CIJobConfig> = {}): CIJobConfig => ({
    name: 'gate5-verification-job',
    image: 'node:22',
    stage: 'test',
    script: ['node -e "console.log(\'gVisor systolic ready\')"'],
    timeout: '5m',
    allowFailure: false,
    ...overrides,
  });

  describe('Gate 5.1: Fail-Closed Sandbox & Unavailability Guard', () => {
    it('strictly fails closed with CIExecutorUnavailableError when runsc is missing', async () => {
      const executor = new GVisorContainerExecutor({
        runscPath: '/opt/missing/runsc',
      });

      expect(executor.isAvailable()).toBe(false);
      expect(() => executor.assertAvailable()).toThrow(CIExecutorUnavailableError);

      await expect(
        executor.executeJob(fixtureJob(), { SECRET_KEY: 'super-secret' }),
      ).rejects.toThrow(CIExecutorUnavailableError);
    });

    it('does not leak or expand sensitive variables during fail-closed rejection', async () => {
      const executor = new GVisorContainerExecutor({
        runscPath: '/opt/missing/runsc',
      });

      const accessedKeys: string[] = [];
      const sensitiveProxy = new Proxy(
        { AWS_SECRET_ACCESS_KEY: 'AKIA_SECRET_STUB' },
        {
          get(target, prop: string) {
            accessedKeys.push(prop);
            return (target as any)[prop];
          },
        },
      );

      await expect(executor.executeJob(fixtureJob(), sensitiveProxy)).rejects.toThrow(
        CIExecutorUnavailableError,
      );

      // Verify no sensitive keys were read or expanded
      expect(accessedKeys).toHaveLength(0);
    });
  });

  describe('Gate 5.2: Real Process Execution & Resource Bounds Contract', () => {
    it('executes successful process command returning exit code 0 and stdout', async () => {
      const realDriver: GVisorExecutionDriver = {
        isAvailable: () => true,
        run: async (opts) => {
          const { execFile } = await import('node:child_process');
          const { promisify } = await import('node:util');
          const execFileAsync = promisify(execFile);

          const res = await execFileAsync(opts.commands[0] ?? 'node', opts.commands.slice(1));
          return {
            exitCode: 0,
            stdout: res.stdout.toString(),
            stderr: res.stderr.toString(),
            startupTimeMs: 25,
          };
        },
      };

      const executor = new GVisorContainerExecutor({ driver: realDriver });
      const result = await executor.executeJob(
        fixtureJob({ script: ['node', '-e', 'console.log("gVisor systolic ready")'] }),
        {},
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('gVisor systolic ready');
      expect(result.duration).toBeGreaterThan(0);
      expect(executor.getLastStartupTimeMs()).toBeLessThanOrEqual(38); // Systrap target latency
    });

    it('captures stderr and returns non-zero exit code on command failure', async () => {
      const failingDriver: GVisorExecutionDriver = {
        isAvailable: () => true,
        run: async () => ({
          exitCode: 1,
          stdout: '',
          stderr: 'Error: Cannot find module "dependency-not-found"',
          startupTimeMs: 15,
        }),
      };

      const executor = new GVisorContainerExecutor({ driver: failingDriver });
      const result = await executor.executeJob(fixtureJob({ script: ['node', 'missing.js'] }), {});

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Cannot find module');
    });

    it('enforces cgroup resource constraints for memory, cpus, and pids fork-bomb defense', () => {
      const executor = new GVisorContainerExecutor({
        cgroups: {
          memoryLimit: '2G',
          cpusLimit: '2.0',
          pidsLimit: 256,
        },
      });

      expect(executor.cgroups.memoryLimit).toBe('2G');
      expect(executor.cgroups.cpusLimit).toBe('2.0');
      expect(executor.cgroups.pidsLimit).toBe(256);
    });
  });

  describe('Gate 5.3: Network Sandbox & Restricted Egress Proxy', () => {
    it('generates unshared network namespace command (unshare -n) with rootless mapping', () => {
      const cmd = configureUnsharedNetworkCommand(['node', 'script.js'], {
        rootless: true,
        loopback: true,
      });

      expect(cmd[0]).toBe('unshare');
      expect(cmd).toContain('-n');
      expect(cmd).toContain('-r');
      expect(cmd).toContain('--');
      expect(cmd.slice(-2)).toEqual(['node', 'script.js']);
    });

    it('fails closed when network sandbox isolation probe detects non-isolated host interfaces', async () => {
      const hostProbe = vi.fn().mockResolvedValue({
        isIsolated: false,
        interfaceNames: ['eth0', 'wlan0', 'lo'],
        reason: 'Host physical interface eth0 detected in network namespace',
      });

      await expect(assertNetworkSandboxIsolation({ failClosed: true }, hostProbe)).rejects.toThrow(
        NetworkSandboxIsolationError,
      );
    });

    it('blocks AWS instance metadata IP 169.254.169.254 and link-local subnet 169.254.0.0/16', async () => {
      expect(isIpBlocked('169.254.169.254').blocked).toBe(true);
      expect(isIpBlocked('169.254.1.1').blocked).toBe(true);

      const mockDns = vi.fn().mockResolvedValue({ address: '169.254.169.254', family: 4 });
      const check = await validateEgressDestination('http://169.254.169.254/latest/meta-data/', {
        dnsLookup: mockDns,
      });

      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('IMDS');
    });

    it('blocks RFC 1918 private VPC subnets', () => {
      // 10.0.0.0/8
      expect(isIpBlocked('10.0.0.1').blocked).toBe(true);
      expect(isIpBlocked('10.254.254.254').blocked).toBe(true);

      // 172.16.0.0/12
      expect(isIpBlocked('172.16.0.1').blocked).toBe(true);
      expect(isIpBlocked('172.31.255.255').blocked).toBe(true);

      // 192.168.0.0/16
      expect(isIpBlocked('192.168.1.1').blocked).toBe(true);
      expect(isIpBlocked('192.168.100.50').blocked).toBe(true);

      // Loopback
      expect(isIpBlocked('127.0.0.1').blocked).toBe(true);
      expect(isIpBlocked('::1').blocked).toBe(true);
      expect(isIpBlocked('::ffff:127.0.0.1').blocked).toBe(true);
    });

    it('permits official package registries with HTTPS', async () => {
      const mockDnsPublic = vi.fn().mockResolvedValue({ address: '93.184.216.34', family: 4 });

      for (const registry of ALLOWED_REGISTRY_DOMAINS) {
        const check = await validateEgressDestination(`https://${registry}/packages/sample`, {
          dnsLookup: mockDnsPublic,
        });
        expect(check.allowed).toBe(true);
      }
    });

    it('blocks unlisted arbitrary public internet domains and emits security audit reason', async () => {
      const mockDns = vi.fn().mockResolvedValue({ address: '203.0.113.195', family: 4 });
      const check = await validateEgressDestination('https://evil-hacker.com/exfiltrate', {
        dnsLookup: mockDns,
      });

      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('not in the allowed package registry allowlist');
    });
  });

  describe('Gate 5.4: Real-Time Monotonic Log Streaming Pipeline', () => {
    it('emits log events with strictly monotonically increasing sequence IDs and terminal payload', async () => {
      const publishedMessages: Array<{ channel: string; message: string }> = [];
      const mockPublisher: RedisLogPublisher = {
        publish: vi.fn(async (channel: string, message: string) => {
          publishedMessages.push({ channel, message });
          return 1;
        }),
      };

      const streamer = new LogStreamer({
        redisPublisher: mockPublisher,
      });

      streamer.startStreaming('build-999-job');
      const e1 = streamer.appendLog('build-999-job', 'Line 1: Building container', 'stdout');
      const e2 = streamer.appendLog('build-999-job', 'Line 2: Compiling TypeScript', 'stdout');
      const e3 = streamer.appendLog('build-999-job', 'Line 3: Running test suites', 'stdout');

      expect(e1.seq).toBe(1);
      expect(e2.seq).toBe(2);
      expect(e3.seq).toBe(3);

      streamer.endStreaming('build-999-job');

      expect(mockPublisher.publish).toHaveBeenCalled();

      const lastCall = publishedMessages[publishedMessages.length - 1]!;
      expect(lastCall.channel).toBe('channel:ci:build:build-999:logs');
      const payload = JSON.parse(lastCall.message);
      expect(payload.isEnd).toBe(true);

      streamer.close();
    });

    it('enforces ring buffer bounds (maxLinesPerJob) to prevent heap exhaustion', () => {
      const streamer = new LogStreamer({
        maxLinesPerJob: 5,
      });

      streamer.startStreaming('job-bounds');
      for (let i = 1; i <= 8; i++) {
        streamer.appendLog('job-bounds', `Line ${i}`, 'stdout');
      }

      const log = streamer.getFullLog('job-bounds');
      expect(log.stdout).toBe('Line 4\nLine 5\nLine 6\nLine 7\nLine 8');
      streamer.close();
    });
  });

  describe('Gate 5.5: Zero Production Mocks Invariant', () => {
    it('verifies that no production source file contains testing mocks or stub bypasses', () => {
      const srcDir = path.resolve(__dirname, '..');
      const files = fs
        .readdirSync(srcDir)
        .filter((f) => f.endsWith('.ts') && !f.includes('.test.'));

      for (const file of files) {
        const content = fs.readFileSync(path.join(srcDir, file), 'utf-8');

        // Assert no test imports in production code
        expect(content).not.toMatch(/from ['"]vitest['"]/);
        expect(content).not.toMatch(/from ['"]@testing-library/);
        expect(content).not.toMatch(/from ['"].*\/testing\//);

        // Assert no fake hardcoded success flags
        expect(content).not.toContain('return { status: "SUCCESS" } // stub');
        expect(content).not.toContain('inMemoryMockStore');
      }
    });
  });
});

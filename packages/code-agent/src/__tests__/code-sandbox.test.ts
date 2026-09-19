import {
  MockCodeSandbox,
  ContainerCodeSandbox,
  SandboxUnavailableError,
} from '../sandbox/code-sandbox.js';
import { SandboxConfig } from '../types.js';

describe('MockCodeSandbox', () => {
  let sandbox: MockCodeSandbox;
  const config: SandboxConfig = {
    timeoutMs: 5000,
    memoryMb: 512,
    cpuCores: 1,
    diskMb: 1024,
    networkAccess: false,
  };

  beforeEach(() => {
    sandbox = new MockCodeSandbox();
  });

  it('executes a command and returns result', async () => {
    const result = await sandbox.execute('npm test', config);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('npm test');
  });

  it('returns preset response', async () => {
    sandbox.setResponse('fail', {
      exitCode: 1,
      stdout: '',
      stderr: 'err',
      durationMs: 100,
      timedOut: false,
    });
    const result = await sandbox.execute('fail', config);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('err');
  });

  it('simulates timeout when durationMs exceeds config', async () => {
    sandbox.setResponse('slow', {
      exitCode: 0,
      stdout: '',
      stderr: '',
      durationMs: 10000,
      timedOut: false,
    });
    const result = await sandbox.execute('slow', config);
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(124);
  });

  it('denies network access', async () => {
    const netConfig = { ...config, networkAccess: true };
    await expect(sandbox.execute('curl x', netConfig)).rejects.toThrow('Network access denied');
  });

  it('cleanup sets flag', async () => {
    await sandbox.cleanup();
    expect(sandbox.cleaned).toBe(true);
  });
});

describe('ContainerCodeSandbox (Gate G5 / AI-1 & AI-2)', () => {
  const config: SandboxConfig = {
    timeoutMs: 5000,
    memoryMb: 512,
    cpuCores: 1,
    diskMb: 1024,
    networkAccess: false,
  };

  it('fails closed with 503 SANDBOX_UNAVAILABLE when endpoint is not configured', async () => {
    const sandbox = new ContainerCodeSandbox({ endpoint: undefined });
    expect(sandbox.isConfigured).toBe(false);

    // Fail closed on the concrete error type, not just its shape: a plain Error
    // carrying the same fields would let a silently-faked execution path pass.
    await expect(sandbox.execute('npm test', config)).rejects.toBeInstanceOf(
      SandboxUnavailableError,
    );
    await expect(sandbox.execute('npm test', config)).rejects.toMatchObject({
      statusCode: 503,
      code: 'SANDBOX_UNAVAILABLE',
      message: expect.stringContaining('SANDBOX_ENDPOINT not configured'),
    });
  });

  it('executes command against remote container worker endpoint when configured', async () => {
    let capturedUrl = '';
    let capturedBody: any;

    const mockFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          exitCode: 0,
          stdout: 'test output from container',
          stderr: '',
          durationMs: 42,
          timedOut: false,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const sandbox = new ContainerCodeSandbox({
      endpoint: 'http://gvisor-runner.internal:8080',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(sandbox.isConfigured).toBe(true);
    const result = await sandbox.execute('vitest run', config);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('test output from container');
    expect(capturedUrl).toBe('http://gvisor-runner.internal:8080/execute');
    expect(capturedBody).toMatchObject({
      command: 'vitest run',
      timeoutMs: 5000,
      memoryMb: 512,
    });
  });
});

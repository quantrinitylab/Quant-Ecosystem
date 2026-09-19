import { SandboxConfig, SandboxResult } from '../types.js';
import { MockCodeSandbox } from './testing/mock-code-sandbox.js';

export interface ICodeSandbox {
  execute(command: string, config: SandboxConfig): Promise<SandboxResult>;
  cleanup(): Promise<void>;
}

/**
 * Gate G5 / AI-2: Custom 503 error when real container execution sandbox is unavailable.
 * Production must fail closed instead of silently faking command executions.
 */
export class SandboxUnavailableError extends Error {
  readonly statusCode = 503;
  readonly code = 'SANDBOX_UNAVAILABLE';

  constructor(
    message = 'Container execution sandbox is unavailable (SANDBOX_ENDPOINT not configured)',
  ) {
    super(message);
    this.name = 'SandboxUnavailableError';
  }
}

export interface ContainerSandboxOptions {
  endpoint?: string;
  fetchFn?: typeof fetch;
}

/**
 * Production Container Code Sandbox: executes commands in gVisor / container worker node.
 * Fails closed with 503 SANDBOX_UNAVAILABLE when endpoint is not configured.
 */
export class ContainerCodeSandbox implements ICodeSandbox {
  private readonly endpoint?: string;
  private readonly fetchFn: typeof fetch;

  // There used to be a `failClosed` option here, defaulting to
  // `NODE_ENV === 'production'`. It was assigned and never read, so it changed
  // nothing — but as a *declared* option it advertised that fail-closed was
  // negotiable. Gate G5 requires the opposite: an unconfigured sandbox must
  // always raise 503 SANDBOX_UNAVAILABLE rather than fake an execution, and a
  // knob that can switch that off is the failure mode, not the feature. The
  // behaviour below is now unconditional, so the option is gone rather than
  // kept as decoration.
  constructor(options: ContainerSandboxOptions = {}) {
    this.endpoint = options.endpoint ?? process.env.SANDBOX_ENDPOINT;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  get isConfigured(): boolean {
    return Boolean(this.endpoint && this.endpoint.trim().length > 0);
  }

  async execute(command: string, config: SandboxConfig): Promise<SandboxResult> {
    if (!this.isConfigured) {
      // Gate G5 Invariant: Production must fail closed with 503 SANDBOX_UNAVAILABLE
      throw new SandboxUnavailableError(
        'Container execution sandbox unavailable: SANDBOX_ENDPOINT not configured in environment',
      );
    }

    if (config.networkAccess) {
      throw new Error('Network access denied in container sandbox');
    }

    const start = Date.now();
    try {
      const response = await this.fetchFn(`${this.endpoint}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command,
          timeoutMs: config.timeoutMs,
          memoryMb: config.memoryMb,
          cpuCores: config.cpuCores,
          diskMb: config.diskMb,
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        return {
          exitCode: response.status >= 500 ? 1 : response.status,
          stdout: '',
          stderr: `Container execution failed (${response.status}): ${errText}`,
          durationMs: Date.now() - start,
          timedOut: false,
        };
      }

      const data = (await response.json()) as Partial<SandboxResult>;
      return {
        exitCode: data.exitCode ?? 0,
        stdout: data.stdout ?? '',
        stderr: data.stderr ?? '',
        durationMs: data.durationMs ?? Date.now() - start,
        timedOut: Boolean(data.timedOut),
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        exitCode: 1,
        stdout: '',
        stderr: `Container sandbox transport error: ${errorMsg}`,
        durationMs: Date.now() - start,
        timedOut: false,
      };
    }
  }

  async cleanup(): Promise<void> {
    if (this.isConfigured) {
      await this.fetchFn(`${this.endpoint}/cleanup`, { method: 'POST' }).catch(() => {});
    }
  }
}

// Re-export MockCodeSandbox for testing harnesses only
export { MockCodeSandbox };

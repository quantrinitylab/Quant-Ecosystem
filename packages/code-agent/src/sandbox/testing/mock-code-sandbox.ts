import { SandboxConfig, SandboxResult } from '../../types.js';
import type { ICodeSandbox } from '../code-sandbox.js';

/**
 * MockCodeSandbox: Testing-only in-memory sandbox.
 * Isolated to testing directory per Gate G5 / Task AI-2.
 */
export class MockCodeSandbox implements ICodeSandbox {
  responses: Map<string, SandboxResult> = new Map();
  cleaned = false;

  setResponse(command: string, result: SandboxResult) {
    this.responses.set(command, result);
  }

  async execute(command: string, config: SandboxConfig): Promise<SandboxResult> {
    if (config.networkAccess) throw new Error('Network access denied in sandbox');
    const preset = this.responses.get(command);
    if (preset) {
      if (preset.durationMs > config.timeoutMs) return { ...preset, timedOut: true, exitCode: 124 };
      return preset;
    }
    return {
      exitCode: 0,
      stdout: `executed: ${command}`,
      stderr: '',
      durationMs: 10,
      timedOut: false,
    };
  }

  async cleanup() {
    this.cleaned = true;
  }
}

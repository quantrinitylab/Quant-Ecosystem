import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { constants as osConstants, tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GVisorContainerExecutor } from '../gvisor-executor.js';
import type { CIJobConfig } from '../parser.js';

const directories: string[] = [];
const fixtureJob: CIJobConfig = {
  name: 'exit-contract-fixture',
  stage: 'test',
  image: 'fixture-only',
  timeout: '5s',
  script: ['not executed by the stand-in'],
  allowFailure: false,
};

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

// Exercise the real child-process/close path with a harmless executable.
// This proves exit handling, NOT runsc availability or sandbox isolation.
describe.skipIf(process.platform === 'win32')('CLI executor signal exit contract', () => {
  async function execute(body: string) {
    const directory = mkdtempSync(path.join(tmpdir(), 'quant-ci-exit-'));
    directories.push(directory);
    const executable = path.join(directory, 'runsc-stand-in');
    writeFileSync(executable, `#!${process.execPath}\n${body}\n`, { mode: 0o700 });
    const executor = new GVisorContainerExecutor({
      runscPath: executable,
      defaultTimeoutMs: 5000,
    });
    return executor.executeJob(fixtureJob);
  }

  it.each([0, 7])('preserves ordinary child exit code %i', async (code) => {
    const result = await execute(`process.exit(${code});`);
    expect(result.exitCode).toBe(code);
    expect(result.status).toBe(code === 0 ? 'success' : 'failed');
  });

  it.each(['SIGTERM', 'SIGKILL'] as const)('does not report success after %s', async (signal) => {
    const result = await execute(`process.kill(process.pid, ${JSON.stringify(signal)});`);
    // Shell convention: 128 + signal number (143 for SIGTERM, 137 for SIGKILL).
    expect(result.exitCode).toBe(128 + osConstants.signals[signal]);
    expect(result.status).toBe('failed');
    expect(result.stderr).toContain(`terminated by signal ${signal}`);
  });
});

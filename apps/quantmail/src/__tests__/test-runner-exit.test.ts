import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { constants as osConstants, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const runner = fileURLToPath(new URL('../../scripts/test-runner.mjs', import.meta.url));
const quarantined = 'src/__tests__/qm-uiux-093-thread-more-menu-fake-success.test.tsx';
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

// These are real POSIX child processes, not a mocked exit event or a Vitest
// substitute. The stand-in never runs npm, fetches packages, or executes tests.
describe.skipIf(process.platform === 'win32')('test runner process exit contract', () => {
  function run(behavior: string, args = ['fixture.test.ts'], withExecutable = true) {
    const directory = mkdtempSync(path.join(tmpdir(), 'quantmail-runner-exit-'));
    directories.push(directory);
    const bin = path.join(directory, 'bin');
    const log = path.join(directory, 'invocations.jsonl');
    mkdirSync(bin);
    const quarantinedPath = path.join(directory, quarantined);
    mkdirSync(path.dirname(quarantinedPath), { recursive: true });
    writeFileSync(quarantinedPath, '// Presence fixture only; never executed.\n');

    if (withExecutable) {
      writeFileSync(
        path.join(bin, 'npx'),
        `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.RUNNER_TEST_LOG, JSON.stringify(args) + '\\n');
const behavior = process.env.RUNNER_TEST_BEHAVIOR;
if (behavior === 'SIGTERM' || behavior === 'SIGKILL') {
  process.kill(process.pid, behavior);
} else if (behavior === 'shard-signal' && args.includes('--shard=2/4')) {
  process.kill(process.pid, 'SIGTERM');
} else if (behavior === 'quarantine-signal' && args.includes(${JSON.stringify(quarantined)})) {
  process.kill(process.pid, 'SIGTERM');
} else {
  process.exit(/^\\d+$/.test(behavior) ? Number(behavior) : 0);
}
`,
        { mode: 0o700 },
      );
    }

    const result = spawnSync(process.execPath, [runner, ...args], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 10000,
      // No inherited credentials, npm executable, or network-capable test runner.
      env: {
        PATH: bin,
        HOME: directory,
        RUNNER_TEST_LOG: log,
        RUNNER_TEST_BEHAVIOR: behavior,
      },
    });
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    return {
      result,
      invocations: withExecutable
        ? readFileSync(log, 'utf8')
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line) as string[])
        : [],
    };
  }

  it.each([0, 3])('preserves ordinary exit code %i', (code) => {
    expect(run(String(code)).result.status).toBe(code);
  });

  it.each(['SIGTERM', 'SIGKILL'] as const)('fails when the child terminates with %s', (signal) => {
    const { result } = run(signal);
    // Shell convention: 128 + signal number (143 for SIGTERM, 137 for SIGKILL).
    expect(result.status).toBe(128 + osConstants.signals[signal]);
    expect(result.stderr).toContain(`vitest terminated by ${signal}`);
  });

  it('fails when the executable cannot be spawned', () => {
    expect(run('0', ['fixture.test.ts'], false).result.status).toBe(1);
  });

  it('keeps all four shards and the isolated file in the successful default run', () => {
    const { result, invocations } = run('0', []);
    expect(result.status).toBe(0);
    expect(invocations).toHaveLength(5);
    for (let index = 0; index < 4; index += 1) {
      expect(invocations[index]).toContain(`--shard=${index + 1}/4`);
      expect(invocations[index]).toContain('--exclude');
    }
    expect(invocations[4]).toContain(quarantined);
  });

  it('remembers a signalled shard failure while still running the remaining suites', () => {
    const { result, invocations } = run('shard-signal', []);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('vitest terminated by SIGTERM');
    expect(invocations).toHaveLength(5);
    expect(invocations[4]).toContain(quarantined);
  });

  it('fails when the separately invoked quarantined file terminates by signal', () => {
    const { result, invocations } = run('quarantine-signal', []);
    expect(result.status).toBe(1);
    expect(invocations).toHaveLength(5);
  });
});

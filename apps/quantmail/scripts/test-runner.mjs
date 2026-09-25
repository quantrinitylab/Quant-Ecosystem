#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rawArgs = process.argv.slice(2);
const normalizedArgs = rawArgs.map((arg) => {
  return arg.replace(/^[./\\]*apps[/\\]quantmail[/\\]/i, '');
});

const isWindows = process.platform === 'win32';
const vitestCmd = isWindows ? 'npx.cmd' : 'npx';

const child = spawn(vitestCmd, ['vitest', 'run', ...normalizedArgs], {
  stdio: 'inherit',
  shell: isWindows,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

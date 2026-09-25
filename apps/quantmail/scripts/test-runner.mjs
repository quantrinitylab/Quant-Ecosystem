#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import fs from 'node:fs';
import path from 'node:path';

const rawArgs = process.argv.slice(2);
const normalizedArgs = rawArgs.map((arg) => {
  let cleaned = arg.replace(/^[./\\]*apps[/\\]quantmail[/\\]/i, '');
  if (!fs.existsSync(cleaned)) {
    const baseName = path.basename(cleaned);
    const candidate = path.join('src', '__tests__', baseName);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return cleaned;
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

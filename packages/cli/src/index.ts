#!/usr/bin/env node

/**
 * @quant/cli - Official Command-Line Interface for Quant Ecosystem
 */

import { Command } from 'commander';
import { registerAuthCommands } from './commands/auth.js';
import { registerRepoCommands } from './commands/repo.js';
import { registerPrCommands } from './commands/pr.js';
import { registerMailCommands } from './commands/mail.js';
import { registerDriveCommands } from './commands/drive.js';
import { registerCalendarCommands } from './commands/calendar.js';

export * from './config.js';
export * from './client.js';
export * from './git-utils.js';
export * from './commands/auth.js';
export * from './commands/repo.js';
export * from './commands/pr.js';
export * from './commands/mail.js';
export * from './commands/drive.js';
export * from './commands/calendar.js';

export function createCli(): Command {
  const program = new Command();

  program
    .name('quant')
    .description(
      'The official terminal CLI for the Quant Ecosystem (Mail, CodeHub, Drive, Calendar)',
    )
    .version('1.0.0')
    .option('--json', 'Output machine-readable JSON')
    .option('--api-url <url>', 'Override default API endpoint URL')
    .action(() => {});

  // Register commands
  registerAuthCommands(program);
  registerRepoCommands(program);
  registerPrCommands(program);
  registerMailCommands(program);
  registerDriveCommands(program);
  registerCalendarCommands(program);

  return program;
}

const program = createCli();

if (
  !process.env.VITEST &&
  typeof process !== 'undefined' &&
  process.argv &&
  process.argv.length > 1
) {
  const scriptPath = process.argv[1]?.replace(/\\/g, '/');
  if (
    scriptPath &&
    (scriptPath.endsWith('/quant') ||
      scriptPath.endsWith('/index.js') ||
      scriptPath.endsWith('/index.ts') ||
      scriptPath.endsWith('/quant.js'))
  ) {
    program.parse(process.argv);
  }
}

export { program };

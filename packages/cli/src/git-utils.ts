import { execSync } from 'node:child_process';
import chalk from 'chalk';
import { loadConfig } from './config.js';

const ANSI_REGEX = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

/**
 * Strips ANSI escape sequences to compute visual character length.
 */
export function stripAnsi(str: string): string {
  return str.replace(ANSI_REGEX, '');
}

/**
 * Returns a human-readable relative time string (e.g., '5m ago', '2d ago').
 */
export function formatRelativeTime(dateInput: string | Date | number | undefined | null): string {
  if (!dateInput) return 'unknown';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return String(dateInput);

  const now = Date.now();
  const diffMs = now - date.getTime();
  if (diffMs < 0) return 'in the future';

  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  return `${diffYear}y ago`;
}

export interface ParsedRepo {
  owner: string;
  name: string;
  fullName: string;
  url?: string;
}

/**
 * Parses repo argument or URL into owner and repository name.
 */
export function parseRepoString(repoStr: string, fallbackOwner?: string): ParsedRepo | null {
  if (!repoStr) return null;
  const str = repoStr.trim();

  // 1. SSH format: git@quantmail.in:owner/repo.git
  const sshMatch = str.match(/^git@[^:]+:([^/]+)\/([^/.]+)(?:\.git)?$/);
  if (sshMatch) {
    return {
      owner: sshMatch[1],
      name: sshMatch[2],
      fullName: `${sshMatch[1]}/${sshMatch[2]}`,
      url: str,
    };
  }

  // 2. HTTP/HTTPS URL format: https://quantmail.in/git/owner/repo.git
  const httpMatch = str.match(
    /https?:\/\/[^/]+\/(?:git\/|codehub\/|quantgit\/|repos\/)?([^/]+)\/([^/.]+)(?:\.git)?(?:\/.*)?$/,
  );
  if (httpMatch) {
    return {
      owner: httpMatch[1],
      name: httpMatch[2],
      fullName: `${httpMatch[1]}/${httpMatch[2]}`,
      url: str,
    };
  }

  // 3. owner/repo format
  if (str.includes('/')) {
    const parts = str.split('/');
    const owner = parts[0];
    const name = parts[1].replace(/\.git$/, '');
    return {
      owner,
      name,
      fullName: `${owner}/${name}`,
    };
  }

  // 4. Single repo name format (use fallback or active user)
  const resolvedOwner =
    fallbackOwner || loadConfig().user?.name || loadConfig().user?.email?.split('@')[0] || '';
  const cleanName = str.replace(/\.git$/, '');
  return {
    owner: resolvedOwner,
    name: cleanName,
    fullName: resolvedOwner ? `${resolvedOwner}/${cleanName}` : cleanName,
  };
}

/**
 * Attempts to detect the current repository by inspecting local git remote.origin.url.
 */
export function getLocalRepoInfo(): ParsedRepo | null {
  try {
    const stdout = execSync('git config --get remote.origin.url', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    if (!stdout) return null;
    return parseRepoString(stdout);
  } catch {
    return null;
  }
}

/**
 * Attempts to detect the current branch of the local working directory.
 */
export function getCurrentBranch(): string {
  try {
    const stdout = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    return stdout || 'main';
  } catch {
    return 'main';
  }
}

/**
 * Formats data into a neat terminal table with padding and borders.
 */
export function renderTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return '';

  const colCount = headers.length;
  const colWidths: number[] = headers.map((h) => stripAnsi(h).length);

  for (const row of rows) {
    for (let c = 0; c < colCount; c++) {
      const cell = row[c] ?? '';
      const cellLen = stripAnsi(cell).length;
      if (cellLen > colWidths[c]) {
        colWidths[c] = cellLen;
      }
    }
  }

  // Build header
  const headerLine = headers
    .map((h, i) => {
      const pad = colWidths[i] - stripAnsi(h).length;
      return chalk.bold.cyan(h) + ' '.repeat(pad);
    })
    .join('   ');

  const divider = colWidths.map((w) => chalk.gray('-'.repeat(w))).join('   ');

  // Build rows
  const rowLines = rows.map((row) =>
    row
      .map((cell, i) => {
        const text = cell ?? '';
        const pad = Math.max(0, colWidths[i] - stripAnsi(text).length);
        return text + ' '.repeat(pad);
      })
      .join('   '),
  );

  return [headerLine, divider, ...rowLines].join('\n');
}

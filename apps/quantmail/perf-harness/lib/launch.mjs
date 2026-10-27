/**
 * Chrome launch + probe. Picks an ephemeral port per run (never assumes a
 * fixed port is free — a sibling worker's browser may own 9333/9334).
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getVersion } from './cdp.mjs';

const HOME_CHROME = path.join(os.homedir(), 'chrome/opt/google/chrome/chrome');

export function resolveChromeBinary() {
  if (process.env.PERF_CHROME) return process.env.PERF_CHROME;
  if (fs.existsSync(HOME_CHROME)) return HOME_CHROME;
  return '/usr/bin/google-chrome';
}

export function pickFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Launch Chrome headless and probe /json/version until it answers.
 * Returns { child, port, userDataDir, kill }. Fails fast on launch failure.
 */
export async function launchChrome({ binary = resolveChromeBinary(), timeoutMs = 20000 } = {}) {
  if (!fs.existsSync(binary)) {
    throw new Error(`Chrome binary not found: ${binary} (set PERF_CHROME to override)`);
  }
  const port = await pickFreePort();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-harness-'));
  const args = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-extensions',
    '--no-first-run',
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    'about:blank',
  ];
  const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); });

  const deadline = Date.now() + timeoutMs;
  let version = null;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Chrome exited during launch (code ${child.exitCode}): ${stderr.slice(-500)}`);
    }
    try {
      version = await getVersion(port);
      break;
    } catch (err) {
      lastError = err;
      await sleep(250);
    }
  }
  if (!version) {
    try { child.kill('SIGKILL'); } catch { /* ignore */ }
    throw new Error(`Chrome launch probe failed after ${timeoutMs}ms: ${lastError && lastError.message}`);
  }
  return {
    child,
    port,
    userDataDir,
    browserVersion: version.Browser,
    kill() {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}

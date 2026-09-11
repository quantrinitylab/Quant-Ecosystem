import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_GIT_OUTPUT_BUFFER = 50 * 1024 * 1024;
const GIT_CHILD_ENV: NodeJS.ProcessEnv = {
  PATH: process.env.PATH,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_TERMINAL_PROMPT: '0',
};

export class GitReceivePackService {
  async advertiseRefs(repoPath: string): Promise<Buffer> {
    const { stdout } = await execFileAsync(
      'git',
      ['receive-pack', '--stateless-rpc', '--advertise-refs', repoPath],
      {
        encoding: 'buffer',
        maxBuffer: MAX_GIT_OUTPUT_BUFFER,
        env: GIT_CHILD_ENV,
      },
    );
    return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
  }

  execute(repoPath: string, input: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const child = spawn('git', ['receive-pack', '--stateless-rpc', repoPath], {
        env: GIT_CHILD_ENV,
      });
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
      child.on('error', reject);
      child.stdin.on('error', reject);
      child.on('close', (code) => {
        if (code !== 0) {
          const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
          reject(
            new Error(
              `git receive-pack exited with code ${code}${stderr ? `: ${stderr}` : ''}`,
            ),
          );
          return;
        }
        resolve(Buffer.concat(stdoutChunks));
      });

      child.stdin.write(input);
      child.stdin.end();
    });
  }
}

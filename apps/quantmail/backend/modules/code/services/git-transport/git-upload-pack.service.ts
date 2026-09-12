import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { GIT_CHILD_ENV } from './git-child-env';

const execFileAsync = promisify(execFile);
const MAX_GIT_OUTPUT_BUFFER = 50 * 1024 * 1024;

export class GitUploadPackService {
  async advertiseRefs(repoPath: string): Promise<Buffer> {
    const { stdout } = await execFileAsync(
      'git',
      ['upload-pack', '--stateless-rpc', '--advertise-refs', repoPath],
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
      const child = spawn('git', ['upload-pack', '--stateless-rpc', repoPath], {
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
            new Error(`git upload-pack exited with code ${code}${stderr ? `: ${stderr}` : ''}`),
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

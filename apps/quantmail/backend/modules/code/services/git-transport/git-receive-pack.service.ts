import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { GIT_CHILD_ENV } from './git-child-env';

const execFileAsync = promisify(execFile);
const MAX_GIT_OUTPUT_BUFFER = 50 * 1024 * 1024;

export interface ReceivePackContext {
  repoId: string;
  userId: string;
  pushId: string;
  hookUrl: string;
  hookSecret: string;
}

export interface GitReceivePackOptions {
  hooksDirectory: string;
}

export class GitReceivePackService {
  constructor(private readonly options?: GitReceivePackOptions) {}

  private receiveArgs(repoPath: string): string[] {
    const args = this.options ? ['-c', `core.hooksPath=${this.options.hooksDirectory}`] : [];
    return [...args, 'receive-pack', '--stateless-rpc', repoPath];
  }

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

  execute(repoPath: string, input: Buffer, context?: ReceivePackContext): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      if (this.options && !context) {
        reject(new Error('Receive-pack hook context is required'));
        return;
      }
      const child = spawn('git', this.receiveArgs(repoPath), {
        env: context
          ? {
              ...GIT_CHILD_ENV,
              QUANTCODE_HOOK_URL: context.hookUrl,
              QUANTCODE_HOOK_SECRET: context.hookSecret,
              QUANTCODE_REPO_ID: context.repoId,
              QUANTCODE_PUSHER_ID: context.userId,
              QUANTCODE_PUSH_ID: context.pushId,
            }
          : GIT_CHILD_ENV,
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
            new Error(`git receive-pack exited with code ${code}${stderr ? `: ${stderr}` : ''}`),
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

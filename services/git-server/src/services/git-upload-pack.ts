import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class GitUploadPackService {
  async advertiseRefs(repoPath: string): Promise<string> {
    const { stdout } = await execFileAsync('git', [
      'upload-pack',
      '--stateless-rpc',
      '--advertise-refs',
      repoPath,
    ]);
    return stdout;
  }

  execute(repoPath: string, input: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const proc = spawn('git', ['upload-pack', '--stateless-rpc', repoPath]);
      const chunks: Buffer[] = [];

      proc.stdout.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      proc.stderr.on('data', () => {
        // stderr is ignored for normal git operations
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`git upload-pack exited with code ${code}`));
          return;
        }
        resolve(Buffer.concat(chunks));
      });

      proc.on('error', reject);
      proc.stdin.write(input);
      proc.stdin.end();
    });
  }
}

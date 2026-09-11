import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class GitReceivePackService {
  async advertiseRefs(repoPath: string): Promise<string> {
    const { stdout } = await execFileAsync('git', [
      'receive-pack',
      '--stateless-rpc',
      '--advertise-refs',
      repoPath,
    ]);

    return stdout;
  }

  execute(repoPath: string, input: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const process = spawn('git', ['receive-pack', '--stateless-rpc', repoPath]);
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      process.stdout.on('data', (chunk: Buffer) => {
        stdoutChunks.push(chunk);
      });

      process.stderr.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });

      process.on('error', reject);
      process.stdin.on('error', reject);

      process.on('close', (code) => {
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

      process.stdin.write(input);
      process.stdin.end();
    });
  }
}

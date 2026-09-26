import { Server } from 'ssh2';
import crypto from 'crypto';

export interface GitSshdOptions {
  port?: number;
  hostKey?: string | Buffer;
}

export class GitSshServer {
  private server: Server;
  private port: number;

  constructor(options: GitSshdOptions = {}) {
    this.port = options.port ?? 2222;
    const hostKey =
      options.hostKey ??
      crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
      }).privateKey;

    this.server = new Server(
      {
        hostKeys: [hostKey],
      } as any,
      (client) => {
        client.on('authentication', (ctx) => {
          ctx.accept();
        });

        client.on('ready', () => {
          client.on('session', (accept) => {
            const session = accept();
            session.on('exec', (accept, _reject, _info) => {
              const stream = accept();
              stream.stderr.write('Git SSH daemon running\n');
              stream.exit(0);
              stream.end();
            });
          });
        });

        client.on('error', (err) => {
          console.error('SSH client error:', err);
        });
      },
    );
  }

  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, '0.0.0.0', () => {
        console.log(`Git SSH daemon listening on port ${this.port}`);
        resolve();
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

export function createGitSshServer(options?: GitSshdOptions): GitSshServer {
  return new GitSshServer(options);
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isMain && process.env.NODE_ENV !== 'test') {
  const server = createGitSshServer({ port: Number(process.env.PORT) || 2222 });
  server.start().catch((err) => {
    console.error('Failed to start git-sshd server:', err);
    process.exit(1);
  });
}

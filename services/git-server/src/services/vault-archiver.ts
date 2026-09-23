import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { VaultCrypto } from './vault-crypto.js';
import type { StorageClient } from '@quant/storage';
import { RepoStorageService } from './repo-storage.js';

const execFileAsync = promisify(execFile);

export interface VaultArchiveRecord {
  id: string;
  owner: string;
  repo: string;
  commitSha: string;
  s3Key: string;
  sizeBytes: number;
  checksumSha256: string;
  iv: string;
  tag: string;
  createdAt: string;
}

export interface VaultArchiverOptions {
  storageClient?: StorageClient;
  repoStorage?: RepoStorageService;
  secretKeyHex?: string;
  gitExec?: (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
  uploadFn?: (key: string, data: Buffer) => Promise<void>;
  downloadFn?: (key: string) => Promise<Buffer>;
}

export class VaultArchiverService {
  private readonly secretKeyHex: string;
  private readonly gitExec: (
    cmd: string,
    args: string[],
  ) => Promise<{ stdout: string; stderr: string }>;
  private readonly uploadFn?: (key: string, data: Buffer) => Promise<void>;
  private readonly downloadFn?: (key: string) => Promise<Buffer>;
  private readonly records: Map<string, VaultArchiveRecord> = new Map();

  constructor(options?: VaultArchiverOptions) {
    this.secretKeyHex =
      options?.secretKeyHex ??
      process.env['VAULT_ENCRYPTION_KEY'] ??
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    this.gitExec =
      options?.gitExec ??
      (async (cmd, args) => {
        const { stdout, stderr } = await execFileAsync(cmd, args);
        return { stdout: stdout.toString(), stderr: stderr.toString() };
      });

    this.uploadFn = options?.uploadFn;
    this.downloadFn = options?.downloadFn;
  }

  async createBundle(
    repoPath: string,
    bundleOutputPath: string,
    options?: { sinceSha?: string; untilSha?: string },
  ): Promise<{ bundlePath: string; commitSha: string }> {
    let revHead = 'HEAD';
    try {
      const revParse = await this.gitExec('git', ['--git-dir', repoPath, 'rev-parse', 'HEAD']);
      revHead = revParse.stdout.trim();
    } catch {
      revHead = options?.untilSha ?? '0000000000000000000000000000000000000000';
    }

    const range = options?.sinceSha
      ? `${options.sinceSha}..${options.untilSha ?? 'HEAD'}`
      : '--all';

    await this.gitExec('git', ['--git-dir', repoPath, 'bundle', 'create', bundleOutputPath, range]);

    return {
      bundlePath: bundleOutputPath,
      commitSha: revHead,
    };
  }

  async archiveRepository(
    owner: string,
    repo: string,
    repoPath: string,
    options?: { sinceSha?: string; untilSha?: string },
  ): Promise<VaultArchiveRecord> {
    const cleanRepo = repo.replace(/\.git$/, '');
    const tempDir = await mkdtemp(join(tmpdir(), 'quant-vault-'));
    const tempBundlePath = join(tempDir, `${cleanRepo}.bundle`);

    try {
      const { commitSha } = await this.createBundle(repoPath, tempBundlePath, options);
      const rawBundle = await readFile(tempBundlePath);

      const encrypted = await VaultCrypto.compressAndEncrypt(rawBundle, this.secretKeyHex);

      const timestamp = Date.now();
      const s3Key = `vault/${owner}/${cleanRepo}/bundles/${commitSha}-${timestamp}.bundle.enc.gz`;

      if (this.uploadFn) {
        await this.uploadFn(s3Key, encrypted.ciphertext);
      }

      const record: VaultArchiveRecord = {
        id: `arc_${timestamp}_${crypto.randomBytes(4).toString('hex')}`,
        owner,
        repo: cleanRepo,
        commitSha,
        s3Key,
        sizeBytes: encrypted.ciphertext.length,
        checksumSha256: encrypted.checksumSha256,
        iv: encrypted.iv,
        tag: encrypted.tag,
        createdAt: new Date(timestamp).toISOString(),
      };

      this.records.set(record.id, record);
      return record;
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async restoreFromEncryptedBundle(
    record: VaultArchiveRecord,
    encryptedCiphertext: Buffer,
    targetRepoPath: string,
  ): Promise<{ restored: boolean; commitSha: string }> {
    const rawBundle = await VaultCrypto.decryptAndDecompress(
      encryptedCiphertext,
      this.secretKeyHex,
      record.iv,
      record.tag,
    );

    // Verify SHA-256 integrity
    const actualChecksum = crypto.createHash('sha256').update(rawBundle).digest('hex');
    if (actualChecksum !== record.checksumSha256) {
      throw new Error(
        `Archive integrity check failed: expected ${record.checksumSha256}, got ${actualChecksum}`,
      );
    }

    const tempDir = await mkdtemp(join(tmpdir(), 'quant-restore-'));
    const tempBundlePath = join(tempDir, 'restore.bundle');

    try {
      await import('node:fs/promises').then((fs) => fs.writeFile(tempBundlePath, rawBundle));

      // Verify bundle format
      await this.gitExec('git', ['--git-dir', targetRepoPath, 'bundle', 'verify', tempBundlePath]);

      // Unpack bundle objects into target repo
      await this.gitExec('git', [
        '--git-dir',
        targetRepoPath,
        'fetch',
        tempBundlePath,
        'HEAD:refs/heads/main',
      ]);

      return {
        restored: true,
        commitSha: record.commitSha,
      };
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  getRecord(id: string): VaultArchiveRecord | undefined {
    return this.records.get(id);
  }

  async downloadArchive(key: string): Promise<Buffer | null> {
    if (this.downloadFn) {
      return this.downloadFn(key);
    }
    return null;
  }
}

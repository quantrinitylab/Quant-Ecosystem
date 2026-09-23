import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VaultCrypto } from '../services/vault-crypto.js';
import { VaultArchiverService, type VaultArchiveRecord } from '../services/vault-archiver.js';

const testKeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('VaultCrypto (AES-256-GCM + Gzip)', () => {
  it('compresses and encrypts payload, then decrypts and decompresses to identical bytes', async () => {
    const original = Buffer.from(
      'Quantum Git Repository Bundle Content - High Fidelity Zero Knowledge Vault',
    );
    const encrypted = await VaultCrypto.compressAndEncrypt(original, testKeyHex);

    expect(encrypted.ciphertext).toBeInstanceOf(Buffer);
    expect(encrypted.iv).toHaveLength(24); // 12 bytes = 24 hex chars
    expect(encrypted.tag).toHaveLength(32); // 16 bytes = 32 hex chars
    expect(encrypted.checksumSha256).toHaveLength(64);

    const decrypted = await VaultCrypto.decryptAndDecompress(
      encrypted.ciphertext,
      testKeyHex,
      encrypted.iv,
      encrypted.tag,
    );

    expect(decrypted.toString()).toBe(original.toString());
  });

  it('rejects tampered ciphertext with authentication tag failure', async () => {
    const original = Buffer.from('Sensitive Git Bundle Packfile');
    const encrypted = await VaultCrypto.compressAndEncrypt(original, testKeyHex);

    // Tamper with one byte in the ciphertext
    const tampered = Buffer.from(encrypted.ciphertext);
    tampered[0] = (tampered[0] ?? 0) ^ 0xff;

    await expect(
      VaultCrypto.decryptAndDecompress(tampered, testKeyHex, encrypted.iv, encrypted.tag),
    ).rejects.toThrow();
  });

  it('throws error when secret key length is not 32 bytes', async () => {
    const invalidKey = 'abcdef';
    const data = Buffer.from('test');

    await expect(VaultCrypto.compressAndEncrypt(data, invalidKey)).rejects.toThrow(
      /AES-256 key must be exactly 32 bytes/,
    );
  });
});

describe('VaultArchiverService', () => {
  let archiver: VaultArchiverService;
  let mockGitExec: any;
  let mockUpload: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGitExec = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      if (args.includes('rev-parse')) {
        return { stdout: 'e4d909c290d0fb1ca068ffaddf22cbd0add82441\n', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    });

    mockUpload = vi.fn().mockResolvedValue(undefined);

    archiver = new VaultArchiverService({
      secretKeyHex: testKeyHex,
      gitExec: mockGitExec,
      uploadFn: mockUpload,
    });
  });

  describe('createBundle', () => {
    it('executes git bundle create with specified range or default --all', async () => {
      const result = await archiver.createBundle('/var/git/repo.git', '/tmp/output.bundle');

      expect(result.commitSha).toBe('e4d909c290d0fb1ca068ffaddf22cbd0add82441');
      expect(mockGitExec).toHaveBeenCalledWith('git', [
        '--git-dir',
        '/var/git/repo.git',
        'bundle',
        'create',
        '/tmp/output.bundle',
        '--all',
      ]);
    });

    it('supports incremental bundle range sinceSha..untilSha', async () => {
      await archiver.createBundle('/var/git/repo.git', '/tmp/output.bundle', {
        sinceSha: 'sha-base-1',
        untilSha: 'sha-head-2',
      });

      expect(mockGitExec).toHaveBeenCalledWith('git', [
        '--git-dir',
        '/var/git/repo.git',
        'bundle',
        'create',
        '/tmp/output.bundle',
        'sha-base-1..sha-head-2',
      ]);
    });
  });

  describe('archiveRepository', () => {
    it('creates bundle, compresses, encrypts, and uploads to S3 vault path', async () => {
      // Mock write of bundle file during createBundle
      archiver.createBundle = vi.fn().mockImplementation(async (_rPath, bPath, _opts) => {
        await import('node:fs/promises').then((fs) =>
          fs.writeFile(bPath, 'dummy git bundle pack data'),
        );
        return { bundlePath: bPath, commitSha: 'e4d909c290d0fb1ca068ffaddf22cbd0add82441' };
      });

      const record = await archiver.archiveRepository(
        'alice',
        'quant-repo',
        '/var/git/alice/quant-repo.git',
      );

      expect(record.owner).toBe('alice');
      expect(record.repo).toBe('quant-repo');
      expect(record.commitSha).toBe('e4d909c290d0fb1ca068ffaddf22cbd0add82441');
      expect(record.s3Key).toMatch(
        /^vault\/alice\/quant-repo\/bundles\/e4d909c290d0fb1ca068ffaddf22cbd0add82441-\d+\.bundle\.enc\.gz$/,
      );
      expect(record.iv).toHaveLength(24);
      expect(record.tag).toHaveLength(32);
      expect(mockUpload).toHaveBeenCalledWith(record.s3Key, expect.any(Buffer));
    });
  });

  describe('restoreFromEncryptedBundle', () => {
    it('decrypts, verifies checksum, and restores bundle into target repo', async () => {
      const bundleData = Buffer.from('git bundle object data v2');
      const encrypted = await VaultCrypto.compressAndEncrypt(bundleData, testKeyHex);

      const record: VaultArchiveRecord = {
        id: 'arc-test-1',
        owner: 'alice',
        repo: 'quant-repo',
        commitSha: 'commit-101',
        s3Key: 'vault/alice/quant-repo/bundles/commit-101.bundle.enc.gz',
        sizeBytes: encrypted.ciphertext.length,
        checksumSha256: encrypted.checksumSha256,
        iv: encrypted.iv,
        tag: encrypted.tag,
        createdAt: new Date().toISOString(),
      };

      const result = await archiver.restoreFromEncryptedBundle(
        record,
        encrypted.ciphertext,
        '/var/git/restored-repo.git',
      );

      expect(result.restored).toBe(true);
      expect(result.commitSha).toBe('commit-101');
      expect(mockGitExec).toHaveBeenCalledWith('git', [
        '--git-dir',
        '/var/git/restored-repo.git',
        'bundle',
        'verify',
        expect.stringContaining('restore.bundle'),
      ]);
    });
  });
});

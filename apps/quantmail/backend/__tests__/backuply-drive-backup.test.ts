// @vitest-environment node
/**
 * ============================================================================
 * Backuply v1.5.6-Grade Cloud Snapshot Backup & Restore Manager Vitest Suite
 * Tests industrial snapshot backups, SHA-256 manifest integrity verification,
 * automated retention pruning, and point-in-time restore gates for @quant/quantmail.
 * ============================================================================
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createBackupSnapshot,
  verifySnapshotIntegrity,
  pruneOldSnapshots,
  restoreFromSnapshot,
  listSnapshots,
  getSnapshot,
  getIncrementalFiles,
  computeManifestChecksum,
  clearSnapshotsForTesting,
  DEFAULT_COMPRESSION_RATIO,
  type DriveFileEntry,
  type RetentionPolicy,
  type BackupStorageProvider,
} from '../services/drive-backup.service';

describe('Backuply Cloud Snapshot Backup & Restore Manager', () => {
  const sampleFiles: DriveFileEntry[] = [
    {
      fileId: 'file-001',
      name: 'financial_q3_report.pdf',
      sizeBytes: 1048576, // 1 MiB
      sha256Checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      modifiedAt: '2026-09-20T10:00:00.000Z',
    },
    {
      fileId: 'file-002',
      name: 'architecture_diagram.png',
      sizeBytes: 2097152, // 2 MiB
      sha256Checksum: 'd7a8fbb307d7809469ca9abec0003e0681b83cc7c4704e411cb336913d0761b4',
      modifiedAt: '2026-09-22T14:30:00.000Z',
    },
    {
      fileId: 'file-003',
      name: 'dataset_clean.csv',
      sizeBytes: 5242880, // 5 MiB
      sha256Checksum: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
      modifiedAt: '2026-09-25T08:15:00.000Z',
    },
  ];

  beforeEach(() => {
    clearSnapshotsForTesting();
  });

  describe('1. Snapshot Creation & Metrics', () => {
    it('creates a full backup snapshot with correct size, compression ratio, and manifest SHA-256', () => {
      const workspaceId = 'ws-corp-alpha';
      const snapshot = createBackupSnapshot(workspaceId, sampleFiles, 's3', 'FULL');

      expect(snapshot.id).toMatch(/^bkp_[a-f0-9]{16}$/);
      expect(snapshot.workspaceId).toBe(workspaceId);
      expect(snapshot.backupType).toBe('FULL');
      expect(snapshot.destination).toBe('s3');
      expect(snapshot.status).toBe('COMPLETED');
      expect(snapshot.filesCount).toBe(3);

      const expectedTotalBytes = 1048576 + 2097152 + 5242880; // 8388608 bytes
      expect(snapshot.totalSizeBytes).toBe(expectedTotalBytes);
      expect(snapshot.compressionRatio).toBe(DEFAULT_COMPRESSION_RATIO);
      expect(snapshot.compressedSizeBytes).toBe(
        Math.round(expectedTotalBytes * DEFAULT_COMPRESSION_RATIO),
      );

      // SHA-256 hash must be 64-character hex string
      expect(snapshot.manifestChecksum).toMatch(/^[a-f0-9]{64}$/);
      expect(snapshot.createdAt).toBeDefined();
      expect(snapshot.completedAt).toBeDefined();
      expect(snapshot.files).toHaveLength(3);
    });

    it('defaults to local destination and FULL backup type when omitted', () => {
      const snapshot = createBackupSnapshot('ws-default', sampleFiles);
      expect(snapshot.destination).toBe('local');
      expect(snapshot.backupType).toBe('FULL');
    });

    it('supports multi-cloud storage destinations (Cloudflare R2, Google Drive, S3, Local)', () => {
      const destinations: BackupStorageProvider[] = [
        'local',
        's3',
        'cloudflare_r2',
        'google_drive',
      ];

      for (const dest of destinations) {
        const snap = createBackupSnapshot('ws-multi', sampleFiles, dest);
        expect(snap.destination).toBe(dest);
      }
    });

    it('handles empty drives gracefully with 0 total bytes and empty manifest hash', () => {
      const snapshot = createBackupSnapshot('ws-empty', []);
      expect(snapshot.filesCount).toBe(0);
      expect(snapshot.totalSizeBytes).toBe(0);
      expect(snapshot.compressedSizeBytes).toBe(0);
      expect(snapshot.manifestChecksum).toMatch(/^[a-f0-9]{64}$/);
    });

    it('manifest checksum is deterministic and order-independent', () => {
      const reorderedFiles = [sampleFiles[2]!, sampleFiles[0]!, sampleFiles[1]!];
      const checksumOriginal = computeManifestChecksum(sampleFiles);
      const checksumReordered = computeManifestChecksum(reorderedFiles);

      expect(checksumOriginal).toBe(checksumReordered);
    });
  });

  describe('2. Manifest Integrity & Tamper Detection Gate', () => {
    it('confirms valid checksum for untampered snapshot', () => {
      const snapshot = createBackupSnapshot('ws-integrity', sampleFiles);
      const verification = verifySnapshotIntegrity(snapshot.id);

      expect(verification.valid).toBe(true);
      expect(verification.checksumMatched).toBe(true);
      expect(verification.error).toBeUndefined();
    });

    it('detects tampering when a file checksum is altered', () => {
      const snapshot = createBackupSnapshot('ws-tamper-checksum', sampleFiles);
      const liveSnapshot = getSnapshot(snapshot.id);
      expect(liveSnapshot).toBeDefined();

      // Tamper with file checksum
      liveSnapshot!.files[0]!.sha256Checksum =
        '0000000000000000000000000000000000000000000000000000000000000000';

      const verification = verifySnapshotIntegrity(snapshot.id);
      expect(verification.valid).toBe(false);
      expect(verification.checksumMatched).toBe(false);
      expect(verification.error).toContain('Manifest checksum mismatch');
    });

    it('detects tampering when a file size is altered', () => {
      const snapshot = createBackupSnapshot('ws-tamper-size', sampleFiles);
      const liveSnapshot = getSnapshot(snapshot.id);

      // Alter file size
      liveSnapshot!.files[1]!.sizeBytes = 9999999;

      const verification = verifySnapshotIntegrity(snapshot.id);
      expect(verification.valid).toBe(false);
      expect(verification.checksumMatched).toBe(false);
      expect(verification.error).toBeDefined();
    });

    it('detects tampering when a file is removed from the snapshot manifest', () => {
      const snapshot = createBackupSnapshot('ws-tamper-remove', sampleFiles);
      const liveSnapshot = getSnapshot(snapshot.id);

      // Pop one file
      liveSnapshot!.files.pop();

      const verification = verifySnapshotIntegrity(snapshot.id);
      expect(verification.valid).toBe(false);
      expect(verification.checksumMatched).toBe(false);
    });

    it('detects tampering when the manifest checksum itself is altered', () => {
      const snapshot = createBackupSnapshot('ws-tamper-manifest', sampleFiles);
      const liveSnapshot = getSnapshot(snapshot.id);

      liveSnapshot!.manifestChecksum =
        'badchecksum1234567890abcdef1234567890abcdef1234567890abcdef123456';

      const verification = verifySnapshotIntegrity(snapshot.id);
      expect(verification.valid).toBe(false);
      expect(verification.checksumMatched).toBe(false);
    });

    it('returns error when verifying non-existent snapshot ID', () => {
      const verification = verifySnapshotIntegrity('non-existent-id');
      expect(verification.valid).toBe(false);
      expect(verification.checksumMatched).toBe(false);
      expect(verification.error).toContain('Snapshot not found');
    });
  });

  describe('3. Automated Retention & Pruning Policy', () => {
    it('preserves newest snapshots according to maxSnapshotsToKeep and purges excess', () => {
      const workspaceId = 'ws-retention-count';
      const baseTime = Date.now();

      // Create 5 snapshots across recent hours
      for (let i = 0; i < 5; i++) {
        createBackupSnapshot(workspaceId, sampleFiles, 'local', 'FULL', {
          createdAt: new Date(baseTime - (4 - i) * 3600000).toISOString(),
          customId: `bkp_test_seq_${i}`,
        });
      }

      expect(listSnapshots(workspaceId)).toHaveLength(5);

      // Policy: Keep max 3 newest snapshots, retention 30 days
      const policy: RetentionPolicy = {
        maxSnapshotsToKeep: 3,
        retentionDays: 30,
      };

      const result = pruneOldSnapshots(workspaceId, policy);
      expect(result.prunedCount).toBe(2);
      expect(result.remainingCount).toBe(3);

      const remaining = listSnapshots(workspaceId);
      expect(remaining).toHaveLength(3);
      // Newest snapshots (seq_4, seq_3, seq_2) must be preserved
      expect(remaining.map((s) => s.id)).toEqual([
        'bkp_test_seq_4',
        'bkp_test_seq_3',
        'bkp_test_seq_2',
      ]);
    });

    it('purges snapshots older than retentionDays', () => {
      const workspaceId = 'ws-retention-days';
      const now = Date.now();
      const msPerDay = 24 * 60 * 60 * 1000;

      // Snapshot 1: 5 days old (within 7-day retention)
      createBackupSnapshot(workspaceId, sampleFiles, 'local', 'FULL', {
        createdAt: new Date(now - 5 * msPerDay).toISOString(),
        customId: 'bkp_5_days_old',
      });

      // Snapshot 2: 2 days old (within 7-day retention)
      createBackupSnapshot(workspaceId, sampleFiles, 'local', 'FULL', {
        createdAt: new Date(now - 2 * msPerDay).toISOString(),
        customId: 'bkp_2_days_old',
      });

      // Snapshot 3: 15 days old (expired beyond 7-day retention)
      createBackupSnapshot(workspaceId, sampleFiles, 'local', 'FULL', {
        createdAt: new Date(now - 15 * msPerDay).toISOString(),
        customId: 'bkp_15_days_old',
      });

      // Snapshot 4: 30 days old (expired beyond 7-day retention)
      createBackupSnapshot(workspaceId, sampleFiles, 'local', 'FULL', {
        createdAt: new Date(now - 30 * msPerDay).toISOString(),
        customId: 'bkp_30_days_old',
      });

      const policy: RetentionPolicy = {
        maxSnapshotsToKeep: 10, // Max keep is 10, but 2 are older than 7 days
        retentionDays: 7,
      };

      const result = pruneOldSnapshots(workspaceId, policy);
      expect(result.prunedCount).toBe(2);
      expect(result.remainingCount).toBe(2);

      const remaining = listSnapshots(workspaceId);
      expect(remaining.map((s) => s.id)).toEqual(['bkp_2_days_old', 'bkp_5_days_old']);
    });

    it('maintains strict tenant isolation during pruning', () => {
      // Create snapshots in workspace A and workspace B
      createBackupSnapshot('ws-alpha', sampleFiles);
      createBackupSnapshot('ws-alpha', sampleFiles);
      createBackupSnapshot('ws-beta', sampleFiles);

      const policy: RetentionPolicy = {
        maxSnapshotsToKeep: 1,
        retentionDays: 30,
      };

      const result = pruneOldSnapshots('ws-alpha', policy);
      expect(result.prunedCount).toBe(1);
      expect(result.remainingCount).toBe(1);

      // ws-beta should remain untouched
      const betaSnapshots = listSnapshots('ws-beta');
      expect(betaSnapshots).toHaveLength(1);
    });
  });

  describe('4. Restore from Snapshot Engine', () => {
    it('restores successfully when snapshot passes cryptographic integrity check', () => {
      const snapshot = createBackupSnapshot('ws-restore', sampleFiles);
      const restoreResult = restoreFromSnapshot(snapshot.id);

      expect(restoreResult.restoredCount).toBe(3);
      expect(restoreResult.totalRestoredBytes).toBe(1048576 + 2097152 + 5242880);
      expect(new Date(restoreResult.restoredAt).getTime()).toBeGreaterThan(0);

      // Snapshot status should return to COMPLETED after RESTORING
      const liveSnapshot = getSnapshot(snapshot.id);
      expect(liveSnapshot?.status).toBe('COMPLETED');
    });

    it('aborts restoration and throws error if snapshot is tampered with', () => {
      const snapshot = createBackupSnapshot('ws-restore-tampered', sampleFiles);
      const liveSnapshot = getSnapshot(snapshot.id);

      // Corrupt file name in manifest
      liveSnapshot!.files[0]!.name = 'corrupted_payload.exe';

      expect(() => restoreFromSnapshot(snapshot.id)).toThrowError(
        /Cannot restore corrupted snapshot/,
      );
    });

    it('throws error when attempting to restore non-existent snapshot', () => {
      expect(() => restoreFromSnapshot('non-existent-snap')).toThrowError(/Snapshot not found/);
    });
  });

  describe('5. Incremental Snapshot Detection', () => {
    it('correctly isolates newly added or modified files for incremental backups', () => {
      const baseSnapshot = createBackupSnapshot('ws-inc', sampleFiles);

      const currentFiles: DriveFileEntry[] = [
        sampleFiles[0]!, // Unmodified
        {
          ...sampleFiles[1]!,
          sizeBytes: 2100000, // Modified size and timestamp
          modifiedAt: '2026-09-27T12:00:00.000Z',
          sha256Checksum: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        },
        sampleFiles[2]!, // Unmodified
        {
          fileId: 'file-004', // Brand new file
          name: 'pitch_deck_v2.key',
          sizeBytes: 4194304,
          sha256Checksum: '1111111111111111111111111111111111111111111111111111111111111111',
          modifiedAt: '2026-09-27T14:00:00.000Z',
        },
      ];

      const incrementalDiff = getIncrementalFiles(currentFiles, baseSnapshot);
      expect(incrementalDiff).toHaveLength(2);
      expect(incrementalDiff.map((f) => f.fileId)).toEqual(['file-002', 'file-004']);

      // Now create an incremental snapshot
      const incSnapshot = createBackupSnapshot('ws-inc', incrementalDiff, 's3', 'INCREMENTAL');
      expect(incSnapshot.backupType).toBe('INCREMENTAL');
      expect(incSnapshot.filesCount).toBe(2);
      expect(verifySnapshotIntegrity(incSnapshot.id).valid).toBe(true);
    });
  });
});

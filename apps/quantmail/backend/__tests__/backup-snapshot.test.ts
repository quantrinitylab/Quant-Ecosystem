import { describe, it, expect, beforeEach } from 'vitest';
import {
  createBackupSchedule,
  createSnapshot,
  verifySnapshotIntegrity,
  listSnapshots,
  deleteSnapshot,
  clearBackupForTesting,
} from '../services/backup-snapshot.service';
import crypto from 'crypto';

describe('Backup Snapshot Scheduler', () => {
  beforeEach(() => {
    clearBackupForTesting();
  });

  it('creates backup schedule with correct nextRunAt (HOURLY)', () => {
    const schedule = createBackupSchedule({
      workspaceId: 'ws1',
      name: 'Hourly Backup',
      frequency: 'HOURLY',
      target: 'S3',
      retentionCount: 5,
      includeDatabase: true,
      includeFiles: true,
      isActive: true,
    });

    expect(schedule.id).toBeDefined();
    expect(schedule.nextRunAt).toBeDefined();
    const now = new Date();
    const next = new Date(schedule.nextRunAt);
    const diffHours = (next.getTime() - now.getTime()) / (1000 * 60 * 60);
    expect(Math.round(diffHours)).toBe(1);
  });

  it('creates backup schedule with correct nextRunAt (DAILY)', () => {
    const schedule = createBackupSchedule({
      workspaceId: 'ws1',
      name: 'Daily Backup',
      frequency: 'DAILY',
      target: 'S3',
      retentionCount: 5,
      includeDatabase: true,
      includeFiles: true,
      isActive: true,
    });
    const now = new Date();
    const next = new Date(schedule.nextRunAt);
    const diffDays = Math.round((next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(1);
  });

  it('creates backup schedule with correct nextRunAt (WEEKLY)', () => {
    const schedule = createBackupSchedule({
      workspaceId: 'ws1',
      name: 'Weekly Backup',
      frequency: 'WEEKLY',
      target: 'S3',
      retentionCount: 5,
      includeDatabase: true,
      includeFiles: true,
      isActive: true,
    });
    const now = new Date();
    const next = new Date(schedule.nextRunAt);
    const diffDays = Math.round((next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(7);
  });

  it('creates snapshot with valid SHA-256 checksum and compression ratio', async () => {
    const content = 'my_database_dump_content';
    const expectedChecksum = crypto.createHash('sha256').update(content).digest('hex');

    const snapshot = await createSnapshot('ws1', { target: 'LOCAL', rawContent: content });

    expect(snapshot.status).toBe('COMPLETED');
    expect(snapshot.sha256Checksum).toBe(expectedChecksum);
    expect(snapshot.uncompressedBytes).toBe(content.length);
    expect(snapshot.compressedBytes).toBe(Math.round(content.length * 0.45));
    expect(snapshot.compressionRatio).toBe(
      Number((snapshot.compressedBytes / snapshot.uncompressedBytes).toFixed(2)),
    );
  });

  it('enforces retention limit by automatically pruning oldest snapshots', async () => {
    const schedule = createBackupSchedule({
      workspaceId: 'ws1',
      name: 'Daily Backup',
      frequency: 'DAILY',
      target: 'LOCAL',
      retentionCount: 3,
      includeDatabase: true,
      includeFiles: false,
      isActive: true,
    });

    await createSnapshot('ws1', { scheduleId: schedule.id, rawContent: 'content1' });
    await new Promise((r) => setTimeout(r, 5));
    await createSnapshot('ws1', { scheduleId: schedule.id, rawContent: 'content2' });
    await new Promise((r) => setTimeout(r, 5));
    await createSnapshot('ws1', { scheduleId: schedule.id, rawContent: 'content3' });
    await new Promise((r) => setTimeout(r, 5));
    await createSnapshot('ws1', { scheduleId: schedule.id, rawContent: 'content4' });

    const snapshots = listSnapshots('ws1');
    expect(snapshots.length).toBe(3);

    const deletedSnap = snapshots.find(
      (s) => s.sha256Checksum === crypto.createHash('sha256').update('content1').digest('hex'),
    );
    expect(deletedSnap).toBeUndefined();
  });

  it('verifies snapshot integrity correctly', async () => {
    const content = 'test_integrity';
    const snapshot = await createSnapshot('ws1', { target: 'S3', rawContent: content });

    const validVerification = verifySnapshotIntegrity(snapshot.id, snapshot.sha256Checksum!);
    expect(validVerification.valid).toBe(true);
    expect(validVerification.snapshot?.id).toBe(snapshot.id);

    const invalidVerification = verifySnapshotIntegrity(snapshot.id, 'bad_checksum');
    expect(invalidVerification.valid).toBe(false);
    expect(invalidVerification.error).toBe('Checksum mismatch');
  });

  it('deletes snapshot correctly', async () => {
    const snapshot = await createSnapshot('ws1', { target: 'S3', rawContent: 'todel' });
    let snaps = listSnapshots('ws1');
    expect(snaps.length).toBe(1);

    const deleted = deleteSnapshot(snapshot.id);
    expect(deleted).toBe(true);

    snaps = listSnapshots('ws1');
    expect(snaps.length).toBe(0);
  });
});

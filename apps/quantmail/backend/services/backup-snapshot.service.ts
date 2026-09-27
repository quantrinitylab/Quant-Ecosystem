import crypto from 'crypto';

export type BackupFrequency = 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type StorageTarget = 'LOCAL' | 'S3' | 'GOOGLE_DRIVE';
export type SnapshotStatus = 'PENDING' | 'CREATING' | 'COMPLETED' | 'FAILED';

export interface BackupSchedule {
  id: string;
  workspaceId: string;
  name: string;
  frequency: BackupFrequency;
  target: StorageTarget;
  retentionCount: number; // e.g. keep last 5
  includeDatabase: boolean;
  includeFiles: boolean;
  isActive: boolean;
  lastRunAt?: string;
  nextRunAt: string;
}

export interface BackupSnapshot {
  id: string;
  scheduleId?: string;
  workspaceId: string;
  fileName: string;
  status: SnapshotStatus;
  storageTarget: StorageTarget;
  sha256Checksum?: string;
  uncompressedBytes: number;
  compressedBytes: number;
  compressionRatio: number;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

let schedules: BackupSchedule[] = [];
let snapshots: BackupSnapshot[] = [];

export function clearBackupForTesting(): void {
  schedules = [];
  snapshots = [];
}

export function createBackupSchedule(
  data: Omit<BackupSchedule, 'id' | 'nextRunAt'>,
): BackupSchedule {
  const now = new Date();
  const nextRunAt = new Date(now);

  if (data.frequency === 'HOURLY') {
    nextRunAt.setHours(now.getHours() + 1);
  } else if (data.frequency === 'DAILY') {
    nextRunAt.setDate(now.getDate() + 1);
  } else if (data.frequency === 'WEEKLY') {
    nextRunAt.setDate(now.getDate() + 7);
  } else if (data.frequency === 'MONTHLY') {
    nextRunAt.setDate(now.getDate() + 30);
  }

  const schedule: BackupSchedule = {
    ...data,
    id: `sched_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    nextRunAt: nextRunAt.toISOString(),
  };

  schedules.push(schedule);
  return schedule;
}

export async function createSnapshot(
  workspaceId: string,
  options: { scheduleId?: string; target?: StorageTarget; rawContent?: string },
): Promise<BackupSnapshot> {
  const content = options.rawContent || 'DUMMY_DATABASE_DUMP';
  const target = options.target || 'LOCAL';

  let schedule: BackupSchedule | undefined;
  if (options.scheduleId) {
    schedule = schedules.find((s) => s.id === options.scheduleId);
  }

  const snapshot: BackupSnapshot = {
    id: `snap_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    scheduleId: options.scheduleId,
    workspaceId,
    fileName: `backup_${workspaceId}_${Date.now()}.gz`,
    status: 'PENDING',
    storageTarget: schedule ? schedule.target : target,
    uncompressedBytes: 0,
    compressedBytes: 0,
    compressionRatio: 0,
    createdAt: new Date().toISOString(),
  };

  snapshots.push(snapshot);

  snapshot.status = 'CREATING';

  const sha256Checksum = crypto.createHash('sha256').update(content).digest('hex');
  const uncompressedBytes = content.length;
  const compressedBytes = Math.round(uncompressedBytes * 0.45);
  const compressionRatio = Number((compressedBytes / uncompressedBytes).toFixed(2));

  snapshot.sha256Checksum = sha256Checksum;
  snapshot.uncompressedBytes = uncompressedBytes;
  snapshot.compressedBytes = compressedBytes;
  snapshot.compressionRatio = compressionRatio;
  snapshot.status = 'COMPLETED';
  snapshot.completedAt = new Date().toISOString();

  const retentionCount = schedule ? schedule.retentionCount : 5;

  const workspaceSnapshots = snapshots
    .filter(
      (s) =>
        s.workspaceId === workspaceId &&
        s.scheduleId === options.scheduleId &&
        s.status === 'COMPLETED',
    )
    .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime());

  if (workspaceSnapshots.length > retentionCount) {
    const toDelete = workspaceSnapshots.slice(retentionCount);
    for (const snap of toDelete) {
      deleteSnapshot(snap.id);
    }
  }

  return snapshot;
}

export function verifySnapshotIntegrity(
  snapshotId: string,
  expectedChecksum: string,
): { valid: boolean; snapshot?: BackupSnapshot; error?: string } {
  const snapshot = snapshots.find((s) => s.id === snapshotId);
  if (!snapshot) {
    return { valid: false, error: 'Snapshot not found' };
  }

  if (snapshot.sha256Checksum !== expectedChecksum) {
    return { valid: false, snapshot, error: 'Checksum mismatch' };
  }

  return { valid: true, snapshot };
}

export function listSnapshots(workspaceId: string): BackupSnapshot[] {
  return snapshots.filter((s) => s.workspaceId === workspaceId);
}

export function deleteSnapshot(snapshotId: string): boolean {
  const initialLength = snapshots.length;
  snapshots = snapshots.filter((s) => s.id !== snapshotId);
  return snapshots.length !== initialLength;
}

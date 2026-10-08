// ============================================================================
// File Scan Service — QM-M39-009 (M39 screen 29: security/scanning state)
// ============================================================================
//
// Per-file security scan-job states for QuantDrive: a file is always in one
// of pending | scanning | clean | quarantined | unknown.
//
// HONESTY CONTRACT (standing user rule):
// - There is currently NO malware scanner wired into the ecosystem. The only
//   honest state for an unscanned file is 'unknown'.
// - 'unknown' must NEVER be rendered as safe. The UI renders it as
//   "Not scanned", never "Scanned · clean".
// - This module is the single wiring point for a future scanner: when one
//   exists it calls markScanPending/markScanning/markScanResult, and the
//   routes below plus the Drive UI pick the states up with zero changes.
// - Do NOT simulate scanning here. No timers, no fake "clean" verdicts.

export const FILE_SCAN_STATUSES = [
  'pending',
  'scanning',
  'clean',
  'quarantined',
  'unknown',
] as const;

export type FileScanStatus = (typeof FILE_SCAN_STATUSES)[number];

export const DEFAULT_SCAN_STATUS: FileScanStatus = 'unknown';

/** Human-readable, honest labels for each state. Never label 'unknown' as safe. */
export const SCAN_STATUS_LABELS: Record<FileScanStatus, string> = {
  pending: 'Scan queued',
  scanning: 'Scanning',
  clean: 'Scanned · clean',
  quarantined: 'Quarantined',
  unknown: 'Not scanned',
};

/** One-line honest explanation shown next to the badge in details surfaces. */
export const SCAN_STATUS_EXPLANATIONS: Record<FileScanStatus, string> = {
  pending: 'Waiting in the security scan queue.',
  scanning: 'A security scan is currently running on this file.',
  clean: 'A security scan completed and found no threats.',
  quarantined: 'Flagged by a security scan. Preview and download are disabled.',
  unknown: 'This file has not been security-scanned. Treat it with care.',
};

/**
 * Normalize any stored/read value to a valid scan status. Anything
 * unexpected (null, missing column on old rows, garbage) becomes 'unknown' —
 * the only honest fallback.
 */
export function normalizeScanStatus(value: unknown): FileScanStatus {
  return (FILE_SCAN_STATUSES as readonly string[]).includes(value as string)
    ? (value as FileScanStatus)
    : DEFAULT_SCAN_STATUS;
}

export function isQuarantined(status: unknown): boolean {
  return normalizeScanStatus(status) === 'quarantined';
}

/**
 * The instruction shown whenever quarantine blocks an action. This is not a
 * generic error: it names the state, the blocked action, and what the user
 * can do about it.
 */
export function quarantineBlockedMessage(action: 'download' | 'preview' | 'copy'): string {
  return (
    `This file is quarantined and cannot be ${action === 'copy' ? 'copied' : `${action}ed`}. ` +
    'It was flagged by a security scan as potentially harmful. ' +
    'Contact your workspace administrator to request a security review — do not share this file.'
  );
}

export interface ScanStatusUpdate {
  status: FileScanStatus;
  reason?: string | null;
}

/**
 * Quarantine a file. This is the function a real scanner (or a workspace
 * admin tool) calls when a scan flags a file. It is NOT called by the upload
 * path — new uploads honestly start as 'unknown'.
 */
export async function quarantineFile(
  prisma: {
    file: { update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown> };
  },
  fileId: string,
  reason: string,
): Promise<void> {
  await prisma.file.update({
    where: { id: fileId },
    data: { scanStatus: 'quarantined', scanReason: reason, scannedAt: new Date() },
  });
}

/**
 * Record a scan verdict from a real scanner. Never call this with a faked
 * verdict — 'clean' here must mean an actual scan ran.
 */
export async function markScanResult(
  prisma: {
    file: { update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown> };
  },
  fileId: string,
  update: ScanStatusUpdate,
): Promise<void> {
  await prisma.file.update({
    where: { id: fileId },
    data: {
      scanStatus: normalizeScanStatus(update.status),
      scanReason: update.reason ?? null,
      scannedAt: new Date(),
    },
  });
}

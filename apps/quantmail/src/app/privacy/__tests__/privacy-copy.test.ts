// ============================================================================
// Privacy page copy-honesty: every word is an instruction or a provable truth
// (user-locked 2026-10-07 design rule).
//
// Findings (lane-1 QM-SCREEN-018 R3 audit, 2026-10-12):
//   P1. The page contradicted itself on operational-log retention: the data
//       matrix said "scrubbed within 7 days" while §5 said "scrubbed and
//       permanently destroyed within 30 days". Wired evidence (verified
//       2026-10-12): staging terraform wires the EKS service CloudWatch log
//       groups to retention_in_days = 7
//       (infra/terraform/environments/staging/main.tf -> modules/monitoring).
//       The single evidenced figure is 7 days — both spots are pinned to it.
//   P2. §5 claimed "immutable 30-day rotation schedule, after which
//       cryptographic shredding occurs" for backups. Zero code evidence: the
//       live RDS instance quant-staging-postgres reports
//       BackupRetentionPeriod = 7 (terraform staging: backup_retention_period
//       = 7). No "immutable" / "cryptographic shredding" mechanism exists.
//   P2. The page claimed AES-256 / AES-256-GCM at rest in four places, but the
//       live staging RDS instance reports StorageEncrypted = False (boto3
//       describe-db-instances, verified 2026-10-12) — at-rest encryption is
//       configured in the terraform RDS module but NOT enabled on the live
//       database, so the page must not claim it. Only the provable
//       "TLS 1.3 in transit" formulation remains.
//
// These tests pin the fixed copy via source assertions (same pattern as the
// settings section of auth-copy-honesty.test.tsx): JSX comments are stripped
// so audit notes may name a removed claim without tripping the assertions.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const privacySource = readFileSync(
  (function findPrivacySource(): string {
    const rels = [
      'src/app/privacy/page.tsx',
      'apps/quantmail/src/app/privacy/page.tsx',
    ];
    let dir = process.cwd();
    for (let depth = 0; depth < 8; depth++) {
      for (const rel of rels) {
        const candidate = join(dir, rel);
        if (existsSync(candidate)) return candidate;
      }
      const parent = join(dir, '..');
      if (parent === dir) break;
      dir = parent;
    }
    throw new Error(
      `privacy-copy: could not locate src/app/privacy/page.tsx from ${process.cwd()}`,
    );
  })(),
  'utf8',
);

// Strip JSX block comments and line comments; only user-facing strings are
// subject to the provable-truth rule (audit notes may name removed claims).
const userFacing = privacySource
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/(^|\s)\/\/[^\n]*/g, '');

describe('Privacy page copy honesty', () => {
  it('states a single consistent operational-log retention figure (7 days)', () => {
    // Data matrix row ("App Performance & Logs") and §5 must agree.
    expect(userFacing).toMatch(/scrubbed within 7 days/);
    expect(userFacing).toMatch(/permanently destroyed within 7 days/);
    // The old contradictory 30-day operational-log figure must not return.
    expect(userFacing).not.toMatch(/within 30 days/);
  });

  it('never claims cryptographic shredding or immutable backups', () => {
    expect(userFacing).not.toMatch(/shredding/i);
    expect(userFacing).not.toMatch(/immutable/i);
  });

  it('states the evidenced 7-day backup rotation, honestly worded', () => {
    expect(userFacing).toMatch(/rolling rotation/);
    expect(userFacing).toMatch(/currently 7 days/);
  });

  it('never claims at-rest encryption is active (only the honest rollout note)', () => {
    // The old §4 card claimed "persisted with authenticated AES-256-GCM
    // encryption ... rotated according to NIST SP 800-57 guidelines" — none of
    // that is provable while the live database reports StorageEncrypted=False.
    expect(userFacing).not.toMatch(/AES-256/);
    expect(userFacing).not.toMatch(/AES-GCM/);
    expect(userFacing).not.toMatch(/persisted with[\s\S]{0,60}encryption/i);
    expect(userFacing).not.toMatch(/NIST SP 800-57/);
  });

  it('uses one consistent, provable in-transit formulation everywhere', () => {
    const matches = userFacing.match(/TLS 1\.3 in transit/g) ?? [];
    // At-a-glance tile + the three data-matrix rows all carry it.
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });

  it('keeps the honest at-rest rollout note (no false claim, no silence)', () => {
    expect(userFacing).toMatch(/not yet enabled on the live database/);
  });
});

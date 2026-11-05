// ============================================================================
// Privacy page copy-honesty: every word is an instruction or a provable truth
// (user-locked 2026-10-07 design rule).
//
// AMENDMENT 2026-10-30 (Wave-9 Slice A5, retention-claims wins):
// The two 7-day tests below are re-pinned to the page's current "no fixed
// schedule" wording. Reason, evidenced on main: the 7-day figures are
// staging-AWS terraform only (log_retention_days = 7, RDS backup 7),
// while production terraform says 30 (logs) / 35 (primary backups) / 14
// (prod-v2), app audit logs are immutable (403), and the live OCI target
// has no retention config at all. Stating staging figures as live policy
// on a public page would be false for production, and privacy-copy's
// 7-day requirements directly contradict privacy-retention-claims.test.ts
// (which forbids those exact substrings on the raw page source). The
// privacy page itself is NOT changed by this amendment.
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

const accountSettingsSource = readFileSync(
  (function findAccountSettingsSource(): string {
    const rels = [
      'src/app/settings/account/page.tsx',
      'apps/quantmail/src/app/settings/account/page.tsx',
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
      `privacy-copy: could not locate src/app/settings/account/page.tsx from ${process.cwd()}`,
    );
  })(),
  'utf8',
);

// Strip JSX block comments and line comments; only user-facing strings are
// subject to the provable-truth rule (audit notes may name removed claims).
const userFacing = privacySource
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/(^|\s)\/\/[^\n]*/g, '');

const accountUserFacing = accountSettingsSource
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/(^|\s)\/\/[^\n]*/g, '');

describe('Privacy page copy honesty', () => {
  it('states no fixed operational-log scrubbing/destruction schedule is published', () => {
    // Page §5 today: "No fixed scrubbing or destruction schedule is
    // currently published for them." That honest wording is pinned here,
    // instead of the staging-only 7-day figures (see amendment note above).
    // Data matrix row ("App Performance & Logs") and §5 must agree.
    expect(userFacing).toMatch(/No fixed scrubbing or/);
    expect(userFacing).not.toMatch(/scrubbed within 7 days/);
    expect(userFacing).not.toMatch(/permanently destroyed within 7 days/);
    // The old contradictory 30-day operational-log figure must not return.
    expect(userFacing).not.toMatch(/within 30 days/);
  });

  it('never claims cryptographic shredding or immutable backups', () => {
    expect(userFacing).not.toMatch(/shredding/i);
    expect(userFacing).not.toMatch(/immutable/i);
  });

  it('states no fixed backup rotation period is published', () => {
    // JSX source wraps this sentence after "fixed". Whitespace is layout,
    // not a published policy change; keep the substantive copy guard strict.
    expect(userFacing.replace(/\s+/g, ' ')).toContain(
      'No fixed rotation period is currently published.',
    );
    expect(userFacing).not.toMatch(/currently\s+7\s+days/);
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

  it('does not badge the Messages row "Never Shared" (SES is the delivery pipeline)', () => {
    // Outbound mail passes through AWS SES (backend/lib/ses-sender.ts,
    // SESv2 SendEmail), which by construction handles message content — the
    // old emerald "Never Shared" cell contradicted this and the honest
    // settings security copy. The row must disclose AWS SES as the processor.
    const messagesRow = userFacing.match(
      />Messages<\/td>([\s\S]*?)<\/tr>/,
    );
    expect(messagesRow).not.toBeNull();
    expect(messagesRow![1]).not.toMatch(/Never Shared/);
    expect(messagesRow![1]).toMatch(/AWS SES \(mail delivery\)/);
  });

  it('discloses the AWS SES processor under the data matrix', () => {
    expect(userFacing).toMatch(/Processor disclosure/);
    expect(userFacing).toMatch(/AWS SES/);
    expect(userFacing).toMatch(/handles message[\s\S]{0,30}content in order to hand it to the recipient/);
  });

  it('At-a-glance tile agrees with the SES disclosure (no "No External Sharing")', () => {
    // The old "Data Sharing: No External Sharing" tile contradicted the
    // processor disclosure on the same page.
    expect(userFacing).not.toMatch(/No External Sharing/);
    expect(userFacing).toMatch(/Mail delivery only \(AWS SES\)/);
  });

  it('settings account security card claims only provable TLS in transit', () => {
    // Same unprovable-at-rest family as PR #954's login/settings fix: the card
    // read "TLS 1.2+ & AES-256" / "Enforced encryption in transit and
    // encrypted data storage at rest" while the live RDS reports
    // StorageEncrypted=False. Restricted to the provable transit half.
    expect(accountUserFacing).not.toMatch(/at rest/i);
    expect(accountUserFacing).not.toMatch(/AES-256/);
    expect(accountUserFacing).toMatch(/TLS 1\.2\+ in transit/);
    expect(accountUserFacing).toMatch(/Enforced encryption in transit\./);
  });
});

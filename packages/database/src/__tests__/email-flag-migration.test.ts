import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const prismaDir = join(here, '..', '..', 'prisma');
const migrationsDir = join(prismaDir, 'migrations');
const migrationSqlPath = join(
  migrationsDir,
  '0111_email_is_flagged',
  'migration.sql',
);
const schemaPath = join(prismaDir, 'schema.prisma');

function readOrFail(path: string): string {
  expect(existsSync(path), `expected file to exist: ${path}`).toBe(true);
  return readFileSync(path, 'utf8');
}

describe('0111_email_is_flagged migration matches schema and safety constraints', () => {
  const sql = readOrFail(migrationSqlPath);
  const schema = readOrFail(schemaPath);

  it('directory sorts after both 0110_* directories and is the only 0111_* directory', () => {
    const entries = readdirSync(migrationsDir).filter((e) => !e.includes('.'));
    const zero110s = entries.filter((e) => e.startsWith('0110_'));
    const zero111s = entries.filter((e) => e.startsWith('0111_'));

    expect(zero110s.length).toBe(2);
    expect(zero111s).toEqual(['0111_email_is_flagged']);

    for (const dir110 of zero110s) {
      expect('0111_email_is_flagged' > dir110).toBe(true);
    }
  });

  it('header comments contain required recovery text and error identifiers', () => {
    expect(sql).toContain('P3009');
    expect(sql).toContain(
      'prisma migrate resolve --rolled-back 0111_email_is_flagged',
    );
    expect(sql).toContain('lock_timeout');
    expect(sql).toContain('ACCESS EXCLUSIVE');
  });

  it('outside comments holds exactly two statements in exact order', () => {
    // Strip comments (both single-line '--' and multi-line if any)
    const withoutComments = sql
      .split('\n')
      .map((line) => {
        const commentIdx = line.indexOf('--');
        return commentIdx >= 0 ? line.slice(0, commentIdx) : line;
      })
      .join('\n')
      .trim();

    const statements = withoutComments
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);

    expect(statements).toHaveLength(2);
    expect(statements[0]).toBe("SET LOCAL lock_timeout = '3s'");
    expect(statements[1]).toBe(
      'ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "isFlagged" BOOLEAN NOT NULL DEFAULT false',
    );
  });

  it('contains no destructive or locking DDL operations', () => {
    const forbidden = [
      'DROP',
      'TRUNCATE',
      'DELETE',
      'UPDATE',
      'RENAME',
      'ALTER COLUMN',
      'ALTER TYPE',
      'SET NOT NULL',
      'CLUSTER',
      'VACUUM',
      'CREATE INDEX',
    ];

    // Strip comments to only check executable SQL
    const withoutComments = sql
      .split('\n')
      .map((line) => {
        const commentIdx = line.indexOf('--');
        return commentIdx >= 0 ? line.slice(0, commentIdx) : line;
      })
      .join('\n')
      .toUpperCase();

    for (const verb of forbidden) {
      expect(withoutComments).not.toContain(verb);
    }
  });

  it('matches Email model isFlagged field definition in schema.prisma', () => {
    const emailModelMatch = schema.match(/model Email \{([\s\S]*?)\n\}/m);
    expect(emailModelMatch).toBeTruthy();
    const emailBlock = emailModelMatch?.[1] ?? '';

    // Field must be defined as Boolean with default(false)
    expect(emailBlock).toMatch(/isFlagged\s+Boolean\s+@default\(false\)/);

    // Verify it is placed right next to isPinned
    const isPinnedIdx = emailBlock.indexOf('isPinned');
    const isFlaggedIdx = emailBlock.indexOf('isFlagged');
    expect(isPinnedIdx).toBeGreaterThan(0);
    expect(isFlaggedIdx).toBeGreaterThan(isPinnedIdx);
  });
});

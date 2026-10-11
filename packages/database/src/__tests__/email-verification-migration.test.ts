import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Guards the class of bug fixed by migration 0090: PR #940 added the
// EmailVerificationCode model to schema.prisma but shipped no migration, so
// the table did not exist at runtime. This test fails if the schema model and
// its migration ever drift apart again. No database required.
const here = dirname(fileURLToPath(import.meta.url));
const prismaDir = join(here, '..', '..', 'prisma');
const migrationSqlPath = join(
  prismaDir,
  'migrations',
  '0090_email_verification_code',
  'migration.sql',
);
const schemaPath = join(prismaDir, 'schema.prisma');

function readOrFail(path: string): string {
  expect(existsSync(path), `expected file to exist: ${path}`).toBe(true);
  return readFileSync(path, 'utf8');
}

// Minimal parse of the `model EmailVerificationCode { ... }` block in
// schema.prisma: field name -> { type, optional, array, attributes }.
function parseModel(schema: string, modelName: string) {
  const blockMatch = schema.match(
    new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`, 'm'),
  );
  const block = blockMatch?.[1];
  expect(block, `model ${modelName} not found in schema.prisma`).toBeTruthy();
  const fields: Record<string, { type: string; optional: boolean }> = {};
  const indexes: string[][] = [];
  let mapName = '';
  for (const line of (block as string).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;
    if (trimmed.startsWith('@@index')) {
      const cols = trimmed.match(/\[([^\]]+)\]/)?.[1] ?? '';
      indexes.push(cols.split(',').map((c) => c.trim()));
      continue;
    }
    if (trimmed.startsWith('@@map')) {
      mapName = trimmed.match(/"([^"]+)"/)?.[1] ?? '';
      continue;
    }
    if (trimmed.startsWith('@@') || trimmed.startsWith('@relation') || !trimmed.includes(' ')) continue;
    const [name, type] = trimmed.split(/\s+/);
    if (name && type && !type.startsWith('@')) {
      fields[name] = { type, optional: type.endsWith('?') };
    }
  }
  return { fields, indexes, mapName };
}

describe('0090_email_verification_code migration matches schema', () => {
  const sql = readOrFail(migrationSqlPath);
  const schema = readOrFail(schemaPath);
  const model = parseModel(schema, 'EmailVerificationCode');

  it('creates the mapped table name', () => {
    expect(model.mapName).toBe('email_verification_codes');
    expect(sql).toContain('CREATE TABLE "email_verification_codes"');
  });

  it('has one column per scalar model field with the right nullability', () => {
    // Prisma postgresql mapping: String -> TEXT, DateTime -> TIMESTAMP(3),
    // Int -> INTEGER, Boolean -> BOOLEAN.
    const expected: Record<string, { ddl: string; nullable: boolean }> = {
      id: { ddl: '"id" TEXT NOT NULL', nullable: false },
      userId: { ddl: '"userId" TEXT NOT NULL', nullable: false },
      codeHash: { ddl: '"codeHash" TEXT NOT NULL', nullable: false },
      expiresAt: { ddl: '"expiresAt" TIMESTAMP(3) NOT NULL', nullable: false },
      usedAt: { ddl: '"usedAt" TIMESTAMP(3)', nullable: true },
      attempts: { ddl: '"attempts" INTEGER NOT NULL DEFAULT 0', nullable: false },
      requestedIp: { ddl: '"requestedIp" TEXT', nullable: true },
      createdAt: {
        ddl: '"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP',
        nullable: false,
      },
    };
    // Every scalar field in the schema model must have a matching column.
    for (const [field, info] of Object.entries(model.fields)) {
      if (info.type === 'User') continue; // relation field, no column
      const col = expected[field];
      expect(
        col,
        `schema field "${field}" has no expected column mapping in this test`,
      ).toBeTruthy();
      expect(sql).toContain((col as { ddl: string }).ddl);
    }
    // usedAt must be nullable (single-use marker set after verification).
    expect(sql).not.toMatch(/"usedAt" TIMESTAMP\(3\) NOT NULL/);
  });

  it('stores only a hash, never a plaintext code column', () => {
    expect(sql).toContain('"codeHash"');
    expect(sql.toLowerCase()).not.toMatch(/"code"\s+text/);
  });

  it('has a primary key on id', () => {
    expect(sql).toContain('CONSTRAINT "email_verification_codes_pkey" PRIMARY KEY ("id")');
  });

  it('creates one index per @@index in the model', () => {
    expect(model.indexes).toEqual([['userId'], ['expiresAt']]);
    for (const cols of model.indexes) {
      const indexName = `email_verification_codes_${cols.join('_')}_idx`;
      expect(sql).toContain(`CREATE INDEX "${indexName}"`);
    }
  });

  it('cascades deletes to the users table', () => {
    expect(sql).toContain(
      'FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE',
    );
  });
});

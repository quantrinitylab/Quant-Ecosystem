// ============================================================================
// quant_core - outbox migration test (M6: modifier queue, W2)
//
// v1 → v2: builds a v1 database with raw SQL (via package:sqlite3, the
// same engine drift uses — DDL column names verified against the
// generated v1 code), stamps `user_version = 1`, inserts v1 rows, then
// opens the file as [MailDatabase] (schemaVersion 2, fresh executor) and
// verifies the migration preserves every v1 row while the new
// `outbox_operations` table accepts inserts.
//
// The two phases use separate connections by design: drift runs the
// migration when IT opens the database (pre-opening the executor would
// skip the migration entirely).
// ============================================================================

import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;
import 'package:quant_core/src/mail/cache/mail_database.dart';
import 'package:quant_core/src/mail/outbox/outbox_op.dart';
import 'package:quant_core/src/mail/outbox/outbox_store.dart';
import 'package:sqlite3/sqlite3.dart';

/// Writes the exact v1 schema (drift snake_case column names, verified
/// against the generated v1 code) plus sample rows into [file].
void _buildV1Database(String path) {
  final db = sqlite3.open(path);
  try {
    db.execute(
      'CREATE TABLE cached_threads ('
      'thread_id TEXT NOT NULL PRIMARY KEY, '
      'payload_json TEXT NOT NULL, '
      'updated_at_epoch INTEGER NOT NULL)',
    );
    db.execute(
      'CREATE TABLE cached_emails ('
      'id TEXT NOT NULL PRIMARY KEY, '
      'payload_json TEXT NOT NULL)',
    );
    db.execute(
      'CREATE TABLE email_pages ('
      'page_key TEXT NOT NULL PRIMARY KEY, '
      'payload_json TEXT NOT NULL)',
    );
    db.execute(
      'CREATE TABLE thread_pages ('
      'page_key TEXT NOT NULL PRIMARY KEY, '
      'thread_ids_json TEXT NOT NULL, '
      'has_more INTEGER NOT NULL)',
    );
    db.execute(
      'CREATE TABLE sync_state ('
      '"key" TEXT NOT NULL PRIMARY KEY, '
      'value TEXT NOT NULL)',
    );
    db.execute(
      "INSERT INTO cached_threads (thread_id, payload_json, updated_at_epoch)"
      " VALUES ('t1', '{\"id\":\"t1\"}', 1720000000000)",
    );
    db.execute(
      'INSERT INTO sync_state ("key", value)'
      " VALUES ('emails_since', 'cursor-1')",
    );
    db.execute('PRAGMA user_version = 1');
  } finally {
    db.dispose();
  }
}

void main() {
  test('v1 -> v2 migration preserves data and adds outboxOperations',
      () async {
    final dir = await Directory.systemTemp.createTemp('outbox_migration');
    addTearDown(() => dir.delete(recursive: true));
    final file = File(p.join(dir.path, 'v1.db'));

    _buildV1Database(file.path);

    // Fresh file-backed executor: drift reads user_version = 1 <
    // schemaVersion 2 and runs the v1 → v2 MigrationStep
    // (createTable outboxOperations).
    final db = MailDatabase(NativeDatabase(file));
    addTearDown(db.close);

    // First query runs the migration; every v1 row must survive it.
    final threads = await db.select(db.cachedThreads).get();
    expect(threads.map((t) => t.threadId), contains('t1'));
    expect(threads.singleWhere((t) => t.threadId == 't1').payloadJson,
        '{"id":"t1"}');

    final cursor = await (db.select(db.syncState)
          ..where((t) => t.key.equals('emails_since')))
        .getSingleOrNull();
    expect(cursor?.value, 'cursor-1');

    // The new table exists and accepts inserts through the real store.
    final store = DriftOutboxStore(db);
    final op = OutboxOp(
      idempotencyKey: 't1:markRead',
      action: OutboxAction.markRead,
      emailIds: const ['m1'],
    );
    await store.enqueue(op);
    final pending = await store.pendingOps();
    expect(pending.map((o) => o.opId), contains(op.opId));
  });
}

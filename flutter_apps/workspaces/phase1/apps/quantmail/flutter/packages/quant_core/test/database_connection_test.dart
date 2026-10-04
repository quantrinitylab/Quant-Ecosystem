// ============================================================================
// quant_core - database connection seam tests (VQA-P1-04: drift web seam)
//
// Verifies the conditional-import connection seam (`database_connection*`)
// on IO platforms (VM — `flutter test`):
//   1. `openDatabaseConnection()` performs no I/O at call time (returns a
//      lazy executor).
//   2. `openInMemoryDatabaseConnection()` backs a real, working
//      [MailDatabase]: schema is created and a full insert→select
//      round-trip through the generated tables succeeds.
//   3. `MailDatabase.memory()` and `MailDatabase.disk()` still route
//      through the seam: `.memory()` works for tests; `.disk()`
//      constructs WITHOUT touching the filesystem (path_provider is only
//      hit on first query).
//   4. The web seam file compiles clean under dart2js (verified via
//      `flutter build web` on quant_app, not via these VM tests — the web
//      factories intentionally throw a documented UnsupportedError at
//      first query until the wasm asset pipeline is wired; see
//      `database_connection_web.dart`).
//
// No mocks: everything here runs against real sqlite through the real seam.
// ============================================================================

import 'package:drift/drift.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/src/mail/cache/database_connection.dart';
import 'package:quant_core/src/mail/cache/mail_database.dart';

void main() {
  group('database_connection seam (IO)', () {
    test('openInMemoryDatabaseConnection returns a working executor',
        () async {
      final executor = openInMemoryDatabaseConnection();
      expect(executor, isA<QueryExecutor>());

      final db = MailDatabase(executor);
      addTearDown(db.close);

      // Real schema round-trip through the generated tables: proves the
      // seam's executor is a live sqlite connection, not a placeholder.
      await db.into(db.cachedThreads).insert(
            CachedThreadsCompanion.insert(
              threadId: 'seam-t1',
              payloadJson: '{"id":"seam-t1"}',
              updatedAtEpoch: 123,
            ),
          );
      final rows = await db.select(db.cachedThreads).get();
      expect(rows, hasLength(1));
      expect(rows.single.threadId, 'seam-t1');
      expect(rows.single.payloadJson, '{"id":"seam-t1"}');
      expect(rows.single.updatedAtEpoch, 123);
    });

    test('MailDatabase.memory() still works via the seam', () async {
      final db = MailDatabase.memory();
      addTearDown(db.close);

      await db.into(db.cachedEmails).insert(
            CachedEmailsCompanion.insert(
              id: 'seam-m1',
              payloadJson: '{"id":"seam-m1"}',
            ),
          );
      final rows = await db.select(db.cachedEmails).get();
      expect(rows, hasLength(1));
      expect(rows.single.id, 'seam-m1');
    });

    test('MailDatabase.disk() constructs without touching the filesystem',
        () async {
      // Pre-seam behavior preserved: LazyDatabase defers path_provider /
      // the filesystem until the first query. Constructing (and closing
      // without querying) must not throw — in particular, no
      // MissingPluginException from path_provider in a unit test.
      final db = MailDatabase.disk();
      await db.close();
    });

    test('openDatabaseConnection() performs no I/O at call time', () {
      // If the factory touched path_provider or the filesystem here, this
      // would throw (MissingPluginException) under `flutter test`.
      final executor = openDatabaseConnection();
      expect(executor, isA<QueryExecutor>());
    });

    test('schema version is still 2 through a seam-built database',
        () async {
      final db = MailDatabase(openInMemoryDatabaseConnection());
      addTearDown(db.close);
      expect(db.schemaVersion, 2);
      // Touch the connection so onCreate runs; outbox table must exist.
      await db.customSelect('SELECT COUNT(*) AS c FROM outbox_operations')
          .getSingle();
    });
  });
}

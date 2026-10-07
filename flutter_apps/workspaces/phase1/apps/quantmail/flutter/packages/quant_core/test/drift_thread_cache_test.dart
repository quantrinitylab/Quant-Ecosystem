// ============================================================================
// quant_core - drift thread-cache tests (M4: W5)
//
// Tests for W1's SQLite thread-list cache ([DriftThreadCache] over
// `MailDatabase.memory()`): page round-trips, upsert/update semantics,
// delete-tombstone page-membership cleanup, sync-cursor round-trip, and
// full clear().
//
// BLOCKED on codegen: `lib/src/mail/cache/mail_database.g.dart` does not
// exist yet (W1 is running `build_runner`). Until the generated part lands,
// `flutter test test/drift_thread_cache_test.dart` cannot compile. This
// file is written against the REAL landed API (read from
// drift_thread_cache.dart / thread_cache.dart / mail_database.dart) so it
// runs green the moment codegen lands — no mocks, no invented names.
//
// Run once codegen exists:
//   flutter test test/drift_thread_cache_test.dart
// ============================================================================

import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/src/mail/cache/drift_thread_cache.dart';
import 'package:quant_core/src/mail/cache/mail_database.dart';
import 'package:quant_core/src/mail/models/thread.dart';

/// Builds a thread summary fixture.
ThreadSummary _thread(String id, {String? subject}) => ThreadSummary(
      id: id,
      subject: subject ?? 'Subject $id',
      snippet: 'Snippet $id',
    );

void main() {
  late MailDatabase db;
  late DriftThreadCache cache;

  setUp(() {
    db = MailDatabase.memory();
    cache = DriftThreadCache(db);
    addTearDown(db.close);
  });

  test('cold read returns null', () async {
    expect(
      await cache.readThreadPage(page: 1, pageSize: 50),
      isNull,
    );
    expect(await cache.readSyncCursor(), isNull);
  });

  test('writeThreadPage -> readThreadPage round-trips threads + hasMore',
      () async {
    final threads = [_thread('t1'), _thread('t2'), _thread('t3')];
    await cache.writeThreadPage(
      page: 1,
      pageSize: 50,
      threads: threads,
      hasMore: true,
    );

    final page = await cache.readThreadPage(page: 1, pageSize: 50);
    expect(page, isNotNull);
    expect(page!.hasMore, isTrue);
    expect(
      page.threads.map((t) => t.id).toList(),
      ['t1', 't2', 't3'],
      reason: 'page order is preserved',
    );
    expect(page.threads.first.subject, 'Subject t1');

    // A page written with hasMore=false round-trips as false.
    await cache.writeThreadPage(
      page: 2,
      pageSize: 50,
      threads: [_thread('t9')],
      hasMore: false,
    );
    final page2 = await cache.readThreadPage(page: 2, pageSize: 50);
    expect(page2, isNotNull);
    expect(page2!.hasMore, isFalse);
    expect(page2.threads.single.id, 't9');
  });

  test('upsertThread updates an existing row in place', () async {
    await cache.writeThreadPage(
      page: 1,
      pageSize: 50,
      threads: [_thread('t1', subject: 'Old subject')],
      hasMore: false,
    );

    await cache.upsertThread(_thread('t1', subject: 'New subject'));

    final page = await cache.readThreadPage(page: 1, pageSize: 50);
    expect(page, isNotNull);
    expect(page!.threads, hasLength(1),
        reason: 'upsert replaces, never duplicates');
    expect(page.threads.single.subject, 'New subject');
  });

  test('deleteThread removes the row and its page membership', () async {
    await cache.writeThreadPage(
      page: 1,
      pageSize: 50,
      threads: [_thread('t1'), _thread('t2')],
      hasMore: false,
    );
    // A thread upserted outside any page (e.g. by delta sync).
    await cache.upsertThread(_thread('t3'));

    await cache.deleteThread('t1');

    final page = await cache.readThreadPage(page: 1, pageSize: 50);
    expect(page, isNotNull);
    expect(
      page!.threads.map((t) => t.id).toList(),
      ['t2'],
      reason: 'deleted thread is gone from the page membership',
    );

    await cache.deleteThread('t3');
    // Deleting an id that was never on a page is a no-op, not an error.
    final pageAgain = await cache.readThreadPage(page: 1, pageSize: 50);
    expect(pageAgain!.threads.map((t) => t.id).toList(), ['t2']);
  });

  test('sync cursor write/read round-trip', () async {
    expect(await cache.readSyncCursor(), isNull);

    await cache.writeSyncCursor('cursor-abc');
    expect(await cache.readSyncCursor(), 'cursor-abc');

    // Overwrite replaces the previous cursor.
    await cache.writeSyncCursor('cursor-def');
    expect(await cache.readSyncCursor(), 'cursor-def');
  });

  test('clear() drops pages, threads, emails and the cursor', () async {
    await cache.writeThreadPage(
      page: 1,
      pageSize: 50,
      threads: [_thread('t1')],
      hasMore: true,
    );
    await cache.upsertThread(_thread('t9'));
    await cache.writeSyncCursor('cursor-abc');

    await cache.clear();

    expect(await cache.readThreadPage(page: 1, pageSize: 50), isNull);
    expect(await cache.readThread('t1'), isNull);
    expect(await cache.readSyncCursor(), isNull,
        reason: 'the sync cursor is cleared too (sign-out semantics)');
  });

  group('readThread (single-thread lookup, M6 seam)', () {
    test('write page -> readThread finds each thread', () async {
      await cache.writeThreadPage(
        page: 1,
        pageSize: 50,
        threads: [_thread('t1'), _thread('t2')],
        hasMore: false,
      );

      final t1 = await cache.readThread('t1');
      expect(t1, isNotNull);
      expect(t1!.id, 't1');
      expect(t1.subject, 'Subject t1');

      final t2 = await cache.readThread('t2');
      expect(t2, isNotNull);
      expect(t2!.id, 't2');
    });

    test('unknown id returns null', () async {
      await cache.writeThreadPage(
        page: 1,
        pageSize: 50,
        threads: [_thread('t1')],
        hasMore: false,
      );
      expect(await cache.readThread('nope'), isNull);
    });

    test('upsert-only threads are readable without any page write', () async {
      await cache.upsertThread(_thread('solo', subject: 'Solo subject'));
      final found = await cache.readThread('solo');
      expect(found, isNotNull);
      expect(found!.subject, 'Solo subject');
    });

    test('readThread sees upsert updates and deleteThread tombstones',
        () async {
      await cache.upsertThread(_thread('t1', subject: 'v1'));
      await cache.upsertThread(_thread('t1', subject: 'v2'));
      expect((await cache.readThread('t1'))?.subject, 'v2',
          reason: 'upserts replace the payload readThread returns');

      await cache.deleteThread('t1');
      expect(await cache.readThread('t1'), isNull,
          reason: 'deleted threads are gone from single-thread reads too');
    });

    test('readThread is eviction-free: reads do not disturb pages', () async {
      await cache.writeThreadPage(
        page: 1,
        pageSize: 50,
        threads: [_thread('t1'), _thread('t2')],
        hasMore: true,
      );

      // Repeated reads of the same and unknown ids.
      await cache.readThread('t1');
      await cache.readThread('t1');
      await cache.readThread('missing');

      final page = await cache.readThreadPage(page: 1, pageSize: 50);
      expect(page, isNotNull);
      expect(page!.hasMore, isTrue);
      expect(page.threads.map((t) => t.id).toList(), ['t1', 't2']);
    });
  });
}

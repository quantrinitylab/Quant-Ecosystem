// ============================================================================
// quant_core - cache Riverpod providers (M4: drift persistence layer)
// ============================================================================
//
// App-lifetime wiring for the drift database and the offline caches:
// repositories read [MailCache]/[ThreadListCache] through these providers.
// Tests override [driftDatabaseProvider] with `MailDatabase.memory()` via
// `ProviderContainer(overrides: [...])`.

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../mail_providers.dart';
import 'drift_mail_cache.dart';
import 'drift_thread_cache.dart';
import 'mail_database.dart';
import 'thread_cache.dart';

/// The shared drift database, opened once for the app's lifetime.
///
/// [MailDatabase.disk] routes through the `database_connection` seam
/// (conditional import): native sqlite at `<app-documents>/quantmail.db`
/// on IO platforms (lazy — the file is only touched on first query), and
/// a documented limitation on web (see `database_connection_web.dart`:
/// the wasm asset pipeline is not wired yet, so first use on web throws
/// a loud [UnsupportedError] rather than fake-persisting).
/// Closed on dispose.
final driftDatabaseProvider = Provider<MailDatabase>(
  (ref) {
    final db = MailDatabase.disk();
    ref.onDispose(db.close);
    return db;
  },
  name: 'driftDatabaseProvider',
);

/// Offline-cache seam for email pages and messages, backed by SQLite.
final mailCacheProvider = Provider<MailCache>(
  (ref) => DriftMailCache(ref.watch(driftDatabaseProvider)),
  name: 'mailCacheProvider',
);

/// Offline-cache seam for the thread list and the sync cursor, backed by
/// SQLite.
final threadListCacheProvider = Provider<ThreadListCache>(
  (ref) => DriftThreadCache(ref.watch(driftDatabaseProvider)),
  name: 'threadListCacheProvider',
);

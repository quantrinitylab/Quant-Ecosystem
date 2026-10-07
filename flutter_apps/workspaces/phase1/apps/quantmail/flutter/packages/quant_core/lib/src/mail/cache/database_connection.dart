// ============================================================================
// quant_core - platform database connection seam (VQA-P1-04: drift web seam)
// ============================================================================
//
// Conditional-import facade over the per-platform SQLite connection
// factories. Importing this file is web-safe: the platform file is chosen
// at COMPILE time, so `dart:ffi` (via drift/native) never enters the
// dart2js import graph on web.
//
// Resolution:
//   - `dart.library.js_interop` → [database_connection_web.dart]
//     (browser / dart2js / dart2wasm)
//   - `dart.library.io`         → [database_connection_io.dart]
//     (VM: Android, iOS, desktop, `flutter test`)
//   - neither                   → [database_connection_stub.dart]
//     (throws [UnsupportedError]; documents the missing platform)
//
// Behavior contract (all platforms):
// - [openDatabaseConnection] performs NO I/O when called. The returned
//   executor opens the real database lazily on first query (IO), or defers
//   the platform error to first query (web — see [database_connection_web]).
// - [openInMemoryDatabaseConnection] is for tests and ephemeral state;
//   on IO it is `NativeDatabase.memory()`.

import 'package:drift/drift.dart';

import 'database_connection_stub.dart'
    if (dart.library.js_interop) 'database_connection_web.dart'
    if (dart.library.io) 'database_connection_io.dart' as impl;

/// Opens the platform-appropriate persistent database connection.
///
/// No I/O happens at call time — the executor defers opening until the
/// first query. IO platforms open `<app-documents>/quantmail.db` via
/// sqlite; see [database_connection_web.dart] for the current web
/// limitation.
QueryExecutor openDatabaseConnection() => impl.openDatabaseConnection();

/// Opens an in-memory database connection.
///
/// Intended for unit tests and ephemeral state. Backed by sqlite on IO
/// platforms; see [database_connection_web.dart] for the web limitation.
QueryExecutor openInMemoryDatabaseConnection() =>
    impl.openInMemoryDatabaseConnection();

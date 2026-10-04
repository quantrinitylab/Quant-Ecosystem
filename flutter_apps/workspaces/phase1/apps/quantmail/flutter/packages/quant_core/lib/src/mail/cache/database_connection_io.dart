// ============================================================================
// quant_core - database connection, IO platforms (VQA-P1-04: drift web seam)
// ============================================================================
//
// `dart:io` implementation of the [database_connection] seam: Android, iOS,
// desktop, and the VM test runner. Selected by the conditional import in
// [database_connection.dart]; never compiled into the web build.

import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// Opens `<app-documents>/quantmail.db` via the native sqlite driver.
///
/// Wrapped in [LazyDatabase] so `path_provider` (and the filesystem) are
/// only touched on the FIRST query — never at provider-construction time.
/// Behavior is byte-identical to the pre-seam `_openConnection()` that
/// lived in `mail_database.dart`.
QueryExecutor openDatabaseConnection() => LazyDatabase(() async {
      final dir = await getApplicationDocumentsDirectory();
      final file = File(p.join(dir.path, 'quantmail.db'));
      return NativeDatabase(file);
    });

/// In-memory sqlite for unit tests — no filesystem, no path_provider.
QueryExecutor openInMemoryDatabaseConnection() => NativeDatabase.memory();

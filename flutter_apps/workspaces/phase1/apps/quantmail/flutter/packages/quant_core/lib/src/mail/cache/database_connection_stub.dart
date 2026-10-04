// ============================================================================
// quant_core - database connection stub (VQA-P1-04: drift web seam)
// ============================================================================
//
// Fallback implementation selected by [database_connection.dart] when the
// target platform matches NEITHER `dart.library.io` NOR
// `dart.library.js_interop`. Declares the same API surface so the facade
// compiles everywhere; every call throws [UnsupportedError] with the
// platform documented.

import 'package:drift/drift.dart';

/// Stub: this platform has neither `dart:io` nor `dart:js_interop`, so no
/// SQLite backend is available.
QueryExecutor openDatabaseConnection() => throw UnsupportedError(
      'quant_core: no database connection is available on this platform '
      '(neither dart:io nor dart:js_interop).',
    );

/// Stub: this platform has neither `dart:io` nor `dart:js_interop`, so no
/// in-memory SQLite backend is available.
QueryExecutor openInMemoryDatabaseConnection() => throw UnsupportedError(
      'quant_core: no in-memory database connection is available on this '
      'platform (neither dart:io nor dart:js_interop).',
    );

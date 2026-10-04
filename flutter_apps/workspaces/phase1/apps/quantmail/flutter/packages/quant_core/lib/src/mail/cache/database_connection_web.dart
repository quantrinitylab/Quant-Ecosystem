// ============================================================================
// quant_core - database connection, web (VQA-P1-04: drift web seam)
// ============================================================================
//
// `dart:js_interop` implementation of the [database_connection] seam
// (browser / dart2js / dart2wasm). Selected by the conditional import in
// [database_connection.dart]; imports ONLY `package:drift/drift.dart`
// (platform-neutral), so `dart:ffi` never enters the web compile graph.
//
// ----------------------------------------------------------------------------
// WEB LIMITATION (honest, current): the offline mail cache is UNAVAILABLE
// on web in this build — no sqlite backend exists on this platform yet.
// ----------------------------------------------------------------------------
//
// Why (verified against drift 2.31.0 + sqlite3 2.9.4 package sources):
// - drift's only web executor is `WasmDatabase` (`package:drift/wasm.dart`).
//   Using it requires a PREBUILT `sqlite3.wasm` binary plus drift worker
//   assets deployed under the app's `web/` folder, loaded at runtime via
//   `WasmSqlite3.loadFromUrl(...)`.
// - The sqlite3 package ships ONLY C sources (`assets/wasm/*.c`) — no
//   prebuilt binary. Building one needs the emscripten toolchain, and
//   deploying it needs changes under `packages/quant_app/web/`, which is
//   outside the scope that owns this seam.
// - There is NO pure-Dart in-memory `QueryExecutor` in drift (verified:
//   every executor in drift 2.31.0 is either `dart:ffi`-based
//   (`NativeDatabase`) or wasm-based (`WasmDatabase`)), so an
//   "in-memory-only cache on web" is not realizable with drift alone.
//
// Current behavior: both factories return a [LazyDatabase] whose open
// callback throws a documented [UnsupportedError] on the FIRST QUERY.
// Construction stays lazy and safe — the app boots and the Riverpod
// provider graph builds — but any cache read/write on web fails loudly
// with this message instead of silently pretending to persist.
// Callers needing graceful degradation (network-only on web) must handle
// this; that fault-tolerance seam is follow-up work, not part of VQA-P1-04.
//
// TODO(UNVERIFIED): wire the real wasm path (follow-up, needs wasm assets
// in `packages/quant_app/web/` — owned by the web program, out of W1
// scope). Recipe, unverified end-to-end:
//   1. Build `sqlite3.wasm` from the sqlite3 package C sources with
//      emscripten, copy to `quant_app/web/sqlite3.wasm` (+ drift worker).
//   2. In this file:
//        final sqlite3 = await WasmSqlite3.loadFromUrl(Uri.parse('sqlite3.wasm'));
//        sqlite3.registerVirtualFileSystem(
//            IndexedDbFileSystem('quantmail-db'), makeDefault: true);
//        return WasmDatabase.inMemory(sqlite3); // or WasmDatabase(sqlite3: ..., path: 'quantmail.db', fileSystem: ...)
//      (wrap in LazyDatabase as today).
//   3. Verify on a real browser (headless Chrome here has no GPU, so
//      CanvasKit never initializes — rendering can't be verified locally).

import 'package:drift/drift.dart';

/// Web has no sqlite backend yet (see file doc): fails loudly on first
/// query with a documented error instead of fake-persisting.
QueryExecutor openDatabaseConnection() => LazyDatabase(() async {
      throw UnsupportedError(
        'quant_core: the offline mail cache is not available on web yet — '
        'the drift WasmDatabase asset pipeline (sqlite3.wasm under '
        'quant_app/web/) is not wired. See database_connection_web.dart.',
      );
    });

/// Web has no sqlite backend yet (see file doc): fails loudly on first
/// query with a documented error instead of fake-persisting.
QueryExecutor openInMemoryDatabaseConnection() => LazyDatabase(() async {
      throw UnsupportedError(
        'quant_core: in-memory sqlite is not available on web — drift has '
        'no pure-Dart executor (only dart:ffi and wasm). The wasm asset '
        'pipeline is not wired; see database_connection_web.dart.',
      );
    });

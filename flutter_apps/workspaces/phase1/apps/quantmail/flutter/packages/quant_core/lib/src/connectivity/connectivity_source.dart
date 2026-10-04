// ============================================================================
// quant_core - connectivity source abstraction (M6, W1)
//
// Seam between [ConnectivityWatcher] and the connectivity_plus plugin.
//
// Contract:
// - [isOnline] returns `true` when any network route is believed available.
// - [onlineChanges] emits a value ONLY when the online state changes —
//   consecutive duplicates are never emitted by this stream. It NEVER emits
//   an error: platform/plugin failures (e.g. MissingPluginException in
//   test envs) are swallowed and the stream simply yields no event.
//
// This keeps the watcher logic unit-testable without the platform channel
// and keeps plugin failures from tearing down the app's listener.
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/services.dart';

/// Online-state seam consumed by [ConnectivityWatcher].
///
/// Implementations map the platform's notion of "connected" onto a bool.
/// The [onlineChanges] stream emits only transitions and never errors.
abstract class ConnectivitySource {
  /// Whether the device is believed to be online right now.
  ///
  /// Implementations must not throw: on any failure they return `false`.
  Future<bool> isOnline();

  /// Emits `true`/`false` when the online state CHANGES.
  ///
  /// Never emits an error. Never emits two consecutive identical values.
  Stream<bool> get onlineChanges;
}

/// [ConnectivitySource] backed by the connectivity_plus plugin.
///
/// Mapping rule: [ConnectivityResult.none] → offline; every other result
/// (wifi, mobile, ethernet, vpn, bluetooth, other) → online. A result list
/// containing `none` is offline (per plugin docs, `none` never co-occurs
/// with anything else, but `contains` is the defensive read).
class ConnectivityPlusSource implements ConnectivitySource {
  /// Creates the source. Injects a [Connectivity] instance for tests that
  /// need to drive the real wrapper without the platform singleton.
  ConnectivityPlusSource([Connectivity? connectivity])
      : _connectivity = connectivity ?? Connectivity();

  final Connectivity _connectivity;

  /// Whether platform channels can be touched at all right now.
  ///
  /// Mirrors `MethodChannel._findBinaryMessenger`'s decision: channels
  /// resolve through [BackgroundIsolateBinaryMessenger] when there is no
  /// root-isolate token, otherwise through `ServicesBinding.instance` —
  /// which throws when no binding is initialized (plain unit tests). The
  /// EventChannel's attach callbacks (`onListen`/`onCancel`) run lazily in
  /// later microtasks, where no try/catch around `listen()`/`cancel()` can
  /// reach a throw — so the unusable case is detected eagerly here and the
  /// stream degrades to "no events" instead of throwing into the zone.
  static bool get _channelsUsable {
    if (ServicesBinding.rootIsolateToken == null) return true;
    try {
      ServicesBinding.instance;
    } on Object {
      return false;
    }
    return true;
  }

  @override
  Future<bool> isOnline() async {
    try {
      final results = await _connectivity.checkConnectivity();
      return _toOnline(results);
    } on Object {
      // No platform channel (test env), plugin failure, anything: offline.
      return false;
    }
  }

  @override
  Stream<bool> get onlineChanges {
    if (!_channelsUsable) {
      // Plain unit tests (no binding): the EventChannel would throw on
      // attach — report no transitions instead; the watcher stays on its
      // seeded (offline) state.
      return const Stream<bool>.empty();
    }
    return _connectivity.onConnectivityChanged
        .map(_toOnline)
        .distinct()
        // Swallow platform/plugin errors — the stream contract forbids
        // error events (in test envs MissingPluginException is common).
        .handleError((Object _) {});
  }

  static bool _toOnline(List<ConnectivityResult> results) =>
      !results.contains(ConnectivityResult.none);
}

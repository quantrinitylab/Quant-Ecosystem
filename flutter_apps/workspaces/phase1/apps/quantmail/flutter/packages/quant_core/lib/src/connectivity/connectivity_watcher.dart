// ============================================================================
// quant_core - offline→online transition watcher (M6, W1)
//
// [ConnectivityWatcher] turns [ConnectivitySource.onlineChanges] into a
// single, debounced, never-throwing [onReconnect] callback. The app wires
// that callback to "delta-sync, then drain the outbox" via
// `connectivityWatcherProvider` (see `../mail/sync/sync_providers.dart`).
//
// Design (M6 deep note):
// - Transitions only: if the app starts while already online, NO callback
//   fires — the inbox performs its own initial refresh; firing a drain here
//   would double-fire network work on every cold start.
// - Trailing debounce (default 500 ms) guards against flapping radios
//   (online→offline→online within a tunnel). Only the last transition
//   inside the window fires.
// - The callback's errors are swallowed here (logged via debugPrint) — a
//   sync/drain failure must never kill the listener or propagate into the
//   connectivity stream.
// - The watcher never decides WHO may drain: the provider wiring checks
//   the session guard before calling sync/drain. Firing while signed out
//   would mark pending outbox ops permanently failed (401 → failed in
//   [OutboxDrainer._classify]), so that check lives one layer up.
import 'dart:async';

import 'package:flutter/foundation.dart';

import 'connectivity_source.dart';

/// Watches [ConnectivitySource.onlineChanges] and fires [onReconnect] on
/// debounced offline→online transitions.
///
/// Start/stop semantics:
/// - [start] is idempotent: calling it twice re-seeds and re-subscribes;
///   the previous subscription/timer is cancelled first, so exactly one
///   listener ever exists per watcher instance.
/// - [dispose] cancels the subscription and any pending timer. Double
///   dispose is safe. After dispose, no callback fires again.
class ConnectivityWatcher {
  /// Creates the watcher.
  ///
  /// [onReconnect] runs on every debounced false→true transition. Its
  /// errors are caught and logged here; it never propagates.
  ConnectivityWatcher({
    required ConnectivitySource source,
    required Future<void> Function() onReconnect,
    this.debounce = const Duration(milliseconds: 500),
  })  : _source = source,
        _onReconnect = onReconnect;

  final ConnectivitySource _source;
  final Future<void> Function() _onReconnect;

  /// Trailing debounce window for flapping transitions.
  final Duration debounce;

  StreamSubscription<bool>? _subscription;
  Timer? _debounceTimer;
  bool _lastOnline = false;
  bool _disposed = false;

  /// Bumped on every [start]/[dispose]. Events and seed completions carrying
  /// an older generation are ignored, so a replaced subscription can never
  /// act on state that no longer belongs to it.
  int _generation = 0;

  /// Seeds the current state, then subscribes to transitions.
  ///
  /// Idempotent: a second call detaches the previous subscription/timer
  /// synchronously before re-seeding, so exactly one listener is ever
  /// active per watcher instance. The old subscription's `cancel()` is
  /// intentionally NOT awaited — awaiting it would stall re-subscription
  /// on a slow platform channel; the generation guard makes a racing
  /// stale event harmless instead.
  ///
  /// Never throws: a failing [ConnectivitySource.isOnline] seeds offline,
  /// and subscription errors are treated as offline events.
  Future<void> start() async {
    _disposed = false;
    final generation = ++_generation;
    _detachLocked();

    bool seededOnline;
    try {
      seededOnline = await _source.isOnline();
    } on Object {
      // The source contract says isOnline never throws, but a fake in a
      // test might — treat as offline rather than breaking startup.
      seededOnline = false;
    }
    // A newer start()/dispose() landed while the seed was in flight: this
    // generation is stale, leave the fresh state alone.
    if (generation != _generation || _disposed) return;
    _lastOnline = seededOnline;

    // NOTE: the listen() call itself can throw SYNCHRONOUSLY (not as a
    // stream error) when the platform channel has no binding — plain unit
    // tests hit "Binding has not yet been initialized" here, while widget
    // tests get a MissingPluginException as an async stream error instead.
    // Either way the watcher must survive: on a listen failure we simply
    // stay on the seeded state with no listener (no events, no crash).
    try {
      _subscription = _source.onlineChanges.listen(
        (online) => _onEvent(online, generation),
        // The source contract forbids error events; this is belt-and-braces
        // so a contract violation can never tear down the listener.
        onError: (Object _) {},
        cancelOnError: false,
      );
    } on Object {
      _subscription = null;
    }
  }

  /// Cancels the subscription and any pending debounce timer.
  ///
  /// Safe to call more than once and safe to call before [start].
  void dispose() {
    _disposed = true;
    _generation++;
    _detachLocked();
  }

  /// Synchronously detaches the current subscription and timer. The old
  /// subscription's `cancel()` runs in the background (never awaited);
  /// [start]/[dispose] never block on the platform channel.
  ///
  /// Like [start]'s listen, `cancel()` itself can throw synchronously when
  /// the platform channel has no binding (plain unit tests) — swallowed
  /// here so disposal never throws.
  void _detachLocked() {
    _debounceTimer?.cancel();
    _debounceTimer = null;
    final sub = _subscription;
    _subscription = null;
    if (sub != null) {
      try {
        unawaited(sub.cancel().then(
          (_) {},
          // A failing cancel must never surface out of start()/dispose().
          onError: (Object _) {},
        ));
      } on Object {
        // The subscription was already dead (or the platform channel is
        // gone); nothing left to detach.
      }
    }
  }

  void _onEvent(bool online, int generation) {
    if (_disposed || generation != _generation) return;
    final wasOffline = !_lastOnline;
    _lastOnline = online;
    if (online && wasOffline) {
      _debounceTimer?.cancel();
      _debounceTimer = Timer(debounce, () {
        _debounceTimer = null;
        if (_disposed) return;
        // Re-check: if we flapped back offline inside the window, skip.
        if (!_lastOnline) return;
        unawaited(_runReconnect());
      });
    } else {
      // Any other event (offline, or duplicate online) kills a pending fire.
      _debounceTimer?.cancel();
      _debounceTimer = null;
    }
  }

  Future<void> _runReconnect() async {
    try {
      await _onReconnect();
    } on Object catch (error, stackTrace) {
      // Never propagate: a failing reconnect callback must not kill the
      // listener or the zone that owns it.
      debugPrint('[quantmail] ConnectivityWatcher.onReconnect failed: $error');
      debugPrint(stackTrace.toString());
    }
  }
}

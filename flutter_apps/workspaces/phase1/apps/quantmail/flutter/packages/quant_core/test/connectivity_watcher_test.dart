// ============================================================================
// quant_core - unit tests: ConnectivityWatcher + reconnect provider wiring
// (M6, W1)
//
// [ConnectivityWatcher] turns offline→online transitions into a single
// debounced [onReconnect] callback; `connectivityWatcherProvider` wires that
// callback to "syncNow() then drainOutbox()" guarded by the session check.
//
// All timing uses [fakeAsync] (exported by flutter_test): the debounce
// [Timer] is created inside the fake zone, so `async.elapse` advances it
// deterministically with no real waiting.
//
// Note: [StreamController.add] delivers events via microtasks, so every
// `setOnline` is followed by `flushMicrotasks()` BEFORE `elapse` — the
// timer only exists once the event has been delivered.

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fake_async/fake_async.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_foundation/quant_foundation.dart';

/// Fake [ConnectivitySource] driven manually from tests.
///
/// Broadcast stream: mirrors the production [ConnectivityPlusSource] (whose
/// `onConnectivityChanged` is a broadcast EventChannel stream) and lets the
/// watcher re-subscribe after a detach even when the old subscription's
/// `cancel()` future hasn't completed (as in fake_async zones).
class _FakeConnectivitySource implements ConnectivitySource {
  _FakeConnectivitySource({bool seedOnline = false})
      : _seedOnline = seedOnline;

  final bool _seedOnline;

  /// When `true`, [isOnline] throws instead of returning the seed.
  bool seedThrows = false;

  final _controller = StreamController<bool>.broadcast();

  /// Emits a transition event into the stream.
  void setOnline(bool online) => _controller.add(online);

  /// Closes the controller; the watcher tolerates a closed stream.
  Future<void> close() => _controller.close();

  @override
  Future<bool> isOnline() async {
    if (seedThrows) {
      throw StateError('no connectivity service');
    }
    return _seedOnline;
  }

  @override
  Stream<bool> get onlineChanges => _controller.stream;
}

/// Recording [MailSyncService] for the provider-wiring tests.
class _RecordingSync extends MailSyncService {
  _RecordingSync(super.ref);

  final calls = <String>[];

  /// When `true`, [syncNow] reports a failed run (drain must be skipped).
  bool failSync = false;

  @override
  Future<SyncResult> syncNow({int pageLimit = 100}) async {
    calls.add('syncNow');
    if (failSync) {
      return const SyncResult(
        appliedUpserts: 0,
        appliedDeletes: 0,
        error: ApiError(
          code: 'NETWORK',
          message: 'offline',
          statusCode: 0,
        ),
      );
    }
    return const SyncResult(appliedUpserts: 0, appliedDeletes: 0);
  }

  @override
  Future<void> drainOutbox() async {
    calls.add('drainOutbox');
  }
}

void main() {
  group('ConnectivityWatcher', () {
    test('start while already online fires nothing (transitions only)', () {
      fakeAsync((async) {
        final source = _FakeConnectivitySource(seedOnline: true);
        var calls = 0;
        final watcher = ConnectivityWatcher(
          source: source,
          onReconnect: () async => calls++,
        );
        addTearDown(watcher.dispose);
        addTearDown(source.close);

        watcher.start();
        async.flushMicrotasks();
        async.elapse(const Duration(milliseconds: 600));
        async.flushMicrotasks();

        expect(calls, 0);
      });
    });

    test('offline→online fires exactly once after the debounce elapses', () {
      fakeAsync((async) {
        final source = _FakeConnectivitySource();
        var calls = 0;
        final watcher = ConnectivityWatcher(
          source: source,
          onReconnect: () async => calls++,
        );
        addTearDown(watcher.dispose);
        addTearDown(source.close);

        watcher.start();
        async.flushMicrotasks();

        source.setOnline(true);
        async.flushMicrotasks(); // deliver the event → timer starts
        async.elapse(const Duration(milliseconds: 400));
        async.flushMicrotasks();
        expect(calls, 0); // debounce window not over yet

        async.elapse(const Duration(milliseconds: 200));
        async.flushMicrotasks();
        expect(calls, 1); // window over → exactly one fire

        // A duplicate online event is not a transition: still one.
        source.setOnline(true);
        async.flushMicrotasks();
        async.elapse(const Duration(milliseconds: 600));
        async.flushMicrotasks();
        expect(calls, 1);
      });
    });

    test('flapping within the debounce window collapses to one fire', () {
      fakeAsync((async) {
        final source = _FakeConnectivitySource();
        var calls = 0;
        final watcher = ConnectivityWatcher(
          source: source,
          onReconnect: () async => calls++,
        );
        addTearDown(watcher.dispose);
        addTearDown(source.close);

        watcher.start();
        async.flushMicrotasks();

        // online→offline→online→offline→online, all inside the window.
        for (final online in [true, false, true, false, true]) {
          source.setOnline(online);
          async.flushMicrotasks();
          async.elapse(const Duration(milliseconds: 100));
        }
        async.flushMicrotasks();
        expect(calls, 0); // still inside the trailing window

        async.elapse(const Duration(milliseconds: 600));
        async.flushMicrotasks();
        expect(calls, 1);
      });
    });

    test('online→offline never fires', () {
      fakeAsync((async) {
        final source = _FakeConnectivitySource(seedOnline: true);
        var calls = 0;
        final watcher = ConnectivityWatcher(
          source: source,
          onReconnect: () async => calls++,
        );
        addTearDown(watcher.dispose);
        addTearDown(source.close);

        watcher.start();
        async.flushMicrotasks();

        source.setOnline(false);
        async.flushMicrotasks();
        async.elapse(const Duration(milliseconds: 600));
        async.flushMicrotasks();

        expect(calls, 0);
      });
    });

    test('events after dispose are ignored (double dispose is safe)', () {
      fakeAsync((async) {
        final source = _FakeConnectivitySource();
        var calls = 0;
        final watcher = ConnectivityWatcher(
          source: source,
          onReconnect: () async => calls++,
        );
        addTearDown(source.close);

        watcher.start();
        async.flushMicrotasks();
        watcher.dispose();
        watcher.dispose(); // must not throw

        source.setOnline(true);
        async.flushMicrotasks();
        async.elapse(const Duration(milliseconds: 600));
        async.flushMicrotasks();

        expect(calls, 0);
      });
    });

    test('isOnline() throwing is treated as offline, start() never throws',
        () {
      fakeAsync((async) {
        final source = _FakeConnectivitySource()..seedThrows = true;
        var calls = 0;
        final watcher = ConnectivityWatcher(
          source: source,
          onReconnect: () async => calls++,
        );
        addTearDown(watcher.dispose);
        addTearDown(source.close);

        watcher.start(); // must not throw even though the seed probe fails
        async.flushMicrotasks();

        // Offline-seeded, so the first online event is a real transition.
        source.setOnline(true);
        async.flushMicrotasks();
        async.elapse(const Duration(milliseconds: 600));
        async.flushMicrotasks();
        expect(calls, 1);
      });
    });

    test('a throwing onReconnect is swallowed and the watcher keeps working',
        () {
      fakeAsync((async) {
        final source = _FakeConnectivitySource();
        var calls = 0;
        final watcher = ConnectivityWatcher(
          source: source,
          onReconnect: () async {
            calls++;
            if (calls == 1) throw StateError('sync exploded');
          },
        );
        addTearDown(watcher.dispose);
        addTearDown(source.close);

        watcher.start();
        async.flushMicrotasks();

        source.setOnline(true);
        async.flushMicrotasks();
        async.elapse(const Duration(milliseconds: 600));
        async.flushMicrotasks();
        expect(calls, 1); // the throw did not fail the test

        // The next transition still fires the (now non-throwing) callback.
        source.setOnline(false);
        async.flushMicrotasks();
        async.elapse(const Duration(milliseconds: 600));
        source.setOnline(true);
        async.flushMicrotasks();
        async.elapse(const Duration(milliseconds: 600));
        async.flushMicrotasks();
        expect(calls, 2);
      });
    });

    test('start() is idempotent: second start replaces the subscription',
        () {
      fakeAsync((async) {
        final source = _FakeConnectivitySource();
        var calls = 0;
        final watcher = ConnectivityWatcher(
          source: source,
          onReconnect: () async => calls++,
        );
        addTearDown(watcher.dispose);
        addTearDown(source.close);

        watcher.start();
        async.flushMicrotasks();

        source.setOnline(true);
        async.flushMicrotasks(); // first subscription started its timer…
        watcher.start(); // …then re-seed cancels it and resubscribes
        async.flushMicrotasks();
        async.elapse(const Duration(milliseconds: 600));
        async.flushMicrotasks();
        expect(calls, 0); // re-seed saw offline: the stale event is gone

        // The new subscription still works.
        source.setOnline(true);
        async.flushMicrotasks();
        async.elapse(const Duration(milliseconds: 600));
        async.flushMicrotasks();
        expect(calls, 1);
      });
    });
  });

  group('connectivityWatcherProvider wiring', () {
    /// Container with the connectivity seam, the sync service seam, and the
    /// session guard all overridden for deterministic tests.
    ProviderContainer wiredContainer(
      _FakeConnectivitySource fake, {
      bool failSync = false,
      bool authenticated = true,
    }) {
      final container = ProviderContainer(
        overrides: [
          connectivitySourceProvider.overrideWithValue(fake),
          mailSyncServiceProvider.overrideWith(
            (ref) => _RecordingSync(ref)..failSync = failSync,
          ),
          isSessionAuthenticatedProvider.overrideWithValue(authenticated),
        ],
      );
      addTearDown(container.dispose);
      return container;
    }

    _RecordingSync syncOf(ProviderContainer container) =>
        container.read(mailSyncServiceProvider) as _RecordingSync;

    /// Reads the watcher (starting it) and settles the seed probe.
    void startWatcher(ProviderContainer container, FakeAsync async) {
      container.read(connectivityWatcherProvider);
      async.flushMicrotasks();
    }

    /// Drives one offline→online transition through the debounce window.
    void goOnline(_FakeConnectivitySource fake, FakeAsync async) {
      fake.setOnline(true);
      async.flushMicrotasks();
      async.elapse(const Duration(milliseconds: 600));
      async.flushMicrotasks();
    }

    test('offline→online runs syncNow then drainOutbox, in order', () {
      fakeAsync((async) {
        final fake = _FakeConnectivitySource();
        addTearDown(fake.close);
        final container = wiredContainer(fake);

        startWatcher(container, async);
        goOnline(fake, async);

        expect(syncOf(container).calls, ['syncNow', 'drainOutbox']);
      });
    });

    test('failed syncNow skips the drain', () {
      fakeAsync((async) {
        final fake = _FakeConnectivitySource();
        addTearDown(fake.close);
        final container = wiredContainer(fake, failSync: true);

        startWatcher(container, async);
        goOnline(fake, async);

        expect(syncOf(container).calls, ['syncNow']);
      });
    });

    test('signed-out session skips sync and drain entirely', () {
      fakeAsync((async) {
        final fake = _FakeConnectivitySource();
        addTearDown(fake.close);
        final container =
            wiredContainer(fake, authenticated: false);

        startWatcher(container, async);
        goOnline(fake, async);

        expect(syncOf(container).calls, isEmpty);
      });
    });

    test('no transition fires while starting online', () {
      fakeAsync((async) {
        final fake = _FakeConnectivitySource(seedOnline: true);
        addTearDown(fake.close);
        final container = wiredContainer(fake);

        startWatcher(container, async);
        async.elapse(const Duration(milliseconds: 600));
        async.flushMicrotasks();

        expect(syncOf(container).calls, isEmpty);
      });
    });
  });
}

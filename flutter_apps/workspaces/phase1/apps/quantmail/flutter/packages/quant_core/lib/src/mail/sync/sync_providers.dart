// ============================================================================
// quant_core - delta-sync providers (M4, W3)
// ============================================================================

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/auth_providers.dart';
import '../../connectivity/connectivity.dart';
import 'mail_sync_service.dart';

/// The delta-sync engine, shared app-wide.
///
/// Constructed over [Ref] so the cache ([threadListCacheProvider]) and API
/// seams ([emailChangesApiProvider], [threadsApiProvider]) resolve lazily
/// per call — tests override those providers without touching this one.
final mailSyncServiceProvider = Provider<MailSyncService>(
  (ref) => MailSyncService(ref),
  name: 'mailSyncServiceProvider',
);

/// Connectivity seam (M6): override-friendly [ConnectivitySource].
///
/// Tests override this with a fake (e.g. driven by a `StreamController`);
/// production gets [ConnectivityPlusSource] over the platform plugin.
final connectivitySourceProvider = Provider<ConnectivitySource>(
  (ref) => ConnectivityPlusSource(),
  name: 'connectivitySourceProvider',
);

/// App-lifetime connectivity watcher: offline→online transitions trigger
/// delta-sync followed by the outbox drain (M6, W1).
///
/// Plain [Provider] (not autoDispose) — one instance per container, matching
/// the drainer's app-lifetime semantics. `ref.onDispose` tears the listener
/// down with the container.
///
/// Design (see `ConnectivityWatcher` and the `_classify` 401→permanent
/// hazard in `../outbox/outbox_drainer.dart`):
/// - Reconnect order is fixed: `syncNow()` FIRST, then `drainOutbox()`
///   ONLY on success. A successful sync is the real connectivity proof —
///   the connectivity plugin's false positives must never fire a drain
///   on their own.
/// - The drain NEVER fires while signed out: [isSessionAuthenticatedProvider]
///   guards the callback. A signed-out drain would send unauthenticated
///   requests, burn pending ops to `failed` on 401, and lose user data.
/// - Startup while already online fires NOTHING: the inbox does its own
///   initial refresh; the watcher is transitions-only.
final connectivityWatcherProvider = Provider<ConnectivityWatcher>(
  (ref) {
    final watcher = ConnectivityWatcher(
      source: ref.watch(connectivitySourceProvider),
      onReconnect: () async {
        try {
          // Session guard — see the 401→permanent hazard above.
          if (!ref.read(isSessionAuthenticatedProvider)) return;
          final sync = ref.read(mailSyncServiceProvider);
          final result = await sync.syncNow();
          if (result.succeeded) {
            await sync.drainOutbox();
          }
        } catch (_) {
          // The watcher already swallows callback errors; this is
          // belt-and-braces so a sync/drain throw can never escape the
          // provider into the connectivity stream.
        }
      },
    );
    ref.onDispose(watcher.dispose);
    // Fire-and-forget by design: seeding reads the platform channel once;
    // the watcher never throws out of start(), and failures seed offline.
    unawaited(watcher.start());
    return watcher;
  },
  name: 'connectivityWatcherProvider',
);

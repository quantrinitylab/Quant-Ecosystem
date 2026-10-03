// ============================================================================
// quant_core - outbox Riverpod providers (M6: modifier queue, W2)
//
// App-lifetime wiring for the persistent outbox:
//
// - [outboxStoreProvider] — the SQLite [OutboxStore] over the shared
//   [driftDatabaseProvider] (same database as the M4 caches; the
//   `OutboxOperations` table lives next to them).
// - [outboxDrainerProvider] — the single [OutboxDrainer], a plain
//   (non-autoDispose) [Provider] so one instance — and its single-writer
//   guard — lives for the whole app session. Closed on dispose.
// - [threadMutationServiceProvider] — the [ThreadMutationService]
//   modifier-queue entry point, composed over the thread-detail
//   repository, the outbox store/drainer, and the M4 caches.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../cache/cache_providers.dart';
import '../mail_providers.dart';
import '../../providers/core_providers.dart';
import '../thread_detail_providers.dart';
import '../compose/compose_api.dart';
import 'outbox_drainer.dart';
import 'outbox_op.dart';
import 'outbox_store.dart';
import '../thread_mutation_service.dart';

/// The persistent outbox store, backed by the shared drift database.
final outboxStoreProvider = Provider<OutboxStore>(
  (ref) => DriftOutboxStore(ref.watch(driftDatabaseProvider)),
  name: 'outboxStoreProvider',
);

/// The single outbox drainer for the app's lifetime.
///
/// Plain [Provider] (not autoDispose): exactly one instance per container,
/// so concurrent [OutboxDrainer.drain] calls always collapse into the one
/// in-flight drain via its single-writer guard.
///
/// The [ComposeApi] is constructed directly from [apiClientProvider] here
/// (not via `composeApiProvider` in `compose/compose_providers.dart`) to
/// avoid a provider import cycle: that file watches this drainer provider
/// for [ComposeService].
final outboxDrainerProvider = Provider<OutboxDrainer>(
  (ref) {
    final drainer = OutboxDrainer(
      store: ref.watch(outboxStoreProvider),
      emails: ref.watch(emailsApiProvider),
      compose: ComposeApi(ref.watch(apiClientProvider)),
    );
    ref.onDispose(drainer.dispose);
    return drainer;
  },
  name: 'outboxDrainerProvider',
);

/// The thread mutation service: synchronous local flip + persistent
/// outbox op + async drain (Superhuman's modifier-queue).
final threadMutationServiceProvider = Provider<ThreadMutationService>(
  (ref) => ThreadMutationService(
    repository: ref.watch(threadDetailRepositoryProvider),
    store: ref.watch(outboxStoreProvider),
    drainer: ref.watch(outboxDrainerProvider),
    emailsApi: ref.watch(emailsApiProvider),
    mailCache: ref.watch(mailCacheProvider),
    threadListCache: ref.watch(threadListCacheProvider),
  ),
  name: 'threadMutationServiceProvider',
);

/// Public UI surface for permanently-failed outbox ops: emits the current
/// `failed` snapshot as failures occur, driving the UI's retry/discard
/// affordance. (The service's rollback policy never auto-rolls the local
/// flip back — this stream is where failure becomes visible.)
final failedOpsProvider = StreamProvider<List<OutboxOp>>(
  (ref) => ref.watch(threadMutationServiceProvider).failedOps(),
  name: 'failedOpsProvider',
);

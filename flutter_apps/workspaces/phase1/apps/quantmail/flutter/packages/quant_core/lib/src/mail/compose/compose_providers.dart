// ============================================================================
// quant_core - compose Riverpod providers (M7: compose core, W2)
//
// App-lifetime wiring for the compose domain layer:
//
// - [composeApiProvider] — the thin [ComposeApi] surface on the shared,
//   authenticated [apiClientProvider] (pattern from `mail_providers.dart`).
// - [composeServiceProvider] — the [ComposeService] modifier-queue entry
//   point, composed over the persistent [OutboxStore] and the single
//   [OutboxDrainer].
//
// The coordinator adds these to `mail.dart` at reconcile (shared-file
// rule) — this file is the local declaration site only.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers/core_providers.dart';
import '../outbox/outbox_providers.dart';
import 'compose_api.dart';
import 'compose_service.dart';

/// Thin compose API surface on the shared authenticated client.
final composeApiProvider = Provider<ComposeApi>(
  (ref) => ComposeApi(ref.watch(apiClientProvider)),
  name: 'composeApiProvider',
);

/// The compose service: validation + write-ahead send enqueue + async
/// drain (Superhuman's modifier-queue).
final composeServiceProvider = Provider<ComposeService>(
  (ref) => ComposeService(
    store: ref.watch(outboxStoreProvider),
    drainer: ref.watch(outboxDrainerProvider),
  ),
  name: 'composeServiceProvider',
);

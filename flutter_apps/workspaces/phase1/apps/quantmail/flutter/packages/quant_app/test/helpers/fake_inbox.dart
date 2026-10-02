// ============================================================================
// quant_app - fake inbox notifier for widget tests (Phase 1, M4)
// ============================================================================
//
// Test double for [InboxListNotifier]: serves a fixed state without touching
// the network or the cache, so widget tests never depend on backend
// availability. `refresh`/`loadMore` are no-ops — pull-to-refresh and the
// load-more tail can't escape the test.

import 'dart:async';

import 'package:quant_core/quant_core.dart';

/// Deterministic [InboxListNotifier] for tests.
class FakeInboxNotifier extends InboxListNotifier {
  /// Serves [state] as the provider's data.
  FakeInboxNotifier.data(InboxListState state)
      : _result = Future<InboxListState>.value(state);

  /// Never completes [build]: the provider stays in the first-load spinner.
  FakeInboxNotifier.loading() : _result = Completer<InboxListState>().future;

  final Future<InboxListState> _result;

  @override
  Future<InboxListState> build() => _result;

  @override
  Future<void> refresh() async {}

  @override
  Future<void> loadMore() async {}
}

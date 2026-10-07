// ============================================================================
// quant_core - thread-detail providers (M5: W1)
//
// Riverpod state management for the thread detail screen (quant_app's
// `thread_screen.dart`, built on the contract below):
//
// - [threadDetailRepositoryProvider] — the [ThreadDetailRepository] over
//   [threadRepositoryProvider] + [emailsApiProvider], with the M4 drift
//   caches ([mailCacheProvider], [threadListCacheProvider]) wired in.
// - [threadDetailProvider] —
//   `AsyncNotifierProviderFamily<ThreadDetailNotifier, ThreadDetail, String>`
//   keyed by thread id, so each open thread owns isolated state.
//
// Contract for the thread screen:
//   `ref.watch(threadDetailProvider(threadId))` gives
//   `AsyncValue<ThreadDetail>`:
//   - `data.summary` ... thread summary for the header
//   - `data.messages` ... messages in display order (never null)
//   Call `ref.read(threadDetailProvider(threadId).notifier).refresh()` for
//   pull-to-refresh, and `.markReadOptimistic()` when the thread is opened:
//   the UI flips to read instantly and a `markRead` op is enqueued on the
//   modifier queue; the server confirm happens underneath and failures
//   surface on the `failedOps` stream (never rolled back).

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'cache/cache_providers.dart';
import 'mail_providers.dart';
import 'outbox/outbox_providers.dart';
import 'thread_detail_repository.dart';
import 'threads_api.dart';

/// Domain error for thread-detail load/refresh failures.
///
/// [ThreadDetailNotifier.build] never lets raw exceptions escape: they are
/// normalized to this type first, so the provider surface always carries a
/// meaningful [AsyncError] instead of an unhandled throw.
class ThreadDetailException implements Exception {
  /// Creates the exception with a human-readable [message].
  const ThreadDetailException(this.message);

  /// Human-readable failure description.
  final String message;

  @override
  String toString() => 'ThreadDetailException: $message';
}

/// Cache-through thread-detail repository with the M4 drift caches wired
/// in (unlike the M3 network-only `threadRepositoryProvider` default).
final threadDetailRepositoryProvider = Provider<ThreadDetailRepository>(
  (ref) => ThreadDetailRepository(
    ref.watch(threadRepositoryProvider),
    ref.watch(emailsApiProvider),
    ref.watch(mailCacheProvider),
    ref.watch(threadListCacheProvider),
  ),
  name: 'threadDetailRepositoryProvider',
);

/// Thread detail state, one instance per thread id.
final threadDetailProvider = AsyncNotifierProviderFamily<ThreadDetailNotifier,
    ThreadDetail, String>(
  ThreadDetailNotifier.new,
  name: 'threadDetailProvider',
);

/// Owns the detail state of a single thread (family arg = thread id).
///
/// - [build] is cache-first: a detail fetched earlier this session paints
///   instantly with zero network; otherwise the thread is resolved over
///   the network. Failures (and unexpected exceptions) surface as
///   [AsyncError] — `build` never throws a raw exception.
/// - [refresh] forces a network re-fetch, keeping the current detail
///   visible while loading; on failure the previous detail stays on
///   screen.
/// - [markReadOptimistic] flips the UI to read instantly (pure local
///   preview via [markThreadDetailRead]), then enqueues a `markRead` op on
///   the [ThreadMutationService] modifier queue. Returns `true` once the
///   op is ENQUEUED — the server confirm owns the [OutboxDrainer], not
///   this call. No rollback: permanent failures surface on the
///   `failedOps` stream (see `failedOpsProvider`) for retry/discard.
class ThreadDetailNotifier extends FamilyAsyncNotifier<ThreadDetail, String> {
  ThreadDetailRepository get _repository =>
      ref.read(threadDetailRepositoryProvider);

  @override
  Future<ThreadDetail> build(String threadId) async {
    try {
      final cached = await _repository.getCachedThread(threadId);
      if (cached != null) return cached;
      final result = await _repository.fetchThread(threadId);
      final detail = result.data;
      if (result.success && detail != null) return detail;
      throw ThreadDetailException(result.error?.message ??
          'Thread load nahi ho payi — internet check karke dobara try karo.');
    } on Object catch (e, stackTrace) {
      // Normalize before Riverpod converts the throw into AsyncError: the
      // provider surface carries ThreadDetailException, never a raw error.
      final normalized = e is ThreadDetailException
          ? e
          : ThreadDetailException(e.toString());
      Error.throwWithStackTrace(normalized, stackTrace);
    }
  }

  /// Pull-to-refresh: re-resolves the thread from the network.
  ///
  /// The existing detail stays visible behind the loading state
  /// (`copyWithPrevious`); when the re-fetch fails, the previous detail is
  /// restored instead of blanking the screen.
  Future<void> refresh() async {
    final threadId = arg;
    state = const AsyncLoading<ThreadDetail>().copyWithPrevious(state);
    ThreadDetail? fresh;
    try {
      final result =
          await _repository.fetchThread(threadId, forceRefresh: true);
      if (result.success) fresh = result.data;
    } on Object {
      // Fall through: `fresh` stays null and the previous detail is kept.
    }
    if (fresh != null) {
      state = AsyncValue.data(fresh);
      return;
    }
    final previous = state.valueOrNull;
    state = previous == null
        ? AsyncValue.error(
            const ThreadDetailException('Thread refresh nahi ho paya.'),
            StackTrace.current,
          )
        : AsyncValue.data(previous);
  }

  /// Marks the thread read with an instant UI flip plus a queued server
  /// confirm (M6 modifier-queue contract).
  ///
  /// Flips state to read immediately via [markThreadDetailRead], then
  /// calls [ThreadMutationService.markRead] with the thread id and the
  /// ids of the currently-unread messages — the service performs the
  /// local flip, enqueues the `markRead` op, and fires the drain. The
  /// repository's deprecated inline `markThreadRead` is deliberately NOT
  /// called here: the queue owns server confirms, and calling both would
  /// double-send.
  ///
  /// Returns `true` once the op is enqueued (queued, NOT server-confirmed).
  /// NO rollback: the local flip is never reverted — failure surfaces on
  /// the `failedOps` stream for retry/discard (see the service's rollback
  /// policy). The service/drainer never throw.
  Future<bool> markReadOptimistic() async {
    final threadId = arg;
    final previous = state.valueOrNull;
    var unreadIds = const <String>[];
    if (previous != null) {
      // Unread ids come from the PRE-flip state: after the flip every
      // message reads as read.
      unreadIds = previous.messages
          .where((m) => !m.isRead && m.id.isNotEmpty)
          .map((m) => m.id)
          .toList(growable: false);
      // Instant UI update; the service performs the same pure
      // transformation on its own copy, so the two stay in sync.
      state = AsyncValue.data(markThreadDetailRead(previous));
    }
    await ref.read(threadMutationServiceProvider).markRead(threadId, unreadIds);
    return true;
  }
}

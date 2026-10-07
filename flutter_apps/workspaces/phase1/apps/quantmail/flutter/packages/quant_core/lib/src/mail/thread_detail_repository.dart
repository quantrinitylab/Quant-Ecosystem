// ============================================================================
// quant_core - thread-detail repository (M5: W1)
//
// Cache-through, optimistic-read-state access to a single conversation
// thread:
//
// - [fetchThread] delegates to [ThreadRepository.fetchThread] (M3): network
//   resolve of the thread plus write-through of every message into
//   [MailCache]. Fetched details are also indexed in-memory (see
//   [getCachedThread]).
// - [getCachedThread] is the cache-first tier: details fetched earlier in
//   this session are served with zero network calls; cross-session, the
//   drift caches restore summary + messages.
// - [markThreadRead] is DEPRECATED (M6 part 2): the modifier queue
//   ([ThreadMutationService.markRead]) now owns server confirms. The inline
//   `POST /emails/batch` confirm below is kept for existing callers/tests
//   and will be removed after the UI migration.
//
// Design note (resolved, M6 part 2): the single-thread read seam now
// exists — [ThreadListCache.readThread] looks a thread summary up by id in
// CachedThreads, and [MailCache.readEmailsForThread] returns the cached
// messages for a thread id — so [getCachedThread] is now 3-tier: session
// index → cross-session summary + restored messages → null. Honest
// remaining gap: the cache only holds what it holds — deltas that arrived
// after the last sync stay missing until the next sync.

import 'package:quant_foundation/quant_foundation.dart';

import 'cache/thread_cache.dart';
import 'emails_api.dart';
import 'mail_providers.dart';
import 'models/email.dart';
import 'models/thread.dart';
import 'threads_api.dart';

/// Returns a copy of [detail] with every message (and the summary) marked
/// read. Pure function shared by the repository's optimistic write and the
/// notifier's instant UI preview, so the two can never disagree.
ThreadDetail markThreadDetailRead(ThreadDetail detail) {
  final messages =
      detail.messages.map(_markEmailRead).toList(growable: false);
  final summary = detail.summary;
  return ThreadDetail(
    summary: ThreadSummary(
      id: summary.id,
      subject: summary.subject,
      snippet: summary.snippet,
      messageCount: summary.messageCount,
      lastMessageDate: summary.lastMessageDate,
      // The summary is "all read" exactly when every message is read.
      isRead: messages.every((m) => m.isRead),
      participantNames: summary.participantNames,
      raw: summary.raw,
    ),
    messages: messages,
  );
}

/// Copies [email] with [Email.isRead] forced to `true` ([Email] is
/// immutable and carries no `copyWith`, so every field is carried over).
Email _markEmailRead(Email email) {
  if (email.isRead) return email;
  return Email(
    id: email.id,
    threadId: email.threadId,
    subject: email.subject,
    snippet: email.snippet,
    from: email.from,
    to: email.to,
    cc: email.cc,
    date: email.date,
    labels: email.labels,
    isRead: true,
    isStarred: email.isStarred,
    hasAttachments: email.hasAttachments,
    folderId: email.folderId,
  );
}

/// Cache-through repository for a single thread's detail plus optimistic
/// read-state.
///
/// Wraps the M3 [ThreadRepository] (network + [MailCache] write-through)
/// and [EmailsApi] (bulk `markRead` via `POST /emails/batch`). Both caches
/// are optional: omit them for the network-only behavior.
class ThreadDetailRepository {
  /// Creates a repository over [threads] and [emails].
  ///
  /// [mailCache] receives the optimistic message writes (and already
  /// receives write-through messages from [ThreadRepository.fetchThread]);
  /// [threadListCache] receives the optimistic summary write so the inbox
  /// row flips to read offline too.
  ThreadDetailRepository(
    this._threads,
    this._emails, [
    this._mailCache,
    this._threadListCache,
  ]);

  final ThreadRepository _threads;
  final EmailsApi _emails;
  final MailCache? _mailCache;
  final ThreadListCache? _threadListCache;

  /// Session-scoped detail index, populated by [fetchThread] (keyed by the
  /// requested id AND the resolved summary id, since `resolveThread`
  /// accepts an email id that maps to a different thread id).
  final Map<String, ThreadDetail> _detailIndex = {};

  /// Re-entrancy guard for [markThreadRead]: concurrent calls serialize on
  /// the first one rather than issuing duplicate batch requests.
  bool _markingRead = false;

  /// Fetches the full thread, writing messages through to [MailCache]
  /// (via [ThreadRepository]) and indexing the detail for [getCachedThread].
  Future<ApiResult<ThreadDetail>> fetchThread(
    String threadId, {
    bool forceRefresh = false,
  }) async {
    final result =
        await _threads.fetchThread(threadId, forceRefresh: forceRefresh);
    final detail = result.data;
    if (result.success && detail != null) {
      _indexDetail(threadId, detail);
    }
    return result;
  }

  /// Returns the thread detail fetched earlier this session (full
  /// messages, zero network calls), else restores it cross-session from
  /// the drift caches: [ThreadListCache.readThread] for the summary plus
  /// [MailCache.readEmailsForThread] for the messages.
  ///
  /// The cross-session tier returns a summary-only detail when no messages
  /// are cached for the thread (header still paints offline). Honest gap:
  /// the cache only holds what it holds — deltas that arrived after the
  /// last sync stay missing until the next sync. `null` when nothing is
  /// cached anywhere. Never touches the network — the notifier's `build()`
  /// uses this for the cache-first first paint.
  Future<ThreadDetail?> getCachedThread(String threadId) async {
    final indexed = _detailIndex[threadId];
    if (indexed != null) return indexed;
    final threadListCache = _threadListCache;
    if (threadListCache == null) return null;
    final summary = await threadListCache.readThread(threadId);
    if (summary == null) return null;
    final mailCache = _mailCache;
    final messages = mailCache == null
        ? const <Email>[]
        : await mailCache.readEmailsForThread(threadId);
    return ThreadDetail(summary: summary, messages: messages);
  }

  /// Marks every message of the thread as read, optimistically.
  ///
  /// DEPRECATED: the modifier queue ([ThreadMutationService.markRead]) now
  /// owns the local flip AND the server confirm. Calling this inline
  /// `POST /emails/batch` confirm alongside the queue would double-send —
  /// the UI must go through the queue (see `ThreadDetailNotifier`
  /// migration, M6 part 2). Kept only for existing callers/tests; it will
  /// be removed after the UI migration.
  @Deprecated(
    'Use ThreadMutationService.markRead — the modifier queue now owns '
    'server confirms. This inline batch-confirm will be removed after '
    'the UI migration.',
  )
  Future<ApiResult<ThreadDetail>> markThreadRead(String threadId) async {
    if (_markingRead) {
      final current = _detailIndex[threadId];
      if (current != null) return ApiResult.ok(current);
      return fetchThread(threadId);
    }
    _markingRead = true;
    try {
      return await _markThreadRead(threadId);
    } finally {
      _markingRead = false;
    }
  }

  Future<ApiResult<ThreadDetail>> _markThreadRead(String threadId) async {
    var detail = _detailIndex[threadId];
    if (detail == null) {
      final fetched = await fetchThread(threadId);
      if (!fetched.success || fetched.data == null) {
        return ApiResult.failure(fetched.error ??
            const ApiError(
              code: 'THREAD_NOT_FOUND',
              message: 'Read mark karne se pehle thread load nahi ho paya.',
              statusCode: 0,
            ));
      }
      detail = fetched.data!;
    }

    final unreadIds = detail.messages
        .where((m) => !m.isRead && m.id.isNotEmpty)
        .map((m) => m.id)
        .toList(growable: false);
    if (unreadIds.isEmpty) {
      // Already fully read: idempotent success, no network call.
      return ApiResult.ok(detail);
    }

    // Snapshot for rollback, then the optimistic write.
    final before = detail;
    final optimistic = markThreadDetailRead(detail);
    await _writeDetailToCache(optimistic);
    _indexDetail(threadId, optimistic);

    final confirm = await _emails.batch([
      {'action': 'markRead', 'emailIds': unreadIds},
    ]);
    if (confirm.success) {
      return ApiResult.ok(optimistic);
    }

    // Rollback: prefer the authoritative network state; fall back to the
    // pre-optimistic snapshot when the network is down too.
    final refetch = await _threads.fetchThread(threadId, forceRefresh: true);
    final authoritative = refetch.data;
    if (refetch.success && authoritative != null) {
      await _writeDetailToCache(authoritative);
      _indexDetail(threadId, authoritative);
    } else {
      await _writeDetailToCache(before);
      _indexDetail(threadId, before);
    }
    return ApiResult.failure(confirm.error ??
        const ApiError(
          code: 'MARK_READ_FAILED',
          message: 'Thread ko read mark nahi kar paye.',
          statusCode: 0,
        ));
  }

  /// Writes every message of [detail] to [MailCache] and its summary to
  /// [ThreadListCache] (each only when bound).
  Future<void> _writeDetailToCache(ThreadDetail detail) async {
    final mailCache = _mailCache;
    if (mailCache != null) {
      for (final message in detail.messages) {
        await mailCache.writeEmail(message);
      }
    }
    final threadListCache = _threadListCache;
    if (threadListCache != null) {
      await threadListCache.upsertThread(detail.summary);
    }
  }

  void _indexDetail(String requestedId, ThreadDetail detail) {
    _detailIndex[requestedId] = detail;
    _detailIndex[detail.summary.id] = detail;
  }
}

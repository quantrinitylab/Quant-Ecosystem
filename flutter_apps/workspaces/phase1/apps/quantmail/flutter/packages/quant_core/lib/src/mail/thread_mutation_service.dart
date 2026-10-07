// ============================================================================
// quant_core - thread mutation service (M6: modifier queue, W2)
//
// [ThreadMutationService] is the `modify()` half of Superhuman's
// modifier-queue pattern: every mutating user intent applies its local
// change SYNCHRONOUSLY (instant UI — the optimistic flip), then persists
// an [OutboxOp] and fires the [OutboxDrainer] (`persist()`, idempotent,
// async). The drainer owns every server call; this service never touches
// the network directly.
//
// Composition note: the local read-flip reuses the repository's EXISTING
// pure function [markThreadDetailRead] (imported from
// `thread_detail_repository.dart`, not rewritten) applied to the cached
// detail from [ThreadDetailRepository.getCachedThread], with cache
// write-through via the public [MailCache]/[ThreadListCache] seams — the
// same seams [ThreadDetailRepository] writes through. `markThreadRead`
// itself is deliberately NOT called: it performs the inline server confirm
// that the outbox now owns (calling it would double-send and fight the
// queue offline). For markUnread/archive/unarchive/delete the repository
// exposes no optimistic flip, so the (small, honest) local effects live
// here — there is no repository logic to duplicate.
//
// Idempotency: every op's key is [OutboxOp.idempotencyKeyFor] —
// `"<threadId>:<action>"`, stable across restarts, so a retried service
// call (double-tap, process restart) can never double-enqueue. Rapid
// same-action double-taps collapse; mixed sequences drain in order.
//
// ROLLBACK POLICY (graceful, Superhuman-style — NO auto-rollback):
// the local flip is never reverted when the server persist fails.
// - Transient failure → the op stays `pending` and retries on the next
//   drain; the local state stands as the user left it.
// - Permanent failure (4xx / poison-op) → the op moves to `failed` and
//   [failedOps] emits so the UI can surface retry/discard. The user's
//   intent is preserved locally; the next successful delta-sync
//   reconciles any divergence (server truth wins on sync).
// Auto-rolling back would yank the UI out from under the user on every
// tunnel/expired-token blip — strictly worse than a visible retry affordance.
import 'dart:async';

import 'cache/thread_cache.dart';
import 'emails_api.dart';
import 'mail_providers.dart';
import 'models/email.dart';
import 'models/thread.dart';
import 'outbox/outbox_drainer.dart';
import 'outbox/outbox_op.dart';
import 'outbox/outbox_store.dart';
import 'thread_detail_repository.dart';
import 'threads_api.dart';

/// Returns a copy of [detail] with every message (and the summary) marked
/// unread. Pure function mirroring the repository's [markThreadDetailRead]
/// ([Email] is immutable and carries no `copyWith`, so every field is
/// carried over).
ThreadDetail _markThreadDetailUnread(ThreadDetail detail) {
  final messages =
      detail.messages.map(_markEmailUnread).toList(growable: false);
  final summary = detail.summary;
  return ThreadDetail(
    summary: ThreadSummary(
      id: summary.id,
      subject: summary.subject,
      snippet: summary.snippet,
      messageCount: summary.messageCount,
      lastMessageDate: summary.lastMessageDate,
      isRead: false,
      participantNames: summary.participantNames,
      raw: summary.raw,
    ),
    messages: messages,
  );
}

/// Copies [email] with [Email.isRead] forced to `false`.
Email _markEmailUnread(Email email) {
  if (!email.isRead) return email;
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
    isRead: false,
    isStarred: email.isStarred,
    hasAttachments: email.hasAttachments,
    folderId: email.folderId,
  );
}

/// Modifier-queue entry point for thread mutations: synchronous local
/// flip + persistent outbox op + async drain. See the module doc for the
/// pattern and the rollback policy.
class ThreadMutationService {
  /// Creates the service.
  ///
  /// [emailsApi] is held for API-surface parity with the modifier-queue
  /// contract — every server write flows through [drainer] (the single
  /// API caller), so the service never calls it directly; keeping the
  /// handle here is what guarantees no call site can bypass the queue.
  /// Caches are optional (omitted = local flip skipped, op still
  /// enqueued — the offline-first path).
  ThreadMutationService({
    required ThreadDetailRepository repository,
    required OutboxStore store,
    required OutboxDrainer drainer,
    EmailsApi? emailsApi,
    MailCache? mailCache,
    ThreadListCache? threadListCache,
  })  : _repository = repository,
        _store = store,
        _drainer = drainer,
        _emailsApi = emailsApi,
        _mailCache = mailCache,
        _threadListCache = threadListCache;

  final ThreadDetailRepository _repository;
  final OutboxStore _store;
  final OutboxDrainer _drainer;
  final EmailsApi? _emailsApi;
  final MailCache? _mailCache;
  final ThreadListCache? _threadListCache;

  /// The API handle, or `null` when not wired. Retained (not called) so
  /// the queue cannot be bypassed — see the constructor doc.
  EmailsApi? get emailsApi => _emailsApi;

  /// Marks the thread's messages read: instant local flip, then a
  /// `markRead` batch op.
  Future<void> markRead(String threadId, List<String> messageIds) async {
    await _flipDetail(threadId, markThreadDetailRead);
    await _enqueueAndDrain(threadId, OutboxAction.markRead, messageIds);
  }

  /// Marks the thread's messages unread: instant local flip, then a
  /// `markUnread` batch op.
  Future<void> markUnread(String threadId, List<String> messageIds) async {
    await _flipDetail(threadId, _markThreadDetailUnread);
    await _enqueueAndDrain(threadId, OutboxAction.markUnread, messageIds);
  }

  /// Archives the thread: it leaves the inbox list locally at once, then
  /// an `archive` batch op confirms server-side.
  Future<void> archive(String threadId, List<String> messageIds) async {
    await _threadListCache?.deleteThread(threadId);
    await _enqueueAndDrain(threadId, OutboxAction.archive, messageIds);
  }

  /// Unarchives the thread: the cached summary is re-inserted into the
  /// list locally (no-op when nothing is cached), then an `unarchive` op
  /// drains via `POST /emails/{id}/unarchive` per id (no batch wire name
  /// exists for unarchive).
  Future<void> unarchive(String threadId, List<String> messageIds) async {
    final detail = await _repository.getCachedThread(threadId);
    if (detail != null) {
      await _threadListCache?.upsertThread(detail.summary);
    }
    await _enqueueAndDrain(threadId, OutboxAction.unarchive, messageIds);
  }

  /// Deletes the thread: it leaves the inbox list locally at once, then a
  /// `delete` batch op confirms server-side.
  ///
  /// [hard] forwards the batch `hard` flag (permanent vs trash). It does
  /// not participate in the idempotency key: a pending soft-delete absorbs
  /// a later hard-delete intent for the same thread (the thread is gone
  /// either way; contrived double-delete sequences are out of scope).
  ///
  /// Local-cache note: [MailCache] exposes no per-email delete, so message
  /// rows stay orphaned until the next cache clear — the same tombstone
  /// semantics the delta-sync path uses ([MailSyncService] drops the
  /// thread from the list cache only).
  Future<void> deleteThread(
    String threadId,
    List<String> messageIds, {
    bool hard = false,
  }) async {
    await _threadListCache?.deleteThread(threadId);
    await _enqueueAndDrain(
      threadId,
      OutboxAction.delete,
      messageIds,
      payloadJson: hard ? '{"hard":true}' : null,
    );
  }

  /// Permanently failed ops, as they occur — the UI retry/discard source.
  /// Delegates to the drainer's broadcast stream.
  Stream<List<OutboxOp>> failedOps() => _drainer.failedOps;

  /// The current `failed` snapshot on demand (e.g. for initial UI paint).
  Future<List<OutboxOp>> failedOpsSnapshot() => _store.failedOps();

  /// Retries a failed op: back to `pending` (attempts reset), then drains.
  Future<void> retryOp(String opId) async {
    await _store.requeue(opId);
    unawaited(_drainer.drain());
  }

  /// Discards a failed op without sending it.
  Future<void> discardOp(String opId) => _store.remove(opId);

  /// Applies [flip] to the cached detail and writes it back through the
  /// caches (the repository's own write-through seams). No cached detail
  /// → nothing to flip locally; the op still enqueues (offline-first).
  Future<void> _flipDetail(
    String threadId,
    ThreadDetail Function(ThreadDetail) flip,
  ) async {
    final detail = await _repository.getCachedThread(threadId);
    if (detail == null) return;
    final flipped = flip(detail);
    final mailCache = _mailCache;
    if (mailCache != null) {
      for (final message in flipped.messages) {
        await mailCache.writeEmail(message);
      }
    }
    await _threadListCache?.upsertThread(flipped.summary);
  }

  /// Write-ahead enqueue, then fire the drain (fire-and-forget: the
  /// drainer never throws and collapses concurrent callers).
  Future<void> _enqueueAndDrain(
    String threadId,
    OutboxAction action,
    List<String> messageIds, {
    String? payloadJson,
  }) async {
    final op = OutboxOp(
      idempotencyKey: OutboxOp.idempotencyKeyFor(threadId, action),
      action: action,
      emailIds: List<String>.of(messageIds),
      payloadJson: payloadJson,
    );
    await _store.enqueue(op);
    unawaited(_drainer.drain());
  }
}

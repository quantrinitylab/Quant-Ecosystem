// ============================================================================
// quant_core - outbox drainer (M6: modifier queue, W2)
//
// [OutboxDrainer] is the single writer that flushes persisted [OutboxOp]s
// to the server — the `persist()` half of Superhuman's modifier-queue
// pattern (`modify()` runs synchronously in [ThreadMutationService],
// `persist()` runs here, idempotent and async).
//
// Single-writer guard: concurrent [drain] calls collapse into the one
// in-flight drain (callers share its future). No [Isolate] is involved,
// deliberately: Dart's single-threaded event loop makes the check-and-set
// in [drain] atomic (no `await` sits between reading and writing
// [_inflight]), and only one Flutter process ever drains its own outbox
// database. The guard's only job is coalescing async callers, which a
// future chain does exactly.
//
// Failure policy (per op, never aborting the drain):
// - success → `dispatched`, then reaped from the table;
// - retryable (no HTTP response / timeout / 5xx / unknown) → attempts++,
//   stays `pending` for the next drain;
// - permanent (4xx) → `failed`, surfaced on [failedOps] for user
//   retry/discard — the local optimistic flip is NOT auto-rolled back
//   (documented policy in [ThreadMutationService]);
// - poison guard: a retryable op past [maxAttempts] escalates to `failed`
//   instead of spinning forever.
//
// M7 (compose) ops ride the same drainer: `OutboxAction.send` posts the
// stored payload byte-passthrough to `POST /emails/compose`
// ([ComposeApi.composeRaw]); `OutboxAction.undoSend` posts per email id to
// `POST /emails/{id}/undo-send` ([ComposeApi.undoSend]). Both are handled
// additively before the batch dispatch — the existing dispatch below is
// untouched.
//
// [drain] never throws: store-level failures (e.g. a closed database in
// tests) are swallowed and the ops stay `pending` for the next pass.
import 'dart:async';
import 'dart:convert';

import 'package:quant_foundation/quant_foundation.dart';

import '../compose/compose_api.dart';
import '../emails_api.dart';
import 'outbox_op.dart';
import 'outbox_store.dart';

/// Per-op outcome of one dispatch attempt.
enum _OpOutcome {
  /// Server confirmed.
  sent,

  /// Transient: keep `pending`, retry on a later drain.
  retryable,

  /// Permanent (4xx): move to `failed`.
  permanent,
}

/// A server-confirmed send op, emitted on [OutboxDrainer.sentOps] AFTER
/// the `POST /emails/compose` call succeeds.
///
/// [data] is the raw composeRaw response payload (`ApiResult.data` when
/// present, `{}` when the envelope unwrapped to null) — the server's
/// message-id shape is unverified, so consumers parse it defensively
/// (see `sent_tracker.dart`'s `extractServerMessageId`).
class SendResult {
  /// Creates a send confirmation.
  const SendResult({required this.idempotencyKey, required this.data});

  /// The dispatched op's idempotency key (`send:<idempotencyKey>`).
  final String idempotencyKey;

  /// The raw composeRaw response payload.
  final Map<String, dynamic> data;
}

/// Flushes the persistent outbox to the server, oldest op first.
class OutboxDrainer {
  /// Creates the drainer over [store], [emails], and [compose].
  OutboxDrainer(
      {required OutboxStore store,
      required EmailsApi emails,
      required ComposeApi compose})
      : _store = store,
        _emails = emails,
        _compose = compose;

  final OutboxStore _store;
  final EmailsApi _emails;
  final ComposeApi _compose;

  /// Poison-op guard: a retryable op failing this many times escalates to
  /// `failed` (user-visible) instead of retrying forever.
  static const int maxAttempts = 25;

  /// The in-flight drain future, or `null` when idle. Read and written
  /// with no `await` in between, so the check-and-set is atomic on Dart's
  /// single-threaded event loop.
  Future<void>? _inflight;

  /// Emits the current `failed` snapshot after every drain pass, so UI can
  /// surface retry/discard. Broadcast: buffering nothing when unlistened.
  final StreamController<List<OutboxOp>> _failedController =
      StreamController<List<OutboxOp>>.broadcast();

  /// The failed-ops stream (see [_failedController]).
  Stream<List<OutboxOp>> get failedOps => _failedController.stream;

  /// Emits a [SendResult] per [OutboxAction.send] op AFTER the server
  /// confirms it ([ComposeApi.composeRaw] success). Failure/pending ops
  /// never emit — the [failedOps] stream covers those. Broadcast: events
  /// are dropped when unlistened. The compose layer's `sentMessages`
  /// provider listens here to drive the undo-send window UX.
  final StreamController<SendResult> _sentController =
      StreamController<SendResult>.broadcast();

  /// The server-confirmed send stream (see [_sentController]).
  Stream<SendResult> get sentOps => _sentController.stream;

  /// Closes the failed-ops and sent-ops streams. Called on provider dispose.
  void dispose() {
    _inflight = null;
    _failedController.close();
    _sentController.close();
  }

  /// Drains all pending ops in enqueue order.
  ///
  /// Concurrent calls collapse into the single in-flight drain and share
  /// its future — ops are processed exactly once, in order, with no
  /// interleaving. Never throws.
  Future<void> drain() {
    final current = _inflight;
    if (current != null) return current;
    final future = _drainInner();
    _inflight = future;
    // The derived future must never surface an unhandled async error:
    // swallow its outcome, then clear the guard. (_drainInner never throws
    // by construction; this is defense in depth.)
    future.then<void>((_) {}, onError: (_) {}).whenComplete(() {
      if (identical(_inflight, future)) _inflight = null;
    });
    return future;
  }

  Future<void> _drainInner() async {
    try {
      final ops = await _store.pendingOps();
      for (final op in ops) {
        final outcome = await _dispatch(op);
        switch (outcome) {
          case _OpOutcome.sent:
            await _store.markDispatched(op.opId);
            await _store.remove(op.opId);
          case _OpOutcome.retryable:
            if (op.attempts + 1 >= maxAttempts) {
              await _store.markFailed(op.opId, permanent: true);
            } else {
              await _store.incrementAttempts(op.opId);
            }
          case _OpOutcome.permanent:
            await _store.markFailed(op.opId, permanent: true);
        }
      }
      if (!_failedController.isClosed) {
        _failedController.add(await _store.failedOps());
      }
    } on Object {
      // Store-level failure: swallow; ops stay pending for the next drain.
    }
  }

  Future<_OpOutcome> _dispatch(OutboxOp op) async {
    // M7 (compose), additive: send/undoSend are routed BEFORE the batch
    // dispatch (and before the emailIds guard — a send op legitimately has
    // no email ids). The existing dispatch below is untouched.
    if (op.action == OutboxAction.send) return _dispatchSend(op);
    if (op.action == OutboxAction.undoSend) {
      if (op.emailIds.isEmpty) return _OpOutcome.permanent;
      return _dispatchUndoSend(op);
    }
    // Malformed op: can never succeed — fail fast instead of burning
    // maxAttempts retries on it.
    if (op.emailIds.isEmpty) return _OpOutcome.permanent;
    try {
      if (op.action == OutboxAction.unarchive) {
        // No batch wire name exists for unarchive (batchActionSchema has
        // no such action): one POST /emails/{id}/unarchive per id.
        // Re-sends are idempotent server-side, so a partial multi-id
        // failure is safe to retry whole.
        for (final id in op.emailIds) {
          final res = await _emails.unarchive(id);
          if (!res.success) return _classify(res.error);
        }
        return _OpOutcome.sent;
      }
      final body = <String, dynamic>{
        'action': op.action.batchWireName,
        'emailIds': op.emailIds,
        ...op.extras,
      };
      final res = await _emails.batch([body]);
      if (res.success) return _OpOutcome.sent;
      return _classify(res.error);
    } on Object {
      // Defensive: ApiResult never throws per its contract, but a
      // misbehaving transport must not kill the drain — retryable.
      return _OpOutcome.retryable;
    }
  }

  /// Dispatches an [OutboxAction.send] op: posts the stored payload
  /// byte-passthrough to `POST /emails/compose` (spec L17853).
  ///
  /// The body is re-sent EXACTLY as stored at enqueue time (no
  /// re-serialization from a model) — [ComposeApi.composeRaw]. A missing,
  /// empty, or corrupt payload can never succeed, so it fails fast as
  /// permanent instead of burning retries.
  Future<_OpOutcome> _dispatchSend(OutboxOp op) async {
    final raw = op.payloadJson;
    if (raw == null || raw.isEmpty) return _OpOutcome.permanent;
    late final Map<String, dynamic> body;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map<String, dynamic>) return _OpOutcome.permanent;
      body = decoded;
    } on FormatException {
      return _OpOutcome.permanent;
    }
    try {
      final res = await _compose.composeRaw(body);
      if (res.success) {
        if (!_sentController.isClosed) {
          _sentController.add(SendResult(
            idempotencyKey: op.idempotencyKey,
            data: res.data ?? const <String, dynamic>{},
          ));
        }
        return _OpOutcome.sent;
      }
      return _classify(res.error);
    } on Object {
      // Defensive: ApiResult never throws per its contract, but a
      // misbehaving transport must not kill the drain — retryable.
      return _OpOutcome.retryable;
    }
  }

  /// Dispatches an [OutboxAction.undoSend] op: one
  /// `POST /emails/{id}/undo-send` (spec L18922) per email id, mirroring
  /// the unarchive per-id pattern. Re-sends are safe inside the 30s
  /// server-held undo window; outside it the server rejects (400 →
  /// permanent), never an infinite retry.
  Future<_OpOutcome> _dispatchUndoSend(OutboxOp op) async {
    try {
      for (final id in op.emailIds) {
        final res = await _compose.undoSend(id);
        if (!res.success) return _classify(res.error);
      }
      return _OpOutcome.sent;
    } on Object {
      return _OpOutcome.retryable;
    }
  }

  /// Classifies a failed [ApiResult] into retryable vs permanent.
  ///
  /// `statusCode == 0` means no HTTP response was received (network /
  /// DNS failure; see [ApiError]), `408` is the client-side timeout —
  /// both retryable. 5xx retryable. Other 4xx permanent.
  _OpOutcome _classify(ApiError? error) {
    final status = error?.statusCode ?? 0;
    if (status == 0 || status == 408) return _OpOutcome.retryable;
    if (status >= 500) return _OpOutcome.retryable;
    if (status >= 400) return _OpOutcome.permanent;
    return _OpOutcome.retryable;
  }
}

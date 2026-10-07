// ============================================================================
// quant_app - recording ThreadMutationService double for widget tests
// (Phase 1, M6)
//
// Test double for [ThreadMutationService]: records the modifier-queue calls
// a screen makes so tests can assert the UI routes through the queue (and
// never the raw `POST /emails/batch`). Failed-ops surface whatever [failed]
// holds (empty by default), so the [FailedOpsBannerHost] renders without
// the real drift/SQLite outbox stack.

import 'package:quant_core/quant_core.dart';

/// One recorded mutation call: the thread plus the message ids passed.
class MutationCall {
  const MutationCall(this.threadId, this.messageIds);

  final String threadId;
  final List<String> messageIds;
}

/// Deterministic [ThreadMutationService] for tests. Records
/// [archive]/[markUnread]/[deleteThread]; everything else is a no-op.
class RecordingThreadMutationService implements ThreadMutationService {
  /// Failed ops the banner should render; empty by default.
  List<OutboxOp> failed = const <OutboxOp>[];

  /// Recorded [ThreadMutationService.archive] calls, in order.
  final List<MutationCall> archiveCalls = <MutationCall>[];

  /// Recorded [ThreadMutationService.markUnread] calls, in order.
  final List<MutationCall> markUnreadCalls = <MutationCall>[];

  /// Recorded [ThreadMutationService.deleteThread] calls, in order.
  final List<MutationCall> deleteCalls = <MutationCall>[];

  /// Retried op ids, in order.
  final List<String> retryCalls = <String>[];

  /// Discarded op ids, in order.
  final List<String> discardCalls = <String>[];

  @override
  Future<void> archive(String threadId, List<String> messageIds) async {
    archiveCalls.add(MutationCall(threadId, List<String>.of(messageIds)));
  }

  @override
  Future<void> markUnread(String threadId, List<String> messageIds) async {
    markUnreadCalls.add(MutationCall(threadId, List<String>.of(messageIds)));
  }

  @override
  Future<void> deleteThread(
    String threadId,
    List<String> messageIds, {
    bool hard = false,
  }) async {
    deleteCalls.add(MutationCall(threadId, List<String>.of(messageIds)));
  }

  @override
  Future<void> markRead(String threadId, List<String> messageIds) async {}

  @override
  Future<void> unarchive(String threadId, List<String> messageIds) async {}

  @override
  Stream<List<OutboxOp>> failedOps() =>
      Stream<List<OutboxOp>>.value(List<OutboxOp>.of(failed));

  @override
  Future<List<OutboxOp>> failedOpsSnapshot() async =>
      List<OutboxOp>.of(failed);

  @override
  Future<void> retryOp(String opId) async {
    retryCalls.add(opId);
  }

  @override
  Future<void> discardOp(String opId) async {
    discardCalls.add(opId);
  }

  @override
  EmailsApi? get emailsApi => null;
}

// Repository interfaces. Screens depend on these, never on Dio.
// Every method throws [MailException] on failure.

import '../models/mail_models.dart';
import '../models/session_models.dart';

abstract class MailRepository {
  /// One page of a view. First page: no [cursor]. Next page: the previous
  /// page's `nextCursor`.
  Future<MailPage> list(MailView view, {String? cursor, int pageSize = 30});

  /// Whole-view counts (a one-row fetch).
  Future<MailCounts> counts(MailView view);

  /// A conversation by thread id or by email id.
  Future<MailConversation> getConversation(String id);

  /// Marks every unread received message of the thread read.
  Future<void> markThreadRead(String id);

  /// Deterministic bulk action. Returns how many emails the server changed.
  /// Reuse [idempotencyKey] when retrying the same logical operation.
  Future<int> applyBatch(MailBatchAction action, List<String> emailIds, {String? idempotencyKey});

  /// Undo helpers for the "Archived. Undo" and "Moved to Trash. Undo" toasts.
  Future<void> unarchive(String emailId, {String? idempotencyKey});
  Future<void> restore(String emailId, {String? idempotencyKey});
}

abstract class FolderRepository {
  Future<List<MailFolder>> folders();
  Future<List<MailLabel>> labels();
}

abstract class SessionRepository {
  SessionState get state;
  Stream<SessionState> get changes;

  /// Current access token, or null when signed out.
  String? get accessToken;

  /// Runs ONE refresh (concurrent callers share it). Returns true when a new
  /// access token is in place. When the server rejects the refresh the user
  /// is signed out with [kSessionEndedMessage] and false is returned. When no
  /// answer arrived at all (offline) the session is kept and a
  /// [MailException] is thrown.
  Future<bool> refreshAccessToken();

  /// Signs out on this device first, then tells the server best-effort.
  Future<void> signOut({String? message});
}

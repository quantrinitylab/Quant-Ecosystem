// ============================================================================
// quant_core - Threads API + delta-sync seam (M3: W3)
// ============================================================================
//
// Hand-written API layer over the phase-0 repaired OpenAPI spec for the
// thread endpoints, plus the pluggable seam for the staged (not yet merged)
// delta-sync endpoint.
//
// Spec refs (~/workspace/quantmail-omnipresent/phase0/openapi.repaired.yaml):
// - `GET /threads` ............. L23608-23647 (`getThreads`)
// - `GET /threads/{id}` ........ L23648-23681 (`getThreadsbyId`)
// - `POST /threads/{id}/mute` .. L23682-23720 (`postThreadsbyIdMute`)
// - `POST /threads/{id}/unmute` . L23721-23759 (`postThreadsbyIdUnmute`)
// - `GET /emails/changes?since=` does NOT exist in the spec (grep
//   "emails/changes|/changes" -> no hits; 33 other `/emails/*` paths exist).
//   The staged backend contract lives in
//   `~/workspace/quantmail-omnipresent/phase2/repo-staging/delta-sync/NOTES.md`
//   (backend P0-1, NOT merged).
//
// Envelope contract (package:quant_foundation): [QuantApiClient.get]/[post]
// unwrap the `{success, data}` envelope automatically, so the type parameter
// is the shape of the envelope's `data` field. The spec leaves the `data`
// shape of the thread endpoints unspecified, so every parse below is
// defensive — never assume a single shape; see the per-method notes.

import 'package:quant_foundation/quant_foundation.dart';

import 'models/email.dart';
import 'models/thread.dart';

/// Hand-written API layer for the thread endpoints.
///
/// All responses carry the backend's `SuccessWrapper` envelope, which the
/// client unwraps; `data` may be a bare list or a map wrapping one, so
/// [listThreads] and [resolveThread] parse defensively.
class ThreadsApi {
  /// Creates the API layer over [client].
  const ThreadsApi(this._client);

  final QuantApiClient _client;

  /// Lists conversation threads for the inbox.
  ///
  /// Spec: `GET /threads` (L23608-23647), query `page`, `pageSize` (1-100),
  /// `folderId`; 200 -> `SuccessWrapper`.
  ///
  /// The spec does not fix the envelope `data` shape, so parsing is
  /// defensive: a bare JSON list is parsed directly; a map is searched for a
  /// list under `items`/`threads`/`data` in that order. Anything else yields
  /// an empty list (the thread screen renders "no threads" rather than
  /// crashing) — see the doc note below.
  ///
  /// Note: because the backend has never documented which of these shapes it
  /// actually returns, the "empty list on unknown shape" fallback is a
  /// deliberate degradation, not a silent success: repositories should treat
  /// it as "no threads" only until the contract is pinned down.
  Future<ApiResult<List<ThreadSummary>>> listThreads({
    int page = 1,
    int pageSize = 50,
    String? folderId,
  }) async {
    // Spec clamps: page >= 1, pageSize in 1..100 (L23615-23632).
    final clampedPage = page < 1 ? 1 : page;
    final clampedSize = pageSize.clamp(1, 100);

    final query = <String, dynamic>{
      'page': clampedPage,
      'pageSize': clampedSize,
      if (folderId != null && folderId.isNotEmpty) 'folderId': folderId,
    };

    final result = await _client.get<dynamic>('/threads',
        queryParameters: query);
    if (!result.success) {
      return ApiResult.failure(result.error ??
          const ApiError(
            code: 'UNKNOWN_ERROR',
            message: 'listThreads failed with no error detail',
            statusCode: 0,
          ));
    }

    final data = result.data;
    List<dynamic> items;
    if (data is List) {
      items = data;
    } else if (data is Map<String, dynamic>) {
      // Map-with-items shapes the backend may return.
      final wrapped =
          data['items'] ?? data['threads'] ?? data['data'];
      if (wrapped is List) {
        items = wrapped;
      } else {
        // Unknown shape: degrade to an empty list rather than throwing.
        return ApiResult.ok(<ThreadSummary>[]);
      }
    } else {
      // Null or otherwise unexpected `data`: same deliberate degradation.
      return ApiResult.ok(<ThreadSummary>[]);
    }

    final threads = <ThreadSummary>[];
    for (final item in items) {
      if (item is Map<String, dynamic>) {
        // Skip malformed items instead of failing the whole list: the spec
        // fixes no `data` shape, so one bad row must not sink the inbox.
        try {
          threads.add(ThreadSummary.fromJson(item));
        } on Object {
          continue;
        }
      }
    }
    return ApiResult.ok(threads);
  }

  /// Resolves a thread by thread id OR by email id.
  ///
  /// Spec: `GET /threads/{id}` (L23648-23681, `getThreadsbyId`). The spec
  /// summary is load-bearing for the thread screen: "resolves a thread id OR
  /// an email id. Threads are created lazily, so many emails have
  /// threadId=null and the frontend falls back to the email id for
  /// /thread/:id deep links."
  ///
  /// Callers therefore pass either a real thread id or an email id (the
  /// deep-link route `/thread/:id` receives one of the two); the backend
  /// resolves whichever it was given, synthesizing a single-message thread
  /// when threads were created lazily. Never branch on id format client-side.
  ///
  /// The `data` shape is unspecified in the spec, so parsing is defensive:
  /// a map may carry the summary under `thread`/`summary` (or be the summary
  /// itself) and messages under `messages`/`emails`/`items`; a bare list is
  /// treated as the message list. If no summary can be parsed, a
  /// `PARSE_ERROR` failure is returned rather than fabricating one.
  Future<ApiResult<ThreadDetail>> resolveThread(String idOrEmailId) async {
    final result = await _client
        .get<dynamic>('/threads/${Uri.encodeComponent(idOrEmailId)}');
    if (!result.success) {
      return ApiResult.failure(result.error ??
          const ApiError(
            code: 'UNKNOWN_ERROR',
            message: 'resolveThread failed with no error detail',
            statusCode: 0,
          ));
    }

    final data = result.data;
    Map<String, dynamic>? summaryJson;
    List<dynamic> messageJson = const [];

    if (data is Map<String, dynamic>) {
      final candidate = data['thread'] ?? data['summary'];
      if (candidate is Map<String, dynamic>) {
        summaryJson = candidate;
      } else {
        // The map itself may be the thread summary.
        summaryJson = data;
      }
      final messages = data['messages'] ?? data['emails'] ?? data['items'];
      if (messages is List) {
        messageJson = messages;
      }
    } else if (data is List) {
      // Bare message list; no separate summary payload.
      messageJson = data;
    }

    if (summaryJson == null) {
      return ApiResult.failure(const ApiError(
        code: 'PARSE_ERROR',
        message:
            'GET /threads/{id} returned a data shape with no thread summary',
        statusCode: 200,
      ));
    }

    ThreadSummary summary;
    try {
      summary = ThreadSummary.fromJson(summaryJson);
    } on Object catch (e) {
      return ApiResult.failure(ApiError(
        code: 'PARSE_ERROR',
        message: 'Could not parse thread summary: $e',
        statusCode: 200,
      ));
    }

    final messages = <Email>[];
    for (final item in messageJson) {
      if (item is Map<String, dynamic>) {
        try {
          messages.add(Email.fromJson(item));
        } on Object {
          // Skip malformed message rows; the summary above still stands.
          continue;
        }
      }
    }
    return ApiResult.ok(ThreadDetail(summary: summary, messages: messages));
  }

  /// Mutes a conversation thread.
  ///
  /// Spec: `POST /threads/{id}/mute` (L23682-23720, `postThreadsbyIdMute`).
  /// Success carries no meaningful `data`, so this returns `ApiResult<void>`.
  Future<ApiResult<void>> muteThread(String id) async {
    final result = await _client
        .post<dynamic>('/threads/${Uri.encodeComponent(id)}/mute');
    if (!result.success) {
      return ApiResult.failure(result.error ??
          const ApiError(
            code: 'UNKNOWN_ERROR',
            message: 'muteThread failed with no error detail',
            statusCode: 0,
          ));
    }
    return ApiResult.ok(null);
  }

  /// Unmutes a conversation thread.
  ///
  /// Spec: `POST /threads/{id}/unmute` (L23721-23759,
  /// `postThreadsbyIdUnmute`).
  Future<ApiResult<void>> unmuteThread(String id) async {
    final result = await _client
        .post<dynamic>('/threads/${Uri.encodeComponent(id)}/unmute');
    if (!result.success) {
      return ApiResult.failure(result.error ??
          const ApiError(
            code: 'UNKNOWN_ERROR',
            message: 'unmuteThread failed with no error detail',
            statusCode: 0,
          ));
    }
    return ApiResult.ok(null);
  }
}

// VERIFIED 2026-10-03 (build-shift, W3): contract re-verified against the
// MERGED backend (`apps/quantmail/backend/routes/emails-changes.ts` in main,
// PR #370) — merged code is byte-identical to the staged contract this seam
// was written against. Envelope `{success, data: {changes, nextCursor,
// hasMore}}`, cursor base64url `{t,id}`, limit 1-500, change items
// `{id, threadId, deleted, updatedAt, ...(deleted ? {} : {message})}`,
// tombstone = `deleted: true` with no payload, 400 `INVALID_CURSOR`.
// See `phase1/W3_MERGE_VERIFY_NOTE.md`. Live-backend integration run still
// pending (no device E2E yet) — marked here, not blocking.

/// Delta-sync seam over the staged `GET /emails/changes` endpoint.
///
/// Staged contract (delta-sync/NOTES.md):
/// - query `since` = opaque base64url cursor (never parsed client-side;
///   omitted on first sync), `limit` 1-500 (default 100);
/// - response `data` = `{changes, nextCursor, hasMore}`; tombstones are
///   `{deleted: true}` with NO message payload — drop the local copy.
/// - malformed cursor -> 400 `INVALID_CURSOR`; cursor clock-skew is mitigated
///   server-side by `(updatedAt, id)` ordering.
class EmailChangesApi {
  /// Creates the delta-sync seam over [client].
  const EmailChangesApi(this._client);

  final QuantApiClient _client;

  /// Fetches one page of changes since the opaque [since] cursor.
  ///
  /// Pass `since: null` for the first sync; the server treats a missing
  /// cursor as a bounded full resync start. `limit` is clamped to the staged
  /// contract's 1-500 range (default 100 per NOTES.md).
  Future<ApiResult<EmailChangesPage>> fetchChanges({
    String? since,
    int limit = 100,
  }) async {
    final query = <String, dynamic>{
      'limit': limit.clamp(1, 500),
      if (since != null && since.isNotEmpty) 'since': since,
    };

    final result = await _client.get<dynamic>('/emails/changes',
        queryParameters: query);
    if (!result.success) {
      return ApiResult.failure(result.error ??
          const ApiError(
            code: 'UNKNOWN_ERROR',
            message: 'fetchChanges failed with no error detail',
            statusCode: 0,
          ));
    }

    // Merged contract (verified 2026-10-03, see file header):
    // data = {changes, nextCursor, hasMore}. Parsed defensively anyway.
    final data = result.data;
    List<dynamic> rawChanges = const [];
    String? nextSince;
    if (data is Map<String, dynamic>) {
      final changes = data['changes'];
      if (changes is List) {
        rawChanges = changes;
      }
      final cursor = data['nextCursor'] ?? data['nextSince'] ?? data['cursor'];
      if (cursor is String && cursor.isNotEmpty) {
        nextSince = cursor;
      }
    } else if (data is List) {
      rawChanges = data;
    }

    final changes = <EmailChange>[];
    for (final item in rawChanges) {
      if (item is Map<String, dynamic>) {
        final change = _parseChange(item);
        if (change != null) {
          changes.add(change);
        }
      }
    }
    return ApiResult.ok(
        EmailChangesPage(changes: changes, nextSince: nextSince));
  }

  /// Parses one change item. Returns `null` for unparseable items (skipped).
  EmailChange? _parseChange(Map<String, dynamic> item) {
    final deleted = item['deleted'] == true;
    final id = item['id'] ?? item['emailId'] ?? item['messageId'];
    if (id is! String || id.isEmpty) {
      return null;
    }
    // Merged contract (emails-changes.ts:150): change items carry `threadId`
    // (row.threadId ?? null) next to the email `id`. Parsed defensively.
    final threadId = item['threadId'];
    final String? parsedThreadId =
        threadId is String && threadId.isNotEmpty ? threadId : null;
    if (deleted) {
      // Tombstone: no payload — the caller drops its local copy.
      return EmailChange(id: id, deleted: true, threadId: parsedThreadId);
    }
    // Non-tombstone: payload under `message` (merged contract); fall back to
    // `email`, then to the item itself — defensive.
    final payload = item['message'] ?? item['email'];
    Map<String, dynamic>? emailJson;
    if (payload is Map<String, dynamic>) {
      emailJson = payload;
    } else {
      emailJson = item;
    }
    try {
      return EmailChange(
        id: id,
        deleted: false,
        email: Email.fromJson(emailJson),
        threadId: parsedThreadId,
      );
    } on Object {
      // Unparseable payload against the staged contract: skip the item.
      return null;
    }
  }
}

/// A resolved thread: summary plus its messages in display order.
class ThreadDetail {
  /// The thread summary (from W1's `ThreadSummary` model).
  final ThreadSummary summary;

  /// Messages of the thread in display order (may be empty when the backend
  /// returns only a summary).
  final List<Email> messages;

  /// Creates a thread detail.
  const ThreadDetail({required this.summary, required this.messages});
}

/// One page of delta-sync changes.
class EmailChangesPage {
  /// Changes in this page: upserts (with [EmailChange.email]) and tombstones.
  final List<EmailChange> changes;

  /// Opaque cursor for the next [EmailChangesApi.fetchChanges] call.
  /// `null` when the server returned no cursor (last page / unknown shape).
  final String? nextSince;

  /// Creates a changes page.
  const EmailChangesPage({required this.changes, this.nextSince});
}

/// A single delta-sync change: either an upsert or a tombstone.
class EmailChange {
  /// Server id of the email this change concerns.
  final String id;

  /// `true` for tombstones (`deleted: true`, no payload): the caller must
  /// drop its local copy of this email instead of upserting.
  final bool deleted;

  /// The email payload for upserts; `null` for tombstones.
  final Email? email;

  /// Thread id the change belongs to (staged contract: change items carry
  /// `threadId` next to the email `id`; `null` when absent). Tombstone
  /// deletes prefer this over [id] so real (non-lazy) threads are hit.
  final String? threadId;

  /// Creates a change.
  const EmailChange({
    required this.id,
    required this.deleted,
    this.email,
    this.threadId,
  });
}

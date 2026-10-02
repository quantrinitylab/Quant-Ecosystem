import 'package:quant_core/src/mail/models/email.dart';
import 'package:quant_core/src/mail/models/pagination.dart';
import 'package:quant_foundation/quant_foundation.dart';

/// Typed client for the Mail `/emails` surface of the QuantMail backend.
///
/// Spec: `~/workspace/quantmail-omnipresent/phase0/openapi.repaired.yaml`,
/// `/emails*` paths (L17687–L19060). All requests go through
/// [QuantApiClient], which unwraps the `{success, data}` envelope, so most
/// methods here receive only the inner `data` payload. The two paginated
/// list methods ([listEmails], [searchEmails]) instead use
/// [QuantApiClient.getEnvelope] because their `data` field is an array —
/// the generic unwrap cast cannot carry the whole envelope.
///
/// Notes on spec fidelity:
/// * Several repaired-spec sections (`/emails/{id}/snooze`,
///   `/emails/{id}/unarchive`, `/emails/{id}/unread`,
///   `/emails/{id}/unsnooze`, `/emails/mark-all-read`) list a *required*
///   `q` query parameter that no sibling endpoint documents and that has no
///   plausible meaning on those actions. This is treated as a repair
///   artifact: it is deliberately **not** sent. Flagged
///   `// TODO(UNVERIFIED)` on the affected methods.
/// * There is **no** `POST /emails/{id}/unstar` endpoint in the spec; only
///   `/emails/{id}/star` exists (`unstar` appears solely as an action name
///   inside the `batchActionSchema` enum). No `unstar` method is provided —
///   do not invent the endpoint.
class EmailsApi {
  /// Creates an [EmailsApi] backed by [client].
  EmailsApi(this._client);

  final QuantApiClient _client;

  /// Wire name for a [FolderType], matching the spec enum
  /// (`INBOX`, `SENT`, `DRAFTS`, `TRASH`, `SPAM`, `ARCHIVE`, `STARRED`,
  /// `SNOOZED`). Uses the enum member name upper-cased so it works whether
  /// the model defines members in lower or upper case.
  static String _folderWireName(FolderType folderType) =>
      folderType.name.toUpperCase();

  /// Fallback when a failed [ApiResult] carries no [ApiError] (should not
  /// happen per the [QuantApiClient] contract, but never crash on it).
  static ApiError _errorOf(ApiResult<dynamic> result) =>
      result.error ??
      const ApiError(
        code: 'EMPTY_ERROR',
        message: 'Request failed without an error payload',
        statusCode: 0,
      );

  /// Maps a successful envelope payload, propagating failures unchanged.
  ApiResult<R> _map<R>(
    ApiResult<Map<String, dynamic>> result,
    R Function(Map<String, dynamic>) convert,
  ) {
    if (result.success && result.data != null) {
      return ApiResult<R>.ok(convert(result.data!));
    }
    return ApiResult<R>.failure(_errorOf(result));
  }

  /// Maps a successful envelope payload to a `void` result.
  ApiResult<void> _mapVoid(ApiResult<Map<String, dynamic>> result) =>
      result.success
          ? ApiResult<void>.ok(null)
          : ApiResult<void>.failure(_errorOf(result));

  /// Lists emails, paginated and optionally folder-filtered.
  ///
  /// Spec: `GET /emails` (L17687). `pageSize` is clamped to the spec range
  /// 1–100. `limit` is documented as an alias for `pageSize`; only
  /// `pageSize` is sent. Null filters are omitted from the query.
  ///
  /// Uses [QuantApiClient.getEnvelope]: the `PaginatedEmails.data` field is
  /// an array, so the generic `get<T>` envelope-unwrap (`data as T`) cannot
  /// carry the whole envelope — the envelope is parsed here instead.
  Future<ApiResult<PaginatedEmails>> listEmails({
    int page = 1,
    int pageSize = 50,
    String? folderId,
    FolderType? folderType,
  }) async {
    final clamped = pageSize.clamp(1, 100);
    final query = <String, dynamic>{'page': page, 'pageSize': clamped};
    if (folderId != null) query['folderId'] = folderId;
    if (folderType != null) query['folderType'] = _folderWireName(folderType);
    final result = await _client.getEnvelope(
      '/emails',
      queryParameters: query,
    );
    return _map(result, PaginatedEmails.fromJson);
  }

  /// Fetches a single email by id.
  ///
  /// Spec: `GET /emails/{id}` (`getEmailsbyId`, L18088). The repaired spec
  /// annotates the 200 response as `PaginatedEmails`, which is almost
  /// certainly a repair artifact for a single-object response; this method
  /// accepts either shape defensively (a bare object, or a paginated
  /// wrapper whose first `items` entry is used).
  Future<ApiResult<Email>> getEmail(String id) async {
    final result = await _client.get<Map<String, dynamic>>('/emails/$id');
    return _map(result, _parseEmail);
  }

  Email _parseEmail(Map<String, dynamic> json) {
    final items = json['items'];
    if (items is List && items.isNotEmpty && items.first is Map) {
      return Email.fromJson(
        Map<String, dynamic>.from(items.first as Map),
      );
    }
    return Email.fromJson(json);
  }

  /// Full-text search over emails.
  ///
  /// Spec: `GET /emails/search` (L18060), whose only documented parameter
  /// is the required query string `q`. `page`/`pageSize`/`folderId` are sent
  /// as additional query parameters — the backend list handler accepts the
  /// same pagination shape, but this is not stated in the spec for search.
  /// // TODO(UNVERIFIED): confirm search pagination/filter params.
  ///
  /// Like [listEmails], this returns a `PaginatedEmails` envelope whose
  /// `data` is an array, so it goes through [QuantApiClient.getEnvelope].
  Future<ApiResult<PaginatedEmails>> searchEmails(
    String query, {
    int page = 1,
    int pageSize = 50,
    String? folderId,
  }) async {
    final params = <String, dynamic>{
      'q': query,
      'page': page,
      'pageSize': pageSize.clamp(1, 100),
    };
    if (folderId != null) params['folderId'] = folderId;
    final result = await _client.getEnvelope(
      '/emails/search',
      queryParameters: params,
    );
    return _map(result, PaginatedEmails.fromJson);
  }

  /// Marks an email as read.
  ///
  /// Spec: `POST /emails/{id}/read` (L18497). The spec body is an
  /// unextracted generic object; `{}` is sent.
  Future<ApiResult<void>> markRead(String id) async {
    final result = await _client.post<Map<String, dynamic>>(
      '/emails/$id/read',
      data: <String, dynamic>{},
    );
    return _mapVoid(result);
  }

  /// Marks an email as unread.
  ///
  /// Spec: `POST /emails/{id}/unread` (L18968). No request body is
  /// documented; `{}` is sent.
  /// // TODO(UNVERIFIED): spec lists a required `q` query param that looks
  /// like a repair artifact — not sent. Also confirm whether the body
  /// should be empty or carry a flag.
  Future<ApiResult<void>> markUnread(String id) async {
    final result = await _client.post<Map<String, dynamic>>(
      '/emails/$id/unread',
      data: <String, dynamic>{},
    );
    return _mapVoid(result);
  }

  /// Moves an email to the owner's archive folder without trashing it.
  ///
  /// Spec: `POST /emails/{id}/archive` (L18197). No request body is
  /// documented; `{}` is sent.
  /// // TODO(UNVERIFIED): confirm the body should be empty.
  Future<ApiResult<void>> archive(String id) async {
    final result = await _client.post<Map<String, dynamic>>(
      '/emails/$id/archive',
      data: <String, dynamic>{},
    );
    return _mapVoid(result);
  }

  /// Moves an archived email back to the inbox.
  ///
  /// Spec: `POST /emails/{id}/unarchive` (L18870). The spec body is an
  /// unextracted generic object; `{}` is sent.
  /// // TODO(UNVERIFIED): spec lists a required `q` query param that looks
  /// like a repair artifact — not sent.
  Future<ApiResult<void>> unarchive(String id) async {
    final result = await _client.post<Map<String, dynamic>>(
      '/emails/$id/unarchive',
      data: <String, dynamic>{},
    );
    return _mapVoid(result);
  }

  /// Stars an email.
  ///
  /// Spec: `POST /emails/{id}/star` (L18778). The spec body is an
  /// unextracted generic object; `{}` is sent.
  ///
  /// Note: the spec defines **no** `/emails/{id}/unstar` endpoint
  /// (`unstar` exists only as a `batchActionSchema` action name), so no
  /// single-email `unstar` method is provided here. Use [batch] with the
  /// `unstar` action for bulk un-starring.
  Future<ApiResult<void>> star(String id) async {
    final result = await _client.post<Map<String, dynamic>>(
      '/emails/$id/star',
      data: <String, dynamic>{},
    );
    return _mapVoid(result);
  }

  /// Moves an email to another folder.
  ///
  /// Spec: `POST /emails/{id}/move` (L18407), body validated by
  /// `moveSchema` (L25547) which requires `folderId`. When only
  /// [folderType] is given, its wire name is used as the folder id — a
  /// client-side convenience mapping, not stated in the spec.
  /// // TODO(UNVERIFIED): confirm `folderType` names are valid `folderId`
  /// values, and what happens when neither argument is provided.
  Future<ApiResult<void>> move(
    String id, {
    String? folderId,
    FolderType? folderType,
  }) async {
    final resolved = folderId ??
        (folderType == null ? null : _folderWireName(folderType));
    final result = await _client.post<Map<String, dynamic>>(
      '/emails/$id/move',
      data: resolved == null
          ? <String, dynamic>{}
          : <String, dynamic>{'folderId': resolved},
    );
    return _mapVoid(result);
  }

  /// Snoozes an email until [until].
  ///
  /// Spec: `POST /emails/{id}/snooze` (L18721): body requires `snoozeUntil`
  /// as a date-time string; sent as UTC ISO-8601.
  /// // TODO(UNVERIFIED): spec lists a required `q` query param that looks
  /// like a repair artifact — not sent.
  Future<ApiResult<void>> snooze(String id, DateTime until) async {
    final result = await _client.post<Map<String, dynamic>>(
      '/emails/$id/snooze',
      data: <String, dynamic>{
        'snoozeUntil': until.toUtc().toIso8601String(),
      },
    );
    return _mapVoid(result);
  }

  /// Clears the snooze wake timer so the email returns to the inbox now.
  ///
  /// Spec: `POST /emails/{id}/unsnooze` (L19013). No request body is
  /// documented; `{}` is sent.
  /// // TODO(UNVERIFIED): spec lists a required `q` query param that looks
  /// like a repair artifact — not sent. Also confirm the body should be
  /// empty.
  Future<ApiResult<void>> unsnooze(String id) async {
    final result = await _client.post<Map<String, dynamic>>(
      '/emails/$id/unsnooze',
      data: <String, dynamic>{},
    );
    return _mapVoid(result);
  }

  /// Deletes an email.
  ///
  /// Spec: `DELETE /emails/{id}` (`deleteEmailsbyId`, L18060): the first
  /// call moves the email to trash; a second call while it is in trash
  /// records a logical permanent deletion without erasing history. Callers
  /// wanting a hard delete should prefer [batch] with the `delete` action
  /// and `hard: true`.
  Future<ApiResult<void>> deleteEmail(String id) async {
    final result = await _client.delete<Map<String, dynamic>>('/emails/$id');
    return _mapVoid(result);
  }

  /// Bulk-clears unread state for the current inbox view.
  ///
  /// Spec: `POST /emails/mark-all-read` (L18018); optionally scoped by the
  /// request body. The spec body is an unextracted generic object, so the
  /// non-null [folderId]/[folderType] filters are placed in the body.
  /// // TODO(UNVERIFIED): spec lists a required `q` query param (summary
  /// mentions an optional category-tab scope) that looks partially like a
  /// repair artifact — not sent. Confirm the intended scoping contract.
  Future<ApiResult<void>> markAllRead({
    String? folderId,
    FolderType? folderType,
  }) async {
    final body = <String, dynamic>{};
    if (folderId != null) body['folderId'] = folderId;
    if (folderType != null) body['folderType'] = _folderWireName(folderType);
    final result = await _client.post<Map<String, dynamic>>(
      '/emails/mark-all-read',
      data: body,
    );
    return _mapVoid(result);
  }

  /// Runs bulk email actions in a single batch transaction.
  ///
  /// Spec: `POST /emails/batch` (L17779), body validated by
  /// `batchActionSchema` (L25567): a **single** `{action, emailIds,
  /// folderId?, hard?}` object per request, where `action` is one of
  /// `markRead`, `markUnread`, `archive`, `delete`, `star`, `unstar`.
  ///
  /// Because the backend accepts only one action per request, this method
  /// groups [operations] by action and issues one `POST /emails/batch`
  /// per distinct action. Each operation map must carry:
  /// * `action` — one of the `batchActionSchema` action names (required);
  /// * the target ids as `emailIds` (list), `emailId`, or `id` (required,
  ///   at least one non-empty id);
  /// * optionally `folderId` and `hard` (forwarded into the request body).
  ///
  /// Malformed operations throw [ArgumentError] before any request is
  /// sent. If any grouped request fails, the failure is returned
  /// immediately and remaining groups are not attempted. On success,
  /// returns the per-action results under the `results` key.
  Future<ApiResult<Map<String, dynamic>>> batch(
    List<Map<String, dynamic>> operations,
  ) async {
    if (operations.isEmpty) {
      return ApiResult<Map<String, dynamic>>.ok(
        <String, dynamic>{'results': <Map<String, dynamic>>[]},
      );
    }

    const allowedActions = {
      'markRead',
      'markUnread',
      'archive',
      'delete',
      'star',
      'unstar',
    };

    final grouped = <String, List<_BatchGroup>>{};
    for (var i = 0; i < operations.length; i++) {
      final op = operations[i];
      final action = op['action'];
      if (action is! String || !allowedActions.contains(action)) {
        throw ArgumentError(
          'operations[$i]: "action" must be one of $allowedActions',
        );
      }
      final ids = <String>[];
      final emailIds = op['emailIds'];
      if (emailIds is List) {
        ids.addAll(emailIds.whereType<String>().where((e) => e.isNotEmpty));
      }
      for (final key in ['emailId', 'id']) {
        final v = op[key];
        if (v is String && v.isNotEmpty && !ids.contains(v)) ids.add(v);
      }
      if (ids.isEmpty) {
        throw ArgumentError(
          'operations[$i]: no email ids found '
          '(expected "emailIds", "emailId" or "id")',
        );
      }
      final folderId = op['folderId'];
      final hard = op['hard'];
      grouped.putIfAbsent(action, () => []).add(
            _BatchGroup(
              ids: ids,
              folderId: folderId is String && folderId.isNotEmpty
                  ? folderId
                  : null,
              hard: hard is bool ? hard : null,
            ),
          );
    }

    final results = <Map<String, dynamic>>[];
    for (final entry in grouped.entries) {
      final ids = <String>{
        for (final g in entry.value) ...g.ids,
      }.toList();
      final folderId = entry.value
          .map((g) => g.folderId)
          .firstWhere((f) => f != null, orElse: () => null);
      final hard = entry.value
          .map((g) => g.hard)
          .firstWhere((h) => h != null, orElse: () => null);
      final body = <String, dynamic>{
        'action': entry.key,
        'emailIds': ids,
      };
      if (folderId != null) body['folderId'] = folderId;
      if (hard != null) body['hard'] = hard;

      final res = await _client.post<Map<String, dynamic>>(
        '/emails/batch',
        data: body,
      );
      if (!res.success) {
        return ApiResult<Map<String, dynamic>>.failure(_errorOf(res));
      }
      results.add(<String, dynamic>{
        'action': entry.key,
        'emailIds': ids,
        'data': res.data,
      });
    }

    return ApiResult<Map<String, dynamic>>.ok(
      <String, dynamic>{'results': results},
    );
  }
}

/// One validated operation inside a [EmailsApi.batch] action group.
class _BatchGroup {
  const _BatchGroup({required this.ids, this.folderId, this.hard});

  final List<String> ids;
  final String? folderId;
  final bool? hard;
}

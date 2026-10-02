// ============================================================================
// quantai_core - typed Sessions/Chat API wrapper (W1: chat data layer)
// ============================================================================
//
// Thin typed wrapper over [QuantAiApiClient]. Every method is wired 1:1 to a
// spec'd operation in `app-foundations/quantai/openapi.yaml` (line refs on
// each method); no endpoint is invented. Backend failures surface as
// [ChatApiException]; the foundation [ApiResult] never throws, so this layer
// unwraps it exactly once.
//
// Response bodies are `{success, data}` envelopes; [ChatPage.fromJson] and
// the model `fromJson` factories parse defensively because field shapes are
// not spec-documented (see `chat_models.dart`).

import 'package:quant_foundation/quant_foundation.dart';

import '../api/quantai_api_client.dart';
import 'chat_models.dart';

/// Failure of a typed chat API call (transport, HTTP, or envelope failure).
class ChatApiException implements Exception {
  final String code;
  final String message;
  final int statusCode;

  const ChatApiException(this.message,
      {this.code = 'CHAT_API_ERROR', this.statusCode = 0});

  factory ChatApiException.fromApiError(ApiError error) => ChatApiException(
        error.message,
        code: error.code,
        statusCode: error.statusCode,
      );

  @override
  String toString() =>
      'ChatApiException($code, status $statusCode): $message';
}

/// Typed wrapper for the QuantAI sessions/messages/usage endpoints.
///
/// Auth: Bearer tokens are injected by [QuantAiApiClient]'s interceptor stack
/// (D1 — the existing OAuth2 flow); nothing here manages credentials.
class SessionsApi {
  final QuantAiApiClient _client;

  SessionsApi({required QuantAiApiClient client}) : _client = client;

  // -- Sessions ---------------------------------------------------------------

  /// List the caller's sessions, paginated.
  ///
  /// spec: app-foundations/quantai/openapi.yaml L3768
  /// `GET /sessions/` (query `page`, `pageSize`).
  Future<ChatPage<ChatSession>> listSessions({
    int page = 1,
    int pageSize = 20,
  }) async {
    final payload = await _request<Map<String, dynamic>>(
      () => _client.get<Map<String, dynamic>>(
        '/sessions/',
        queryParameters: {'page': page, 'pageSize': pageSize},
      ),
      'listSessions',
    );
    return ChatPage<ChatSession>.fromJson(
      payload,
      ChatSession.fromJson,
    );
  }

  /// Create a new AI session.
  ///
  /// spec: app-foundations/quantai/openapi.yaml L3768
  /// `POST /sessions/` (body `title?`, `model?`, `systemPrompt?`) → 201.
  Future<ChatSession> createSession({
    String? title,
    String? model,
    String? systemPrompt,
  }) async {
    final body = <String, dynamic>{
      if (title != null) 'title': title,
      if (model != null) 'model': model,
      if (systemPrompt != null) 'systemPrompt': systemPrompt,
    };
    final payload = await _request<Map<String, dynamic>>(
      () => _client.post<Map<String, dynamic>>('/sessions/', data: body),
      'createSession',
    );
    return _sessionOrThrow(payload, 'createSession');
  }

  /// Fetch one session by id.
  ///
  /// spec: app-foundations/quantai/openapi.yaml L3802
  /// `GET /sessions/{id}`.
  Future<ChatSession> getSession(String id) async {
    final payload = await _request<Map<String, dynamic>>(
      () => _client.get<Map<String, dynamic>>(
        '/sessions/${Uri.encodeComponent(id)}',
      ),
      'getSession',
    );
    return _sessionOrThrow(payload, 'getSession');
  }

  /// Update session fields (only non-null fields are sent).
  ///
  /// spec: app-foundations/quantai/openapi.yaml L3802
  /// `PUT /sessions/{id}`.
  Future<ChatSession> updateSession(
    String id, {
    String? title,
    String? model,
    String? systemPrompt,
  }) async {
    final body = <String, dynamic>{
      if (title != null) 'title': title,
      if (model != null) 'model': model,
      if (systemPrompt != null) 'systemPrompt': systemPrompt,
    };
    final payload = await _request<Map<String, dynamic>>(
      () => _client.put<Map<String, dynamic>>(
        '/sessions/${Uri.encodeComponent(id)}',
        data: body,
      ),
      'updateSession',
    );
    return _sessionOrThrow(payload, 'updateSession');
  }

  /// Delete a session.
  ///
  /// spec: app-foundations/quantai/openapi.yaml L3802
  /// `DELETE /sessions/{id}`.
  Future<void> deleteSession(String id) async {
    await _request<Map<String, dynamic>>(
      () => _client.delete<Map<String, dynamic>>(
        '/sessions/${Uri.encodeComponent(id)}',
      ),
      'deleteSession',
    );
  }

  /// Archive a session.
  ///
  /// spec: app-foundations/quantai/openapi.yaml L3849
  /// `POST /sessions/{id}/archive`.
  // TODO(UNVERIFIED): archive response payload shape (returns the session?
  // empty envelope?). Falls back to the requested id when unparseable.
  Future<ChatSession> archiveSession(String id) async {
    final payload = await _request<Map<String, dynamic>>(
      () => _client.post<Map<String, dynamic>>(
        '/sessions/${Uri.encodeComponent(id)}/archive',
      ),
      'archiveSession',
    );
    return _sessionOrFallback(payload, id);
  }

  /// Pin a session.
  ///
  /// spec: app-foundations/quantai/openapi.yaml L3863
  /// `POST /sessions/{id}/pin`.
  // TODO(UNVERIFIED): pin response payload shape. Falls back to the requested
  // id when unparseable.
  Future<ChatSession> pinSession(String id) async {
    final payload = await _request<Map<String, dynamic>>(
      () => _client.post<Map<String, dynamic>>(
        '/sessions/${Uri.encodeComponent(id)}/pin',
      ),
      'pinSession',
    );
    return _sessionOrFallback(payload, id);
  }

  // -- Messages ---------------------------------------------------------------

  /// List messages of a session, paginated (pageSize max 200 per spec).
  ///
  /// spec: app-foundations/quantai/openapi.yaml L2452
  /// `GET /sessions/{id}/messages` (query `page`, `pageSize`).
  Future<ChatPage<ChatMessage>> listMessages(
    String sessionId, {
    int page = 1,
    int pageSize = 50,
  }) async {
    final payload = await _request<Map<String, dynamic>>(
      () => _client.get<Map<String, dynamic>>(
        '/sessions/${Uri.encodeComponent(sessionId)}/messages',
        queryParameters: {'page': page, 'pageSize': pageSize},
      ),
      'listMessages',
    );
    return ChatPage<ChatMessage>.fromJson(
      payload,
      ChatMessage.fromJson,
    );
  }

  /// Send a message (non-streaming); the assistant reply arrives in the
  /// returned message list payload.
  ///
  /// spec: app-foundations/quantai/openapi.yaml L2452
  /// `POST /sessions/{id}/messages` (body `content` required) → 201.
  Future<ChatMessage> sendMessage(String sessionId, String content) async {
    final payload = await _request<Map<String, dynamic>>(
      () => _client.post<Map<String, dynamic>>(
        '/sessions/${Uri.encodeComponent(sessionId)}/messages',
        data: {'content': content},
      ),
      'sendMessage',
    );
    final message = _messageOrNull(payload);
    if (message == null) {
      throw const ChatApiException(
        'sendMessage returned an unparseable message payload',
      );
    }
    return message;
  }

  /// Record feedback on an assistant message. `positive: null` clears the
  /// feedback (spec allows `"POSITIVE" | "NEGATIVE" | null`).
  ///
  /// spec: app-foundations/quantai/openapi.yaml L2512
  /// `POST /sessions/{id}/messages/{messageId}/feedback`.
  Future<void> sendFeedback({
    required String sessionId,
    required String messageId,
    required bool? positive,
  }) async {
    await _request<Map<String, dynamic>>(
      () => _client.post<Map<String, dynamic>>(
        '/sessions/${Uri.encodeComponent(sessionId)}/messages/'
        '${Uri.encodeComponent(messageId)}/feedback',
        data: {
          'feedback': positive == null
              ? null
              : (positive ? 'POSITIVE' : 'NEGATIVE'),
        },
      ),
      'sendFeedback',
    );
  }

  // -- Search & usage ---------------------------------------------------------

  /// Full-text search across the caller's conversations.
  ///
  /// spec: app-foundations/quantai/openapi.yaml L3753
  /// `GET /sessions/search` (query `q` required).
  Future<List<ChatSession>> searchSessions(String q) async {
    final payload = await _request<Map<String, dynamic>>(
      () => _client.get<Map<String, dynamic>>(
        '/sessions/search',
        queryParameters: {'q': q},
      ),
      'searchSessions',
    );
    return ChatPage<ChatSession>.fromJson(payload, ChatSession.fromJson)
        .items;
  }

  /// Usage stats for the caller for the current day.
  ///
  /// spec: app-foundations/quantai/openapi.yaml L4055
  /// `GET /usage/` (query `period=day|week|month`).
  // TODO(UNVERIFIED): usage payload field names are not spec-documented.
  Future<Map<String, dynamic>?> todayUsage() async {
    final payload = await _request<Map<String, dynamic>>(
      () => _client.get<Map<String, dynamic>>(
        '/usage/',
        queryParameters: {'period': 'day'},
      ),
      'todayUsage',
    );
    return payload;
  }

  // -- Internals ---------------------------------------------------------------

  /// Runs [call], throwing [ChatApiException] on transport/HTTP failure, and
  /// unwraps the `{success, data}` envelope into the payload (`data` field
  /// when present, else the whole body — defensive).
  Future<Map<String, dynamic>?> _request<T>(
    Future<ApiResult<T>> Function() call,
    String operation,
  ) async {
    final result = await call();
    if (!result.success) {
      final error = result.error;
      throw error == null
          ? ChatApiException('$operation failed without an error payload')
          : ChatApiException.fromApiError(error);
    }
    final body = result.data;
    if (body == null) return null;
    if (body is Map<String, dynamic> && body.containsKey('data')) {
      final inner = body['data'];
      if (inner is Map<String, dynamic>) return inner;
      // `data` may itself be the payload list/map for list endpoints; the
      // callers that need the raw value re-read it. Signal via body.
      return body;
    }
    return body is Map<String, dynamic> ? body : null;
  }

  ChatSession _sessionOrThrow(
    Map<String, dynamic>? payload,
    String operation,
  ) {
    final session = _sessionOrNull(payload);
    if (session == null) {
      throw ChatApiException(
        '$operation returned an unparseable session payload',
      );
    }
    return session;
  }

  ChatSession? _sessionOrNull(Map<String, dynamic>? payload) {
    final map = _unwrapDataMap(payload);
    if (map == null || map.isEmpty) return null;
    return ChatSession.fromJson(map);
  }

  ChatSession _sessionOrFallback(Map<String, dynamic>? payload, String id) {
    return _sessionOrNull(payload) ?? ChatSession(id: id);
  }

  ChatMessage? _messageOrNull(Map<String, dynamic>? payload) {
    final map = _unwrapDataMap(payload);
    if (map == null || map.isEmpty) return null;
    return ChatMessage.fromJson(map);
  }

  /// Returns the `{..., data: {...}}` inner map when the envelope carries one,
  /// else the body itself when it already looks like the object.
  Map<String, dynamic>? _unwrapDataMap(Map<String, dynamic>? body) {
    if (body == null) return null;
    final inner = body['data'];
    if (inner is Map<String, dynamic>) return inner;
    return body;
  }
}

// ============================================================================
// chat_core - QuantChat REST API client (QuantChat, shift 2 / W2)
//
// Thin transport over the QuantChat conversation/message endpoints
// (`app-foundations/quantchat/openapi.yaml`):
//
//   GET  /conversations                 listConversations  (page, pageSize)
//   GET  /conversations/{id}            getConversation    (404 → not found)
//   POST /conversations                createConversation (201)
//   GET  /conversations/{id}/messages   listMessages       (page, pageSize)
//
// Auth: Bearer JWT, audience `quantchat` — injected by the foundation
// interceptor stack on the [Dio] instance handed in (see `apiClientProvider`
// in `../providers/core_providers.dart`); this client adds no auth headers
// itself. The canonical response envelope is `{success, data}`; when
// `success == false` the envelope's `message`/`code` surface as an
// [AuthException]. Transport failures are wrapped into the existing typed
// vocabulary from `../auth/auth_exceptions.dart` so app code handles one
// failure language.
//
// No endpoint outside the spec is invented here.
// ============================================================================

import 'package:dio/dio.dart';

import '../auth/auth_exceptions.dart';
import 'conversation.dart';
import 'message.dart';
import 'pagination.dart';

/// REST client for the QuantChat conversations/messages surface.
class ChatApi {
  /// Creates the client.
  ///
  /// [dio] must carry the auth/refresh/retry interceptor stack (use
  /// `apiClientProvider`'s `QuantApiClient.dio`); [baseUrl] is the API root
  /// (e.g. `AppConfig.apiBaseUrl`) that path segments resolve against.
  ChatApi({required Dio dio, required String baseUrl})
      : _dio = dio,
        _baseUrl = baseUrl;

  final Dio _dio;
  final String _baseUrl;

  /// Lists the caller's conversations, newest first (server order).
  ///
  /// Spec: `GET /conversations`, `page` >= 1, `pageSize` 1..100 — values are
  /// clamped defensively client-side.
  Future<Paginated<Conversation>> listConversations({
    int page = 1,
    int pageSize = 20,
  }) async {
    final Response<dynamic> response = await _guard(
      () => _dio.get<dynamic>(
        '$_baseUrl/conversations',
        queryParameters: <String, dynamic>{
          'page': page < 1 ? 1 : page,
          'pageSize': pageSize.clamp(1, 100),
        },
      ),
      'listConversations',
    );
    return Paginated<Conversation>.fromJson(
      _envelope(response, 'listConversations'),
      Conversation.fromJson,
    );
  }

  /// Fetches one conversation by id.
  ///
  /// Spec: `GET /conversations/{id}`, 200 Conversation, 404 not found.
  Future<Conversation> getConversation(String id) async {
    final Response<dynamic> response = await _guard(
      () => _dio.get<dynamic>(
        '$_baseUrl/conversations/${Uri.encodeComponent(id)}',
      ),
      'getConversation',
    );
    final dynamic payload = _envelope(response, 'getConversation')['data'];
    if (payload is Map<String, dynamic>) {
      return Conversation.fromJson(payload);
    }
    if (payload is Map) {
      return Conversation.fromJson(Map<String, dynamic>.from(payload));
    }
    throw AuthException(
      'Unexpected conversation shape from getConversation.',
      code: 'bad_shape',
    );
  }

  /// Creates a conversation.
  ///
  /// Spec: `POST /conversations` with body
  /// `{participantIds (required, min 1), type (direct|group), name?,
  /// description?}`; 201 on success.
  Future<Conversation> createConversation({
    required List<String> participantIds,
    required String type,
    String? name,
    String? description,
  }) async {
    if (participantIds.isEmpty) {
      throw ArgumentError.value(
        participantIds,
        'participantIds',
        'At least one participant is required.',
      );
    }
    if (type != 'direct' && type != 'group') {
      throw ArgumentError.value(type, 'type', "Must be 'direct' or 'group'.");
    }
    final Response<dynamic> response = await _guard(
      () => _dio.post<dynamic>(
        '$_baseUrl/conversations',
        data: <String, dynamic>{
          'participantIds': participantIds,
          'type': type,
          if (name != null) 'name': name,
          if (description != null) 'description': description,
        },
      ),
      'createConversation',
    );
    final dynamic payload = _envelope(response, 'createConversation')['data'];
    if (payload is Map<String, dynamic>) {
      return Conversation.fromJson(payload);
    }
    if (payload is Map) {
      return Conversation.fromJson(Map<String, dynamic>.from(payload));
    }
    throw AuthException(
      'Unexpected conversation shape from createConversation.',
      code: 'bad_shape',
    );
  }

  /// Lists messages of a conversation (paginated).
  ///
  /// Spec: `GET /conversations/{id}/messages`, `page` >= 1,
  /// `pageSize` 1..100 — values are clamped defensively client-side.
  Future<Paginated<ChatMessage>> listMessages(
    String conversationId, {
    int page = 1,
    int pageSize = 30,
  }) async {
    final Response<dynamic> response = await _guard(
      () => _dio.get<dynamic>(
        '$_baseUrl/conversations/${Uri.encodeComponent(conversationId)}/messages',
        queryParameters: <String, dynamic>{
          'page': page < 1 ? 1 : page,
          'pageSize': pageSize.clamp(1, 100),
        },
      ),
      'listMessages',
    );
    return Paginated<ChatMessage>.fromJson(
      _envelope(response, 'listMessages'),
      ChatMessage.fromJson,
    );
  }

  // -- transport plumbing ------------------------------------------------------

  /// Runs [call], wrapping [DioException]s into the typed vocabulary from
  /// `auth_exceptions.dart`.
  Future<Response<dynamic>> _guard(
    Future<Response<dynamic>> Function() call,
    String operation,
  ) async {
    try {
      return await call();
    } on DioException catch (e) {
      throw _mapDioError(e, operation);
    }
  }

  /// Maps a [DioException] to a typed failure.
  ///
  /// 401/403 after the interceptor stack ran means the session is dead →
  /// [AuthSignedOutException] (caller routes to login). Everything else
  /// becomes an [AuthException] carrying the wire `code` when present.
  Exception _mapDioError(DioException e, String operation) {
    final int? status = e.response?.statusCode;
    if (status == 401 || status == 403) {
      return const AuthSignedOutException();
    }
    final dynamic body = e.response?.data;
    final String? code = body is Map ? body['code']?.toString() : null;
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.transformTimeout:
        return AuthException(
          '$operation timed out. Check your connection and retry.',
          code: code ?? 'timeout',
        );
      case DioExceptionType.badResponse:
        if (status == 404) {
          return AuthException(
            '$operation: not found.',
            code: code ?? 'not_found',
          );
        }
        return AuthException(
          '$operation failed${status != null ? ' (HTTP $status)' : ''}.',
          code: code ?? (status != null ? 'http_$status' : 'bad_response'),
        );
      case DioExceptionType.cancel:
        return AuthException(
          '$operation was cancelled.',
          code: code ?? 'cancelled',
        );
      case DioExceptionType.badCertificate:
        return AuthException(
          '$operation failed: insecure connection.',
          code: code ?? 'bad_certificate',
        );
      case DioExceptionType.connectionError:
      case DioExceptionType.unknown:
        return AuthException(
          '$operation failed: network error. Check your connection and retry.',
          code: code ?? 'network',
        );
    }
  }

  /// Extracts the `{success, data}` envelope; throws [AuthException] when the
  /// envelope reports `success: false` or the shape is unrecognised.
  Map<String, dynamic> _envelope(Response<dynamic> response, String operation) {
    final dynamic data = response.data;
    final Map<String, dynamic> envelope = data is Map<String, dynamic>
        ? data
        : data is Map
            ? Map<String, dynamic>.from(data)
            : <String, dynamic>{};
    if (envelope.isEmpty) {
      throw AuthException(
        'Unexpected response shape from $operation.',
        code: 'bad_shape',
      );
    }
    if (envelope['success'] == false) {
      throw AuthException(
        envelope['message']?.toString() ?? '$operation failed.',
        code: envelope['code']?.toString(),
      );
    }
    return envelope;
  }
}

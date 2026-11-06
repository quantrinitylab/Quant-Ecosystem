// Sovereign Quant Ecosystem - QuantChat Thread Transport (Phase 2B)
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:quant_core/quant_core.dart';

/// Phase 2B REST transport for the chat thread, built on quant_core's
/// [QuantApiClient] (dio, MIT-licensed) — no new third-party dependency.
///
/// The client is HONEST about connectivity: [isConfigured] is false unless
/// the build was compiled with `--dart-define=QUANTCHAT_API_BASE=<url>`.
/// When unconfigured, every method throws [QuantChatTransportUnavailable]
/// immediately and the thread UI keeps its offline behavior (messages stay
/// `notSent`, server actions show the "no connection" notice) instead of
/// faking server acknowledgements. When configured, the bearer token comes
/// from the shared [QuantAuthService] session — this app has no login
/// screen yet, so requests go out unauthenticated (backend 401s) until the
/// ecosystem SSO session exists; nothing here fabricates auth.
///
/// Base URL example:
///   flutter build apk --dart-define=QUANTCHAT_API_BASE=https://quantchat.quantrinity.in
class QuantChatTransportUnavailable implements Exception {
  const QuantChatTransportUnavailable();
  @override
  String toString() => 'QuantChat backend is not configured in this build.';
}

class QuantChatThreadApi {
  /// Compile-time backend base URL. Empty by default = offline build.
  static const String configuredBaseUrl = String.fromEnvironment(
    'QUANTCHAT_API_BASE',
    defaultValue: '',
  );

  final QuantApiClient _client;
  final String _me;

  QuantChatThreadApi({
    String? baseUrlOverride,
    QuantAuthService? authService,
    String currentUserId = 'usr-me',
  })  : _client = QuantApiClient(
          baseUrl: (baseUrlOverride ?? configuredBaseUrl).isEmpty
              ? 'http://127.0.0.1:1'
              : (baseUrlOverride ?? configuredBaseUrl),
          authService: authService ?? QuantAuthService(),
        ),
        _me = currentUserId;

  /// True when a backend base URL was compiled in. The thread only attempts
  /// network calls when this is true.
  bool get isConfigured => configuredBaseUrl.isNotEmpty;

  String get currentUserId => _me;

  void _requireTransport() {
    if (!isConfigured) throw const QuantChatTransportUnavailable();
  }

  Map<String, dynamic> _data(dynamic raw) {
    if (raw is Map<String, dynamic>) {
      final body = raw['data'];
      if (body is Map<String, dynamic>) return body;
      return raw;
    }
    return <String, dynamic>{};
  }

  // -- messages ------------------------------------------------------------

  Future<Map<String, dynamic>> fetchMessages(
    String conversationId, {
    int page = 1,
    int pageSize = 50,
  }) async {
    _requireTransport();
    final res = await _client.get<Map<String, dynamic>>(
      '/conversations/$conversationId/messages',
      queryParameters: {'page': page, 'pageSize': pageSize},
    );
    return _data(res.data);
  }

  Future<Map<String, dynamic>> sendMessage(
    String conversationId, {
    required String content,
    String type = 'text',
    String? mediaUrl,
    String? disappearMode,
    Map<String, dynamic>? metadata,
  }) async {
    _requireTransport();
    final res = await _client.post<Map<String, dynamic>>(
      '/conversations/$conversationId/messages',
      data: {
        'content': content,
        'type': type,
        if (mediaUrl != null) 'mediaUrl': mediaUrl,
        if (disappearMode != null) 'disappearMode': disappearMode,
        if (metadata != null) 'metadata': metadata,
      },
    );
    return _data(res.data);
  }

  // -- Phase 1B disappearing mechanics (now actually wired) -----------------

  /// Task 14.9 — mark a view-once/disappearing message viewed; the server
  /// starts the authoritative destruction timer.
  Future<Map<String, dynamic>> markViewed(String messageId, int timerSeconds) async {
    _requireTransport();
    final res = await _client.post<Map<String, dynamic>>(
      '/conversations/messages/$messageId/view',
      data: {'timerSeconds': timerSeconds},
    );
    return _data(res.data);
  }

  /// Phase 1B-1 — sender revokes an UNVIEWED disappearing message.
  /// Throws [QuantApiException] with statusCode 409
  /// (MESSAGE_ALREADY_VIEWED) when the recipient already viewed it.
  Future<Map<String, dynamic>> revokeMessage(String messageId) async {
    _requireTransport();
    final res = await _client.post<Map<String, dynamic>>(
      '/conversations/messages/$messageId/revoke',
    );
    return _data(res.data);
  }

  /// Phase 1B-2 — recipient asks the sender to keep a disappearing message.
  /// The request alone keeps nothing; the sender must consent.
  Future<Map<String, dynamic>> requestKeep(String messageId) async {
    _requireTransport();
    final res = await _client.post<Map<String, dynamic>>(
      '/conversations/messages/$messageId/keep-request',
    );
    return _data(res.data);
  }

  /// Phase 1B-3 — sender grants/denies a keep request.
  Future<Map<String, dynamic>> resolveKeep(String messageId, bool granted) async {
    _requireTransport();
    final res = await _client.post<Map<String, dynamic>>(
      '/conversations/messages/$messageId/keep-consent',
      data: {'decision': granted ? 'granted' : 'denied'},
    );
    return _data(res.data);
  }

  /// Phase 1B-4 — per-contact disappearing default ('off' / seconds).
  Future<Map<String, dynamic>> setDisappearingDefault(
    String conversationId, {
    int seconds = 0,
  }) async {
    _requireTransport();
    final res = await _client.post<Map<String, dynamic>>(
      '/conversations/$conversationId/disappearing-default',
      data: {'seconds': seconds},
    );
    return _data(res.data);
  }

  // -- capture notices -----------------------------------------------------

  /// Task 14.10 — report a screenshot of one message. The backend posts the
  /// in-thread system notice ("<name> took a screenshot"). Detection +
  /// notice only — never prevention.
  Future<Map<String, dynamic>> reportScreenshot(String messageId) async {
    _requireTransport();
    final res = await _client.post<Map<String, dynamic>>(
      '/conversations/messages/$messageId/screenshot',
      data: <String, dynamic>{},
    );
    return _data(res.data);
  }

  /// Phase 2B — report a screenshot or screen recording of the whole chat
  /// surface. Detection + notice only — never prevention.
  Future<Map<String, dynamic>> reportScreenCapture(
    String conversationId,
    String kind,
  ) async {
    _requireTransport();
    final res = await _client.post<Map<String, dynamic>>(
      '/conversations/$conversationId/screen-capture',
      data: {'kind': kind},
    );
    return _data(res.data);
  }

  // -- likes & receipts ----------------------------------------------------

  /// Toggles the caller's 'heart' reaction (QC-F-410 toggle semantics).
  Future<Map<String, dynamic>> toggleLike(String messageId) async {
    _requireTransport();
    final res = await _client.post<Map<String, dynamic>>(
      '/conversations/messages/$messageId/reactions',
      data: {'emoji': 'heart'},
    );
    return _data(res.data);
  }

  Future<void> markDelivered(String messageId) async {
    _requireTransport();
    await _client.post<Map<String, dynamic>>('/receipts/$messageId/delivered');
  }

  Future<void> markRead(String messageId) async {
    _requireTransport();
    await _client.post<Map<String, dynamic>>('/receipts/$messageId/read');
  }

  // -- mini-apps -----------------------------------------------------------

  /// Creates a poll in the thread (Phase 2B Quick Poll mini-app).
  Future<Map<String, dynamic>> createPoll(
    String conversationId, {
    required String question,
    required List<String> options,
    bool allowMultiple = false,
  }) async {
    _requireTransport();
    final res = await _client.post<Map<String, dynamic>>(
      '/polls',
      data: {
        'chatId': conversationId,
        'question': question,
        'options': options,
        'allowMultiple': allowMultiple,
      },
    );
    return _data(res.data);
  }

  /// Votes on a poll option (0-based index).
  Future<Map<String, dynamic>> votePoll(String pollId, int optionIndex) async {
    _requireTransport();
    final res = await _client.post<Map<String, dynamic>>(
      '/polls/$pollId/vote',
      data: {'optionIndex': optionIndex},
    );
    return _data(res.data);
  }

  /// Reads fresh poll results (serialized poll, no raw voter roster).
  Future<Map<String, dynamic>> pollResults(String pollId) async {
    _requireTransport();
    final res = await _client.get<Map<String, dynamic>>('/polls/$pollId/results');
    return _data(res.data);
  }
}

// ============================================================================
// quantai_core - chat domain models (W1: chat data layer)
// ============================================================================
//
// Defensive JSON parsing throughout: the session/message field shapes are NOT
// documented in `app-foundations/quantai/openapi.yaml`, so every field is
// parsed null-safely and unknown shapes fall back to defaults instead of
// throwing. Every assumed field name carries a `TODO(UNVERIFIED)` marker.

import 'dart:convert';

/// Extracts the assistant's incremental text from one SSE `data:` frame.
///
/// Frame shape is unverified — tries `content`, then `delta`, `text`,
/// `message` keys (in that order); falls back to the raw trimmed string when
/// the frame is not a JSON object or carries none of those keys.
///
/// TODO(UNVERIFIED): confirm the exact SSE frame schema of
/// `POST /sessions/{id}/messages/stream` (app-foundations/quantai/openapi.yaml
/// L2487) with the backend team.
String parseStreamFrame(String data) {
  final trimmed = data.trim();
  if (trimmed.isEmpty) return '';
  final decoded = _tryJsonMap(trimmed);
  if (decoded == null) return trimmed;
  for (final key in const ['content', 'delta', 'text', 'message']) {
    // TODO(UNVERIFIED): frame payload key names.
    final value = decoded[key];
    if (value is String && value.isNotEmpty) return value;
  }
  return trimmed;
}

Map<String, dynamic>? _tryJsonMap(String raw) {
  try {
    final decoded = jsonDecode(raw);
    if (decoded is Map) return Map<String, dynamic>.from(decoded);
    return null;
  } catch (_) {
    return null;
  }
}

/// Chat participant role.
enum ChatRole {
  user,
  assistant,
  system;

  /// Parses a role string defensively: unknown / missing values fall back to
  /// [ChatRole.system] so unrecognized server roles are never rendered as if
  /// the user wrote them.
  ///
  // TODO(UNVERIFIED): role value vocabulary ("user"/"assistant"/"system").
  static ChatRole fromString(Object? value) {
    if (value is String) {
      switch (value.trim().toLowerCase()) {
        case 'user':
          return ChatRole.user;
        case 'assistant':
          return ChatRole.assistant;
        case 'system':
          return ChatRole.system;
      }
    }
    return ChatRole.system;
  }

  /// Wire value for the role (`"POSITIVE"`-style upper-case is feedback only).
  // TODO(UNVERIFIED): confirm lowercase role serialization.
  String get wireValue => name;
}

/// Feedback signal on an assistant message.
enum MessageFeedback {
  none,
  positive,
  negative;

  /// Parses the spec'd feedback vocabulary (`"POSITIVE" | "NEGATIVE" | null`).
  ///
  /// spec: app-foundations/quantai/openapi.yaml L2512
  /// `POST /sessions/{id}/messages/{messageId}/feedback`.
  // TODO(UNVERIFIED): feedback value vocabulary.
  static MessageFeedback? fromString(Object? value) {
    if (value == null) return null;
    if (value is String) {
      switch (value.trim().toUpperCase()) {
        case 'POSITIVE':
          return MessageFeedback.positive;
        case 'NEGATIVE':
          return MessageFeedback.negative;
      }
    }
    return MessageFeedback.none;
  }

  /// Wire value for the feedback endpoint.
  String? get wireValue => switch (this) {
        MessageFeedback.positive => 'POSITIVE',
        MessageFeedback.negative => 'NEGATIVE',
        MessageFeedback.none => null,
      };
}

/// An AI conversation session.
class ChatSession {
  // TODO(UNVERIFIED): every field name below is assumed, not spec-documented.
  final String id;
  final String title;
  final String? model;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final bool pinned;
  final int? messageCount;

  const ChatSession({
    required this.id,
    this.title = 'Untitled',
    this.model,
    this.createdAt,
    this.updatedAt,
    this.pinned = false,
    this.messageCount,
  });

  factory ChatSession.fromJson(Map<String, dynamic> json) {
    return ChatSession(
      id: _stringId(json['id']),
      title: _stringOr(json['title'], 'Untitled'),
      model: _stringOrNull(json['model']),
      createdAt: _dateTimeOrNull(json['createdAt'] ?? json['created_at']),
      updatedAt: _dateTimeOrNull(json['updatedAt'] ?? json['updated_at']),
      pinned: _boolOr(json['pinned'], false),
      messageCount:
          _intOrNull(json['messageCount'] ?? json['message_count']),
    );
  }

  ChatSession copyWith({
    String? id,
    String? title,
    String? model,
    DateTime? createdAt,
    DateTime? updatedAt,
    bool? pinned,
    int? messageCount,
  }) {
    return ChatSession(
      id: id ?? this.id,
      title: title ?? this.title,
      model: model ?? this.model,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      pinned: pinned ?? this.pinned,
      messageCount: messageCount ?? this.messageCount,
    );
  }

  @override
  String toString() =>
      'ChatSession(id: $id, title: $title, model: $model, pinned: $pinned)';
}

/// A single message inside a session.
class ChatMessage {
  // TODO(UNVERIFIED): every field name below is assumed, not spec-documented.
  final String id;
  final String? sessionId;
  final ChatRole role;
  final String content;

  /// Creation timestamp, when the backend provides one.
  final DateTime? createdAt;

  /// UI-only: `true` while this message is the live streaming placeholder.
  /// Never parsed from the wire.
  final bool isStreaming;

  /// Feedback the user left on this message, when any.
  final MessageFeedback? feedback;

  const ChatMessage({
    required this.id,
    this.sessionId,
    required this.role,
    this.content = '',
    this.createdAt,
    this.isStreaming = false,
    this.feedback,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    return ChatMessage(
      id: _stringId(json['id']),
      sessionId: _stringOrNull(json['sessionId'] ?? json['session_id']),
      role: ChatRole.fromString(json['role']),
      content: _stringOr(json['content'], ''),
      createdAt: _dateTimeOrNull(json['createdAt'] ?? json['created_at']),
      feedback: MessageFeedback.fromString(json['feedback']),
    );
  }

  ChatMessage copyWith({
    String? id,
    String? sessionId,
    ChatRole? role,
    String? content,
    DateTime? createdAt,
    bool? isStreaming,
    MessageFeedback? feedback,
  }) {
    return ChatMessage(
      id: id ?? this.id,
      sessionId: sessionId ?? this.sessionId,
      role: role ?? this.role,
      content: content ?? this.content,
      createdAt: createdAt ?? this.createdAt,
      isStreaming: isStreaming ?? this.isStreaming,
      feedback: feedback ?? this.feedback,
    );
  }

  @override
  String toString() =>
      'ChatMessage(id: $id, role: ${role.name}, '
      'content: ${_truncate(content, 40)}, isStreaming: $isStreaming)';
}

/// A paginated list payload.
///
/// Defensive about the container shape: `data` may arrive as a bare JSON list
/// or as a map (`{items|results|data: [...], page, pageSize, hasMore}`).
class ChatPage<T> {
  final List<T> items;
  final int page;
  final int pageSize;
  final bool hasMore;

  const ChatPage({
    required this.items,
    this.page = 1,
    this.pageSize = 20,
    this.hasMore = false,
  });

  factory ChatPage.fromJson(
    Object? json,
    T Function(Map<String, dynamic>) fromItem,
  ) {
    List<dynamic> rawItems = const [];
    var page = 1;
    var pageSize = 20;
    bool? hasMore;

    if (json is List) {
      rawItems = json;
    } else if (json is Map) {
      final map = Map<String, dynamic>.from(json);
      final inner = map['items'] ?? map['results'] ?? map['data'];
      // TODO(UNVERIFIED): list-container key ("items" assumed).
      if (inner is List) rawItems = inner;
      page = _intOr(map['page'], 1);
      pageSize = _intOr(
        map['pageSize'] ?? map['page_size'] ?? map['perPage'],
        20,
      );
      // TODO(UNVERIFIED): pagination field names.
      final rawHasMore = map['hasMore'] ?? map['has_more'];
      hasMore = rawHasMore is bool ? rawHasMore : null;
    }

    final items = <T>[];
    for (final raw in rawItems) {
      if (raw is Map) {
        items.add(fromItem(Map<String, dynamic>.from(raw)));
      }
      // Non-map entries are skipped, not fatal (defensive).
    }
    hasMore ??= items.isNotEmpty && items.length >= pageSize;
    return ChatPage<T>(
      items: items,
      page: page,
      pageSize: pageSize,
      hasMore: hasMore,
    );
  }

  @override
  String toString() =>
      'ChatPage(items: ${items.length}, page: $page, hasMore: $hasMore)';
}

// -- Defensive parsing helpers ----------------------------------------------

String _stringId(Object? value) {
  // TODO(UNVERIFIED): id field name/type.
  if (value == null) return '';
  return value.toString();
}

String _stringOr(Object? value, String fallback) {
  if (value is String) return value;
  if (value == null) return fallback;
  return value.toString();
}

String? _stringOrNull(Object? value) {
  if (value == null) return null;
  if (value is String) return value;
  return value.toString();
}

bool _boolOr(Object? value, bool fallback) {
  if (value is bool) return value;
  if (value is num) return value != 0;
  if (value is String) {
    final lower = value.toLowerCase();
    if (lower == 'true' || lower == '1') return true;
    if (lower == 'false' || lower == '0') return false;
  }
  return fallback;
}

int _intOr(Object? value, int fallback) =>
    _intOrNull(value) ?? fallback;

int? _intOrNull(Object? value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value);
  return null;
}

DateTime? _dateTimeOrNull(Object? value) {
  if (value == null) return null;
  if (value is DateTime) return value;
  if (value is int) {
    // Heuristic: epoch millis vs seconds.
    // TODO(UNVERIFIED): timestamp representation.
    final millis = value < 10000000000 ? value * 1000 : value;
    return DateTime.fromMillisecondsSinceEpoch(millis, isUtc: true);
  }
  if (value is String) return DateTime.tryParse(value);
  return null;
}

String _truncate(String value, int maxLength) =>
    value.length <= maxLength
        ? value
        : '${value.substring(0, maxLength)}…';

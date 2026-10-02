// ============================================================================
// chat_core - conversation domain model (QuantChat, shift 2 / W2)
//
// [Conversation] mirrors `GET /conversations` / `POST /conversations` from the
// QuantChat OpenAPI contract
// (`app-foundations/quantchat/openapi.yaml`, operationIds listConversations,
// getConversation, createConversation). The spec defines request/response
// SHAPES but no response body schemas, so every field below is defensive:
// missing keys fall back to defaults and `fromJson` never throws. Fields
// whose wire shape was assumed (not present in the spec) are marked
// `TODO(UNVERIFIED)` so the backend P0 workstream can confirm them.
// ============================================================================

/// Compact preview of the most recent message in a conversation list row.
///
/// TODO(UNVERIFIED): wire shape assumed — the spec has no response body
/// schemas; fields inferred from the sendMessage request body.
class ChatMessagePreview {
  /// Message id.
  final String id;

  /// Message body text (or caption for media types).
  final String content;

  /// Sender user id.
  final String senderId;

  /// Creation timestamp, when the server sends one.
  ///
  /// TODO(UNVERIFIED): field name + ISO-8601 format assumed.
  final DateTime? createdAt;

  /// Message type; mirrors the sendMessage `type` enum
  /// (`text|image|video|audio|file|location|snap_photo|snap_video`).
  ///
  /// TODO(UNVERIFIED): assumed present on previews; defaults to `'text'`.
  final String type;

  /// Creates a message preview.
  const ChatMessagePreview(
    this.id,
    this.content,
    this.senderId, {
    this.createdAt,
    this.type = 'text',
  });

  /// Defensive parse: missing keys fall back to defaults, never throws.
  factory ChatMessagePreview.fromJson(Map<String, dynamic> json) {
    return ChatMessagePreview(
      json['id']?.toString() ?? '',
      json['content']?.toString() ?? '',
      (json['senderId'] ?? json['sender_id'])?.toString() ?? '',
      createdAt: _parseDateTime(json['createdAt'] ?? json['created_at']),
      type: json['type']?.toString() ?? 'text',
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ChatMessagePreview &&
          other.id == id &&
          other.content == content &&
          other.senderId == senderId &&
          other.createdAt == createdAt &&
          other.type == type;

  @override
  int get hashCode => Object.hash(id, content, senderId, createdAt, type);
}

/// A chat conversation (direct or group).
///
/// TODO(UNVERIFIED): every response field below is assumed — the spec only
/// defines the create-conversation request body and the `{success, data}`
/// envelope; response body schemas are not in the contract.
class Conversation {
  /// Conversation id (path param `{id}` in the spec).
  final String id;

  /// `'direct'` or `'group'` (spec enum on the create request body).
  final String type;

  /// Display name (groups; may be derived for directs).
  ///
  /// TODO(UNVERIFIED): response field assumed.
  final String? name;

  /// Group description.
  ///
  /// TODO(UNVERIFIED): response field assumed.
  final String? description;

  /// Participant user ids (`participantIds` on the create request body).
  ///
  /// TODO(UNVERIFIED): assumed present on responses.
  final List<String> participantIds;

  /// Preview of the most recent message for list rows.
  ///
  /// TODO(UNVERIFIED): response field assumed.
  final ChatMessagePreview? lastMessage;

  /// Number of unread messages for the caller.
  ///
  /// TODO(UNVERIFIED): response field assumed.
  final int unreadCount;

  /// Last activity timestamp (drives list ordering).
  ///
  /// TODO(UNVERIFIED): field name + ISO-8601 format assumed.
  final DateTime? updatedAt;

  /// Whether the caller archived this conversation.
  ///
  /// TODO(UNVERIFIED): response field assumed (`isArchived` appears only on
  /// the updateConversation request body in the spec).
  final bool isArchived;

  /// Creates a conversation.
  const Conversation(
    this.id,
    this.type, {
    this.name,
    this.description,
    this.participantIds = const <String>[],
    this.lastMessage,
    this.unreadCount = 0,
    this.updatedAt,
    this.isArchived = false,
  });

  /// Defensive parse: missing keys fall back to defaults, never throws.
  factory Conversation.fromJson(Map<String, dynamic> json) {
    final dynamic rawLast = json['lastMessage'] ?? json['last_message'];
    return Conversation(
      json['id']?.toString() ?? '',
      json['type']?.toString() ?? 'direct',
      name: json['name']?.toString(),
      description: json['description']?.toString(),
      participantIds: _parseStringList(
        json['participantIds'] ?? json['participant_ids'],
      ),
      lastMessage: rawLast is Map<String, dynamic>
          ? ChatMessagePreview.fromJson(rawLast)
          : rawLast is Map
              ? ChatMessagePreview.fromJson(Map<String, dynamic>.from(rawLast))
              : null,
      unreadCount: _parseInt(json['unreadCount'] ?? json['unread_count']),
      updatedAt: _parseDateTime(json['updatedAt'] ?? json['updated_at']),
      isArchived: (json['isArchived'] ?? json['is_archived']) == true,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is Conversation &&
          other.id == id &&
          other.type == type &&
          other.name == name &&
          other.description == description &&
          _listEquals(other.participantIds, participantIds) &&
          other.lastMessage == lastMessage &&
          other.unreadCount == unreadCount &&
          other.updatedAt == updatedAt &&
          other.isArchived == isArchived;

  @override
  int get hashCode => Object.hash(
        id,
        type,
        name,
        description,
        Object.hashAll(participantIds),
        lastMessage,
        unreadCount,
        updatedAt,
        isArchived,
      );
}

// -- defensive parsing helpers (shared by this file) ----------------------------

int _parseInt(dynamic value) {
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value) ?? 0;
  return 0;
}

DateTime? _parseDateTime(dynamic value) {
  if (value is String && value.isNotEmpty) return DateTime.tryParse(value);
  return null;
}

List<String> _parseStringList(dynamic value) {
  if (value is List) {
    return <String>[
      for (final dynamic e in value)
        if (e != null) e.toString(),
    ];
  }
  return const <String>[];
}

bool _listEquals(List<String> a, List<String> b) {
  if (identical(a, b)) return true;
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
}

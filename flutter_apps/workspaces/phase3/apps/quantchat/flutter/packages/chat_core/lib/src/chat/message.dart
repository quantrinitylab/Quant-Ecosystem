// ============================================================================
// chat_core - chat message domain model (QuantChat, shift 2 / W2)
//
// [ChatMessage] mirrors `GET /conversations/{id}/messages` from the QuantChat
// OpenAPI contract (`app-foundations/quantchat/openapi.yaml`, operationIds
// listMessages / sendMessage). The spec defines the sendMessage request body
// (`content` required; `type` enum
// text|image|video|audio|file|location|snap_photo|snap_video; `mediaUrl`,
// `replyToId`, `metadata`) and the `{success, data}` envelope, but no
// response body schemas — so every response field is defensive: missing keys
// fall back to defaults and `fromJson` never throws. Assumed wire fields are
// marked `TODO(UNVERIFIED)` for the backend P0 workstream to confirm.
// ============================================================================

/// A single chat message inside a conversation.
///
/// TODO(UNVERIFIED): response fields are assumed — the spec only defines the
/// sendMessage request body; response body schemas are not in the contract.
class ChatMessage {
  /// Message id.
  final String id;

  /// Owning conversation id.
  ///
  /// TODO(UNVERIFIED): response field assumed (spec only has it as a path
  /// param on `POST /conversations/{id}/messages`).
  final String conversationId;

  /// Sender user id.
  ///
  /// TODO(UNVERIFIED): response field assumed.
  final String senderId;

  /// Message body (required on the sendMessage request body; minLength 1,
  /// maxLength 10000).
  final String content;

  /// Message type; one of the sendMessage `type` enum values
  /// (`text|image|video|audio|file|location|snap_photo|snap_video`).
  ///
  /// TODO(UNVERIFIED): assumed present on responses; defaults to `'text'`.
  final String type;

  /// Id of the message this one replies to, if any.
  ///
  /// TODO(UNVERIFIED): response field assumed.
  final String? replyToId;

  /// Creation timestamp.
  ///
  /// TODO(UNVERIFIED): field name + ISO-8601 format assumed.
  final DateTime? createdAt;

  /// Opaque server metadata (e.g. media dimensions, location payload).
  ///
  /// TODO(UNVERIFIED): response field assumed.
  final Map<String, dynamic>? metadata;

  /// Creates a chat message.
  const ChatMessage(
    this.id,
    this.conversationId,
    this.senderId,
    this.content, {
    this.type = 'text',
    this.replyToId,
    this.createdAt,
    this.metadata,
  });

  /// Defensive parse: missing keys fall back to defaults, never throws.
  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    final dynamic rawMeta = json['metadata'];
    return ChatMessage(
      json['id']?.toString() ?? '',
      (json['conversationId'] ?? json['conversation_id'])?.toString() ?? '',
      (json['senderId'] ?? json['sender_id'])?.toString() ?? '',
      json['content']?.toString() ?? '',
      type: json['type']?.toString() ?? 'text',
      replyToId: (json['replyToId'] ?? json['reply_to_id'])?.toString(),
      createdAt: _parseDateTime(json['createdAt'] ?? json['created_at']),
      metadata: rawMeta is Map<String, dynamic>
          ? rawMeta
          : rawMeta is Map
              ? Map<String, dynamic>.from(rawMeta)
              : null,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ChatMessage &&
          other.id == id &&
          other.conversationId == conversationId &&
          other.senderId == senderId &&
          other.content == content &&
          other.type == type &&
          other.replyToId == replyToId &&
          other.createdAt == createdAt;

  @override
  int get hashCode => Object.hash(
        id,
        conversationId,
        senderId,
        content,
        type,
        replyToId,
        createdAt,
      );
}

DateTime? _parseDateTime(dynamic value) {
  if (value is String && value.isNotEmpty) return DateTime.tryParse(value);
  return null;
}

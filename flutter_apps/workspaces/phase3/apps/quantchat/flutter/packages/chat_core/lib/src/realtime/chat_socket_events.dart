// ============================================================================
// chat_core - typed realtime (WebSocket) event model for QuantChat
// ============================================================================
//
// Contract ground truth:
//   app-foundations/quantchat/openapi.yaml  §/ws/chat  (122-path spec)
//   app-foundations/quantchat/API_NOTES.md  "Realtime / WebSocket usage"
//
// Outbound (server → client) frame types per spec:
//   new_message, typing_indicator, message:delivered, message:read,
//   presence:update {userId, status, lastSeen}, error
//
// Inbound (client → server) frame types per spec:
//   heartbeat | ping, join_conversation {conversationId},
//   chat_message {conversationId, ...}, typing {conversationId, isTyping},
//   delivery_ack | message:delivered {messageId, conversationId},
//   read_receipt | message:read {messageId, conversationId}
//
// Hard rule (W4): unknown inbound types NEVER throw — they surface as
// [UnknownEvent] so a server-side frame addition can't crash the client.

/// Delivery state for [DeliveryEvent].
enum DeliveryStatus { delivered, read }

/// A typed realtime event decoded from an inbound WebSocket JSON frame.
///
/// Dispatch is on the frame's `type` field via [ChatSocketEvent.fromJson].
/// Never throws for unknown payloads — see [UnknownEvent].
sealed class ChatSocketEvent {
  const ChatSocketEvent();

  /// Decodes one inbound frame into a typed event.
  ///
  /// Never throws: malformed or unknown frames become [UnknownEvent].
  factory ChatSocketEvent.fromJson(Map<String, dynamic> json) {
    try {
      return switch (json['type']) {
        'new_message' => NewMessageEvent(
            (json['message'] as Map?)?.cast<String, dynamic>() ?? json,
          ),
        'typing_indicator' => TypingIndicatorEvent(
            conversationId: json['conversationId']?.toString() ?? '',
            userId: json['userId']?.toString() ?? '',
            isTyping: json['isTyping'] == true,
          ),
        'message:delivered' => DeliveryEvent(
            messageId: json['messageId']?.toString() ?? '',
            status: DeliveryStatus.delivered,
          ),
        'message:read' => DeliveryEvent(
            messageId: json['messageId']?.toString() ?? '',
            status: DeliveryStatus.read,
          ),
        'presence:update' => PresenceEvent(
            userId: json['userId']?.toString() ?? '',
            status: json['status']?.toString() ?? '',
            lastSeen: _parseLastSeen(json['lastSeen']),
          ),
        'error' => SocketErrorEvent(
            code: (json['code'] as num?)?.toInt() ?? 0,
            message: json['message']?.toString() ?? 'Unknown socket error',
          ),
        _ => UnknownEvent(json),
      };
    } catch (_) {
      // Defensive: even a weird-but-typed payload must not crash the stream.
      return UnknownEvent(json);
    }
  }

  static DateTime? _parseLastSeen(Object? value) {
    if (value == null) return null;
    if (value is num) {
      return DateTime.fromMillisecondsSinceEpoch(value.toInt(), isUtc: true);
    }
    if (value is String) {
      final asInt = int.tryParse(value);
      if (asInt != null) {
        return DateTime.fromMillisecondsSinceEpoch(asInt, isUtc: true);
      }
      return DateTime.tryParse(value);
    }
    return null;
  }
}

/// A new chat message arrived (server fan-out of someone's `chat_message`).
///
/// [messageJson] is the message payload object (`json['message']` when the
/// frame wraps it, otherwise the frame itself minus the envelope).
final class NewMessageEvent extends ChatSocketEvent {
  final Map<String, dynamic> messageJson;
  const NewMessageEvent(this.messageJson);
}

/// A remote user's typing state changed in a conversation.
final class TypingIndicatorEvent extends ChatSocketEvent {
  final String conversationId;
  final String userId;
  final bool isTyping;
  const TypingIndicatorEvent({
    required this.conversationId,
    required this.userId,
    required this.isTyping,
  });
}

/// A delivery or read receipt for one of our messages.
final class DeliveryEvent extends ChatSocketEvent {
  final String messageId;
  final DeliveryStatus status;
  const DeliveryEvent({required this.messageId, required this.status});
}

/// A user's presence changed (online on connect, offline on last-device
/// disconnect; `lastSeen` freshness is 30 s per the backend contract).
final class PresenceEvent extends ChatSocketEvent {
  final String userId;
  final String status;
  final DateTime? lastSeen;
  const PresenceEvent({
    required this.userId,
    required this.status,
    this.lastSeen,
  });
}

/// An error pushed by the server (e.g. `{type:'error'}` before the 4001
/// handshake-failure close).
final class SocketErrorEvent extends ChatSocketEvent {
  final int code;
  final String message;
  const SocketErrorEvent({required this.code, required this.message});
}

/// An inbound frame whose `type` the client doesn't recognise.
///
/// Kept raw for logging/telemetry. Never thrown away, never crashes.
final class UnknownEvent extends ChatSocketEvent {
  final Map<String, dynamic> raw;
  const UnknownEvent(this.raw);
}

// ---------------------------------------------------------------------------
// Outbound frame builders — frame names are EXACT per the /ws/chat contract.
// ---------------------------------------------------------------------------

/// Builds a `chat_message` frame. `senderId` is injected server-side; the
/// client must NOT send it.
Map<String, dynamic> buildChatMessage({
  required String conversationId,
  required String content,
  String type = 'text',
  String? replyToId,
}) {
  return {
    'type': 'chat_message',
    'conversationId': conversationId,
    'content': content,
    'messageType': type,
    if (replyToId != null) 'replyToId': replyToId,
  };
}

/// Builds a `typing` frame (server fans it out as `typing_indicator`).
Map<String, dynamic> buildTyping({
  required String conversationId,
  required bool isTyping,
}) {
  return {
    'type': 'typing',
    'conversationId': conversationId,
    'isTyping': isTyping,
  };
}

/// Builds a `join_conversation` frame.
Map<String, dynamic> buildJoinConversation(String conversationId) {
  return {
    'type': 'join_conversation',
    'conversationId': conversationId,
  };
}

/// Builds a `heartbeat` frame (server treats it as a last-seen refresh;
/// `ping` is an accepted alias).
Map<String, dynamic> buildHeartbeat() {
  return {'type': 'heartbeat'};
}

/// Builds a `delivery_ack` frame (server fans it out as `message:delivered`).
Map<String, dynamic> buildDeliveryAck({
  required String messageId,
  required String conversationId,
}) {
  return {
    'type': 'delivery_ack',
    'messageId': messageId,
    'conversationId': conversationId,
  };
}

/// Builds a `read_receipt` frame (server fans it out as `message:read`).
Map<String, dynamic> buildReadReceipt({
  required String messageId,
  required String conversationId,
}) {
  return {
    'type': 'read_receipt',
    'messageId': messageId,
    'conversationId': conversationId,
  };
}

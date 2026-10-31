// QuantChat Chat List — Phase 2A data layer.
// Strictly ZERO raw Unicode emojis throughout this file.
//
// Reuses the backend contract in
// apps/quantchat/backend/services/chat-event-envelope.ts (§18–§20):
// every realtime event carries event_id / sequence / cursor, clients dedupe
// by event_id and detect gaps through sequence/cursor. No NEW realtime
// infrastructure is added here — a Centrifugo-backed implementation of
// [ChatListRepository] plugs into this same interface later.
//
// The bundled [LocalSampleChatListRepository] is SAMPLE DATA ONLY, clearly
// labeled, so the UI can be reviewed before backend wire-up lands. It must
// be replaced by the Centrifugo-backed repository; see the TODO below.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';

import '../models/chat_list_models.dart';
import '../models/chat_models.dart';

/// Mirror of the backend ChatEventEnvelope (contract §18). Only the fields the
/// chat list consumes are modeled; unknown fields pass through in [payload].
class ChatListEventEnvelope {
  /// Unique id — clients dedupe on this (§18).
  final String eventId;

  /// Event type, e.g. 'chat.message.created.v1'.
  final String eventType;

  /// Per-channel monotonic sequence — gap detection (§18).
  final int sequence;

  /// Opaque resume cursor: "<channel>:<sequence>" (§20).
  final String cursor;

  final Map<String, dynamic> payload;

  const ChatListEventEnvelope({
    required this.eventId,
    required this.eventType,
    required this.sequence,
    required this.cursor,
    this.payload = const {},
  });

  factory ChatListEventEnvelope.fromJson(Map<String, dynamic> json) {
    return ChatListEventEnvelope(
      eventId: json['event_id'] as String? ?? '',
      eventType: json['event_type'] as String? ?? '',
      sequence: (json['sequence'] as num?)?.toInt() ?? 0,
      cursor: json['cursor'] as String? ?? '',
      payload: (json['payload'] as Map?)?.cast<String, dynamic>() ?? const {},
    );
  }
}

/// Immutable snapshot handed to the chat list UI.
class ChatListSnapshot {
  final List<ChatListEntry> conversations;
  final List<FriendRequest> addedMe;
  final List<FriendSuggestion> quickAdd;

  /// Last applied realtime cursor, or null when nothing applied yet.
  final String? lastCursor;

  const ChatListSnapshot({
    this.conversations = const [],
    this.addedMe = const [],
    this.quickAdd = const [],
    this.lastCursor,
  });

  int get totalUnread => conversations.fold<int>(
        0,
        (sum, e) => sum + e.conversation.unreadCount,
      );

  int get newCount =>
      conversations.where((e) => e.isNewItem).length;
}

/// Data source contract for the chat list.
///
/// A future Centrifugo-backed implementation subscribes to
/// `conversation.*` / `user.<id>.inbox` channels and feeds envelopes into
/// [applyEnvelope]; unread/reply counts then come from live cursor state.
abstract class ChatListRepository {
  Future<ChatListSnapshot> load();
  Stream<ChatListSnapshot> get updates;
  void applyEnvelope(ChatListEventEnvelope envelope);
  Future<void> markAsRead(String conversationId);
  Future<void> acceptRequest(String requestId);
  Future<void> ignoreRequest(String requestId);
  Future<void> addSuggestion(String suggestionId);
  Future<void> dismissSuggestion(String suggestionId);
  void dispose();
}

/// SAMPLE DATA ONLY — in-memory stand-in for the Centrifugo/Prisma-backed
/// repository. Names and timestamps are invented for UI review; nothing here
/// is a real user. TODO(phase-2b): replace with the live repository wired to
/// the backend conversations API + Centrifugo envelopes.
class LocalSampleChatListRepository implements ChatListRepository {
  final _controller = StreamController<ChatListSnapshot>.broadcast();

  List<ChatListEntry> _conversations = [];
  List<FriendRequest> _addedMe = [];
  List<FriendSuggestion> _quickAdd = [];

  /// event_ids already applied — dedupe per contract §18.
  final Set<String> _seenEventIds = <String>{};

  /// Highest sequence applied per channel — gap detection per §18.
  final Map<String, int> _lastSequenceByChannel = <String, int>{};
  String? _lastCursor;

  LocalSampleChatListRepository() {
    _seed();
  }

  @override
  Future<ChatListSnapshot> load() async => _snapshot();

  @override
  Stream<ChatListSnapshot> get updates => _controller.stream;

  ChatListSnapshot _snapshot() => ChatListSnapshot(
        conversations: List.unmodifiable(_conversations),
        addedMe: List.unmodifiable(_addedMe),
        quickAdd: List.unmodifiable(_quickAdd),
        lastCursor: _lastCursor,
      );

  void _emit() {
    if (!_controller.isClosed) _controller.add(_snapshot());
  }

  @override
  void applyEnvelope(ChatListEventEnvelope envelope) {
    if (envelope.eventId.isEmpty || !_seenEventIds.add(envelope.eventId)) {
      return; // duplicate or malformed — ignore per §18
    }
    final channel = envelope.cursor.split(':').first;
    final lastSeq = _lastSequenceByChannel[channel] ?? 0;
    if (envelope.sequence > lastSeq + 1 && lastSeq > 0) {
      // Gap detected: the UI layer may request a snapshot resync.
      // The local stand-in just continues; the live implementation must
      // replay from the cursor per contract §20.
    }
    _lastSequenceByChannel[channel] = envelope.sequence;
    _lastCursor = envelope.cursor;

    final conversationId = envelope.payload['conversation_id'] as String?;
    if (conversationId == null) {
      _emit();
      return;
    }
    final idx =
        _conversations.indexWhere((e) => e.conversation.id == conversationId);
    if (idx < 0) {
      _emit();
      return;
    }
    final entry = _conversations[idx];
    switch (envelope.eventType) {
      case 'chat.message.created.v1':
        final isSnap = envelope.payload['is_snap'] == true;
        _conversations[idx] = entry.copyWith(
          conversation: entry.conversation.copyWith(
            unreadCount: entry.conversation.unreadCount + 1,
            lastMessage: envelope.payload['preview'] as String? ??
                entry.conversation.lastMessage,
            lastMessageTime: 'just now',
          ),
          activityKind:
              isSnap ? ChatActivityKind.newSnap : ChatActivityKind.unreadMessage,
          needsReply: true,
          isNewItem: true,
        );
      case 'chat.message.receipt_updated.v1':
        final receipt = envelope.payload['receipt'] as String?;
        final status = switch (receipt) {
          'read' => MessageDeliveryStatus.read,
          'delivered' => MessageDeliveryStatus.delivered,
          'sent' => MessageDeliveryStatus.sent,
          _ => null,
        };
        if (status != null) {
          _conversations[idx] = entry.copyWith(
            conversation:
                entry.conversation.copyWith(lastMessageStatus: status),
          );
        }
    }
    _emit();
  }

  @override
  Future<void> markAsRead(String conversationId) async {
    final idx =
        _conversations.indexWhere((e) => e.conversation.id == conversationId);
    if (idx >= 0) {
      final entry = _conversations[idx];
      _conversations[idx] = entry.copyWith(
        conversation: entry.conversation.copyWith(unreadCount: 0),
        activityKind: entry.activityKind == ChatActivityKind.newSnap ||
                entry.activityKind == ChatActivityKind.unreadMessage
            ? ChatActivityKind.chat
            : entry.activityKind,
        needsReply: false,
        isNewItem: false,
      );
      _emit();
    }
  }

  @override
  Future<void> acceptRequest(String requestId) async {
    final idx = _addedMe.indexWhere((r) => r.id == requestId);
    if (idx < 0) return;
    final request = _addedMe.removeAt(idx);
    _conversations.insert(
      0,
      ChatListEntry(
        conversation: request.toConversation().copyWith(
              lastMessage: 'You accepted the friend request',
              lastMessageTime: 'just now',
            ),
        activityKind: ChatActivityKind.tapToChat,
      ),
    );
    _emit();
  }

  @override
  Future<void> ignoreRequest(String requestId) async {
    _addedMe.removeWhere((r) => r.id == requestId);
    _emit();
  }

  @override
  Future<void> addSuggestion(String suggestionId) async {
    final idx = _quickAdd.indexWhere((s) => s.id == suggestionId);
    if (idx < 0) return;
    final suggestion = _quickAdd.removeAt(idx);
    _addedMe.add(
      FriendRequest(
        id: suggestion.id,
        name: suggestion.name,
        handle: suggestion.handle,
        avatarInitials: suggestion.avatarInitials,
        avatarColor: suggestion.avatarColor,
        mutualFriends: suggestion.mutualFriends,
        timeLabel: 'just now',
      ),
    );
    _emit();
  }

  @override
  Future<void> dismissSuggestion(String suggestionId) async {
    _quickAdd.removeWhere((s) => s.id == suggestionId);
    _emit();
  }

  @override
  void dispose() {
    _controller.close();
  }

  // ---------------------------------------------------------------------------
  // Sample seed data — invented names for UI review only.
  // ---------------------------------------------------------------------------

  static const _cCyan = QuantColors.sovereignCyan;
  static const _cOrange = QuantColors.moltenOrange;

  void _seed() {
    _conversations = [
      ChatListEntry(
        conversation: const ChatConversation(
          id: 'conv-diya',
          contactId: 'u-diya',
          name: 'Diya Sharma',
          avatarInitials: 'DS',
          avatarColor: _cCyan,
          lastMessage: 'New Snap',
          lastMessageTime: 'just now',
          unreadCount: 1,
          isOnline: true,
          lastSeenText: 'Online now',
        ),
        activityKind: ChatActivityKind.newSnap,
        needsReply: true,
        isNewItem: true,
      ),
      ChatListEntry(
        conversation: const ChatConversation(
          id: 'conv-aarav',
          contactId: 'u-aarav',
          name: 'Aarav Mehta',
          avatarInitials: 'AM',
          avatarColor: _cOrange,
          lastMessage: 'Are we still on for Saturday?',
          lastMessageTime: '12m',
          unreadCount: 2,
          isOnline: true,
          lastSeenText: 'Online now',
        ),
        activityKind: ChatActivityKind.unreadMessage,
        needsReply: true,
      ),
      ChatListEntry(
        conversation: const ChatConversation(
          id: 'conv-kabir',
          contactId: 'u-kabir',
          name: 'Kabir Rao',
          avatarInitials: 'KR',
          avatarColor: Color(0xFFB388FF),
          lastMessage: 'Screenshot',
          lastMessageTime: '3h',
          lastSeenText: 'Active 1h ago',
        ),
        activityKind: ChatActivityKind.screenshot,
      ),
      ChatListEntry(
        conversation: const ChatConversation(
          id: 'conv-ananya',
          contactId: 'u-ananya',
          name: 'Ananya Iyer',
          avatarInitials: 'AI',
          avatarColor: Color(0xFF69F0AE),
          lastMessage: 'Sent you the photos',
          lastMessageTime: '1d',
          lastMessageStatus: MessageDeliveryStatus.read,
          lastSeenText: 'Active 2h ago',
        ),
      ),
      ChatListEntry(
        conversation: const ChatConversation(
          id: 'conv-vivaan',
          contactId: 'u-vivaan',
          name: 'Vivaan Patel',
          avatarInitials: 'VP',
          avatarColor: Color(0xFFFFD54F),
          lastMessage: 'Tap to chat',
          lastMessageTime: '',
          lastSeenText: 'Active yesterday',
        ),
        activityKind: ChatActivityKind.tapToChat,
      ),
      ChatListEntry(
        conversation: ChatConversation(
          id: 'conv-quant-design',
          contactId: 'g-design',
          name: 'Quant Design Guild',
          avatarInitials: 'QD',
          avatarColor: _cCyan,
          lastMessage: 'Mira: the new header looks sharp',
          lastMessageTime: '2d',
          lastMessageStatus: MessageDeliveryStatus.delivered,
          isGroup: true,
          memberCount: 12,
          lastSeenText: '12 members',
        ),
      ),
      ChatListEntry(
        conversation: const ChatConversation(
          id: 'conv-ishita',
          contactId: 'u-ishita',
          name: 'Ishita Nair',
          avatarInitials: 'IN',
          avatarColor: Color(0xFFFF8A80),
          lastMessage: 'Talk later?',
          lastMessageTime: '5d',
          lastMessageStatus: MessageDeliveryStatus.sent,
          lastSeenText: 'Active 5d ago',
        ),
      ),
    ];

    _addedMe = const [
      FriendRequest(
        id: 'req-meera',
        name: 'Meera Joshi',
        handle: '@meera.j',
        avatarInitials: 'MJ',
        avatarColor: Color(0xFF80D8FF),
        mutualFriends: 2,
        timeLabel: '1h',
      ),
      FriendRequest(
        id: 'req-rohan',
        name: 'Rohan Verma',
        handle: '@rohanv',
        avatarInitials: 'RV',
        avatarColor: Color(0xFFCCFF90),
        mutualFriends: 1,
        timeLabel: '4h',
      ),
    ];

    _quickAdd = const [
      FriendSuggestion(
        id: 'sug-sana',
        name: 'Sana Kapoor',
        handle: '@sanak',
        avatarInitials: 'SK',
        avatarColor: Color(0xFFFFCC80),
        mutualFriends: 4,
      ),
      FriendSuggestion(
        id: 'sug-aditya',
        name: 'Aditya Rao',
        handle: '@adi.rao',
        avatarInitials: 'AR',
        avatarColor: Color(0xFFB9F6CA),
        mutualFriends: 3,
      ),
      FriendSuggestion(
        id: 'sug-priya',
        name: 'Priya Nair',
        handle: '@priya.n',
        avatarInitials: 'PN',
        avatarColor: Color(0xFFE1BEE7),
        mutualFriends: 2,
      ),
    ];
  }
}

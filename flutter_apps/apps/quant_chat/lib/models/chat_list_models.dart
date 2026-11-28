// QuantChat Chat List — Phase 2A domain models.
// Strictly ZERO raw Unicode emojis throughout this file.
//
// Layout and interaction patterns here are ABSTRACTED from a Mobbin screen
// review (see mobbin-screen-spec.md, Flow 3). No Snapchat assets, logos,
// screenshots, branding, wording, or code are reproduced.
//
// Privacy honesty: end-to-end encryption is NOT enabled yet. Nothing in this
// file claims it. Screenshot handling is detection + notice only, never
// "prevention".

import 'package:flutter/material.dart';
import 'chat_models.dart';

/// Filter chips on the chat list: All / Unread / Reply / New.
enum ChatListFilter {
  all,
  unread,
  reply,
  isNew,
}

extension ChatListFilterLabel on ChatListFilter {
  /// Short text label rendered inside the tappable pill.
  String get label {
    switch (this) {
      case ChatListFilter.all:
        return 'All';
      case ChatListFilter.unread:
        return 'Unread';
      case ChatListFilter.reply:
        return 'Reply';
      case ChatListFilter.isNew:
        return 'New';
    }
  }
}

/// What the status line beneath a conversation name should describe.
enum ChatActivityKind {
  /// No history yet — invite the user to start chatting.
  tapToChat,

  /// Incoming snap that has not been opened yet.
  newSnap,

  /// Incoming chat message that has not been read yet.
  unreadMessage,

  /// Outgoing snap delivered but not yet opened by the friend.
  snapDelivered,

  /// Plain chat exchange with no unread activity.
  chat,

  /// A screenshot of the chat was detected (detection + notice only).
  screenshot,
}

/// One row in the conversations section of the chat list.
///
/// Wraps the shared [ChatConversation] model with Phase 2A list-specific
/// presentation state so the shared model file stays untouched.
class ChatListEntry {
  final ChatConversation conversation;
  final ChatActivityKind activityKind;
  final bool needsReply;
  final bool isNewItem;

  const ChatListEntry({
    required this.conversation,
    this.activityKind = ChatActivityKind.chat,
    this.needsReply = false,
    this.isNewItem = false,
  });

  ChatListEntry copyWith({
    ChatConversation? conversation,
    ChatActivityKind? activityKind,
    bool? needsReply,
    bool? isNewItem,
  }) {
    return ChatListEntry(
      conversation: conversation ?? this.conversation,
      activityKind: activityKind ?? this.activityKind,
      needsReply: needsReply ?? this.needsReply,
      isNewItem: isNewItem ?? this.isNewItem,
    );
  }
}

/// Incoming friend request — the "Added Me" section.
class FriendRequest {
  final String id;
  final String name;
  final String handle;
  final String avatarInitials;
  final Color avatarColor;
  final int mutualFriends;
  final String timeLabel;

  const FriendRequest({
    required this.id,
    required this.name,
    required this.handle,
    required this.avatarInitials,
    required this.avatarColor,
    this.mutualFriends = 0,
    this.timeLabel = '',
  });

  /// A lightweight conversation view so an "Added Me" row can open a thread
  /// or address a quick snap without a backend round-trip.
  ChatConversation toConversation() {
    return ChatConversation(
      id: 'req-$id',
      contactId: id,
      name: name,
      avatarInitials: avatarInitials,
      avatarColor: avatarColor,
      lastMessage: 'Tap to chat',
      lastMessageTime: timeLabel,
    );
  }
}

/// Suggested friend — the "Quick Add" section.
class FriendSuggestion {
  final String id;
  final String name;
  final String handle;
  final String avatarInitials;
  final Color avatarColor;
  final int mutualFriends;

  const FriendSuggestion({
    required this.id,
    required this.name,
    required this.handle,
    required this.avatarInitials,
    required this.avatarColor,
    this.mutualFriends = 0,
  });

  String get subtitle =>
      mutualFriends > 0 ? '$mutualFriends mutual friends' : handle;
}

/// Result of the addressed quick-capture flow.
class QuickSnapResult {
  final String recipientId;
  final String recipientName;
  final String filePath;

  const QuickSnapResult({
    required this.recipientId,
    required this.recipientName,
    required this.filePath,
  });
}

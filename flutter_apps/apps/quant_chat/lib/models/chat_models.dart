// Sovereign Quant Ecosystem - QuantChat Domain Models
// Strictly ZERO raw Unicode emojis throughout this file.

import 'package:flutter/material.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_theme/quant_theme.dart';

/// Message delivery lifecycle status with double-tick tracking.
enum MessageDeliveryStatus {
  sending,
  sent,
  delivered,
  read,
}

/// Content payload classification.
enum MessageType {
  text,
  audio,
  image,
  document,
  system,
}

/// Audio Space participant roles.
enum SpaceParticipantRole {
  host,
  speaker,
  listener,
}

/// Domain model representing an encrypted chat message.
class ChatMessage {
  final String id;
  final String conversationId;
  final String senderId;
  final String senderName;
  final String text;
  final String timestamp;
  final bool isOutgoing;
  final MessageDeliveryStatus deliveryStatus;
  final MessageType type;
  final int audioDurationSeconds;
  final List<double> audioWaveform;
  final String? mediaUrl;
  final String? fileName;
  final int? fileSizeBytes;

  const ChatMessage({
    required this.id,
    required this.conversationId,
    required this.senderId,
    required this.senderName,
    required this.text,
    required this.timestamp,
    required this.isOutgoing,
    this.deliveryStatus = MessageDeliveryStatus.sent,
    this.type = MessageType.text,
    this.audioDurationSeconds = 0,
    this.audioWaveform = const [],
    this.mediaUrl,
    this.fileName,
    this.fileSizeBytes,
  });

  ChatMessage copyWith({
    String? id,
    String? conversationId,
    String? senderId,
    String? senderName,
    String? text,
    String? timestamp,
    bool? isOutgoing,
    MessageDeliveryStatus? deliveryStatus,
    MessageType? type,
    int? audioDurationSeconds,
    List<double>? audioWaveform,
    String? mediaUrl,
    String? fileName,
    int? fileSizeBytes,
  }) {
    return ChatMessage(
      id: id ?? this.id,
      conversationId: conversationId ?? this.conversationId,
      senderId: senderId ?? this.senderId,
      senderName: senderName ?? this.senderName,
      text: text ?? this.text,
      timestamp: timestamp ?? this.timestamp,
      isOutgoing: isOutgoing ?? this.isOutgoing,
      deliveryStatus: deliveryStatus ?? this.deliveryStatus,
      type: type ?? this.type,
      audioDurationSeconds: audioDurationSeconds ?? this.audioDurationSeconds,
      audioWaveform: audioWaveform ?? this.audioWaveform,
      mediaUrl: mediaUrl ?? this.mediaUrl,
      fileName: fileName ?? this.fileName,
      fileSizeBytes: fileSizeBytes ?? this.fileSizeBytes,
    );
  }
}

/// Domain model representing a chat conversation / thread.
class ChatConversation {
  final String id;
  final String contactId;
  final String name;
  final String avatarInitials;
  final Color avatarColor;
  final String lastMessage;
  final String lastMessageTime;
  final int unreadCount;
  final bool isOnline;
  final bool isTyping;
  final bool isPinned;
  final bool isMuted;
  final String lastSeenText;
  final MessageDeliveryStatus? lastMessageStatus;

  const ChatConversation({
    required this.id,
    required this.contactId,
    required this.name,
    required this.avatarInitials,
    required this.avatarColor,
    required this.lastMessage,
    required this.lastMessageTime,
    this.unreadCount = 0,
    this.isOnline = false,
    this.isTyping = false,
    this.isPinned = false,
    this.isMuted = false,
    this.lastSeenText = 'Offline',
    this.lastMessageStatus,
  });

  ChatConversation copyWith({
    String? id,
    String? contactId,
    String? name,
    String? avatarInitials,
    Color? avatarColor,
    String? lastMessage,
    String? lastMessageTime,
    int? unreadCount,
    bool? isOnline,
    bool? isTyping,
    bool? isPinned,
    bool? isMuted,
    String? lastSeenText,
    MessageDeliveryStatus? lastMessageStatus,
  }) {
    return ChatConversation(
      id: id ?? this.id,
      contactId: contactId ?? this.contactId,
      name: name ?? this.name,
      avatarInitials: avatarInitials ?? this.avatarInitials,
      avatarColor: avatarColor ?? this.avatarColor,
      lastMessage: lastMessage ?? this.lastMessage,
      lastMessageTime: lastMessageTime ?? this.lastMessageTime,
      unreadCount: unreadCount ?? this.unreadCount,
      isOnline: isOnline ?? this.isOnline,
      isTyping: isTyping ?? this.isTyping,
      isPinned: isPinned ?? this.isPinned,
      isMuted: isMuted ?? this.isMuted,
      lastSeenText: lastSeenText ?? this.lastSeenText,
      lastMessageStatus: lastMessageStatus ?? this.lastMessageStatus,
    );
  }
}

/// Participant in a live Audio Space stage.
class SpaceParticipant {
  final String id;
  final String name;
  final String avatarInitials;
  final SpaceParticipantRole role;
  final bool isMuted;
  final bool isSpeaking;
  final bool isHandRaised;
  final Color accentColor;

  const SpaceParticipant({
    required this.id,
    required this.name,
    required this.avatarInitials,
    required this.role,
    this.isMuted = false,
    this.isSpeaking = false,
    this.isHandRaised = false,
    this.accentColor = QuantColors.moltenOrange,
  });

  SpaceParticipant copyWith({
    String? id,
    String? name,
    String? avatarInitials,
    SpaceParticipantRole? role,
    bool? isMuted,
    bool? isSpeaking,
    bool? isHandRaised,
    Color? accentColor,
  }) {
    return SpaceParticipant(
      id: id ?? this.id,
      name: name ?? this.name,
      avatarInitials: avatarInitials ?? this.avatarInitials,
      role: role ?? this.role,
      isMuted: isMuted ?? this.isMuted,
      isSpeaking: isSpeaking ?? this.isSpeaking,
      isHandRaised: isHandRaised ?? this.isHandRaised,
      accentColor: accentColor ?? this.accentColor,
    );
  }
}

/// Domain model for Chatter-class live Audio Space room.
class AudioSpaceRoom {
  final String id;
  final String title;
  final String topic;
  final int listenersCount;
  final int speakersCount;
  final bool isLive;
  final SpaceParticipant host;
  final List<SpaceParticipant> speakers;
  final List<SpaceParticipant> listeners;

  const AudioSpaceRoom({
    required this.id,
    required this.title,
    required this.topic,
    required this.listenersCount,
    required this.speakersCount,
    this.isLive = true,
    required this.host,
    required this.speakers,
    required this.listeners,
  });
}

/// Domain model for call history entries.
class CallHistoryItem {
  final String id;
  final String contactName;
  final String contactInitials;
  final Color contactAvatarColor;
  final QuantCallType callType;
  final bool isIncoming;
  final bool isMissed;
  final String timestamp;
  final String duration;
  final int latencyMs;

  const CallHistoryItem({
    required this.id,
    required this.contactName,
    required this.contactInitials,
    required this.contactAvatarColor,
    required this.callType,
    required this.isIncoming,
    required this.isMissed,
    required this.timestamp,
    required this.duration,
    this.latencyMs = 18,
  });
}

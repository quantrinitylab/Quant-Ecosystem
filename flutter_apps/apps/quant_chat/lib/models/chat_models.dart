// Sovereign Quant Ecosystem - QuantChat Domain Models
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_theme/quant_theme.dart';

/// Message delivery lifecycle status with 4-stage tick tracking:
/// - pending / Clock: Sending (clock icon)
/// - sent / SingleGrey: Sent to server (single grey check)
/// - delivered / DoubleGrey: Delivered to recipient device (double grey check)
/// - read / DoubleCyan: Read by recipient (double cyan check #00E5FF)
enum MessageDeliveryStatus {
  pending,
  sent,
  delivered,
  read;

  /// Backward-compatible alias for previous sending state
  static const MessageDeliveryStatus sending = pending;

  /// Canonical 4-stage delivery tick identifier
  String get stageName {
    switch (this) {
      case MessageDeliveryStatus.pending:
        return 'Clock';
      case MessageDeliveryStatus.sent:
        return 'SingleGrey';
      case MessageDeliveryStatus.delivered:
        return 'DoubleGrey';
      case MessageDeliveryStatus.read:
        return 'DoubleCyan';
    }
  }

  /// Material 3 vector icon representing each delivery stage
  IconData get icon {
    switch (this) {
      case MessageDeliveryStatus.pending:
        return Icons.access_time_rounded;
      case MessageDeliveryStatus.sent:
        return Icons.check_rounded;
      case MessageDeliveryStatus.delivered:
        return Icons.done_all_rounded;
      case MessageDeliveryStatus.read:
        return Icons.done_all_rounded;
    }
  }

  /// Sovereign color coding for each 4-stage delivery tick
  Color get color {
    switch (this) {
      case MessageDeliveryStatus.pending:
        return const Color(0xFF94A3B8); // Slate grey clock
      case MessageDeliveryStatus.sent:
        return const Color(0xFF94A3B8); // Single grey check
      case MessageDeliveryStatus.delivered:
        return const Color(0xFF94A3B8); // Double grey check
      case MessageDeliveryStatus.read:
        return QuantColors.sovereignCyan; // Double cyan read check
    }
  }
}

/// Reusable Sovereign 4-Stage Delivery Tick Widget
/// - Clock (Sending): Icons.access_time_rounded (Grey)
/// - SingleGrey (Sent): Icons.check_rounded (Grey)
/// - DoubleGrey (Delivered): Icons.done_all_rounded (Grey)
/// - DoubleCyan (Read): Icons.done_all_rounded (Cyan)
class DeliveryTickWidget extends StatelessWidget {
  final MessageDeliveryStatus status;
  final double size;
  final Color? overrideColor;

  const DeliveryTickWidget({
    super.key,
    required this.status,
    this.size = 14,
    this.overrideColor,
  });

  @override
  Widget build(BuildContext context) {
    return Icon(
      status.icon,
      size: size,
      color: overrideColor ?? status.color,
    );
  }
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
  final double audioPlaybackSpeed; // 1.0, 1.5, 2.0
  final String? mediaUrl;
  final String? fileName;
  final int? fileSizeBytes;

  // Sovereign Ephemeral / Disappearing message fields (HTTP 410 destruction)
  final bool isDisappearing;
  final int disappearingDurationSeconds;
  final int secondsRemaining;
  final bool isServerDestroyed;
  final int serverDestructionCode; // 410 Gone

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
    this.audioPlaybackSpeed = 1.0,
    this.mediaUrl,
    this.fileName,
    this.fileSizeBytes,
    this.isDisappearing = false,
    this.disappearingDurationSeconds = 0,
    this.secondsRemaining = 0,
    this.isServerDestroyed = false,
    this.serverDestructionCode = 410,
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
    double? audioPlaybackSpeed,
    String? mediaUrl,
    String? fileName,
    int? fileSizeBytes,
    bool? isDisappearing,
    int? disappearingDurationSeconds,
    int? secondsRemaining,
    bool? isServerDestroyed,
    int? serverDestructionCode,
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
      audioPlaybackSpeed: audioPlaybackSpeed ?? this.audioPlaybackSpeed,
      mediaUrl: mediaUrl ?? this.mediaUrl,
      fileName: fileName ?? this.fileName,
      fileSizeBytes: fileSizeBytes ?? this.fileSizeBytes,
      isDisappearing: isDisappearing ?? this.isDisappearing,
      disappearingDurationSeconds: disappearingDurationSeconds ?? this.disappearingDurationSeconds,
      secondsRemaining: secondsRemaining ?? this.secondsRemaining,
      isServerDestroyed: isServerDestroyed ?? this.isServerDestroyed,
      serverDestructionCode: serverDestructionCode ?? this.serverDestructionCode,
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
  final bool isDisappearingModeEnabled;
  final int defaultDisappearingDurationSeconds;

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
    this.isDisappearingModeEnabled = false,
    this.defaultDisappearingDurationSeconds = 30,
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
    bool? isDisappearingModeEnabled,
    int? defaultDisappearingDurationSeconds,
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
      isDisappearingModeEnabled: isDisappearingModeEnabled ?? this.isDisappearingModeEnabled,
      defaultDisappearingDurationSeconds: defaultDisappearingDurationSeconds ?? this.defaultDisappearingDurationSeconds,
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
  final bool isScreenSharing;

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
    this.isScreenSharing = false,
  });

  AudioSpaceRoom copyWith({
    String? id,
    String? title,
    String? topic,
    int? listenersCount,
    int? speakersCount,
    bool? isLive,
    SpaceParticipant? host,
    List<SpaceParticipant>? speakers,
    List<SpaceParticipant>? listeners,
    bool? isScreenSharing,
  }) {
    return AudioSpaceRoom(
      id: id ?? this.id,
      title: title ?? this.title,
      topic: topic ?? this.topic,
      listenersCount: listenersCount ?? this.listenersCount,
      speakersCount: speakersCount ?? this.speakersCount,
      isLive: isLive ?? this.isLive,
      host: host ?? this.host,
      speakers: speakers ?? this.speakers,
      listeners: listeners ?? this.listeners,
      isScreenSharing: isScreenSharing ?? this.isScreenSharing,
    );
  }
}

/// Participant in an HD WebRTC Audio/Video call.
class CallParticipant {
  final String id;
  final String name;
  final String avatarInitials;
  final Color avatarColor;
  final bool isAudioMuted;
  final bool isVideoEnabled;
  final bool isSpeaking;
  final bool isScreenSharing;
  final int latencyMs;
  final String videoResolution;
  final int frameRateFps;

  const CallParticipant({
    required this.id,
    required this.name,
    required this.avatarInitials,
    required this.avatarColor,
    this.isAudioMuted = false,
    this.isVideoEnabled = true,
    this.isSpeaking = false,
    this.isScreenSharing = false,
    this.latencyMs = 18,
    this.videoResolution = '1080p',
    this.frameRateFps = 60,
  });

  CallParticipant copyWith({
    String? id,
    String? name,
    String? avatarInitials,
    Color? avatarColor,
    bool? isAudioMuted,
    bool? isVideoEnabled,
    bool? isSpeaking,
    bool? isScreenSharing,
    int? latencyMs,
    String? videoResolution,
    int? frameRateFps,
  }) {
    return CallParticipant(
      id: id ?? this.id,
      name: name ?? this.name,
      avatarInitials: avatarInitials ?? this.avatarInitials,
      avatarColor: avatarColor ?? this.avatarColor,
      isAudioMuted: isAudioMuted ?? this.isAudioMuted,
      isVideoEnabled: isVideoEnabled ?? this.isVideoEnabled,
      isSpeaking: isSpeaking ?? this.isSpeaking,
      isScreenSharing: isScreenSharing ?? this.isScreenSharing,
      latencyMs: latencyMs ?? this.latencyMs,
      videoResolution: videoResolution ?? this.videoResolution,
      frameRateFps: frameRateFps ?? this.frameRateFps,
    );
  }
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

// Sovereign Quant Ecosystem - WebRTC Architectural Bridge
// Connects mobile audio/video call engines to sovereign Fastify & WebSocket Gateway.
// Strictly ZERO raw Unicode emojis throughout this file.

import 'dart:async';

/// Supported media call types.
enum QuantCallType {
  audio,
  video,
  screenShare,
}

/// Call session lifecycle states.
enum QuantCallState {
  idle,
  initiating,
  ringing,
  connecting,
  connected,
  reconnecting,
  ended,
  failed,
}

/// Dynamic STUN/TURN server configuration fetched from sovereign Fastify endpoints.
class QuantIceServerConfig {
  final List<String> urls;
  final String? username;
  final String? credential;

  const QuantIceServerConfig({
    required this.urls,
    this.username,
    this.credential,
  });

  factory QuantIceServerConfig.fromJson(Map<String, dynamic> json) {
    final rawUrls = json['urls'];
    final urls = rawUrls is List
        ? rawUrls.map((u) => u.toString()).toList()
        : [rawUrls.toString()];

    return QuantIceServerConfig(
      urls: urls,
      username: json['username'] as String?,
      credential: json['credential'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'urls': urls,
        if (username != null) 'username': username,
        if (credential != null) 'credential': credential,
      };
}

/// Session parameters for initiating or accepting a WebRTC call.
class QuantCallSession {
  final String callId;
  final String channelId;
  final String callerId;
  final String callerName;
  final String? callerAvatar;
  final String calleeId;
  final QuantCallType callType;
  final DateTime startedAt;
  final List<QuantIceServerConfig> iceServers;

  const QuantCallSession({
    required this.callId,
    required this.channelId,
    required this.callerId,
    required this.callerName,
    this.callerAvatar,
    required this.calleeId,
    required this.callType,
    required this.startedAt,
    required this.iceServers,
  });

  factory QuantCallSession.fromJson(Map<String, dynamic> json) {
    final iceList = (json['iceServers'] as List<dynamic>? ?? [])
        .map((e) => QuantIceServerConfig.fromJson(e as Map<String, dynamic>))
        .toList();

    return QuantCallSession(
      callId: json['callId'] as String? ?? json['call_id'] as String? ?? '',
      channelId: json['channelId'] as String? ?? json['channel_id'] as String? ?? '',
      callerId: json['callerId'] as String? ?? json['caller_id'] as String? ?? '',
      callerName: json['callerName'] as String? ?? json['caller_name'] as String? ?? 'Anonymous',
      callerAvatar: json['callerAvatar'] as String? ?? json['caller_avatar'] as String?,
      calleeId: json['calleeId'] as String? ?? json['callee_id'] as String? ?? '',
      callType: (json['callType'] == 'video' || json['call_type'] == 'video')
          ? QuantCallType.video
          : QuantCallType.audio,
      startedAt: json['startedAt'] != null
          ? DateTime.parse(json['startedAt'] as String)
          : DateTime.now(),
      iceServers: iceList,
    );
  }

  Map<String, dynamic> toJson() => {
        'callId': callId,
        'channelId': channelId,
        'callerId': callerId,
        'callerName': callerName,
        'callerAvatar': callerAvatar,
        'calleeId': calleeId,
        'callType': callType.name,
        'startedAt': startedAt.toIso8601String(),
        'iceServers': iceServers.map((s) => s.toJson()).toList(),
      };
}

/// Audio and video media constraints builder.
class QuantMediaConstraints {
  static Map<String, dynamic> build({
    required QuantCallType callType,
    bool enableEchoCancellation = true,
    bool enableNoiseSuppression = true,
    bool enableAutoGainControl = true,
    int idealWidth = 1280,
    int idealHeight = 720,
    int idealFrameRate = 30,
  }) {
    return {
      'audio': {
        'echoCancellation': enableEchoCancellation,
        'noiseSuppression': enableNoiseSuppression,
        'autoGainControl': enableAutoGainControl,
        'sampleRate': 44100,
        'channelCount': 1,
      },
      'video': callType == QuantCallType.video
          ? {
              'width': {'min': 640, 'ideal': idealWidth, 'max': 1920},
              'height': {'min': 480, 'ideal': idealHeight, 'max': 1080},
              'frameRate': {'min': 15, 'ideal': idealFrameRate, 'max': 60},
              'facingMode': 'user',
              'aspectRatio': 16 / 9,
            }
          : false,
    };
  }
}

/// Abstract contract for real-time WebRTC signaling bridge.
abstract class QuantWebRtcSignalingBridge {
  Future<void> sendOffer({
    required String callId,
    required String targetUserId,
    required String sdp,
    required QuantCallType callType,
  });

  Future<void> sendAnswer({
    required String callId,
    required String targetUserId,
    required String sdp,
  });

  Future<void> sendIceCandidate({
    required String callId,
    required String targetUserId,
    required String candidate,
    required String sdpMid,
    required int sdpMLineIndex,
  });

  Future<void> endCall({
    required String callId,
    required String reason,
  });
}

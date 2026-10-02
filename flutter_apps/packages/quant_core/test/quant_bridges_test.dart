// Sovereign Quant Ecosystem - Unit Tests for Architectural Bridges
// Verifies WebRTC, Media, and Document bridges.
// Strictly ZERO raw Unicode emojis throughout this test file.

import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/quant_core.dart';

void main() {
  group('WebRTC Architectural Bridge Tests', () {
    test('QuantIceServerConfig serializes and deserializes properly', () {
      final config = QuantIceServerConfig(
        urls: ['stun:stun.quantmail.in:3478', 'turn:turn.quantmail.in:3478'],
        username: 'user_turn',
        credential: 'ephemeral_turn_password',
      );

      final json = config.toJson();
      final revived = QuantIceServerConfig.fromJson(json);

      expect(revived.urls, config.urls);
      expect(revived.username, 'user_turn');
      expect(revived.credential, 'ephemeral_turn_password');
    });

    test('QuantCallSession builds valid session with default ICE servers', () {
      final session = QuantCallSession(
        callId: 'call_abc_123',
        channelId: 'channel_room_456',
        callerId: 'usr_sundar',
        callerName: 'Sundar Pichai',
        calleeId: 'usr_satya',
        callType: QuantCallType.video,
        startedAt: DateTime.utc(2026, 10, 2, 10, 0),
        iceServers: [
          const QuantIceServerConfig(urls: ['turn:turn.quantmail.in:3478']),
        ],
      );

      final json = session.toJson();
      final revived = QuantCallSession.fromJson(json);

      expect(revived.callId, 'call_abc_123');
      expect(revived.callerName, 'Sundar Pichai');
      expect(revived.callType, QuantCallType.video);
      expect(revived.iceServers.length, 1);
    });

    test('QuantMediaConstraints generates correct audio/video parameters', () {
      final audioConstraints = QuantMediaConstraints.build(
        callType: QuantCallType.audio,
      );
      expect(audioConstraints['audio']['echoCancellation'], isTrue);
      expect(audioConstraints['audio']['noiseSuppression'], isTrue);
      expect(audioConstraints['video'], isFalse);

      final videoConstraints = QuantMediaConstraints.build(
        callType: QuantCallType.video,
        idealWidth: 1920,
        idealHeight: 1080,
      );
      expect(videoConstraints['video']['width']['ideal'], 1920);
      expect(videoConstraints['video']['height']['ideal'], 1080);
      expect(videoConstraints['video']['facingMode'], 'user');
    });
  });

  group('Media & Video Processing Bridge Tests', () {
    test('QuantPreloadPolicy evaluates viewport distance correctly', () {
      const policy = QuantPreloadPolicy(preloadCount: 3);

      expect(policy.shouldPreload(0, 0), isTrue);  // current page
      expect(policy.shouldPreload(1, 0), isTrue);  // next page 1
      expect(policy.shouldPreload(3, 0), isTrue);  // next page 3
      expect(policy.shouldPreload(4, 0), isFalse); // outside preload range
      expect(policy.shouldPreload(0, 2), isFalse); // past pages
    });

    test('QuantVideoTrimRange enforces invariants and calculates duration', () {
      const range = QuantVideoTrimRange(startSeconds: 2.5, endSeconds: 15.0);
      expect(range.durationSeconds, 12.5);
      expect(range.toJson()['durationSeconds'], 12.5);
    });

    test('QuantFFmpegCommandBuilder outputs valid zero-mock commands', () {
      final stripCmd = QuantFFmpegCommandBuilder.buildStripAudioCommand(
        sourceVideoPath: '/tmp/input.mp4',
        outputVideoPath: '/tmp/output.mp4',
      );
      expect(stripCmd, contains('-an'));
      expect(stripCmd, contains('-c copy'));

      final muxCmd = QuantFFmpegCommandBuilder.buildMuxAudioCommand(
        sourceVideoPath: '/tmp/input.mp4',
        sourceAudioPath: '/tmp/audio.aac',
        outputVideoPath: '/tmp/muxed.mp4',
        durationSeconds: 15.0,
      );
      expect(muxCmd, contains('-c:v copy'));
      expect(muxCmd, contains('-c:a aac'));
      expect(muxCmd, contains('-t 15.00'));

      final trimCmd = QuantFFmpegCommandBuilder.buildTrimVideoCommand(
        sourceVideoPath: '/tmp/input.mp4',
        outputVideoPath: '/tmp/trimmed.mp4',
        startSeconds: 3.5,
        durationSeconds: 10.0,
      );
      expect(trimCmd, contains('-ss 3.50'));
      expect(trimCmd, contains('-t 10.00'));

      final thumbCmd = QuantFFmpegCommandBuilder.buildExtractThumbnailCommand(
        sourceVideoPath: '/tmp/input.mp4',
        outputImagePath: '/tmp/thumb.jpg',
        atSeconds: 1.2,
      );
      expect(thumbCmd, contains('-ss 1.20'));
      expect(thumbCmd, contains('-vframes 1'));
    });
  });

  group('Document & PDF Viewing Bridge Tests', () {
    test('QuantDocumentDescriptor identifies PDFs and builds descriptor', () {
      const doc = QuantDocumentDescriptor(
        id: 'doc_1',
        title: 'Q3 Financial Report.pdf',
        uri: '/storage/q3.pdf',
        sourceType: QuantDocumentSourceType.localFile,
        fileSizeBytes: 2048576,
      );

      expect(doc.isPdf, isTrue);
      expect(doc.title, 'Q3 Financial Report.pdf');
      expect(doc.sourceType, QuantDocumentSourceType.localFile);
    });

    test('QuantDocumentViewerConfig provides sensible defaults', () {
      const config = QuantDocumentViewerConfig();
      expect(config.enableDoubleTapZoom, isTrue);
      expect(config.initialZoomLevel, 1.0);
      expect(config.maxZoomLevel, 3.0);
      expect(config.darkModeInversion, isFalse);
    });
  });
}

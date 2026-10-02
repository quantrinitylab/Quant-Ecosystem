// Sovereign Quant Ecosystem - QuantChat Unit & Widget Test Suite
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_chat/main.dart';
import 'package:quant_chat/models/chat_models.dart';
import 'package:quant_chat/services/chat_mock_data.dart';
import 'package:quant_chat/screens/chat_list_screen.dart';
import 'package:quant_chat/screens/conversation_screen.dart';
import 'package:quant_chat/screens/call_screen.dart';
import 'package:quant_chat/screens/audio_space_screen.dart';
import 'package:quant_chat/screens/calls_tab_screen.dart';
import 'package:quant_chat/screens/settings_screen.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // ===========================================================================
  // 1. DOMAIN MODEL & 4-STAGE TICK PROGRESSION UNIT TESTS
  // ===========================================================================
  group('QuantChat Domain Models & 4-Stage Tick Pipeline', () {
    test('MessageDeliveryStatus: 4-stage tick progression and sending backward alias', () {
      expect(MessageDeliveryStatus.values.length, 4);
      expect(MessageDeliveryStatus.pending.index, 0);
      expect(MessageDeliveryStatus.sent.index, 1);
      expect(MessageDeliveryStatus.delivered.index, 2);
      expect(MessageDeliveryStatus.read.index, 3);

      // Verify backward-compatible alias
      expect(MessageDeliveryStatus.sending, equals(MessageDeliveryStatus.pending));
    });

    test('ChatMessage properties, copyWith, and ephemeral HTTP 410 fields', () {
      const msg = ChatMessage(
        id: 'msg-test-1',
        conversationId: 'conv-test-1',
        senderId: 'usr-1',
        senderName: 'CEO Astra',
        text: 'Deploying sovereign mesh',
        timestamp: '12:00',
        isOutgoing: true,
        deliveryStatus: MessageDeliveryStatus.pending,
        type: MessageType.text,
        isDisappearing: true,
        disappearingDurationSeconds: 30,
        secondsRemaining: 15,
        isServerDestroyed: false,
        serverDestructionCode: 410,
      );

      expect(msg.id, 'msg-test-1');
      expect(msg.deliveryStatus, MessageDeliveryStatus.pending);
      expect(msg.isOutgoing, isTrue);
      expect(msg.isDisappearing, isTrue);
      expect(msg.disappearingDurationSeconds, 30);
      expect(msg.secondsRemaining, 15);
      expect(msg.isServerDestroyed, isFalse);
      expect(msg.serverDestructionCode, 410);

      // Advance through tick progression: pending -> sent -> delivered -> read
      final sentMsg = msg.copyWith(deliveryStatus: MessageDeliveryStatus.sent);
      expect(sentMsg.deliveryStatus, MessageDeliveryStatus.sent);

      final deliveredMsg = sentMsg.copyWith(deliveryStatus: MessageDeliveryStatus.delivered);
      expect(deliveredMsg.deliveryStatus, MessageDeliveryStatus.delivered);

      final readMsg = deliveredMsg.copyWith(deliveryStatus: MessageDeliveryStatus.read);
      expect(readMsg.deliveryStatus, MessageDeliveryStatus.read);

      // Verify destruction transition
      final destroyedMsg = readMsg.copyWith(
        secondsRemaining: 0,
        isServerDestroyed: true,
      );
      expect(destroyedMsg.secondsRemaining, 0);
      expect(destroyedMsg.isServerDestroyed, isTrue);
    });

    test('CallParticipant properties and copyWith for floating participant grid', () {
      const participant = CallParticipant(
        id: 'part-test-1',
        name: 'Node B (OS Lead)',
        avatarInitials: 'NB',
        avatarColor: QuantColors.sovereignCyan,
        isAudioMuted: false,
        isVideoEnabled: true,
        isSpeaking: true,
        isScreenSharing: false,
        latencyMs: 14,
        videoResolution: '1080p60',
        frameRateFps: 60,
      );

      expect(participant.name, 'Node B (OS Lead)');
      expect(participant.isSpeaking, isTrue);
      expect(participant.isScreenSharing, isFalse);
      expect(participant.latencyMs, 14);

      final updated = participant.copyWith(
        isScreenSharing: true,
        isAudioMuted: true,
      );
      expect(updated.isScreenSharing, isTrue);
      expect(updated.isAudioMuted, isTrue);
    });

    test('ChatConversation supports disappearing mode configuration and pin status', () {
      const conv = ChatConversation(
        id: 'conv-test-2',
        contactId: 'contact-test-2',
        name: 'Node B',
        avatarInitials: 'NB',
        avatarColor: QuantColors.sovereignCyan,
        lastMessage: 'Voice Orb active',
        lastMessageTime: '12:30',
        unreadCount: 5,
        isOnline: true,
        isTyping: true,
        isPinned: true,
        isDisappearingModeEnabled: true,
        defaultDisappearingDurationSeconds: 30,
      );

      expect(conv.name, 'Node B');
      expect(conv.unreadCount, 5);
      expect(conv.isOnline, isTrue);
      expect(conv.isTyping, isTrue);
      expect(conv.isPinned, isTrue);
      expect(conv.isDisappearingModeEnabled, isTrue);
      expect(conv.defaultDisappearingDurationSeconds, 30);
    });

    test('AudioSpaceRoom participant roles and hand-raising flags', () {
      final room = ChatMockData.getInitialSpaceRoom();

      expect(room.id, 'space-sovereign-stage');
      expect(room.host.role, SpaceParticipantRole.host);
      expect(room.host.isSpeaking, isTrue);
      expect(room.speakers.length, 3);
      expect(room.listeners.length, 6);

      final handsRaised = room.listeners.where((l) => l.isHandRaised).toList();
      expect(handsRaised.isNotEmpty, isTrue);
    });

    test('CallHistoryItem correctly formats WebRTC call logs', () {
      final history = ChatMockData.getInitialCallHistory();
      expect(history.length, 4);

      final videoCall = history.firstWhere((c) => c.callType == QuantCallType.video);
      expect(videoCall.contactName, 'CEO Astra');
      expect(videoCall.latencyMs, lessThan(24));
    });
  });

  // ===========================================================================
  // 2. WIDGET TREE & DEEPENED CHAT SCREEN TESTS
  // ===========================================================================
  group('QuantChat Widget Tree & Feature Tests', () {
    testWidgets('QuantChatApp builds with obsidian luxury theme and top capsule', (tester) async {
      await tester.pumpWidget(const QuantChatApp());

      expect(find.text('Quant'), findsOneWidget);
      expect(find.text('Chat'), findsOneWidget);
      expect(find.text('Quant AI Copilot'), findsOneWidget);
      expect(find.text('<24ms E2EE'), findsOneWidget);

      expect(find.text('Chats'), findsOneWidget);
      expect(find.text('Calls'), findsOneWidget);
      expect(find.text('Spaces'), findsOneWidget);
      expect(find.text('Settings'), findsOneWidget);
    });

    testWidgets('ChatListScreen renders pinned section and sticky search bar', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(body: ChatListScreen()),
        ),
      );

      expect(find.byType(TextField), findsOneWidget);
      expect(find.text('PINNED CONVERSATIONS'), findsOneWidget);
      expect(find.text('ALL CONVERSATIONS'), findsOneWidget);
      expect(find.text('CEO Astra (Notion AI Swarm)'), findsWidgets);
    });

    testWidgets('ConversationScreen: 4-stage ticks, audio scrubber & speed cycling, disappearing 410', (tester) async {
      final conv = ChatMockData.getInitialConversations().first;

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: ConversationScreen(conversation: conv),
        ),
      );
      await tester.pump();

      // Verify Conversation AppBar
      expect(find.text('CEO Astra (Notion AI Swarm)'), findsOneWidget);
      expect(find.text('Online | E2EE Active'), findsOneWidget);
      expect(find.byIcon(Icons.call_outlined), findsOneWidget);
      expect(find.byIcon(Icons.videocam_outlined), findsOneWidget);

      // Verify Disappearing mode button exists in AppBar
      expect(find.byIcon(Icons.timer_outlined), findsOneWidget);

      // Verify Audio Player speed badge and scrubber
      expect(find.text('1.0x'), findsOneWidget);
      expect(find.byIcon(Icons.play_arrow_rounded), findsOneWidget);

      // Cycle audio speed: 1.0x -> 1.5x
      await tester.tap(find.text('1.0x'));
      await tester.pump();
      expect(find.text('1.5x'), findsOneWidget);

      // Cycle audio speed: 1.5x -> 2.0x
      await tester.tap(find.text('1.5x'));
      await tester.pump();
      expect(find.text('2.0x'), findsOneWidget);

      // Cycle audio speed: 2.0x -> 1.0x
      await tester.tap(find.text('2.0x'));
      await tester.pump();
      expect(find.text('1.0x'), findsOneWidget);

      // Verify Ephemeral message with 410 Server Destruction countdown
      expect(find.textContaining('410 Server Destruction:'), findsOneWidget);

      // Verify HTTP 410 GONE Destroyed Tombstone
      expect(find.textContaining('HTTP 410 GONE'), findsWidgets);

      // Verify Composer
      expect(find.byType(TextField), findsOneWidget);
      expect(find.byIcon(Icons.send_rounded), findsOneWidget);
      expect(find.byIcon(Icons.mic_rounded), findsWidgets);
    });

    testWidgets('CallScreen: HD WebRTC layout, floating participant grid, mute mic, switch camera, screen share', (tester) async {
      final conv = ChatMockData.getInitialConversations().first;

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: CallScreen(
            conversation: conv,
            callType: QuantCallType.video,
          ),
        ),
      );
      await tester.pump();

      // Verify Telemetry Header
      expect(find.text('<18 ms E2EE'), findsOneWidget);
      expect(find.textContaining('VP9/1080p'), findsOneWidget);

      // Verify Floating Participant Strip (peers displayed)
      expect(find.text('CEO Astra'), findsWidgets);
      expect(find.text('Node B (OS Lead)'), findsOneWidget);
      expect(find.text('Node C (Dev-Worker)'), findsOneWidget);
      expect(find.text('You (Local Impeller)'), findsOneWidget);

      // Verify Call Control Buttons
      expect(find.byIcon(Icons.mic_rounded), findsWidgets);
      expect(find.byIcon(Icons.videocam_rounded), findsOneWidget);
      expect(find.byIcon(Icons.flip_camera_ios_rounded), findsOneWidget);
      expect(find.byIcon(Icons.screen_share_rounded), findsOneWidget);
      expect(find.byIcon(Icons.grid_view_rounded), findsOneWidget);
      expect(find.byIcon(Icons.call_end_rounded), findsOneWidget);

      // Test Mute Mic Toggle
      await tester.tap(find.byIcon(Icons.mic_rounded).first);
      await tester.pump();
      expect(find.byIcon(Icons.mic_off_rounded), findsWidgets);

      // Test Screen Share Toggle
      await tester.tap(find.byIcon(Icons.screen_share_rounded).first);
      await tester.pump();
      expect(find.byIcon(Icons.stop_screen_share_rounded), findsOneWidget);
      expect(find.text('SHARING'), findsOneWidget);

      // Test Floating Grid to Matrix Grid Layout Toggle
      await tester.tap(find.byIcon(Icons.grid_view_rounded));
      await tester.pump();
      expect(find.byIcon(Icons.view_sidebar_rounded), findsOneWidget);
    });

    testWidgets('AudioSpaceScreen: Live Stage, Host, screen share banner, reaction buttons', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const AudioSpaceScreen(),
        ),
      );
      await tester.pump();

      expect(find.text('LIVE STAGE'), findsOneWidget);
      expect(find.text('STAGE SPEAKERS (4)'), findsOneWidget);
      expect(find.text('HOST'), findsOneWidget);

      // Verify Stage Screen Share button exists
      expect(find.byIcon(Icons.screen_share_rounded), findsOneWidget);

      // Tap Stage Screen Share toggle
      await tester.tap(find.byIcon(Icons.screen_share_rounded));
      await tester.pump();
      expect(find.text('STAGE PRESENTATION LIVE'), findsOneWidget);

      // Vector reaction buttons
      expect(find.byIcon(Icons.thumb_up_rounded), findsOneWidget);
      expect(find.byIcon(Icons.local_fire_department_rounded), findsOneWidget);
      expect(find.byIcon(Icons.rocket_launch_rounded), findsOneWidget);
    });

    testWidgets('SettingsScreen renders hardware keystore, biometric and 120Hz toggles', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const SettingsScreen(),
        ),
      );
      await tester.pump();

      expect(find.text('SOVEREIGN E2EE & SECURITY'), findsOneWidget);
      expect(find.text('Hardware Keystore Storage'), findsOneWidget);
      expect(find.text('120Hz Impeller GPU Acceleration'), findsOneWidget);
      expect(find.text('WEBRTC AUDIO/VIDEO MESH'), findsOneWidget);
    });
  });

  // ===========================================================================
  // 3. MULTIPLATFORM RUNNER MANIFESTS INTEGRITY TESTS
  // ===========================================================================
  group('QuantChat Multiplatform Target Runner Manifests Verification', () {
    final baseDir = Directory('android').existsSync()
        ? Directory('.')
        : (Directory('flutter_apps/apps/quant_chat').existsSync()
            ? Directory('flutter_apps/apps/quant_chat')
            : Directory('c:/Users/Pc/Quant-Ecosystem/flutter_apps/apps/quant_chat'));

    test('Android: Target manifests exist with SDK 36, Java 17, and full permissions', () {
      final buildGradle = File('${baseDir.path}/android/build.gradle');
      final appBuildGradle = File('${baseDir.path}/android/app/build.gradle');
      final manifest = File('${baseDir.path}/android/app/src/main/AndroidManifest.xml');
      final mainActivity = File('${baseDir.path}/android/app/src/main/kotlin/com/quant/chat/MainActivity.kt');

      expect(buildGradle.existsSync(), isTrue);
      expect(appBuildGradle.existsSync(), isTrue);
      expect(manifest.existsSync(), isTrue);
      expect(mainActivity.existsSync(), isTrue);

      final appGradleContent = appBuildGradle.readAsStringSync();
      expect(appGradleContent.contains('namespace "com.quant.chat"'), isTrue);
      expect(appGradleContent.contains('compileSdk 36'), isTrue);
      expect(appGradleContent.contains('JavaVersion.VERSION_17'), isTrue);

      final manifestContent = manifest.readAsStringSync();
      expect(manifestContent.contains('package="com.quant.chat"'), isTrue);
      expect(manifestContent.contains('android.permission.CAMERA'), isTrue);
      expect(manifestContent.contains('android.permission.RECORD_AUDIO'), isTrue);
      expect(manifestContent.contains('android.permission.INTERNET'), isTrue);
      expect(manifestContent.contains('android.permission.BLUETOOTH'), isTrue);
      expect(manifestContent.contains('android.permission.VIBRATE'), isTrue);
    });

    test('iOS: Runner manifests exist with NSCamera, NSMicrophone, NSPhotoLibrary usage descriptions', () {
      final podfile = File('${baseDir.path}/ios/Podfile');
      final infoPlist = File('${baseDir.path}/ios/Runner/Info.plist');
      final appDelegate = File('${baseDir.path}/ios/Runner/AppDelegate.swift');

      expect(podfile.existsSync(), isTrue);
      expect(infoPlist.existsSync(), isTrue);
      expect(appDelegate.existsSync(), isTrue);

      final plistContent = infoPlist.readAsStringSync();
      expect(plistContent.contains('NSCameraUsageDescription'), isTrue);
      expect(plistContent.contains('NSMicrophoneUsageDescription'), isTrue);
      expect(plistContent.contains('NSPhotoLibraryUsageDescription'), isTrue);
      expect(plistContent.contains('com.quant.chat'), isTrue);
    });

    test('Web: Manifests exist with Obsidian luxury theme #090A0E and QuantChat title', () {
      final indexHtml = File('${baseDir.path}/web/index.html');
      final manifestJson = File('${baseDir.path}/web/manifest.json');

      expect(indexHtml.existsSync(), isTrue);
      expect(manifestJson.existsSync(), isTrue);

      final htmlContent = indexHtml.readAsStringSync();
      expect(htmlContent.contains('#090A0E'), isTrue);
      expect(htmlContent.contains('QuantChat · Sovereign E2EE Communications'), isTrue);

      final jsonContent = manifestJson.readAsStringSync();
      expect(jsonContent.contains('"name": "QuantChat · Sovereign E2EE Communications"'), isTrue);
      expect(jsonContent.contains('#090A0E'), isTrue);
    });

    test('Windows, macOS, Linux: Desktop runner CMake and manifest files exist', () {
      final winCMake = File('${baseDir.path}/windows/CMakeLists.txt');
      final winMain = File('${baseDir.path}/windows/runner/main.cpp');
      final winFlutterWindow = File('${baseDir.path}/windows/runner/flutter_window.cpp');

      expect(winCMake.existsSync(), isTrue);
      expect(winMain.existsSync(), isTrue);
      expect(winFlutterWindow.existsSync(), isTrue);

      final macPodfile = File('${baseDir.path}/macos/Podfile');
      final macPlist = File('${baseDir.path}/macos/Runner/Info.plist');
      expect(macPodfile.existsSync(), isTrue);
      expect(macPlist.existsSync(), isTrue);

      final linuxCMake = File('${baseDir.path}/linux/CMakeLists.txt');
      final linuxMain = File('${baseDir.path}/linux/runner/main.cc');
      expect(linuxCMake.existsSync(), isTrue);
      expect(linuxMain.existsSync(), isTrue);
    });
  });

  // ===========================================================================
  // 4. ARCHITECTURAL INVARIANT ASSERTION TESTS
  // ===========================================================================
  group('QuantChat Sovereign Invariant Assertion Tests', () {
    final libDir = Directory('lib').existsSync()
        ? Directory('lib')
        : (Directory('flutter_apps/apps/quant_chat/lib').existsSync()
            ? Directory('flutter_apps/apps/quant_chat/lib')
            : Directory('c:/Users/Pc/Quant-Ecosystem/flutter_apps/apps/quant_chat/lib'));

    test('Invariant: ZERO raw Unicode emojis across all .dart source files in quant_chat', () {
      expect(libDir.existsSync(), isTrue);

      final emojiRegex = RegExp(
        r'[\u{1F000}-\u{1FAFF}]|[\u{2300}-\u{23FF}]|[\u{2600}-\u{27BF}]|[\u{2B50}-\u{2B55}]',
        unicode: true,
      );

      final dartFiles = libDir
          .listSync(recursive: true)
          .whereType<File>()
          .where((f) => f.path.endsWith('.dart'))
          .toList();

      expect(dartFiles.isNotEmpty, isTrue);

      final violations = <String>[];

      for (final file in dartFiles) {
        final lines = file.readAsLinesSync();
        for (int i = 0; i < lines.length; i++) {
          final line = lines[i];
          final matches = emojiRegex.allMatches(line);
          for (final match in matches) {
            final char = match.group(0)!;
            // Exclude legitimate Apple/Mac Command symbol if any
            if (char.runes.first == 0x2318) continue;

            violations.add(
              '${file.path}:${i + 1} -> Found raw Unicode emoji "$char" in: ${line.trim()}',
            );
          }
        }
      }

      expect(
        violations,
        isEmpty,
        reason: 'Violation of Sovereign Rule: Zero raw Unicode emojis allowed in code or comments.',
      );
    });

    test('Invariant: ZERO Skia clipPath method invocations across all .dart source files in quant_chat/lib', () {
      expect(libDir.existsSync(), isTrue);

      final clipPathCallRegex = RegExp(r'(\.clipPath\s*\(|canvas\.clipPath\s*\()');

      final dartFiles = libDir
          .listSync(recursive: true)
          .whereType<File>()
          .where((f) => f.path.endsWith('.dart'))
          .toList();

      expect(dartFiles.isNotEmpty, isTrue);

      final violations = <String>[];

      for (final file in dartFiles) {
        final lines = file.readAsLinesSync();
        for (int i = 0; i < lines.length; i++) {
          final line = lines[i];
          if (clipPathCallRegex.hasMatch(line)) {
            violations.add(
              '${file.path}:${i + 1} -> Found Skia clipPath invocation: ${line.trim()}',
            );
          }
        }
      }

      expect(
        violations,
        isEmpty,
        reason: 'Violation of Sovereign Impeller Rule: Zero Skia clipPath calls allowed. Use BorderRadius/BoxDecoration.',
      );
    });
  });
}

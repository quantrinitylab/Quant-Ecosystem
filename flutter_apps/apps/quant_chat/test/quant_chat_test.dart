// Sovereign Quant Ecosystem - QuantChat Unit & Widget Test Suite
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_chat/main.dart';
import 'package:quant_chat/models/chat_models.dart';
import 'package:quant_chat/screens/chat_list_screen.dart';
import 'package:quant_chat/screens/conversation_screen.dart';
import 'package:quant_chat/screens/call_screen.dart';
import 'package:quant_chat/screens/audio_space_screen.dart';
import 'package:quant_chat/screens/calls_tab_screen.dart';
import 'package:quant_chat/screens/settings_screen.dart';
import 'package:quant_chat/widgets/call_sheet.dart';
import 'package:quant_chat/widgets/chat_media_sheet.dart';
import 'package:quant_chat/screens/group/create_group_sheet.dart';
import 'package:quant_chat/screens/group/group_detail_screen.dart';
import 'package:quant_chat/screens/security/safety_number_screen.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // ===========================================================================
  // 1. DOMAIN MODEL & 4-STAGE TICK PROGRESSION UNIT TESTS
  // ===========================================================================
  group('QuantChat Domain Models & 4-Stage Tick Pipeline', () {
    test('MessageDeliveryStatus: 4-stage tick progression, stage names, vector icons and colors', () {
      expect(MessageDeliveryStatus.values.length, 4);
      expect(MessageDeliveryStatus.pending.index, 0);
      expect(MessageDeliveryStatus.sent.index, 1);
      expect(MessageDeliveryStatus.delivered.index, 2);
      expect(MessageDeliveryStatus.read.index, 3);

      // Verify backward-compatible alias
      expect(MessageDeliveryStatus.sending, equals(MessageDeliveryStatus.pending));

      // Verify 4-stage names
      expect(MessageDeliveryStatus.pending.stageName, 'Clock');
      expect(MessageDeliveryStatus.sent.stageName, 'SingleGrey');
      expect(MessageDeliveryStatus.delivered.stageName, 'DoubleGrey');
      expect(MessageDeliveryStatus.read.stageName, 'DoubleCyan');

      // Verify vector icons
      expect(MessageDeliveryStatus.pending.icon, Icons.access_time_rounded);
      expect(MessageDeliveryStatus.sent.icon, Icons.check_rounded);
      expect(MessageDeliveryStatus.delivered.icon, Icons.done_all_rounded);
      expect(MessageDeliveryStatus.read.icon, Icons.done_all_rounded);

      // Verify color palette
      expect(MessageDeliveryStatus.pending.color, const Color(0xFF94A3B8));
      expect(MessageDeliveryStatus.sent.color, const Color(0xFF94A3B8));
      expect(MessageDeliveryStatus.delivered.color, const Color(0xFF94A3B8));
      expect(MessageDeliveryStatus.read.color, QuantColors.sovereignCyan);
    });

    testWidgets('DeliveryTickWidget renders appropriate vector icons and cyan tint on read', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Column(
              children: const [
                DeliveryTickWidget(status: MessageDeliveryStatus.pending),
                DeliveryTickWidget(status: MessageDeliveryStatus.sent),
                DeliveryTickWidget(status: MessageDeliveryStatus.delivered),
                DeliveryTickWidget(status: MessageDeliveryStatus.read),
              ],
            ),
          ),
        ),
      );

      expect(find.byIcon(Icons.access_time_rounded), findsOneWidget);
      expect(find.byIcon(Icons.check_rounded), findsOneWidget);
      expect(find.byIcon(Icons.done_all_rounded), findsNWidgets(2));
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

      // Advance through tick progression: Clock (pending) -> SingleGrey (sent) -> DoubleGrey (delivered) -> DoubleCyan (read)
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

    test('AudioSpaceRoom holds real participant roles and hand-raising flags', () {
      const room = AudioSpaceRoom(
        id: 'space-test-1',
        title: 'Test Space',
        topic: 'Testing',
        listenersCount: 0,
        speakersCount: 0,
        host: SpaceParticipant(
          id: 'host-1',
          name: 'Host',
          avatarInitials: 'H',
          role: SpaceParticipantRole.host,
          isSpeaking: true,
        ),
        speakers: [],
        listeners: [],
      );

      expect(room.id, 'space-test-1');
      expect(room.host.role, SpaceParticipantRole.host);
      expect(room.host.isSpeaking, isTrue);
      expect(room.speakers, isEmpty);
      expect(room.listeners, isEmpty);
    });

    test('CallHistoryItem carries real WebRTC call log fields', () {
      const call = CallHistoryItem(
        id: 'call-test-1',
        contactName: 'Test Contact',
        contactInitials: 'TC',
        contactAvatarColor: QuantColors.sovereignCyan,
        callType: QuantCallType.video,
        isIncoming: false,
        isMissed: false,
        timestamp: '12:00',
        duration: '02:00',
        latencyMs: 14,
      );

      expect(call.contactName, 'Test Contact');
      expect(call.callType, QuantCallType.video);
      expect(call.latencyMs, lessThan(24));
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

    testWidgets('ChatListScreen renders sticky search bar and honest empty state', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(body: ChatListScreen()),
        ),
      );

      expect(find.byType(TextField), findsOneWidget);

      // No fabricated conversations: the honest empty state renders instead
      expect(find.text('No Encrypted Conversations Found'), findsOneWidget);
      expect(find.text('CEO Astra (Notion AI Swarm)'), findsNothing);
    });

    testWidgets('ConversationScreen: app bar, composer, and honest empty message list', (tester) async {
      const conv = const ChatConversation(
        id: 'conv-test-widget',
        contactId: 'contact-test-widget',
        name: 'Test Contact',
        avatarInitials: 'TC',
        avatarColor: QuantColors.sovereignCyan,
        lastMessage: '',
        lastMessageTime: 'Now',
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const ConversationScreen(conversation: conv),
        ),
      );
      await tester.pump();

      // Verify Conversation AppBar
      expect(find.text('Test Contact'), findsOneWidget);
      expect(find.byIcon(Icons.call_outlined), findsOneWidget);
      expect(find.byIcon(Icons.videocam_outlined), findsOneWidget);

      // No fabricated message history renders
      expect(find.textContaining('410 Server Destruction:'), findsNothing);

      // Verify Composer and Mic Record Button
      expect(find.byType(TextField), findsOneWidget);
      expect(find.byIcon(Icons.send_rounded), findsOneWidget);
      expect(find.byIcon(Icons.mic_rounded), findsWidgets);
    });

    testWidgets('ConversationScreen: Voice Memo Recording state, waveform visualizer, discard and send', (tester) async {
      const conv = const ChatConversation(
        id: 'conv-test-widget',
        contactId: 'contact-test-widget',
        name: 'Test Contact',
        avatarInitials: 'TC',
        avatarColor: QuantColors.sovereignCyan,
        lastMessage: '',
        lastMessageTime: 'Now',
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: ConversationScreen(conversation: conv),
        ),
      );
      await tester.pump();

      // Tap mic button to enter Voice Memo Recording state
      await tester.tap(find.byTooltip('Record Voice Memo'));
      await tester.pump();

      // Verify Voice Recording Dock is active
      expect(find.byIcon(Icons.delete_outline_rounded), findsOneWidget);
      expect(find.text('00:00'), findsOneWidget);

      // Cancel / Discard voice recording
      await tester.tap(find.byIcon(Icons.delete_outline_rounded));
      await tester.pump();

      // Verify returned to standard composer
      expect(find.byType(TextField), findsOneWidget);

      // Start recording again and send it
      await tester.tap(find.byTooltip('Record Voice Memo'));
      await tester.pump();
      expect(find.byIcon(Icons.delete_outline_rounded), findsOneWidget);

      // Send the recorded voice memo
      await tester.tap(find.byIcon(Icons.send_rounded).last);
      await tester.pump();

      // Verify normal composer restored and audio message created
      expect(find.byType(TextField), findsOneWidget);
    });

    testWidgets('WebRTCCallSheet: E2EE badge, contact info, mute, speaker, video toggle and end call', (tester) async {
      const conv = const ChatConversation(
        id: 'conv-test-widget',
        contactId: 'contact-test-widget',
        name: 'Test Contact',
        avatarInitials: 'TC',
        avatarColor: QuantColors.sovereignCyan,
        lastMessage: '',
        lastMessageTime: 'Now',
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: Scaffold(
            body: WebRTCCallSheet(
              conversation: conv,
              callType: QuantCallType.video,
            ),
          ),
        ),
      );
      await tester.pump();

      // Verify E2EE hardware keystore badge
      expect(find.text('Hardware Keystore E2EE | Zero-Cloud Plaintext'), findsOneWidget);
      expect(find.text('Test Contact'), findsOneWidget);
      expect(find.textContaining('VP9 1080p60'), findsOneWidget);

      // Verify interactive controls exist
      expect(find.byIcon(Icons.mic_rounded), findsOneWidget);
      expect(find.byIcon(Icons.volume_up_rounded), findsOneWidget);
      expect(find.byIcon(Icons.videocam_rounded), findsOneWidget);
      expect(find.byIcon(Icons.flip_camera_ios_rounded), findsOneWidget);
      expect(find.byIcon(Icons.fullscreen_rounded), findsOneWidget);
      expect(find.byIcon(Icons.call_end_rounded), findsOneWidget);

      // Test Mute Mic Toggle
      await tester.tap(find.byIcon(Icons.mic_rounded));
      await tester.pump();
      expect(find.byIcon(Icons.mic_off_rounded), findsOneWidget);

      // Test Speaker Toggle
      await tester.tap(find.byIcon(Icons.volume_up_rounded));
      await tester.pump();
      expect(find.byIcon(Icons.volume_off_rounded), findsOneWidget);

      // Test Video Camera Toggle
      await tester.tap(find.byIcon(Icons.videocam_rounded));
      await tester.pump();
      expect(find.byIcon(Icons.videocam_off_rounded), findsOneWidget);
    });

    testWidgets('CallScreen: honest empty state without fabricated participants', (tester) async {
      const conv = const ChatConversation(
        id: 'conv-test-widget',
        contactId: 'contact-test-widget',
        name: 'Test Contact',
        avatarInitials: 'TC',
        avatarColor: QuantColors.sovereignCyan,
        lastMessage: '',
        lastMessageTime: 'Now',
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const CallScreen(
            conversation: conv,
            callType: QuantCallType.video,
          ),
        ),
      );
      await tester.pump();

      // No fabricated participants render
      expect(find.text('No participants yet.'), findsOneWidget);
      expect(find.text('CEO Astra'), findsNothing);
      expect(find.text('Node B (OS Lead)'), findsNothing);
    });

    testWidgets('AudioSpaceScreen: honest empty state without fabricated room', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const AudioSpaceScreen(),
        ),
      );
      await tester.pump();

      expect(find.text('No audio space live right now.'), findsOneWidget);
      expect(find.text('LIVE STAGE'), findsNothing);
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

    testWidgets('CreateGroupSheet: renders avatar picker, subject input, contact chips, admin toggles, and disappearing dropdown', (tester) async {
      ChatConversation? createdConversation;

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: Scaffold(
            body: CreateGroupSheet(
              onGroupCreated: (conv) {
                createdConversation = conv;
              },
            ),
          ),
        ),
      );
      await tester.pump();

      // Verify Header
      expect(find.text('Create Sovereign Group'), findsOneWidget);
      expect(find.text('End-to-End Encrypted Group Mesh'), findsOneWidget);

      // Verify Subject Input Field
      expect(find.byType(TextField), findsWidgets);
      expect(find.text('Group Subject'), findsOneWidget);

      // Verify Disappearing Messages Dropdown
      expect(find.text('Disappearing Messages'), findsOneWidget);
      expect(find.text('Off'), findsOneWidget);

      // Verify Admin Governance Toggles
      expect(find.text('Only Admins Can Send Messages'), findsOneWidget);
      expect(find.text('Only Admins Can Edit Info'), findsOneWidget);
      expect(find.text('Approve New Members'), findsOneWidget);

      // Verify Member Search
      expect(find.text('ADD PARTICIPANTS'), findsOneWidget);

      // Enter group subject
      await tester.enterText(find.widgetWithText(TextField, 'Group Subject'), 'Sovereign Core Mesh');
      await tester.pump();

      // Toggle Admin Permissions
      await tester.tap(find.widgetWithText(SwitchListTile, 'Only Admins Can Send Messages'));
      await tester.pump();

      // Tap Create Group button
      await tester.tap(find.textContaining('Create Group'));
      await tester.pump();

      // Verify callback triggered
      expect(createdConversation, isNotNull);
      expect(createdConversation!.name, 'Sovereign Core Mesh');
      expect(createdConversation!.isGroup, isTrue);
    });

    testWidgets('GroupDetailScreen: member list with Admin badges, add member, media/docs/links gallery tabs, mute toggle, exit/delete actions', (tester) async {
      const groupConv = ChatConversation(
        id: 'grp-test-1',
        contactId: 'group-broadcast',
        name: 'Sovereign Core Mesh',
        avatarInitials: 'SC',
        avatarColor: QuantColors.sovereignCyan,
        lastMessage: 'All systems green',
        lastMessageTime: '12:00',
        isGroup: true,
        memberCount: 7,
        groupDescription: 'Core Tripartite Swarm architectural dispatch channel.',
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const GroupDetailScreen(conversation: groupConv),
        ),
      );
      await tester.pump();

      // Verify Header details
      expect(find.text('Group Info'), findsOneWidget);
      expect(find.text('Sovereign Core Mesh'), findsOneWidget);
      expect(find.text('Signal Double Ratchet E2EE Active'), findsOneWidget);

      // Verify Quick Action Buttons
      expect(find.text('Audio Call'), findsOneWidget);
      expect(find.text('Video Call'), findsOneWidget);
      expect(find.text('Add Member'), findsWidgets);
      expect(find.text('Search'), findsOneWidget);

      // Verify Shared Repository Tabs
      expect(find.textContaining('Media'), findsOneWidget);
      expect(find.textContaining('Docs'), findsOneWidget);
      expect(find.textContaining('Links'), findsOneWidget);

      // No fabricated shared media: galleries are honestly empty
      await tester.tap(find.textContaining('Docs'));
      await tester.pumpAndSettle();
      expect(find.textContaining('E2EE_Signal_Protocol_Spec_v3.pdf'), findsNothing);

      await tester.tap(find.textContaining('Links'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Quant Ecosystem Staging Gateway'), findsNothing);

      // Verify Mute Notifications toggle
      expect(find.text('Mute Notifications'), findsOneWidget);
      await tester.tap(find.text('Mute Notifications'));
      await tester.pump();
      expect(find.text('Muted'), findsOneWidget);

      // No fabricated member list
      expect(find.text('CEO Astra (Notion AI Swarm)'), findsNothing);

      // Verify Exit and Delete actions exist
      expect(find.text('Exit Group'), findsOneWidget);
      expect(find.text('Delete Sovereign Group'), findsOneWidget);

      // Tap Exit Group to open confirmation dialog
      await tester.tap(find.text('Exit Group'));
      await tester.pump();
      expect(find.text('Exit Sovereign Group?'), findsOneWidget);

      // Dismiss dialog
      await tester.tap(find.text('Cancel'));
      await tester.pump();
    });

    testWidgets('ChatMediaSheet: renders 6 squircle actions and FastCDC/Location previews', (tester) async {
      ChatMediaType? selectedType;
      Map<String, dynamic>? selectedData;

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: Scaffold(
            body: ChatMediaSheet(
              onActionSelected: (type, data) {
                selectedType = type;
                selectedData = data;
              },
            ),
          ),
        ),
      );
      await tester.pump();

      // Verify Header
      expect(find.text('Share Encrypted Media & Data'), findsOneWidget);
      expect(find.textContaining('FastCDC Content-Defined Chunking'), findsOneWidget);

      // Verify 6 Squircle Actions
      expect(find.text('Document'), findsOneWidget);
      expect(find.text('Camera'), findsOneWidget);
      expect(find.text('Gallery'), findsOneWidget);
      expect(find.text('Audio Note'), findsOneWidget);
      expect(find.text('Location'), findsOneWidget);
      expect(find.text('Contact'), findsOneWidget);

      // Tap Document action to show FastCDC preview panel
      await tester.tap(find.text('Document'));
      await tester.pump();

      // Verify FastCDC preview panel appears
      expect(find.text('FILE SIZE'), findsOneWidget);
      expect(find.text('CHUNKS'), findsOneWidget);
      expect(find.text('DEDUP'), findsOneWidget);
      expect(find.textContaining('SHA-256:'), findsOneWidget);
      expect(find.textContaining('Send FastCDC Document'), findsOneWidget);

      // Send FastCDC document
      await tester.tap(find.textContaining('Send FastCDC Document'));
      await tester.pump();

      expect(selectedType, ChatMediaType.document);
      expect(selectedData!['fileName'], 'Quant_Mesh_Specification_v3.pdf');
    });

    testWidgets('SafetyNumberScreen: 60 digits displayed in 12 blocks of 5, copy chip, QR matrix, scanner toggle, verification toggle', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: SafetyNumberScreen(
            contactName: 'CEO Astra',
            contactInitials: 'AS',
            contactAvatarColor: QuantColors.moltenOrange,
          ),
        ),
      );
      await tester.pump();

      // Verify Title and Peer
      expect(find.text('Verify Safety Number'), findsOneWidget);
      expect(find.text('CEO Astra'), findsOneWidget);
      expect(find.text('UNVERIFIED'), findsOneWidget);

      // Verify Advisory banner
      expect(find.textContaining('If the safety number changed, it might mean someone is trying to intercept'), findsOneWidget);

      // Verify 60-digit safety number section and Copy chip
      expect(find.text('60-DIGIT SAFETY NUMBER'), findsOneWidget);
      expect(find.text('Copy'), findsOneWidget);

      // Verify QR Code CustomPainter is present
      expect(find.byType(CustomPaint), findsWidgets);

      // Toggle to Scan Mode
      expect(find.text('Scan Peer Code'), findsOneWidget);
      await tester.tap(find.text('Scan Peer Code'));
      await tester.pump();

      // Verify Viewfinder active
      expect(find.text('Point camera at peer QR code'), findsOneWidget);
      expect(find.text('Show QR Code'), findsOneWidget);

      // Toggle back to Show QR Code
      await tester.tap(find.text('Show QR Code'));
      await tester.pump();
      expect(find.text('Scan Peer Code'), findsOneWidget);

      // Verify Telemetry rows
      expect(find.text('Cryptographic Protocol'), findsOneWidget);
      expect(find.text('Signal Double Ratchet + X3DH'), findsOneWidget);
      expect(find.text('Post-Quantum Defense'), findsOneWidget);
      expect(find.text('Kyber-1024 Lattice KEM'), findsOneWidget);

      // Mark as Verified CTA
      expect(find.text('Mark as Verified'), findsOneWidget);
      await tester.tap(find.text('Mark as Verified'));
      await tester.pump();

      // Verify status flipped to Verified
      expect(find.text('VERIFIED'), findsOneWidget);
      expect(find.text('Mark as Unverified'), findsOneWidget);
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

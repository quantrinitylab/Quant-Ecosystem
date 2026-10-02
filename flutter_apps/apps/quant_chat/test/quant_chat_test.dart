// Sovereign Quant Ecosystem - QuantChat Unit & Widget Test Suite
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

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
  group('QuantChat Domain Models & Delivery Status Pipeline', () {
    test('ChatMessage properties and copyWith work accurately', () {
      const msg = ChatMessage(
        id: 'msg-test-1',
        conversationId: 'conv-test-1',
        senderId: 'usr-1',
        senderName: 'CEO Astra',
        text: 'Deploying sovereign mesh',
        timestamp: '12:00',
        isOutgoing: false,
        deliveryStatus: MessageDeliveryStatus.sending,
        type: MessageType.text,
      );

      expect(msg.id, 'msg-test-1');
      expect(msg.deliveryStatus, MessageDeliveryStatus.sending);
      expect(msg.isOutgoing, isFalse);

      final updated = msg.copyWith(deliveryStatus: MessageDeliveryStatus.read);
      expect(updated.deliveryStatus, MessageDeliveryStatus.read);
      expect(updated.id, msg.id);
    });

    test('ChatConversation supports typing indicator, unread count and pinning', () {
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
      );

      expect(conv.name, 'Node B');
      expect(conv.unreadCount, 5);
      expect(conv.isOnline, isTrue);
      expect(conv.isTyping, isTrue);
      expect(conv.isPinned, isTrue);
    });

    test('AudioSpaceRoom participant roles and hand-raising flags', () {
      final room = ChatMockData.getInitialSpaceRoom();

      expect(room.id, 'space-sovereign-stage');
      expect(room.host.role, SpaceParticipantRole.host);
      expect(room.host.isSpeaking, isTrue);
      expect(room.speakers.length, 3);
      expect(room.listeners.length, 6);

      // Verify at least one listener has raised hand
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

  group('QuantChat Widget Tree & Screen Pumping Tests', () {
    testWidgets('QuantChatApp builds with obsidian luxury theme and top capsule', (tester) async {
      await tester.pumpWidget(const QuantChatApp());

      // Verify top brand elements
      expect(find.text('Quant'), findsOneWidget);
      expect(find.text('Chat'), findsOneWidget);
      expect(find.text('Quant AI Copilot'), findsOneWidget);
      expect(find.text('<24ms E2EE'), findsOneWidget);

      // Verify 4 bottom navigation items
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

    testWidgets('ConversationScreen renders bubbles and composer bar', (tester) async {
      final conv = ChatMockData.getInitialConversations().first;

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: ConversationScreen(conversation: conv),
        ),
      );

      expect(find.text('CEO Astra (Notion AI Swarm)'), findsOneWidget);
      expect(find.text('Online | E2EE Active'), findsOneWidget);
      expect(find.byIcon(Icons.call_outlined), findsOneWidget);
      expect(find.byIcon(Icons.videocam_outlined), findsOneWidget);
      expect(find.byType(TextField), findsOneWidget);
      expect(find.byIcon(Icons.send_rounded), findsOneWidget);
      expect(find.byIcon(Icons.mic_rounded), findsWidgets);
    });

    testWidgets('AudioSpaceScreen renders Live Stage, Host, and vector reaction buttons', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const AudioSpaceScreen(),
        ),
      );

      expect(find.text('LIVE STAGE'), findsOneWidget);
      expect(find.text('STAGE SPEAKERS (4)'), findsOneWidget);
      expect(find.text('HOST'), findsOneWidget);
      expect(find.byIcon(Icons.thumb_up_rounded), findsOneWidget);
      expect(find.byIcon(Icons.local_fire_department_rounded), findsOneWidget);
      expect(find.byIcon(Icons.rocket_launch_rounded), findsOneWidget);
    });

    testWidgets('CallScreen renders telemetry badge (<24ms E2EE) and call controls dock', (tester) async {
      final conv = ChatMockData.getInitialConversations().first;

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: CallScreen(
            conversation: conv,
            callType: QuantCallType.audio,
          ),
        ),
      );

      expect(find.text('<18 ms E2EE'), findsOneWidget);
      expect(find.byIcon(Icons.call_end_rounded), findsOneWidget);
      expect(find.byIcon(Icons.mic_rounded), findsWidgets);
    });

    testWidgets('SettingsScreen renders hardware keystore, biometric and 120Hz toggles', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const SettingsScreen(),
        ),
      );

      expect(find.text('SOVEREIGN E2EE & SECURITY'), findsOneWidget);
      expect(find.text('Hardware Keystore Storage'), findsOneWidget);
      expect(find.text('120Hz Impeller GPU Acceleration'), findsOneWidget);
      expect(find.text('WEBRTC AUDIO/VIDEO MESH'), findsOneWidget);
    });
  });
}

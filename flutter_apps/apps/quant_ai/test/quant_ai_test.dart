// Sovereign Quant Ecosystem - QuantAI Comprehensive Test Suite
// Unit and Widget Tests for Sovereign ChatGPT & Claude Killer Agent OS & 3D Voice Orb
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_ai/main.dart';
import 'package:quant_ai/models/ai_models.dart';
import 'package:quant_ai/services/ai_mock_data.dart';
import 'package:quant_ai/services/quant_ai_service.dart';
import 'package:quant_ai/screens/ai_chat_screen.dart';
import 'package:quant_ai/screens/dual_canvas_screen.dart';
import 'package:quant_ai/screens/voice_orb_screen.dart';
import 'package:quant_ai/screens/agent_swarm_screen.dart';
import 'package:quant_ai/screens/history_screen.dart';
import 'package:quant_theme/quant_theme.dart';

void main() {
  group('QuantAI Domain Models & Architecture Invariants', () {
    test('AiModel static options verify sovereign providers and context windows', () {
      expect(AiModel.availableModels.length, 3);

      final quant1Pro = AiModel.quant1Pro;
      expect(quant1Pro.id, 'quant-1.0-pro');
      expect(quant1Pro.name, 'Quant-1.0 Pro');
      expect(quant1Pro.contextWindow, '1M tokens');
      expect(quant1Pro.latencyBadge, '<18ms TTFT');
      expect(quant1Pro.isLocal, isFalse);

      final sonnet = AiModel.claude35Sonnet;
      expect(sonnet.id, 'claude-3-5-sonnet');
      expect(sonnet.contextWindow, '200K tokens');

      final llama = AiModel.localLlama3;
      expect(llama.id, 'local-llama-3');
      expect(llama.isLocal, isTrue);
      expect(llama.latencyBadge, '<4ms Local');
    });

    test('AiChatMessage supports thought chain, latency telemetry, and code blocks', () {
      const msg = AiChatMessage(
        id: 'msg-test-1',
        role: AiMessageRole.assistant,
        text: 'Zero-clipPath Impeller verified.',
        timestamp: '11:00 AM',
        thought: 'Verified AST invariants.',
        thoughtDurationSec: 2.1,
        tokensPerSec: 150.0,
        latencyMs: 16,
        codeBlocks: [
          AiCodeBlock(language: 'dart', code: 'void main() {}', filename: 'main.dart'),
        ],
        citations: [
          AiCitation(
            id: 'cit-1',
            title: 'Impeller Specs',
            source: 'docs/impeller.md',
            snippet: '120Hz smooth raster cache.',
          ),
        ],
      );

      expect(msg.id, 'msg-test-1');
      expect(msg.role, AiMessageRole.assistant);
      expect(msg.thought, 'Verified AST invariants.');
      expect(msg.thoughtDurationSec, 2.1);
      expect(msg.latencyMs, 16);
      expect(msg.codeBlocks.length, 1);
      expect(msg.codeBlocks.first.filename, 'main.dart');
      expect(msg.citations.length, 1);

      final updated = msg.copyWith(latencyMs: 12);
      expect(updated.latencyMs, 12);
      expect(updated.id, msg.id);
    });

    test('CanvasDocument supports version history, diff metrics and state copying', () {
      const doc = CanvasDocument(
        id: 'doc-test-1',
        title: 'Impeller Shader Plan',
        type: CanvasDocType.code,
        language: 'dart',
        content: 'class ShaderBox {}',
        version: 2,
        diffAdditions: 15,
        diffDeletions: 2,
        versionHistory: [
          CanvasVersionEntry(
            version: 1,
            label: 'v1 initial',
            timestamp: '09:00',
            content: 'class Box {}',
          ),
          CanvasVersionEntry(
            version: 2,
            label: 'v2 shader',
            timestamp: '10:00',
            content: 'class ShaderBox {}',
          ),
        ],
      );

      expect(doc.title, 'Impeller Shader Plan');
      expect(doc.version, 2);
      expect(doc.diffAdditions, 15);
      expect(doc.diffDeletions, 2);
      expect(doc.versionHistory.length, 2);

      final copy = doc.copyWith(version: 3, diffAdditions: 20);
      expect(copy.version, 3);
      expect(copy.diffAdditions, 20);
    });

    test('VoicePersona static profiles contain all 4 personas with distinctive tempos', () {
      expect(VoicePersona.allPersonas.length, 4);

      final aura = VoicePersona.aura;
      expect(aura.name, 'Aura');
      expect(aura.pulseSpeed, 1.0);

      final vesper = VoicePersona.vesper;
      expect(vesper.name, 'Vesper');
      expect(vesper.pulseSpeed, 0.85);

      final zenith = VoicePersona.zenith;
      expect(zenith.name, 'Zenith');
      expect(zenith.pulseSpeed, 1.2);

      final zephyr = VoicePersona.zephyr;
      expect(zephyr.name, 'Zephyr');
      expect(zephyr.pulseSpeed, 1.4);
    });

    test('AgentNode supports progress tracking, DAG dependencies and execution logging', () {
      const node = AgentNode(
        id: 'agent-sentinel',
        name: 'Sentinel Agent',
        role: AgentRole.sentinel,
        status: AgentStatus.running,
        progress: 0.75,
        currentStep: 'Running Vitest and flutter_test harnesses.',
        toolCallsCount: 12,
        outputLog: ['Pass 1 complete.', 'Pass 2 complete.'],
        dependencies: ['agent-coder'],
        icon: Icons.verified_user_rounded,
        roleColor: QuantColors.emeraldMatrix,
      );

      expect(node.name, 'Sentinel Agent');
      expect(node.progress, 0.75);
      expect(node.toolCallsCount, 12);
      expect(node.dependencies, ['agent-coder']);

      final completed = node.copyWith(status: AgentStatus.completed, progress: 1.0);
      expect(completed.status, AgentStatus.completed);
      expect(completed.progress, 1.0);
    });

    test('QuantAiService initializes and provides graceful fallback', () async {
      final service = QuantAiService();
      expect(service.client, isNotNull);

      final reply = await service.sendMessage(
        text: 'Test message',
        model: AiModel.quant1Pro,
      );
      expect(reply.text.isNotEmpty, isTrue);
      expect(reply.latencyMs, isNotNull);

      final agents = await service.fetchActiveSwarm();
      expect(agents.isNotEmpty, isTrue);

      final docs = await service.fetchCanvasDocuments();
      expect(docs.isNotEmpty, isTrue);
    });
  });

  group('QuantAI Widget Tree & Screen Pumping Tests', () {
    testWidgets('QuantAiApp builds with obsidian luxury theme and top telemetry capsule', (tester) async {
      await tester.pumpWidget(const QuantAiApp());

      // Brand Identity
      expect(find.text('Quant'), findsOneWidget);
      expect(find.text('AI'), findsOneWidget);

      // Model Selector
      expect(find.text('Quant-1.0 Pro'), findsOneWidget);

      // Telemetry Capsule
      expect(find.text('Sovereign LLM'), findsOneWidget);
      expect(find.text('<18ms TTFT'), findsOneWidget);

      // 5 Bottom Navigation items
      expect(find.text('Chat'), findsOneWidget);
      expect(find.text('Canvas'), findsOneWidget);
      expect(find.text('Voice'), findsOneWidget);
      expect(find.text('Agents'), findsOneWidget);
      expect(find.text('History'), findsOneWidget);
    });

    testWidgets('AiChatScreen renders prompt suggestions, thought accordion, and code block', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(
            body: AiChatScreen(currentModel: AiModel.quant1Pro),
          ),
        ),
      );

      // Verify prompt suggestions ribbon
      expect(find.text('Architect Swarm DAG'), findsOneWidget);
      expect(find.text('Audit Rust Microservice'), findsOneWidget);

      // Verify thought process accordion is visible
      expect(find.byIcon(Icons.psychology_outlined), findsOneWidget);

      // Verify code block copy button
      expect(find.text('Copy'), findsWidgets);

      // Verify message composer and toggles
      expect(find.text('Web Search'), findsOneWidget);
      expect(find.text('Deep Thinking'), findsOneWidget);
      expect(find.byType(TextField), findsOneWidget);
    });

    testWidgets('DualCanvasScreen renders document tabs, version slider, and apply diff button', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const DualCanvasScreen(),
        ),
      );

      // Document Switcher
      expect(find.text('Sovereign Swarm Architecture Plan'), findsOneWidget);
      expect(find.text('Impeller Fast Blur Shader'), findsOneWidget);

      // Version control bar
      expect(find.byType(Slider), findsOneWidget);
      expect(find.text('Apply Diff'), findsOneWidget);

      // Artifact view actions
      expect(find.byIcon(Icons.copy_rounded), findsWidgets);
    });

    testWidgets('VoiceOrbScreen renders 3D Voice Orb, telemetry, persona chips and transcript ticker', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const VoiceOrbScreen(),
        ),
      );

      // Telemetry
      expect(find.text('<120ms VAD | WebRTC Opus 16kHz'), findsOneWidget);

      // Persona chips
      expect(find.text('Aura'), findsWidgets);
      expect(find.text('Vesper'), findsWidgets);
      expect(find.text('Zenith'), findsWidgets);
      expect(find.text('Zephyr'), findsWidgets);

      // Transcript Ticker
      expect(find.text('REAL-TIME TRANSCRIPT TICKER'), findsOneWidget);

      // Controls
      expect(find.text('Tap to Interrupt'), findsOneWidget);
      expect(find.byIcon(Icons.call_end_rounded), findsOneWidget);

      // Advance animation frame cleanly
      await tester.pump(const Duration(milliseconds: 300));
    });

    testWidgets('AgentSwarmScreen renders DAG execution pipeline and agent cards', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const AgentSwarmScreen(),
        ),
      );

      // Header telemetry
      expect(find.text('AUTONOMOUS SWARM DAG'), findsOneWidget);
      expect(find.text('Spawn Agent'), findsOneWidget);

      // DAG Pipeline
      expect(find.text('EXECUTION DAG TOPOLOGY'), findsOneWidget);
      expect(find.text('Researcher Agent'), findsWidgets);
      expect(find.text('Coder Agent'), findsWidgets);
      expect(find.text('Sentinel Agent'), findsWidgets);
      expect(find.text('Deployer Agent'), findsWidgets);

      // Console
      expect(find.byIcon(Icons.terminal_rounded), findsOneWidget);
    });

    testWidgets('HistoryScreen renders search header, filters and thread entries', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const HistoryScreen(),
        ),
      );

      // Search and filters
      expect(find.byType(TextField), findsOneWidget);
      expect(find.text('All'), findsOneWidget);
      expect(find.text('Starred'), findsOneWidget);

      // Categories and threads
      expect(find.text('TODAY'), findsOneWidget);
      expect(find.text('Sub-18ms TTFT & Dual Canvas Diff'), findsOneWidget);
    });
  });
}

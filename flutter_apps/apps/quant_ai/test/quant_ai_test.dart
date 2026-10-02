// Sovereign Quant Ecosystem - QuantAI Comprehensive Test Suite
// Unit and Widget Tests for Sovereign ChatGPT & Claude Killer Agent OS & 3D Voice Orb
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'dart:io';
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
      expect(aura.glowColor, QuantColors.cosmicCyan);

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

    test('AgentNode supports tripartite roles, track assignment, and subagent fleet counts', () {
      const ceo = AgentNode(
        id: 'agent-ceo-astra',
        name: 'CEO Astra',
        role: AgentRole.ceoAstra,
        status: AgentStatus.running,
        progress: 0.96,
        currentStep: 'Executive Orchestrator & Gatekeeper dispatching Wave 80.',
        toolCallsCount: 42,
        outputLog: ['Swarm active.', '100% green gate enforced.'],
        dependencies: [],
        icon: Icons.shield_rounded,
        roleColor: QuantColors.obsidianPurple,
        assignedTrack: 'Executive Swarm Leadership',
        subagentsCount: 15,
      );

      expect(ceo.name, 'CEO Astra');
      expect(ceo.role, AgentRole.ceoAstra);
      expect(ceo.assignedTrack, 'Executive Swarm Leadership');
      expect(ceo.subagentsCount, 15);
      expect(ceo.progress, 0.96);

      const nodeA = AgentNode(
        id: 'agent-node-a',
        name: 'Node A: IDE Orchestrator',
        role: AgentRole.nodeA,
        status: AgentStatus.running,
        progress: 0.90,
        currentStep: 'Track 3: GitHub Sovereign Parity.',
        toolCallsCount: 31,
        outputLog: ['Subagents A1-A5 dispatched.'],
        dependencies: ['agent-ceo-astra'],
        icon: Icons.laptop_chromebook_rounded,
        roleColor: QuantColors.cosmicCyan,
        assignedTrack: 'Track 3 (GitHub Sovereign Parity)',
        subagentsCount: 5,
      );

      expect(nodeA.role, AgentRole.nodeA);
      expect(nodeA.dependencies, ['agent-ceo-astra']);
      expect(nodeA.subagentsCount, 5);

      final updated = nodeA.copyWith(progress: 1.0, status: AgentStatus.completed);
      expect(updated.progress, 1.0);
      expect(updated.status, AgentStatus.completed);
    });

    test('SyntaxToken and CodeExecutionResult domain models verify AST execution contracts', () {
      const token = SyntaxToken('class', TokenType.keyword);
      expect(token.text, 'class');
      expect(token.type, TokenType.keyword);

      const result = CodeExecutionResult(
        stdout: '[COMPILER] Build succeeded in 3.4ms',
        exitCode: 0,
        durationMs: 3.4,
        memoryUsageKb: 14500,
      );
      expect(result.exitCode, 0);
      expect(result.durationMs, 3.4);
      expect(result.memoryUsageKb, 14500);
      expect(result.stdout, contains('Build succeeded'));
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

    testWidgets('DualCanvasScreen renders Split-Screen Dual Canvas: left AI chat and right code editor', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const DualCanvasScreen(),
        ),
      );

      // Document Switcher Tabs
      expect(find.text('Sovereign Swarm Architecture Plan'), findsOneWidget);
      expect(find.text('Impeller Fast Blur Shader'), findsOneWidget);

      // Left Pane: AI Conversation
      expect(find.text('AI CONVERSATION'), findsOneWidget);
      expect(find.text('<18ms TTFT'), findsOneWidget);
      expect(find.text('Add unit test'), findsOneWidget);
      expect(find.text('Optimize memory cache'), findsOneWidget);

      // Right Pane: Live Executable Code Editor & Controls
      expect(find.text('Run Code'), findsOneWidget);
      expect(find.text('Apply Diff'), findsOneWidget);
      expect(find.byType(Slider), findsOneWidget);

      // Live Execution Console Tray
      expect(find.text('LIVE EXECUTION CONSOLE'), findsOneWidget);
      expect(find.text('EXIT CODE 0'), findsOneWidget);

      // Trigger Run Code execution
      await tester.tap(find.text('Run Code'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 700));

      expect(find.text('LIVE EXECUTION CONSOLE'), findsOneWidget);
    });

    testWidgets('VoiceOrbScreen renders 3D Voice Orb with <120ms VAD and voice personas', (tester) async {
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

      // Tap to interrupt to cycle VAD state
      await tester.tap(find.text('Tap to Interrupt'));
      await tester.pump();

      // Switch to Vesper persona
      await tester.tap(find.text('Vesper').first);
      await tester.pump();

      // Advance animation frame cleanly
      await tester.pump(const Duration(milliseconds: 300));
    });

    testWidgets('AgentSwarmScreen renders Tripartite Node Tree and Live Chat Ledger', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const AgentSwarmScreen(),
        ),
      );

      // Header telemetry
      expect(find.text('AUTONOMOUS SWARM DAG'), findsOneWidget);
      expect(find.text('Dispatch Wave'), findsOneWidget);

      // Interactive Node Tree
      expect(find.text('INTERACTIVE TRIPARTITE SWARM DAG'), findsOneWidget);
      expect(find.text('CEO Astra'), findsWidgets);
      expect(find.text('Node A: IDE Orchestrator'), findsWidgets);
      expect(find.text('Node B: IDE Peer Agent'), findsWidgets);
      expect(find.text('Node C: CLI Dev-Worker'), findsWidgets);

      // Inter-Agent Live Chat Ledger
      expect(find.text('TRIPARTITE LIVE INTER-AGENT DISPATCH LEDGER'), findsOneWidget);

      // Trigger Dispatch Wave
      await tester.tap(find.text('Dispatch Wave'));
      await tester.pump();

      expect(find.text('Wave 80 Dispatched'), findsWidgets);
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

  group('QuantAI Strict Architecture Invariants Audit', () {
    test('Strict Invariant: 100% ZERO raw Unicode emojis across lib/ and test/', () {
      final libDir = Directory('lib');
      final testDir = Directory('test');

      final emojiRegex = RegExp(
        r'[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]',
        unicode: true,
      );

      final dartFiles = <File>[];
      if (libDir.existsSync()) {
        dartFiles.addAll(
          libDir.listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart')),
        );
      }
      if (testDir.existsSync()) {
        dartFiles.addAll(
          testDir.listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart')),
        );
      }

      for (final file in dartFiles) {
        final content = file.readAsStringSync();
        final matches = emojiRegex.allMatches(content);
        expect(
          matches.isEmpty,
          isTrue,
          reason: 'Raw Unicode emoji detected in ${file.path}: ${matches.map((m) => m.group(0)).toList()}',
        );
      }
    });

    test('Strict Invariant: 100% ZERO Skia clipPath invocations across lib/', () {
      final libDir = Directory('lib');
      if (!libDir.existsSync()) return;

      final dartFiles = libDir
          .listSync(recursive: true)
          .whereType<File>()
          .where((f) => f.path.endsWith('.dart'));

      for (final file in dartFiles) {
        final content = file.readAsStringSync();
        final forbiddenCall = '.${'clipPath'}(';
        expect(
          content.contains(forbiddenCall),
          isFalse,
          reason: 'Skia clipPath call detected in ${file.path}. Use hardware-accelerated drawRoundRect or borderRadius instead.',
        );
      }
    });
  });
}

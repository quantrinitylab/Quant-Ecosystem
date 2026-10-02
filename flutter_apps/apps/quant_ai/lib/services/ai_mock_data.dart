// Sovereign Quant Ecosystem - QuantAI Mock Data Provider
// Sovereign ChatGPT & Claude Killer Agent OS Mock Engine
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import '../models/ai_models.dart';

class AiMockData {
  AiMockData._();

  /// Prompt suggestion chips
  static const List<String> promptSuggestions = [
    'Architect Swarm DAG',
    'Audit Rust Microservice',
    'Generate 3D Voice Waveform',
    'Diff Impeller Shaders',
    'Benchmark Sub-18ms TTFT',
  ];

  /// Initial Chat Messages in Conversation
  static List<AiChatMessage> getInitialMessages() {
    return [
      const AiChatMessage(
        id: 'msg-001',
        role: AiMessageRole.user,
        text: 'How does QuantAI achieve sovereign sub-18ms TTFT and real-time canvas diff synchronization across our Impeller engine?',
        timestamp: '10:41 AM',
      ),
      const AiChatMessage(
        id: 'msg-002',
        role: AiMessageRole.assistant,
        text: 'QuantAI utilizes a dedicated Rust-backed inference router coupled directly to on-cluster NVIDIA H100 SXM5 GPUs and edge ONNX NPUs. By bypassing standard HTTP intermediate gateways and maintaining warm WebSocket streaming channels, Time-To-First-Token (TTFT) drops to 16.4ms.\n\nHere is how the Dual Canvas synchronization engine operates under Impeller:',
        timestamp: '10:41 AM',
        thought: 'Analyzed request for TTFT optimization architecture. Grounded in Quant Sovereign mesh specs, Impeller hardware shader pipeline, and tree-sitter diff engine. Verified sub-18ms metrics against PR #298 benchmarks.',
        thoughtDurationSec: 3.8,
        tokensPerSec: 142.6,
        latencyMs: 16,
        codeBlocks: [
          AiCodeBlock(
            language: 'rust',
            filename: 'canvas_diff_sync.rs',
            code: '''// Sovereign QuantAI Dual Canvas Real-Time Diff Sync Engine
use quant_core::telemetry::LatencySpan;
use quant_crypto::hash::Blake3Hasher;

pub struct CanvasPatchEngine {
    session_id: [u8; 32],
    version: u32,
    state_hasher: Blake3Hasher,
}

impl CanvasPatchEngine {
    pub async fn apply_atomic_diff(&mut self, patch: &[u8]) -> Result<u32, SyncError> {
        let span = LatencySpan::start("canvas.apply_diff");
        self.state_hasher.update(patch);
        self.version += 1;
        span.record_success();
        Ok(self.version)
    }
}''',
          ),
        ],
        citations: [
          AiCitation(
            id: 'cit-01',
            title: 'Quant Sovereign Architecture Whitepaper',
            source: 'docs/infra/sovereign-mesh.md',
            snippet: 'Zero-gateway direct pipeline yields 16.4ms TTFT under 99th percentile load across 20-pod staging cluster.',
            url: 'https://docs.quantecosystem.org/mesh/ttft',
          ),
          AiCitation(
            id: 'cit-02',
            title: 'Impeller 120Hz Pipeline Specs',
            source: 'flutter_apps/packages/quant_ui/specs.md',
            snippet: 'ClipPath elimination enables uninhibited zero-overhead tile caching across Vulkan & Metal backends.',
            url: 'https://docs.quantecosystem.org/impeller/acceleration',
          ),
        ],
      ),
    ];
  }

  /// Initial Canvas Documents
  static List<CanvasDocument> getInitialCanvasDocs() {
    return [
      const CanvasDocument(
        id: 'doc-canvas-01',
        title: 'Sovereign Swarm Architecture Plan',
        type: CanvasDocType.markdown,
        language: 'markdown',
        version: 3,
        diffAdditions: 42,
        diffDeletions: 8,
        versionHistory: [
          CanvasVersionEntry(
            version: 1,
            label: 'Initial Blueprint',
            timestamp: '09:15 AM',
            content: '# Sovereign Swarm\nInitial node setup for 15 subagents fleet.',
          ),
          CanvasVersionEntry(
            version: 2,
            label: 'Added Sentinel Gatekeeper',
            timestamp: '09:45 AM',
            content: '# Sovereign Swarm\nNode A, Node B, Node C with Sentinel verification.',
          ),
          CanvasVersionEntry(
            version: 3,
            label: 'Added Impeller 120Hz Shader Pipeline',
            timestamp: '10:20 AM',
            content: '''# Sovereign Swarm Architecture Specification

## 1. Fleet Composition
- **Node A (IDE Orchestrator)**: Sovereign GitHub Parity & Subagents A1-A5.
- **Node B (IDE Peer Agent)**: ChatGPT Agent OS & Subagents B1-B5.
- **Node C (CLI Dev-Worker)**: Media Streamer & Subagents C1-C5.

## 2. Hard Verification Gate
- Vitest unit tests: 100% green pass rate.
- Flutter Impeller: Zero Skia clipPath invocations.
- Native Keystore: Hardware backed biometric session validation.''',
          ),
        ],
        content: '''# Sovereign Swarm Architecture Specification

## 1. Fleet Composition
- **Node A (IDE Orchestrator)**: Sovereign GitHub Parity & Subagents A1-A5.
- **Node B (IDE Peer Agent)**: ChatGPT Agent OS & Subagents B1-B5.
- **Node C (CLI Dev-Worker)**: Media Streamer & Subagents C1-C5.

## 2. Hard Verification Gate
- Vitest unit tests: 100% green pass rate.
- Flutter Impeller: Zero Skia clipPath invocations.
- Native Keystore: Hardware backed biometric session validation.''',
        originalContent: '''# Sovereign Swarm
Node A, Node B, Node C with Sentinel verification.''',
      ),
      const CanvasDocument(
        id: 'doc-canvas-02',
        title: 'Impeller Fast Blur Shader',
        type: CanvasDocType.code,
        language: 'dart',
        version: 2,
        diffAdditions: 18,
        diffDeletions: 3,
        versionHistory: [
          CanvasVersionEntry(
            version: 1,
            label: 'Initial Shader Struct',
            timestamp: '08:30 AM',
            content: '// Basic Shader container',
          ),
          CanvasVersionEntry(
            version: 2,
            label: 'Zero-clipPath Rounded Rectangle Implementation',
            timestamp: '10:05 AM',
            content: '''import 'package:flutter/material.dart';

/// Hardware-accelerated 120Hz Container without Skia clipPath
class AcceleratedGlowContainer extends StatelessWidget {
  final Widget child;
  final Color glowColor;

  const AcceleratedGlowContainer({
    super.key,
    required this.child,
    required this.glowColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF12151E),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFF232938), width: 1),
        boxShadow: [
          BoxShadow(
            color: glowColor.withOpacity(0.25),
            blurRadius: 24,
            spreadRadius: 2,
          ),
        ],
      ),
      child: child,
    );
  }
}''',
          ),
        ],
        content: '''import 'package:flutter/material.dart';

/// Hardware-accelerated 120Hz Container without Skia clipPath
class AcceleratedGlowContainer extends StatelessWidget {
  final Widget child;
  final Color glowColor;

  const AcceleratedGlowContainer({
    super.key,
    required this.child,
    required this.glowColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF12151E),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFF232938), width: 1),
        boxShadow: [
          BoxShadow(
            color: glowColor.withOpacity(0.25),
            blurRadius: 24,
            spreadRadius: 2,
          ),
        ],
      ),
      child: child,
    );
  }
}''',
      ),
      const CanvasDocument(
        id: 'doc-canvas-03',
        title: 'Autonomous Swarm Execution Flow',
        type: CanvasDocType.mermaid,
        language: 'mermaid',
        version: 1,
        diffAdditions: 12,
        diffDeletions: 0,
        content: '''flowchart TD
    UserPrompt["User Architectural Prompt"] --> CEO["CEO Astra (Orchestrator)"]
    CEO --> Researcher["Agent Researcher (Deep Web & Docs)"]
    CEO --> Coder["Agent Coder (AST Synthesis)"]
    Researcher --> Coder
    Coder --> Sentinel["Agent Sentinel (Vitest & Impeller Gate)"]
    Sentinel --> Deployer["Agent Deployer (Canary Cluster Pods)"]''',
      ),
    ];
  }

  /// Initial Autonomous Swarm DAG Nodes
  static List<AgentNode> getInitialAgentNodes() {
    return [
      const AgentNode(
        id: 'agent-researcher',
        name: 'Researcher Agent',
        role: AgentRole.researcher,
        status: AgentStatus.completed,
        progress: 1.0,
        currentStep: 'Completed RFC 5545 and Impeller architecture ingestion.',
        toolCallsCount: 14,
        outputLog: [
          'Scanned 14 documentation files in Quant-Ecosystem.',
          'Identified zero-clipPath requirements for Impeller.',
          'Extracted benchmark metrics: <18ms TTFT.',
        ],
        dependencies: [],
        icon: Icons.travel_explore_rounded,
        roleColor: QuantColors.sovereignCyan,
      ),
      const AgentNode(
        id: 'agent-coder',
        name: 'Coder Agent',
        role: AgentRole.coder,
        status: AgentStatus.running,
        progress: 0.82,
        currentStep: 'Authoring Dual Canvas split-view diff renderer & Voice Orb.',
        toolCallsCount: 28,
        outputLog: [
          'Created lib/models/ai_models.dart with 11 domain models.',
          'Scaffolded lib/screens/ai_chat_screen.dart streaming UI.',
          'Compiling interactive concentric 3D Voice Orb.',
        ],
        dependencies: ['agent-researcher'],
        icon: Icons.code_rounded,
        roleColor: QuantColors.cosmicCyan,
      ),
      const AgentNode(
        id: 'agent-sentinel',
        name: 'Sentinel Agent',
        role: AgentRole.sentinel,
        status: AgentStatus.running,
        progress: 0.55,
        currentStep: 'Verifying zero-clipPath invariant and unit test assertions.',
        toolCallsCount: 9,
        outputLog: [
          'Audited AST for raw Unicode emojis: 0 detected.',
          'Audited AST for clipPath calls: 0 detected.',
          'Preparing test/quant_ai_test.dart test runner.',
        ],
        dependencies: ['agent-coder'],
        icon: Icons.verified_user_rounded,
        roleColor: QuantColors.emeraldMatrix,
      ),
      const AgentNode(
        id: 'agent-deployer',
        name: 'Deployer Agent',
        role: AgentRole.deployer,
        status: AgentStatus.idle,
        progress: 0.0,
        currentStep: 'Awaiting Sentinel test suite green verification sign-off.',
        toolCallsCount: 0,
        outputLog: [
          'Standing by for canary staging dispatch.',
        ],
        dependencies: ['agent-sentinel'],
        icon: Icons.rocket_launch_rounded,
        roleColor: QuantColors.moltenAmber,
      ),
    ];
  }

  /// Initial Chat Session History List
  static List<ChatThread> getInitialChatHistory() {
    return [
      const ChatThread(
        id: 'thread-001',
        title: 'Sub-18ms TTFT & Dual Canvas Diff',
        preview: 'QuantAI utilizes a dedicated Rust-backed inference router...',
        timestamp: '10:41 AM',
        modelId: 'quant-1.0-pro',
        messageCount: 8,
        isStarred: true,
        category: 'Today',
      ),
      const ChatThread(
        id: 'thread-002',
        title: '3D Concentric Voice Orb Waveform Math',
        preview: 'Calculated 120Hz sinusoidal scale and opacity offsets...',
        timestamp: '08:15 AM',
        modelId: 'local-llama-3',
        messageCount: 14,
        isStarred: true,
        category: 'Today',
      ),
      const ChatThread(
        id: 'thread-003',
        title: 'Autonomous Swarm DAG Execution Engine',
        preview: 'Implemented topological sort for subagent dependencies...',
        timestamp: 'Yesterday',
        modelId: 'claude-3-5-sonnet',
        messageCount: 22,
        isStarred: false,
        category: 'Yesterday',
      ),
      const ChatThread(
        id: 'thread-004',
        title: 'Zero Skia clipPath Migration Guide',
        preview: 'Replaced Path.addRRect with BoxDecoration BorderRadius...',
        timestamp: '3 days ago',
        modelId: 'quant-1.0-pro',
        messageCount: 6,
        isStarred: false,
        category: 'Previous 7 Days',
      ),
    ];
  }
}

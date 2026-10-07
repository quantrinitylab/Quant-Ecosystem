// Sovereign Quant Ecosystem - QuantAI Models
// Sovereign ChatGPT & Claude Killer Agent OS & 3D Voice Orb Domain Models
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';

/// Available Sovereign & Mesh LLM Model Options
class AiModel {
  final String id;
  final String name;
  final String provider;
  final String contextWindow;
  final Color badgeColor;
  final String latencyBadge;
  final bool isLocal;
  final IconData icon;

  const AiModel({
    required this.id,
    required this.name,
    required this.provider,
    required this.contextWindow,
    required this.badgeColor,
    required this.latencyBadge,
    required this.isLocal,
    required this.icon,
  });

  static const AiModel quant1Pro = AiModel(
    id: 'quant-1.0-pro',
    name: 'Quant-1.0 Pro',
    provider: 'Sovereign Cluster Mesh',
    contextWindow: '1M tokens',
    badgeColor: QuantColors.cosmicCyan,
    latencyBadge: '<18ms TTFT',
    isLocal: false,
    icon: Icons.auto_awesome_rounded,
  );

  static const AiModel claude35Sonnet = AiModel(
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic Mesh Bridge',
    contextWindow: '200K tokens',
    badgeColor: QuantColors.obsidianPurple,
    latencyBadge: '<42ms TTFT',
    isLocal: false,
    icon: Icons.psychology_rounded,
  );

  static const AiModel localLlama3 = AiModel(
    id: 'local-llama-3',
    name: 'Local Llama-3',
    provider: 'On-Device ONNX NPU',
    contextWindow: '128K tokens',
    badgeColor: QuantColors.emeraldMatrix,
    latencyBadge: '<4ms Local',
    isLocal: true,
    icon: Icons.memory_rounded,
  );

  static const List<AiModel> availableModels = [
    quant1Pro,
    claude35Sonnet,
    localLlama3,
  ];
}

/// Message Role inside Conversational Thread
enum AiMessageRole {
  user,
  assistant,
  system,
}

/// Syntax-Highlighted Code Block
class AiCodeBlock {
  final String language;
  final String code;
  final String? filename;

  const AiCodeBlock({
    required this.language,
    required this.code,
    this.filename,
  });
}

/// Citation Reference Grounding Source
class AiCitation {
  final String id;
  final String title;
  final String source;
  final String snippet;
  final String? url;

  const AiCitation({
    required this.id,
    required this.title,
    required this.source,
    required this.snippet,
    this.url,
  });
}

/// Conversational Message Bubble
class AiChatMessage {
  final String id;
  final AiMessageRole role;
  final String text;
  final String timestamp;
  final String? thought;
  final double? thoughtDurationSec;
  final List<AiCodeBlock> codeBlocks;
  final List<AiCitation> citations;
  final double? tokensPerSec;
  final int? latencyMs;
  final bool isStreaming;

  const AiChatMessage({
    required this.id,
    required this.role,
    required this.text,
    required this.timestamp,
    this.thought,
    this.thoughtDurationSec,
    this.codeBlocks = const [],
    this.citations = const [],
    this.tokensPerSec,
    this.latencyMs,
    this.isStreaming = false,
  });

  AiChatMessage copyWith({
    String? id,
    AiMessageRole? role,
    String? text,
    String? timestamp,
    String? thought,
    double? thoughtDurationSec,
    List<AiCodeBlock>? codeBlocks,
    List<AiCitation>? citations,
    double? tokensPerSec,
    int? latencyMs,
    bool? isStreaming,
  }) {
    return AiChatMessage(
      id: id ?? this.id,
      role: role ?? this.role,
      text: text ?? this.text,
      timestamp: timestamp ?? this.timestamp,
      thought: thought ?? this.thought,
      thoughtDurationSec: thoughtDurationSec ?? this.thoughtDurationSec,
      codeBlocks: codeBlocks ?? this.codeBlocks,
      citations: citations ?? this.citations,
      tokensPerSec: tokensPerSec ?? this.tokensPerSec,
      latencyMs: latencyMs ?? this.latencyMs,
      isStreaming: isStreaming ?? this.isStreaming,
    );
  }
}

/// Dual Canvas Document Type
enum CanvasDocType {
  code,
  markdown,
  mermaid,
}

/// Historical Version Snapshot of a Canvas
class CanvasVersionEntry {
  final int version;
  final String label;
  final String timestamp;
  final String content;

  const CanvasVersionEntry({
    required this.version,
    required this.label,
    required this.timestamp,
    required this.content,
  });
}

/// Dual Canvas Document Artifact
class CanvasDocument {
  final String id;
  final String title;
  final CanvasDocType type;
  final String language;
  final String content;
  final int version;
  final List<CanvasVersionEntry> versionHistory;
  final int diffAdditions;
  final int diffDeletions;
  final String? originalContent;

  const CanvasDocument({
    required this.id,
    required this.title,
    required this.type,
    required this.language,
    required this.content,
    required this.version,
    this.versionHistory = const [],
    this.diffAdditions = 0,
    this.diffDeletions = 0,
    this.originalContent,
  });

  CanvasDocument copyWith({
    String? id,
    String? title,
    CanvasDocType? type,
    String? language,
    String? content,
    int? version,
    List<CanvasVersionEntry>? versionHistory,
    int? diffAdditions,
    int? diffDeletions,
    String? originalContent,
  }) {
    return CanvasDocument(
      id: id ?? this.id,
      title: title ?? this.title,
      type: type ?? this.type,
      language: language ?? this.language,
      content: content ?? this.content,
      version: version ?? this.version,
      versionHistory: versionHistory ?? this.versionHistory,
      diffAdditions: diffAdditions ?? this.diffAdditions,
      diffDeletions: diffDeletions ?? this.diffDeletions,
      originalContent: originalContent ?? this.originalContent,
    );
  }
}

/// 3D Voice Orb Persona Profile
class VoicePersona {
  final String id;
  final String name;
  final String tagline;
  final String description;
  final String avatarInitials;
  final Color glowColor;
  final String accent;
  final double pulseSpeed;

  const VoicePersona({
    required this.id,
    required this.name,
    required this.tagline,
    required this.description,
    required this.avatarInitials,
    required this.glowColor,
    required this.accent,
    required this.pulseSpeed,
  });

  static const VoicePersona aura = VoicePersona(
    id: 'aura',
    name: 'Aura',
    tagline: 'Empathetic & Calm',
    description: 'Gentle warmth, mindful pacing, executive diplomacy.',
    avatarInitials: 'AU',
    glowColor: QuantColors.cosmicCyan,
    accent: 'Neutral English',
    pulseSpeed: 1.0,
  );

  static const VoicePersona vesper = VoicePersona(
    id: 'vesper',
    name: 'Vesper',
    tagline: 'Deep & Technical',
    description: 'Low resonant frequency, compiler logic, deep engineering.',
    avatarInitials: 'VE',
    glowColor: QuantColors.obsidianPurple,
    accent: 'Studio Baritone',
    pulseSpeed: 0.85,
  );

  static const VoicePersona zenith = VoicePersona(
    id: 'zenith',
    name: 'Zenith',
    tagline: 'Crisp & Analytical',
    description: 'High-frequency precision, zero hesitation, mathematical clarity.',
    avatarInitials: 'ZE',
    glowColor: QuantColors.sunsetGold,
    accent: 'Silicon Valley Clear',
    pulseSpeed: 1.2,
  );

  static const VoicePersona zephyr = VoicePersona(
    id: 'zephyr',
    name: 'Zephyr',
    tagline: 'Fast & Creative',
    description: 'Rapid ideation, high-tempo brainstorming, fluid synthesis.',
    avatarInitials: 'ZP',
    glowColor: QuantColors.neonGreen,
    accent: 'Dynamic High-Tempo',
    pulseSpeed: 1.4,
  );

  static const List<VoicePersona> allPersonas = [
    aura,
    vesper,
    zenith,
    zephyr,
  ];
}

/// Autonomous Swarm Agent Roles
enum AgentRole {
  ceoAstra,
  nodeA,
  nodeB,
  nodeC,
  researcher,
  coder,
  sentinel,
  deployer,
}

/// Autonomous Swarm Agent Status
enum AgentStatus {
  idle,
  running,
  completed,
  error,
}

/// Swarm Directed Acyclic Graph (DAG) Execution Node
class AgentNode {
  final String id;
  final String name;
  final AgentRole role;
  final AgentStatus status;
  final double progress; // 0.0 to 1.0
  final String currentStep;
  final int toolCallsCount;
  final List<String> outputLog;
  final List<String> dependencies;
  final IconData icon;
  final Color roleColor;
  final String? assignedTrack;
  final int subagentsCount;

  const AgentNode({
    required this.id,
    required this.name,
    required this.role,
    required this.status,
    required this.progress,
    required this.currentStep,
    required this.toolCallsCount,
    required this.outputLog,
    required this.dependencies,
    required this.icon,
    required this.roleColor,
    this.assignedTrack,
    this.subagentsCount = 0,
  });

  AgentNode copyWith({
    String? id,
    String? name,
    AgentRole? role,
    AgentStatus? status,
    double? progress,
    String? currentStep,
    int? toolCallsCount,
    List<String>? outputLog,
    List<String>? dependencies,
    IconData? icon,
    Color? roleColor,
    String? assignedTrack,
    int? subagentsCount,
  }) {
    return AgentNode(
      id: id ?? this.id,
      name: name ?? this.name,
      role: role ?? this.role,
      status: status ?? this.status,
      progress: progress ?? this.progress,
      currentStep: currentStep ?? this.currentStep,
      toolCallsCount: toolCallsCount ?? this.toolCallsCount,
      outputLog: outputLog ?? this.outputLog,
      dependencies: dependencies ?? this.dependencies,
      icon: icon ?? this.icon,
      roleColor: roleColor ?? this.roleColor,
      assignedTrack: assignedTrack ?? this.assignedTrack,
      subagentsCount: subagentsCount ?? this.subagentsCount,
    );
  }
}

/// Syntax Highlighting Token Type for Dual Canvas
enum TokenType {
  keyword,
  type,
  string,
  comment,
  number,
  punctuation,
  identifier,
  whitespace,
}

/// Tokenized Segment for Syntax Highlighting
class SyntaxToken {
  final String text;
  final TokenType type;

  const SyntaxToken(this.text, this.type);
}

/// Result of Live Executable Code in Dual Canvas
class CodeExecutionResult {
  final String stdout;
  final int exitCode;
  final double durationMs;
  final int memoryUsageKb;

  const CodeExecutionResult({
    required this.stdout,
    required this.exitCode,
    required this.durationMs,
    required this.memoryUsageKb,
  });
}

/// Persistent Chat Thread Record in History
class ChatThread {
  final String id;
  final String title;
  final String preview;
  final String timestamp;
  final String modelId;
  final int messageCount;
  final bool isStarred;
  final String category; // 'Today', 'Yesterday', 'Previous 7 Days'

  const ChatThread({
    required this.id,
    required this.title,
    required this.preview,
    required this.timestamp,
    required this.modelId,
    required this.messageCount,
    required this.isStarred,
    required this.category,
  });

  ChatThread copyWith({
    String? id,
    String? title,
    String? preview,
    String? timestamp,
    String? modelId,
    int? messageCount,
    bool? isStarred,
    String? category,
  }) {
    return ChatThread(
      id: id ?? this.id,
      title: title ?? this.title,
      preview: preview ?? this.preview,
      timestamp: timestamp ?? this.timestamp,
      modelId: modelId ?? this.modelId,
      messageCount: messageCount ?? this.messageCount,
      isStarred: isStarred ?? this.isStarred,
      category: category ?? this.category,
    );
  }
}

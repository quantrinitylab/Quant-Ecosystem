// Sovereign Quant Ecosystem - QuantAI Agent Swarm Screen
// Autonomous agent visual flow builder with live running agent cards
// (Researcher, Coder, Sentinel, Deployer) and task execution DAG.
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import '../models/ai_models.dart';
import '../services/ai_mock_data.dart';

class AgentSwarmScreen extends StatefulWidget {
  const AgentSwarmScreen({super.key});

  @override
  State<AgentSwarmScreen> createState() => _AgentSwarmScreenState();
}

class _AgentSwarmScreenState extends State<AgentSwarmScreen> {
  late List<AgentNode> _agents;
  String _selectedAgentId = 'agent-coder';
  bool _isSwarmPaused = false;

  @override
  void initState() {
    super.initState();
    _agents = List.from(AiMockData.getInitialAgentNodes());
  }

  AgentNode get _selectedAgent => _agents.firstWhere(
        (a) => a.id == _selectedAgentId,
        orElse: () => _agents.first,
      );

  void _spawnNewAgent() {
    final newId = 'agent-sub-${_agents.length + 1}';
    final newAgent = AgentNode(
      id: newId,
      name: 'Benchmark Optimizer',
      role: AgentRole.sentinel,
      status: AgentStatus.running,
      progress: 0.15,
      currentStep: 'Benchmarking 120Hz Impeller raster cache tile allocation.',
      toolCallsCount: 3,
      outputLog: [
        'Initialized on-device latency benchmark harness.',
        'Spanning telemetry traces across frame budget (8.33ms).',
      ],
      dependencies: ['agent-coder'],
      icon: Icons.speed_rounded,
      roleColor: QuantColors.sunsetGold,
    );

    setState(() {
      _agents.add(newAgent);
      _selectedAgentId = newId;
    });

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        content: Text(
          'Spawned Subagent: Benchmark Optimizer allocated to swarm fleet.',
          style: TextStyle(color: QuantColors.textPrimary),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: SafeArea(
        child: Column(
          children: [
            // Top Swarm Fleet Telemetry Bar
            _buildSwarmTelemetryBar(),

            // Swarm DAG Visual Flow Pipeline
            _buildDagPipelineGraph(),

            // Live Agent Fleet Cards Carousel
            _buildAgentCardsCarousel(),

            // Real-Time Output Console Log
            Expanded(
              child: _buildAgentConsoleLog(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSwarmTelemetryBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: const BoxDecoration(
        color: QuantColors.voidObsidian,
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  color: _isSwarmPaused
                      ? QuantColors.sunsetGold
                      : QuantColors.emeraldMatrix,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: (_isSwarmPaused
                              ? QuantColors.sunsetGold
                              : QuantColors.emeraldMatrix)
                          .withOpacity(0.8),
                      blurRadius: 6,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'AUTONOMOUS SWARM DAG',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      color: QuantColors.textPrimary,
                      letterSpacing: -0.2,
                    ),
                  ),
                  Text(
                    '${_agents.length} Active Nodes | 15 Fleet Capacity',
                    style: const TextStyle(
                      fontSize: 10,
                      color: QuantColors.textMuted,
                      fontFamily: 'monospace',
                    ),
                  ),
                ],
              ),
            ],
          ),
          Row(
            children: [
              IconButton(
                tooltip: _isSwarmPaused ? 'Resume Swarm' : 'Pause Swarm',
                icon: Icon(
                  _isSwarmPaused
                      ? Icons.play_arrow_rounded
                      : Icons.pause_rounded,
                  color: QuantColors.textSecondary,
                  size: 20,
                ),
                onPressed: () {
                  setState(() {
                    _isSwarmPaused = !_isSwarmPaused;
                  });
                },
              ),
              const SizedBox(width: 4),
              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: QuantColors.cosmicCyan,
                  foregroundColor: Colors.black,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  minimumSize: Size.zero,
                ),
                icon: const Icon(Icons.add_rounded, size: 15),
                label: const Text(
                  'Spawn Agent',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                onPressed: _spawnNewAgent,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildDagPipelineGraph() {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
      decoration: const BoxDecoration(
        color: QuantColors.elevatedCard,
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'EXECUTION DAG TOPOLOGY',
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.6,
              color: QuantColors.textMuted,
            ),
          ),
          const SizedBox(height: 8),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: List.generate(_agents.length, (index) {
                final agent = _agents[index];
                final isSelected = agent.id == _selectedAgentId;
                final isLast = index == _agents.length - 1;

                return Row(
                  children: [
                    InkWell(
                      borderRadius: BorderRadius.circular(10),
                      onTap: () {
                        setState(() {
                          _selectedAgentId = agent.id;
                        });
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: isSelected
                              ? agent.roleColor.withOpacity(0.2)
                              : QuantColors.darkSlateCard,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: isSelected
                                ? agent.roleColor
                                : QuantColors.hairlineBorder,
                            width: isSelected ? 1.5 : 1,
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              agent.icon,
                              size: 14,
                              color: agent.roleColor,
                            ),
                            const SizedBox(width: 6),
                            Text(
                              agent.name,
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: isSelected
                                    ? FontWeight.w700
                                    : FontWeight.w500,
                                color: isSelected
                                    ? QuantColors.textPrimary
                                    : QuantColors.textSecondary,
                              ),
                            ),
                            const SizedBox(width: 6),
                            _buildStatusPill(agent.status),
                          ],
                        ),
                      ),
                    ),
                    if (!isLast) ...[
                      const SizedBox(width: 6),
                      const Icon(
                        Icons.chevron_right_rounded,
                        size: 16,
                        color: QuantColors.textMuted,
                      ),
                      const SizedBox(width: 6),
                    ],
                  ],
                );
              }),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAgentCardsCarousel() {
    return Container(
      height: 160,
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: _agents.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (context, index) {
          final agent = _agents[index];
          final isSelected = agent.id == _selectedAgentId;

          return InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: () {
              setState(() {
                _selectedAgentId = agent.id;
              });
            },
            child: Container(
              width: 250,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: QuantColors.darkSlateCard,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: isSelected
                      ? agent.roleColor
                      : QuantColors.hairlineBorder,
                  width: isSelected ? 1.5 : 1,
                ),
                boxShadow: isSelected
                    ? [
                        BoxShadow(
                          color: agent.roleColor.withOpacity(0.2),
                          blurRadius: 12,
                          offset: const Offset(0, 2),
                        ),
                      ]
                    : null,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 28,
                            height: 28,
                            decoration: BoxDecoration(
                              color: agent.roleColor.withOpacity(0.18),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Icon(
                              agent.icon,
                              size: 16,
                              color: agent.roleColor,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            agent.name,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: QuantColors.textPrimary,
                            ),
                          ),
                        ],
                      ),
                      Text(
                        '${(agent.progress * 100).toInt()}%',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          color: agent.roleColor,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ],
                  ),
                  Text(
                    agent.currentStep,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      color: QuantColors.textSecondary,
                      height: 1.35,
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(3),
                        child: LinearProgressIndicator(
                          value: agent.progress,
                          minHeight: 4,
                          backgroundColor: QuantColors.voidObsidian,
                          valueColor:
                              AlwaysStoppedAnimation<Color>(agent.roleColor),
                        ),
                      ),
                      const SizedBox(height: 6),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Tools: ${agent.toolCallsCount}',
                            style: const TextStyle(
                              fontSize: 10,
                              color: QuantColors.textMuted,
                              fontFamily: 'monospace',
                            ),
                          ),
                          Text(
                            agent.status == AgentStatus.completed
                                ? 'Pass Verified'
                                : 'Executing...',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                              color: agent.status == AgentStatus.completed
                                  ? QuantColors.emeraldMatrix
                                  : QuantColors.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildAgentConsoleLog() {
    final agent = _selectedAgent;

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      decoration: BoxDecoration(
        color: const Color(0xFF0A0C12),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Console Header
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: const BoxDecoration(
              color: QuantColors.darkSlateCard,
              borderRadius: BorderRadius.only(
                topLeft: Radius.circular(15),
                topRight: Radius.circular(15),
              ),
              border: Border(
                bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1),
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(
                      Icons.terminal_rounded,
                      size: 15,
                      color: QuantColors.cosmicCyan,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'AGENT CONSOLE // ${agent.name.toUpperCase()}',
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.6,
                        color: QuantColors.textPrimary,
                        fontFamily: 'monospace',
                      ),
                    ),
                  ],
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: QuantColors.voidObsidian,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    '${agent.outputLog.length} events logged',
                    style: const TextStyle(
                      fontSize: 10,
                      color: QuantColors.textMuted,
                      fontFamily: 'monospace',
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Log Content List
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(12),
              itemCount: agent.outputLog.length,
              itemBuilder: (context, index) {
                final logLine = agent.outputLog[index];
                return Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '[${index + 1}] ',
                        style: const TextStyle(
                          fontSize: 11,
                          fontFamily: 'monospace',
                          color: QuantColors.textMuted,
                        ),
                      ),
                      Expanded(
                        child: Text(
                          logLine,
                          style: const TextStyle(
                            fontSize: 11,
                            fontFamily: 'monospace',
                            color: Color(0xFFE2E8F0),
                            height: 1.35,
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusPill(AgentStatus status) {
    Color color;
    String label;

    switch (status) {
      case AgentStatus.completed:
        color = QuantColors.emeraldMatrix;
        label = 'DONE';
        break;
      case AgentStatus.running:
        color = QuantColors.cosmicCyan;
        label = 'RUN';
        break;
      case AgentStatus.error:
        color = QuantColors.statusError;
        label = 'ERR';
        break;
      case AgentStatus.idle:
      default:
        color = QuantColors.textMuted;
        label = 'WAIT';
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: color.withOpacity(0.4)),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 9,
          fontWeight: FontWeight.w800,
          color: color,
          fontFamily: 'monospace',
        ),
      ),
    );
  }
}

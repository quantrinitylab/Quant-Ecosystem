// Sovereign Quant Ecosystem - QuantAI Agent Swarm Screen
// Autonomous Agent Swarm DAG visualizer: Interactive node tree showing CEO Astra,
// Node A, Node B, Node C task dispatch states and 15-subagent fleet execution ledger.
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
  String _selectedAgentId = 'agent-ceo-astra';
  bool _isSwarmPaused = false;

  final List<Map<String, String>> _interAgentLedger = [
    {
      'time': '17:45 IST',
      'node': 'Node C (CLI Dev-Worker)',
      'status': 'Wave 80 Dispatched',
      'message': 'WAVE 80 MULTIPLATFORM OMNI-PRESENCE & DEEP SCREENS SPRINT LAUNCHED: 5 Subagents fleet mobilized for quant_chat, quant_gram, quant_calendar/drive, quant_ai, and Ecosystem Sentinel.',
    },
    {
      'time': '17:42 IST',
      'node': 'CEO Astra',
      'status': 'Orchestration Active',
      'message': 'Executive Orchestrator directive: Enforce 100% zero raw Unicode emojis and zero Skia clipPath across all Flutter runner targets.',
    },
    {
      'time': '17:40 IST',
      'node': 'Node A (IDE Orchestrator)',
      'status': 'Track 3 In Sync',
      'message': 'Track 3 GitHub Parity: Smart HTTP, real git tree, issues, PR 3-way merge streaming verified.',
    },
    {
      'time': '17:38 IST',
      'node': 'Node B (IDE Peer Agent)',
      'status': 'Track 2 In Sync',
      'message': 'Track 2 ChatGPT Parity: Split-Screen Dual Canvas & 3D Voice Orb <120ms VAD buffers synchronized.',
    },
  ];

  @override
  void initState() {
    super.initState();
    _agents = List.from(AiMockData.getInitialAgentNodes());
  }

  AgentNode get _selectedAgent => _agents.firstWhere(
        (a) => a.id == _selectedAgentId,
        orElse: () => _agents.first,
      );

  void _dispatchSprintWave() {
    setState(() {
      _interAgentLedger.insert(0, {
        'time': 'Just now',
        'node': 'CEO Astra',
        'status': 'Wave 80 Dispatched',
        'message': 'CEO Astra dispatched parallel execution payload across Node A, Node B, and Node C. Gatekeeper sentinel verified 0 clipPath invariants.',
      });
    });

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        content: Text(
          'Wave 80 Dispatched: 15-Subagent Fleet synchronized across Tripartite Nodes.',
          style: TextStyle(color: QuantColors.emeraldMatrix),
        ),
      ),
    );
  }

  void _spawnNewAgent() {
    final newId = 'agent-sub-${_agents.length + 1}';
    final newAgent = AgentNode(
      id: newId,
      name: 'Benchmark Optimizer',
      role: AgentRole.sentinel,
      status: AgentStatus.running,
      progress: 0.25,
      currentStep: 'Benchmarking 120Hz Impeller raster cache tile allocation.',
      toolCallsCount: 4,
      outputLog: [
        'Initialized on-device latency benchmark harness.',
        'Spanning telemetry traces across frame budget (8.33ms).',
      ],
      dependencies: ['agent-sentinel'],
      icon: Icons.speed_rounded,
      roleColor: QuantColors.sunsetGold,
      assignedTrack: 'Quality & Benchmarks',
      subagentsCount: 0,
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

            // Interactive Node Tree DAG Visualizer (CEO Astra -> Node A, B, C)
            _buildInteractiveDagNodeTree(),

            // Swarm Fleet Cards Carousel
            _buildAgentCardsCarousel(),

            // Real-Time Output Console Log & Tripartite Ledger
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
                    '${_agents.length} Nodes Active | 15 Subagents Fleet Capacity',
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
                icon: const Icon(Icons.rocket_launch_rounded, size: 14),
                label: const Text(
                  'Dispatch Wave',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                onPressed: _dispatchSprintWave,
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// Interactive Node Tree showing CEO Astra, Node A, Node B, Node C task dispatch states
  Widget _buildInteractiveDagNodeTree() {
    final ceoAstra = _agents.firstWhere(
      (a) => a.role == AgentRole.ceoAstra,
      orElse: () => _agents.first,
    );
    final nodeA = _agents.firstWhere(
      (a) => a.role == AgentRole.nodeA,
      orElse: () => _agents[1],
    );
    final nodeB = _agents.firstWhere(
      (a) => a.role == AgentRole.nodeB,
      orElse: () => _agents[2],
    );
    final nodeC = _agents.firstWhere(
      (a) => a.role == AgentRole.nodeC,
      orElse: () => _agents[3],
    );

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
      decoration: const BoxDecoration(
        color: QuantColors.elevatedCard,
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'INTERACTIVE TRIPARTITE SWARM DAG',
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.6,
                  color: QuantColors.textMuted,
                ),
              ),
              InkWell(
                onTap: _spawnNewAgent,
                child: const Row(
                  children: [
                    Icon(Icons.add_circle_outline_rounded,
                        size: 13, color: QuantColors.cosmicCyan),
                    SizedBox(width: 4),
                    Text(
                      'Spawn Agent',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: QuantColors.cosmicCyan,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          // Master Node: CEO Astra
          _buildDagNodeWidget(ceoAstra, isMasterNode: true),

          // Downward Dispatch Connecting Lines
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 1.5,
                  height: 14,
                  color: QuantColors.hairlineBorder,
                ),
              ],
            ),
          ),

          // Horizontal Connecting Crossbar
          Container(
            height: 1.5,
            width: 260,
            color: QuantColors.hairlineBorder,
          ),
          const SizedBox(height: 6),

          // Tripartite Branches: Node A, Node B, Node C
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _buildDagNodeWidget(nodeA),
                const SizedBox(width: 12),
                _buildDagNodeWidget(nodeB),
                const SizedBox(width: 12),
                _buildDagNodeWidget(nodeC),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDagNodeWidget(AgentNode agent, {bool isMasterNode = false}) {
    final isSelected = agent.id == _selectedAgentId;

    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: () {
        setState(() {
          _selectedAgentId = agent.id;
        });
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        decoration: BoxDecoration(
          color: isSelected
              ? agent.roleColor.withOpacity(0.2)
              : QuantColors.darkSlateCard,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: isSelected
                ? agent.roleColor
                : isMasterNode
                    ? QuantColors.obsidianPurple.withOpacity(0.6)
                    : QuantColors.hairlineBorder,
            width: isSelected ? 1.5 : 1,
          ),
          boxShadow: isSelected
              ? [
                  BoxShadow(
                    color: agent.roleColor.withOpacity(0.25),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ]
              : null,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 22,
              height: 22,
              decoration: BoxDecoration(
                color: agent.roleColor.withOpacity(0.2),
                shape: BoxShape.circle,
              ),
              child: Icon(
                agent.icon,
                size: 13,
                color: agent.roleColor,
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  agent.name,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
                    color: isSelected
                        ? QuantColors.textPrimary
                        : QuantColors.textSecondary,
                  ),
                ),
                if (agent.assignedTrack != null)
                  Text(
                    agent.assignedTrack!,
                    style: TextStyle(
                      fontSize: 9,
                      color: agent.roleColor,
                      fontFamily: 'monospace',
                    ),
                  ),
              ],
            ),
            const SizedBox(width: 8),
            _buildStatusPill(agent.status),
          ],
        ),
      ),
    );
  }

  Widget _buildAgentCardsCarousel() {
    return Container(
      height: 145,
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: _agents.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, index) {
          final agent = _agents[index];
          final isSelected = agent.id == _selectedAgentId;

          return InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: () {
              setState(() {
                _selectedAgentId = agent.id;
              });
            },
            child: Container(
              width: 240,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: QuantColors.darkSlateCard,
                borderRadius: BorderRadius.circular(14),
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
                          blurRadius: 10,
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
                            width: 24,
                            height: 24,
                            decoration: BoxDecoration(
                              color: agent.roleColor.withOpacity(0.18),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Icon(
                              agent.icon,
                              size: 14,
                              color: agent.roleColor,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            agent.name,
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: QuantColors.textPrimary,
                            ),
                          ),
                        ],
                      ),
                      Text(
                        '${(agent.progress * 100).toInt()}%',
                        style: TextStyle(
                          fontSize: 11,
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
                      fontSize: 10,
                      color: QuantColors.textSecondary,
                      height: 1.3,
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(3),
                        child: LinearProgressIndicator(
                          value: agent.progress,
                          backgroundColor: QuantColors.voidObsidian,
                          color: agent.roleColor,
                          minHeight: 4,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            '${agent.toolCallsCount} tools called',
                            style: const TextStyle(
                              fontSize: 9,
                              color: QuantColors.textMuted,
                              fontFamily: 'monospace',
                            ),
                          ),
                          _buildStatusPill(agent.status),
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
      color: const Color(0xFF0C0E14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Console header
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: const BoxDecoration(
              color: QuantColors.darkSlateCard,
              border: Border(
                top: BorderSide(color: QuantColors.hairlineBorder, width: 1),
                bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1),
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Icon(
                      Icons.terminal_rounded,
                      size: 14,
                      color: agent.roleColor,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '${agent.name.toUpperCase()} DISPATCH TRACE',
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.5,
                        color: QuantColors.textPrimary,
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
                    '${agent.outputLog.length} LOGS',
                    style: const TextStyle(
                      fontSize: 9,
                      fontFamily: 'monospace',
                      color: QuantColors.textMuted,
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Inter-Agent Live Chat & Output Logs
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(12),
              children: [
                // Live Chat Ledger Snippet
                Container(
                  padding: const EdgeInsets.all(10),
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(
                    color: QuantColors.elevatedCard,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: QuantColors.hairlineBorder),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Row(
                        children: [
                          Icon(Icons.forum_rounded,
                              size: 12, color: QuantColors.cosmicCyan),
                          SizedBox(width: 6),
                          Text(
                            'TRIPARTITE LIVE INTER-AGENT DISPATCH LEDGER',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              color: QuantColors.cosmicCyan,
                              letterSpacing: 0.4,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      ..._interAgentLedger.map((entry) {
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '[${entry['time']}] ',
                                style: const TextStyle(
                                  fontSize: 9,
                                  fontFamily: 'monospace',
                                  color: QuantColors.textMuted,
                                ),
                              ),
                              Text(
                                '${entry['node']}: ',
                                style: const TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                  color: QuantColors.textSecondary,
                                ),
                              ),
                              Expanded(
                                child: Text(
                                  entry['message']!,
                                  style: const TextStyle(
                                    fontSize: 10,
                                    color: QuantColors.textPrimary,
                                    height: 1.3,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        );
                      }),
                    ],
                  ),
                ),

                // Selected Agent Terminal Logs
                ...agent.outputLog.map((log) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '> ',
                          style: TextStyle(
                            fontSize: 11,
                            fontFamily: 'monospace',
                            color: agent.roleColor,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Expanded(
                          child: Text(
                            log,
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
                }),
              ],
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
      case AgentStatus.running:
        color = QuantColors.emeraldMatrix;
        label = 'RUNNING';
        break;
      case AgentStatus.completed:
        color = QuantColors.cosmicCyan;
        label = 'COMPLETED';
        break;
      case AgentStatus.error:
        color = QuantColors.statusError;
        label = 'ERROR';
        break;
      case AgentStatus.idle:
      default:
        color = QuantColors.textMuted;
        label = 'IDLE';
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
          fontSize: 8,
          fontWeight: FontWeight.w800,
          color: color,
          fontFamily: 'monospace',
        ),
      ),
    );
  }
}

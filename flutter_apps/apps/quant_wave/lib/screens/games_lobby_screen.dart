// Sovereign Quant Ecosystem - QuantWave Party Games Lobby Screen
// Sovereign Interactive Party Games Lobby (Trivia Blitz, Werewolf, Word Clue, Uno, Speed Chess)
// Strictly ZERO raw Unicode emojis throughout this file.
// Pure 120Hz Impeller & Skia hardware acceleration.

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../models/wave_models.dart';
import '../services/wave_mock_data.dart';

class GamesLobbyScreen extends StatefulWidget {
  const GamesLobbyScreen({super.key});

  @override
  State<GamesLobbyScreen> createState() => _GamesLobbyScreenState();
}

class _GamesLobbyScreenState extends State<GamesLobbyScreen> {
  int _activeTab = 0; // 0: Games Lobby, 1: Leaderboard
  late List<LobbyGame> _games;
  late List<GameLeaderboardEntry> _leaderboard;
  Timer? _countdownTimer;
  int _roundCountdown = 15;
  int _liveScoreTicker = 2840;

  @override
  void initState() {
    super.initState();
    _games = WaveMockData.getLobbyGames();
    _leaderboard = WaveMockData.getGameLeaderboard();
    _startTicker();
  }

  void _startTicker() {
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) {
        setState(() {
          if (_roundCountdown > 1) {
            _roundCountdown--;
          } else {
            _roundCountdown = 20;
            _liveScoreTicker += 150;
          }
        });
      }
    });
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    super.dispose();
  }

  void _showCreateGameTableModal(LobbyGame game) {
    int stake = game.stakeCredits;
    showModalBottomSheet(
      context: context,
      backgroundColor: QuantColors.darkSlateCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        side: BorderSide(color: QuantColors.hairlineBorder, width: 1),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(game.icon, color: game.accentColor),
                        const SizedBox(width: 8),
                        Text(
                          'Host ${game.title} Table',
                          style: const TextStyle(
                            color: QuantColors.textPrimary,
                            fontWeight: FontWeight.w700,
                            fontSize: 16,
                          ),
                        ),
                        const Spacer(),
                        IconButton(
                          icon: const Icon(Icons.close_rounded, color: QuantColors.textMuted),
                          onPressed: () => Navigator.pop(ctx),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'ENTRY STAKE: $stake QUANT CREDITS',
                      style: const TextStyle(
                        color: QuantColors.moltenAmber,
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.5,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [50, 100, 200, 500].map((val) {
                        final isSelected = stake == val;
                        return Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ChoiceChip(
                            label: Text('$val QC'),
                            selected: isSelected,
                            selectedColor: QuantColors.moltenAmber,
                            backgroundColor: QuantColors.elevatedCard,
                            labelStyle: TextStyle(
                              color: isSelected ? Colors.white : QuantColors.textSecondary,
                              fontWeight: FontWeight.w700,
                              fontSize: 11,
                            ),
                            onSelected: (selected) {
                              if (selected) {
                                setModalState(() => stake = val);
                              }
                            },
                          ),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 20),
                    SizedBox(
                      width: double.infinity,
                      height: 46,
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: game.accentColor,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                        onPressed: () {
                          Navigator.pop(ctx);
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              backgroundColor: QuantColors.darkSlateCard,
                              content: Text(
                                '${game.title} table created with $stake QC stake. Waiting for challenger...',
                                style: const TextStyle(color: QuantColors.textPrimary),
                              ),
                            ),
                          );
                        },
                        child: const Text(
                          'Create Sovereign Table',
                          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Top Switcher: Games vs Leaderboard
        _buildTopNavTabs(),

        // Real-Time Countdown & Score Ticker Bar
        _buildRealTimeScoreTickerBar(),

        // Body
        Expanded(
          child: _activeTab == 0 ? _buildGamesView() : _buildLeaderboardView(),
        ),
      ],
    );
  }

  Widget _buildTopNavTabs() {
    return Container(
      decoration: const BoxDecoration(
        color: QuantColors.voidObsidian,
        border: Border(bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1)),
      ),
      child: Row(
        children: [
          Expanded(child: _buildTabButton(0, 'Games Lobby', Icons.sports_esports_rounded)),
          Expanded(child: _buildTabButton(1, 'Leaderboard', Icons.military_tech_rounded)),
        ],
      ),
    );
  }

  Widget _buildTabButton(int index, String label, IconData icon) {
    final isSelected = _activeTab == index;
    return InkWell(
      onTap: () => setState(() => _activeTab = index),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(
              color: isSelected ? QuantColors.moltenAmber : Colors.transparent,
              width: 2.5,
            ),
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              size: 16,
              color: isSelected ? QuantColors.moltenAmber : QuantColors.textMuted,
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                color: isSelected ? QuantColors.textPrimary : QuantColors.textMuted,
                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                fontSize: 14,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRealTimeScoreTickerBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateCard,
        border: Border(bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1)),
      ),
      child: Row(
        children: [
          // Real-time Countdown Timer Capsule
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: QuantColors.crimsonRed.withOpacity(0.18),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: QuantColors.crimsonRed.withOpacity(0.6), width: 1),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.timer_outlined, color: QuantColors.crimsonRed, size: 14),
                const SizedBox(width: 5),
                Text(
                  'ROUND: ${_roundCountdown}s',
                  style: const TextStyle(
                    color: QuantColors.crimsonRed,
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.5,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),

          // Real-time Score Ticker Capsule
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: QuantColors.elevatedCard,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: QuantColors.hairlineBorder, width: 1),
              ),
              child: Row(
                children: [
                  const Icon(Icons.bolt_rounded, color: QuantColors.moltenAmber, size: 14),
                  const SizedBox(width: 4),
                  const Text(
                    'LIVE TICKER:',
                    style: TextStyle(color: QuantColors.textMuted, fontSize: 10, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(width: 4),
                  Text(
                    '$_liveScoreTicker PTS',
                    style: const TextStyle(
                      color: QuantColors.sovereignCyan,
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const Spacer(),
                  const Text(
                    'ACTIVE',
                    style: TextStyle(color: QuantColors.emeraldMatrix, fontSize: 9, fontWeight: FontWeight.w800),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGamesView() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Credits Balance Capsule
        _buildCreditsCapsule(),
        const SizedBox(height: 16),

        // Featured Party Games Header
        Row(
          children: [
            const Text(
              'Featured Party Games',
              style: TextStyle(
                color: QuantColors.textPrimary,
                fontSize: 16,
                fontWeight: FontWeight.w800,
              ),
            ),
            const Spacer(),
            Text(
              '${_games.length} Games Online',
              style: const TextStyle(color: QuantColors.textMuted, fontSize: 12),
            ),
          ],
        ),
        const SizedBox(height: 12),

        // Games Grid / Cards
        ..._games.map((game) => _buildGameCard(game)),
      ],
    );
  }

  Widget _buildCreditsCapsule() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            QuantColors.darkSlateCard,
            QuantColors.moltenAmber.withOpacity(0.12),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder, width: 1),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'QUANT CREDITS BALANCE',
                style: TextStyle(
                  color: QuantColors.textMuted,
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.5,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                '12,500 QC',
                style: TextStyle(
                  color: QuantColors.moltenAmber,
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                'Rank: Sovereign Adept • Win Rate: 72%',
                style: TextStyle(color: QuantColors.textSecondary.withOpacity(0.8), fontSize: 11),
              ),
            ],
          ),
          ElevatedButton.icon(
            icon: const Icon(Icons.add_card_rounded, size: 16, color: Colors.white),
            label: const Text('Top Up', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12)),
            style: ElevatedButton.styleFrom(
              backgroundColor: QuantColors.moltenAmber,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            ),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  backgroundColor: QuantColors.darkSlateCard,
                  content: Text('Free daily 500 QC credited to your account.', style: TextStyle(color: QuantColors.textPrimary)),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildGameCard(LobbyGame game) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: game.accentColor.withOpacity(0.18),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: game.accentColor.withOpacity(0.4), width: 1),
                ),
                child: Center(
                  child: Icon(game.icon, color: game.accentColor, size: 24),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            game.title,
                            style: const TextStyle(
                              color: QuantColors.textPrimary,
                              fontWeight: FontWeight.w800,
                              fontSize: 16,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: QuantColors.elevatedCard,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            game.category.toUpperCase(),
                            style: const TextStyle(
                              color: QuantColors.textMuted,
                              fontSize: 9,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      game.description,
                      style: const TextStyle(color: QuantColors.textSecondary, fontSize: 12, height: 1.3),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          const Divider(color: QuantColors.hairlineBorder, height: 1),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Icon(Icons.table_restaurant_rounded, size: 14, color: QuantColors.textMuted),
                  const SizedBox(width: 4),
                  Text(
                    '${game.activeTables} tables',
                    style: const TextStyle(color: QuantColors.textMuted, fontSize: 11),
                  ),
                  const SizedBox(width: 10),
                  Icon(Icons.people_alt_rounded, size: 14, color: QuantColors.textMuted),
                  const SizedBox(width: 4),
                  Text(
                    '${game.playersCount} players',
                    style: const TextStyle(color: QuantColors.textMuted, fontSize: 11),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    '${game.stakeCredits} QC stake',
                    style: TextStyle(color: game.accentColor, fontSize: 11, fontWeight: FontWeight.bold),
                  ),
                ],
              ),
              Row(
                children: [
                  OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: QuantColors.textPrimary,
                      side: const BorderSide(color: QuantColors.hairlineBorder),
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      minimumSize: const Size(50, 32),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    onPressed: () => _showCreateGameTableModal(game),
                    child: const Text('Host', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: game.accentColor,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                      minimumSize: const Size(60, 32),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          backgroundColor: QuantColors.darkSlateCard,
                          content: Text(
                            'Joined quick matchmaking for ${game.title}...',
                            style: const TextStyle(color: QuantColors.textPrimary),
                          ),
                        ),
                      );
                    },
                    child: const Text('Play Now', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildLeaderboardView() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'Victory Leaderboard',
          style: TextStyle(
            color: QuantColors.textPrimary,
            fontSize: 18,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 4),
        const Text(
          'Top champions ranked by net Quant Credits won across all party games.',
          style: TextStyle(color: QuantColors.textMuted, fontSize: 12),
        ),
        const SizedBox(height: 16),
        ..._leaderboard.map((entry) => _buildLeaderboardCard(entry)),
      ],
    );
  }

  Widget _buildLeaderboardCard(GameLeaderboardEntry entry) {
    Color rankBadgeColor = QuantColors.elevatedCard;
    IconData? trophyIcon;

    if (entry.rank == 1) {
      rankBadgeColor = QuantColors.moltenAmber;
      trophyIcon = Icons.emoji_events_rounded;
    } else if (entry.rank == 2) {
      rankBadgeColor = QuantColors.sovereignCyan;
      trophyIcon = Icons.military_tech_rounded;
    } else if (entry.rank == 3) {
      rankBadgeColor = QuantColors.emeraldMatrix;
      trophyIcon = Icons.military_tech_rounded;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: entry.rank == 1 ? QuantColors.moltenAmber : QuantColors.hairlineBorder,
          width: entry.rank == 1 ? 1.5 : 1,
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: rankBadgeColor.withOpacity(0.2),
              shape: BoxShape.circle,
              border: Border.all(color: rankBadgeColor, width: 1),
            ),
            child: Center(
              child: trophyIcon != null
                  ? Icon(trophyIcon, color: rankBadgeColor, size: 16)
                  : Text(
                      '#${entry.rank}',
                      style: TextStyle(color: rankBadgeColor, fontWeight: FontWeight.w800, fontSize: 11),
                    ),
            ),
          ),
          const SizedBox(width: 12),
          CircleAvatar(
            radius: 18,
            backgroundColor: entry.avatarColor,
            child: Text(
              entry.username.isNotEmpty ? entry.username.substring(0, 1) : 'U',
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.username,
                  style: const TextStyle(
                    color: QuantColors.textPrimary,
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
                Text(
                  '${entry.handle} • ${entry.gameSpecialty}',
                  style: const TextStyle(color: QuantColors.textMuted, fontSize: 11),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '+${entry.creditsWon} QC',
                style: const TextStyle(
                  color: QuantColors.moltenAmber,
                  fontWeight: FontWeight.w800,
                  fontSize: 13,
                ),
              ),
              Text(
                'Streak: ${entry.winStreak}W',
                style: const TextStyle(
                  color: QuantColors.statusSuccess,
                  fontWeight: FontWeight.w600,
                  fontSize: 11,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

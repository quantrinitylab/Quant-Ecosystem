// Sovereign Quant Ecosystem - QuantWave Party Games Lobby Screen
// Sovereign Interactive Party Games Lobby (Uno, Trivia, Speed Chess)
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

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

  @override
  void initState() {
    super.initState();
    _games = WaveMockData.getLobbyGames();
    _leaderboard = WaveMockData.getGameLeaderboard();
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
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: InkWell(
              onTap: () => setState(() => _activeTab = 0),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 12),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  border: Border(
                    bottom: BorderSide(
                      color: _activeTab == 0 ? QuantColors.moltenAmber : Colors.transparent,
                      width: 2.5,
                    ),
                  ),
                ),
                child: Text(
                  'Games Lobby',
                  style: TextStyle(
                    color: _activeTab == 0 ? QuantColors.textPrimary : QuantColors.textMuted,
                    fontWeight: _activeTab == 0 ? FontWeight.w700 : FontWeight.w500,
                    fontSize: 14,
                  ),
                ),
              ),
            ),
          ),
          Expanded(
            child: InkWell(
              onTap: () => setState(() => _activeTab = 1),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 12),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  border: Border(
                    bottom: BorderSide(
                      color: _activeTab == 1 ? QuantColors.sunsetGold : Colors.transparent,
                      width: 2.5,
                    ),
                  ),
                ),
                child: Text(
                  'Leaderboard',
                  style: TextStyle(
                    color: _activeTab == 1 ? QuantColors.textPrimary : QuantColors.textMuted,
                    fontWeight: _activeTab == 1 ? FontWeight.w700 : FontWeight.w500,
                    fontSize: 14,
                  ),
                ),
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
        // User Credits Capsule Card
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [QuantColors.darkSlateCard, QuantColors.elevatedCard],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: QuantColors.hairlineBorder),
          ),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: QuantColors.moltenAmber.withOpacity(0.2),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.token_rounded, color: QuantColors.moltenAmber, size: 24),
              ),
              const SizedBox(width: 14),
              const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'QUANT CREDITS BALANCE',
                    style: TextStyle(
                      color: QuantColors.textMuted,
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.5,
                    ),
                  ),
                  SizedBox(height: 2),
                  Text(
                    '12,500 QC',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
              const Spacer(),
              ElevatedButton.icon(
                icon: const Icon(Icons.add_rounded, size: 16, color: Colors.white),
                label: const Text(
                  'Deposit',
                  style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: QuantColors.moltenAmber,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                ),
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      backgroundColor: QuantColors.darkSlateCard,
                      content: Text(
                        'On-chain sovereign credit refill engaged.',
                        style: TextStyle(color: QuantColors.textPrimary),
                      ),
                    ),
                  );
                },
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),

        // Games Grid Header
        const Text(
          'SOVEREIGN MULTIPLAYER MINI-GAMES',
          style: TextStyle(
            color: QuantColors.textMuted,
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
          ),
        ),
        const SizedBox(height: 12),

        // Games List
        ...List.generate(_games.length, (idx) {
          final game = _games[idx];
          return Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: _buildGameCard(game),
          );
        }),
      ],
    );
  }

  Widget _buildGameCard(LobbyGame game) {
    return Container(
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder, width: 1),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: game.accentColor.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(game.icon, color: game.accentColor, size: 26),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      game.title,
                      style: const TextStyle(
                        color: QuantColors.textPrimary,
                        fontWeight: FontWeight.w700,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      game.category,
                      style: const TextStyle(
                        color: QuantColors.textMuted,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: QuantColors.elevatedCard,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: QuantColors.hairlineBorder),
                ),
                child: Text(
                  '${game.stakeCredits} QC Entry',
                  style: const TextStyle(
                    color: QuantColors.moltenAmber,
                    fontWeight: FontWeight.w700,
                    fontSize: 11,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            game.description,
            style: const TextStyle(
              color: QuantColors.textSecondary,
              fontSize: 13,
              height: 1.35,
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              const Icon(Icons.people_alt_rounded, size: 14, color: QuantColors.sovereignCyan),
              const SizedBox(width: 4),
              Text(
                '${game.playersCount} Players (${game.activeTables} tables)',
                style: const TextStyle(color: QuantColors.textMuted, fontSize: 11),
              ),
              const SizedBox(width: 12),
              const Icon(Icons.speed_rounded, size: 14, color: QuantColors.statusSuccess),
              const SizedBox(width: 4),
              Text(
                game.difficulty,
                style: const TextStyle(color: QuantColors.textMuted, fontSize: 11),
              ),
              const Spacer(),
              OutlinedButton(
                style: OutlinedButton.styleFrom(
                  foregroundColor: QuantColors.textPrimary,
                  side: const BorderSide(color: QuantColors.hairlineBorder),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  minimumSize: const Size(60, 32),
                ),
                onPressed: () => _showCreateGameTableModal(game),
                child: const Text('Host', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
              ),
              const SizedBox(width: 8),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: game.accentColor,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                  minimumSize: const Size(70, 32),
                ),
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      backgroundColor: QuantColors.darkSlateCard,
                      content: Text(
                        'Matchmaking for ${game.title} engaged. Connecting to peer table...',
                        style: const TextStyle(color: QuantColors.textPrimary),
                      ),
                    ),
                  );
                },
                child: const Text('Play Now', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
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
        // Trophy Banner
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [QuantColors.darkSlateCard, Color(0xFF221A10)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: QuantColors.sunsetGold.withOpacity(0.4)),
          ),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: QuantColors.sunsetGold.withOpacity(0.2),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.emoji_events_rounded, color: QuantColors.sunsetGold, size: 28),
              ),
              const SizedBox(width: 14),
              const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'WEEKLY SOVEREIGN LEAGUE',
                    style: TextStyle(
                      color: QuantColors.sunsetGold,
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.5,
                    ),
                  ),
                  SizedBox(height: 2),
                  Text(
                    'Prize Pool: 250,000 QC',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),

        const Text(
          'TOP SOVEREIGN PLAYERS',
          style: TextStyle(
            color: QuantColors.textMuted,
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
          ),
        ),
        const SizedBox(height: 12),

        ...List.generate(_leaderboard.length, (idx) {
          final entry = _leaderboard[idx];
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _buildLeaderboardCard(entry),
          );
        }),
      ],
    );
  }

  Widget _buildLeaderboardCard(GameLeaderboardEntry entry) {
    Color rankColor = QuantColors.textSecondary;
    if (entry.rank == 1) rankColor = QuantColors.sunsetGold;
    if (entry.rank == 2) rankColor = const Color(0xFFC0C0C0);
    if (entry.rank == 3) rankColor = const Color(0xFFCD7F32);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: entry.rank == 1 ? QuantColors.sunsetGold.withOpacity(0.5) : QuantColors.hairlineBorder,
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 28,
            height: 28,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: rankColor.withOpacity(0.2),
              shape: BoxShape.circle,
            ),
            child: Text(
              '#${entry.rank}',
              style: TextStyle(
                color: rankColor,
                fontWeight: FontWeight.w800,
                fontSize: 12,
              ),
            ),
          ),
          const SizedBox(width: 12),
          CircleAvatar(
            radius: 16,
            backgroundColor: entry.avatarColor,
            child: Text(
              entry.username.substring(0, 1),
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.username,
                  style: const TextStyle(
                    color: QuantColors.textPrimary,
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
                Text(
                  '${entry.gameSpecialty} • ${entry.winStreak} win streak',
                  style: const TextStyle(
                    color: QuantColors.textMuted,
                    fontSize: 11,
                  ),
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
                  color: QuantColors.statusSuccess,
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              ),
              const Text(
                'Weekly Won',
                style: TextStyle(
                  color: QuantColors.textMuted,
                  fontSize: 10,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

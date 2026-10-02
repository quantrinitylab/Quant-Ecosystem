// Sovereign Quant Ecosystem - QuantWave Profile Screen
// Sovereign Identity, Karma & Quant Credits Ledger
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../models/wave_models.dart';
import '../services/wave_mock_data.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> with SingleTickerProviderStateMixin {
  late UserProfile _profile;
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _profile = WaveMockData.getUserProfile();
    _tabController = TabController(length: 4, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Profile Header Section
        Container(
          color: QuantColors.darkSlateCard,
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Banner & Avatar Row
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    radius: 32,
                    backgroundColor: _profile.avatarColor,
                    child: const Text(
                      'QS',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  const Spacer(),
                  OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: QuantColors.textPrimary,
                      side: const BorderSide(color: QuantColors.hairlineBorder),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    ),
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          backgroundColor: QuantColors.darkSlateCard,
                          content: Text(
                            'Sovereign profile key & bio editor opened.',
                            style: TextStyle(color: QuantColors.textPrimary),
                          ),
                        ),
                      );
                    },
                    child: const Text('Edit Profile', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Name & Verified Badge
              Row(
                children: [
                  Text(
                    _profile.name,
                    style: const TextStyle(
                      color: QuantColors.textPrimary,
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  if (_profile.isVerified) ...[
                    const SizedBox(width: 6),
                    const Icon(
                      Icons.verified_rounded,
                      color: QuantColors.sovereignCyan,
                      size: 18,
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 2),
              Text(
                _profile.handle,
                style: const TextStyle(
                  color: QuantColors.textMuted,
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 8),

              // Bio
              Text(
                _profile.bio,
                style: const TextStyle(
                  color: QuantColors.textSecondary,
                  fontSize: 13,
                  height: 1.35,
                ),
              ),
              const SizedBox(height: 10),

              // Location & Join Date
              Row(
                children: [
                  const Icon(Icons.location_on_outlined, size: 14, color: QuantColors.textMuted),
                  const SizedBox(width: 4),
                  Text(
                    _profile.location,
                    style: const TextStyle(color: QuantColors.textMuted, fontSize: 12),
                  ),
                  const SizedBox(width: 14),
                  const Icon(Icons.calendar_today_outlined, size: 13, color: QuantColors.textMuted),
                  const SizedBox(width: 4),
                  Text(
                    _profile.joinDate,
                    style: const TextStyle(color: QuantColors.textMuted, fontSize: 12),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Followers / Following / Karma / Quant Credits Badges
              Row(
                children: [
                  _buildStatItem('Following', _profile.followingCount.toString()),
                  const SizedBox(width: 14),
                  _buildStatItem('Followers', '18.9k'),
                  const SizedBox(width: 14),
                  _buildStatItem('Karma', '45.2k', color: QuantColors.sunsetGold),
                  const SizedBox(width: 14),
                  _buildStatItem('Credits', '12.5k QC', color: QuantColors.moltenAmber),
                ],
              ),
            ],
          ),
        ),

        // Tabs: Waves, Replies, Highlights, Media
        Container(
          color: QuantColors.voidObsidian,
          child: TabBar(
            controller: _tabController,
            indicatorColor: QuantColors.moltenAmber,
            indicatorWeight: 2.5,
            labelColor: QuantColors.textPrimary,
            unselectedLabelColor: QuantColors.textMuted,
            labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
            tabs: const [
              Tab(text: 'Waves'),
              Tab(text: 'Replies'),
              Tab(text: 'Highlights'),
              Tab(text: 'Media'),
            ],
          ),
        ),

        // Tab Views
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: [
              _buildWavesTab(),
              _buildEmptyState('No replies yet', 'Join discussions across the sovereign mesh.'),
              _buildEmptyState('No highlights pinned', 'Pin your best waves and spaces to your profile.'),
              _buildEmptyState('No media shared', 'Photos and videos will appear here.'),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildStatItem(String label, String value, {Color color = QuantColors.textPrimary}) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          value,
          style: TextStyle(
            color: color,
            fontWeight: FontWeight.w800,
            fontSize: 13,
          ),
        ),
        const SizedBox(width: 4),
        Text(
          label,
          style: const TextStyle(
            color: QuantColors.textMuted,
            fontSize: 12,
          ),
        ),
      ],
    );
  }

  Widget _buildWavesTab() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: QuantColors.darkSlateCard,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: QuantColors.hairlineBorder),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Row(
                children: [
                  Text(
                    'Quant Sovereign',
                    style: TextStyle(color: QuantColors.textPrimary, fontWeight: FontWeight.w700, fontSize: 13),
                  ),
                  SizedBox(width: 4),
                  Icon(Icons.verified_rounded, size: 14, color: QuantColors.sovereignCyan),
                  SizedBox(width: 4),
                  Text('@quant_user • 1d', style: TextStyle(color: QuantColors.textMuted, fontSize: 12)),
                ],
              ),
              const SizedBox(height: 6),
              const Text(
                'Sovereign Wave node initialized. Running 120Hz Impeller direct with zero Skia bottlenecks.',
                style: TextStyle(color: QuantColors.textPrimary, fontSize: 13, height: 1.4),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  const Icon(Icons.favorite_rounded, size: 15, color: QuantColors.crimsonRed),
                  const SizedBox(width: 4),
                  const Text('42', style: TextStyle(color: QuantColors.textMuted, fontSize: 11)),
                  const SizedBox(width: 16),
                  const Icon(Icons.repeat_rounded, size: 15, color: QuantColors.emeraldMatrix),
                  const SizedBox(width: 4),
                  const Text('12', style: TextStyle(color: QuantColors.textMuted, fontSize: 11)),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildEmptyState(String title, String subtitle) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.waves_rounded, size: 40, color: QuantColors.textMuted),
          const SizedBox(height: 12),
          Text(
            title,
            style: const TextStyle(
              color: QuantColors.textPrimary,
              fontWeight: FontWeight.w700,
              fontSize: 15,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            subtitle,
            style: const TextStyle(
              color: QuantColors.textMuted,
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}

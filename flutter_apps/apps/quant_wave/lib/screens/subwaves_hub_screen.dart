// Sovereign Quant Ecosystem - QuantWave SubWaves Hub Screen
// Sovereign Reddit-Class Community Explorer & SubWaves Directory.
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & hardware acceleration).

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import '../models/wave_models.dart';

/// SubWaves Hub Community Directory & Explorer.
/// Features:
/// - Community cards with high-contrast obsidian banners.
/// - Live subscriber & active online counts.
/// - Interactive flair tag pills.
/// - Expandable community rules accordion.
/// - Real-time join/leave toggle with animated member delta.
/// - Category filtering and search.
class SubWavesHubScreen extends StatefulWidget {
  final Function(SubWaveCommunity)? onCommunitySelected;

  const SubWavesHubScreen({
    super.key,
    this.onCommunitySelected,
  });

  @override
  State<SubWavesHubScreen> createState() => _SubWavesHubScreenState();
}

class _CommunityHubEntry {
  final SubWaveCommunity community;
  final String category;
  final List<String> flairs;
  final List<String> rules;
  final String bannerGradientStart;
  final String bannerGradientEnd;

  const _CommunityHubEntry({
    required this.community,
    required this.category,
    required this.flairs,
    required this.rules,
    required this.bannerGradientStart,
    required this.bannerGradientEnd,
  });
}

class _SubWavesHubScreenState extends State<SubWavesHubScreen> {
  final TextEditingController _searchController = TextEditingController();
  String _selectedCategory = 'All';
  String _searchQuery = '';
  final Set<String> _expandedRules = {};

  late List<_CommunityHubEntry> _hubEntries;

  @override
  void initState() {
    super.initState();
    // No mock data: honestly empty until the real community backend is wired.
    // (Previously this list was hardcoded with fabricated communities,
    // member counts, flairs, and rules.)
    _hubEntries = <_CommunityHubEntry>[];
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _toggleJoin(int index) {
    setState(() {
      final entry = _hubEntries[index];
      final currentComm = entry.community;
      final newJoined = !currentComm.isJoined;
      final updatedComm = currentComm.copyWith(
        isJoined: newJoined,
        memberCount: newJoined ? currentComm.memberCount + 1 : currentComm.memberCount - 1,
      );

      _hubEntries[index] = _CommunityHubEntry(
        community: updatedComm,
        category: entry.category,
        flairs: entry.flairs,
        rules: entry.rules,
        bannerGradientStart: entry.bannerGradientStart,
        bannerGradientEnd: entry.bannerGradientEnd,
      );
    });
  }

  void _toggleRulesExpansion(String communityId) {
    setState(() {
      if (_expandedRules.contains(communityId)) {
        _expandedRules.remove(communityId);
      } else {
        _expandedRules.add(communityId);
      }
    });
  }

  List<_CommunityHubEntry> get _filteredEntries {
    return _hubEntries.where((entry) {
      final matchesCategory = _selectedCategory == 'All' || entry.category == _selectedCategory;
      final matchesSearch = _searchQuery.isEmpty ||
          entry.community.name.toLowerCase().contains(_searchQuery.toLowerCase()) ||
          entry.community.title.toLowerCase().contains(_searchQuery.toLowerCase()) ||
          entry.flairs.any((f) => f.toLowerCase().contains(_searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      appBar: AppBar(
        backgroundColor: QuantColors.voidObsidian,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: const Row(
          children: [
            Icon(Icons.explore_rounded, color: QuantColors.sovereignCyan, size: 22),
            SizedBox(width: 8),
            Text(
              'SubWaves Community Hub',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: QuantColors.textPrimary,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_circle_outline_rounded, color: Colors.white70),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Create SubWave Community dialog requested.'),
                ),
              );
            },
            tooltip: 'Create New SubWave',
          ),
        ],
      ),
      body: Column(
        children: [
          // Search & Filter Header
          _buildSearchAndFilters(),

          // Community Cards List
          Expanded(
            child: _filteredEntries.isEmpty
                // Honest empty state: no fabricated communities.
                ? const Center(
                    child: Text(
                      'No communities yet.',
                      style: TextStyle(
                        color: QuantColors.textSecondary,
                        fontSize: 14,
                      ),
                    ),
                  )
                : ListView.builder(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    physics: const BouncingScrollPhysics(),
                    itemCount: _filteredEntries.length,
                    itemBuilder: (context, index) {
                      return _buildCommunityCard(_filteredEntries[index], index);
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchAndFilters() {
    final categories = ['All', 'Systems', 'AI & Agents', 'Cryptography', 'Graphics & 120Hz'];

    return Container(
      color: QuantColors.voidObsidian,
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: Column(
        children: [
          // Search TextField
          Container(
            decoration: BoxDecoration(
              color: QuantColors.darkSlateCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: QuantColors.hairlineBorder, width: 1),
            ),
            child: TextField(
              controller: _searchController,
              onChanged: (val) => setState(() => _searchQuery = val.trim()),
              style: const TextStyle(color: Colors.white, fontSize: 13),
              decoration: InputDecoration(
                hintText: 'Search communities, flairs, and topics...',
                hintStyle: const TextStyle(color: QuantColors.textMuted, fontSize: 13),
                prefixIcon: const Icon(Icons.search_rounded, color: QuantColors.textMuted, size: 20),
                suffixIcon: _searchQuery.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.close_rounded, size: 18, color: Colors.white60),
                        onPressed: () {
                          _searchController.clear();
                          setState(() => _searchQuery = '');
                        },
                      )
                    : null,
                border: InputBorder.none,
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(vertical: 12),
              ),
            ),
          ),
          const SizedBox(height: 10),

          // Horizontal Category Filter Pills
          SizedBox(
            height: 32,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: categories.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, idx) {
                final cat = categories[idx];
                final isSelected = _selectedCategory == cat;
                return GestureDetector(
                  onTap: () => setState(() => _selectedCategory = cat),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? QuantColors.sovereignCyan.withOpacity(0.2)
                          : QuantColors.darkSlateCard,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: isSelected ? QuantColors.sovereignCyan : QuantColors.hairlineBorder,
                        width: 1,
                      ),
                    ),
                    child: Text(
                      cat,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                        color: isSelected ? Colors.white : QuantColors.textSecondary,
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCommunityCard(_CommunityHubEntry entry, int index) {
    final comm = entry.community;
    final isRulesExpanded = _expandedRules.contains(comm.id);

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: comm.isJoined ? comm.badgeColor.withOpacity(0.6) : QuantColors.hairlineBorder,
          width: 1.2,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.4),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Community Header Banner (0 clipPath, pure BoxDecoration with borderRadius)
          Container(
            height: 60,
            decoration: BoxDecoration(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(15)),
              gradient: LinearGradient(
                colors: [
                  comm.badgeColor.withOpacity(0.4),
                  QuantColors.darkSlateCard,
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: QuantColors.voidObsidian.withOpacity(0.7),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: comm.badgeColor.withOpacity(0.5)),
                  ),
                  child: Text(
                    entry.category.toUpperCase(),
                    style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w800,
                      color: comm.badgeColor,
                      letterSpacing: 0.5,
                    ),
                  ),
                ),
                Row(
                  children: [
                    Container(
                      width: 6,
                      height: 6,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        color: QuantColors.statusSuccess,
                      ),
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '${_formatNumber(comm.onlineCount)} Online',
                      style: const TextStyle(fontSize: 11, color: Colors.white70, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ],
            ),
          ),

          // Community Info Body
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Avatar, Title, Handle & Join Button Row
                Row(
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        color: comm.badgeColor.withOpacity(0.2),
                        shape: BoxShape.circle,
                        border: Border.all(color: comm.badgeColor, width: 2),
                      ),
                      child: Icon(comm.icon, color: comm.badgeColor, size: 22),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            comm.name,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: QuantColors.textPrimary,
                            ),
                          ),
                          Text(
                            comm.title,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                              color: QuantColors.textSecondary,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),

                    // Join / Leave Toggle Button
                    ElevatedButton(
                      onPressed: () => _toggleJoin(index),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: comm.isJoined
                            ? QuantColors.elevatedCard
                            : comm.badgeColor,
                        foregroundColor: Colors.white,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                          side: BorderSide(
                            color: comm.isJoined
                                ? QuantColors.hairlineBorder
                                : comm.badgeColor,
                          ),
                        ),
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                        minimumSize: const Size(80, 34),
                      ),
                      child: Text(
                        comm.isJoined ? 'Joined' : 'Join Wave',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: comm.isJoined ? Colors.white70 : Colors.white,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),

                // Description
                Text(
                  comm.description,
                  style: const TextStyle(
                    fontSize: 12,
                    color: QuantColors.textSecondary,
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 12),

                // Subscriber Telemetry Pill
                Row(
                  children: [
                    const Icon(Icons.people_outline_rounded, size: 14, color: QuantColors.textMuted),
                    const SizedBox(width: 4),
                    Text(
                      '${_formatNumber(comm.memberCount)} Subscribers',
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: QuantColors.textMuted,
                      ),
                    ),
                    const Spacer(),

                    // Rules Accordion Toggle
                    GestureDetector(
                      onTap: () => _toggleRulesExpansion(comm.id),
                      child: Row(
                        children: [
                          Icon(
                            isRulesExpanded ? Icons.rule_folder_rounded : Icons.rule_rounded,
                            size: 14,
                            color: comm.badgeColor,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            isRulesExpanded ? 'Hide Rules' : 'Community Rules (${entry.rules.length})',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: comm.badgeColor,
                            ),
                          ),
                          Icon(
                            isRulesExpanded
                                ? Icons.keyboard_arrow_up_rounded
                                : Icons.keyboard_arrow_down_rounded,
                            size: 16,
                            color: comm.badgeColor,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // Flair Pills List
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: entry.flairs.map((flair) {
                    return Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: QuantColors.elevatedCard,
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(color: QuantColors.hairlineBorder, width: 0.8),
                      ),
                      child: Text(
                        '#$flair',
                        style: const TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: QuantColors.sovereignCyan,
                        ),
                      ),
                    );
                  }).toList(),
                ),

                // Expandable Rules Accordion
                if (isRulesExpanded) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: QuantColors.elevatedCard,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: QuantColors.hairlineBorder),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Community Post Rules',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: QuantColors.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 6),
                        for (int r = 0; r < entry.rules.length; r++)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 2),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  '${r + 1}. ',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color: comm.badgeColor,
                                  ),
                                ),
                                Expanded(
                                  child: Text(
                                    entry.rules[r],
                                    style: const TextStyle(
                                      fontSize: 11,
                                      color: QuantColors.textSecondary,
                                      height: 1.3,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _formatNumber(int count) {
    if (count >= 1000000) {
      return '${(count / 1000000).toStringAsFixed(1)}M';
    } else if (count >= 1000) {
      return '${(count / 1000).toStringAsFixed(1)}K';
    }
    return count.toString();
  }
}

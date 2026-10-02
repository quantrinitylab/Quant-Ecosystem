// Sovereign Quant Ecosystem - QuantAI History Screen
// Conversation & thread archive with search, star filters, and instant thread resumption.
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import '../models/ai_models.dart';
import '../services/ai_mock_data.dart';

class HistoryScreen extends StatefulWidget {
  final Function(ChatThread)? onSelectThread;

  const HistoryScreen({super.key, this.onSelectThread});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  final TextEditingController _searchController = TextEditingController();
  late List<ChatThread> _threads;
  String _activeFilter = 'All';

  @override
  void initState() {
    super.initState();
    _threads = List.from(AiMockData.getInitialChatHistory());
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  List<ChatThread> get _filteredThreads {
    final query = _searchController.text.toLowerCase();
    return _threads.where((thread) {
      final matchesSearch = thread.title.toLowerCase().contains(query) ||
          thread.preview.toLowerCase().contains(query);
      if (!matchesSearch) return false;

      if (_activeFilter == 'Starred') {
        return thread.isStarred;
      } else if (_activeFilter == 'Quant-1.0 Pro') {
        return thread.modelId == 'quant-1.0-pro';
      } else if (_activeFilter == 'Local Llama') {
        return thread.modelId == 'local-llama-3';
      }
      return true;
    }).toList();
  }

  void _toggleStar(String id) {
    setState(() {
      final index = _threads.indexWhere((t) => t.id == id);
      if (index != -1) {
        _threads[index] =
            _threads[index].copyWith(isStarred: !_threads[index].isStarred);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final grouped = <String, List<ChatThread>>{};
    for (final thread in _filteredThreads) {
      grouped.putIfAbsent(thread.category, () => []).add(thread);
    }

    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: SafeArea(
        child: Column(
          children: [
            // Search Input Header
            _buildSearchHeader(),

            // Filter Chips
            _buildFilterChips(),

            // Categorized Threads List
            Expanded(
              child: grouped.isEmpty
                  ? _buildEmptyState()
                  : ListView(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 8),
                      children: grouped.entries.map((entry) {
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Padding(
                              padding: const EdgeInsets.symmetric(
                                  vertical: 10, horizontal: 4),
                              child: Text(
                                entry.key.toUpperCase(),
                                style: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 0.6,
                                  color: QuantColors.textMuted,
                                ),
                              ),
                            ),
                            ...entry.value.map((thread) => _buildThreadTile(thread)),
                          ],
                        );
                      }).toList(),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSearchHeader() {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      decoration: const BoxDecoration(
        color: QuantColors.voidObsidian,
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: Container(
        decoration: BoxDecoration(
          color: QuantColors.darkSlateCard,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: QuantColors.hairlineBorder, width: 1),
        ),
        child: TextField(
          controller: _searchController,
          style: const TextStyle(color: QuantColors.textPrimary, fontSize: 13),
          decoration: const InputDecoration(
            hintText: 'Search conversational threads & transcripts...',
            hintStyle: TextStyle(color: QuantColors.textMuted, fontSize: 13),
            prefixIcon: Icon(
              Icons.search_rounded,
              color: QuantColors.textMuted,
              size: 18,
            ),
            border: InputBorder.none,
            isDense: true,
            contentPadding: EdgeInsets.symmetric(vertical: 12),
          ),
          onChanged: (_) => setState(() {}),
        ),
      ),
    );
  }

  Widget _buildFilterChips() {
    final filters = ['All', 'Starred', 'Quant-1.0 Pro', 'Local Llama'];

    return Container(
      height: 44,
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: filters.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final filter = filters[index];
          final isSelected = filter == _activeFilter;

          return InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: () => setState(() => _activeFilter = filter),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(
                color: isSelected
                    ? QuantColors.cosmicCyan.withOpacity(0.18)
                    : QuantColors.elevatedCard,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: isSelected
                      ? QuantColors.cosmicCyan
                      : QuantColors.hairlineBorder,
                ),
              ),
              child: Center(
                child: Text(
                  filter,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                    color: isSelected
                        ? QuantColors.cosmicCyan
                        : QuantColors.textSecondary,
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildThreadTile(ChatThread thread) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: QuantColors.hairlineBorder, width: 1),
      ),
      child: ListTile(
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        onTap: () {
          widget.onSelectThread?.call(thread);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              backgroundColor: QuantColors.darkSlateCard,
              content: Text(
                'Loaded thread: ${thread.title}',
                style: const TextStyle(color: QuantColors.textPrimary),
              ),
              duration: const Duration(seconds: 1),
            ),
          );
        },
        leading: Container(
          width: 38,
          height: 38,
          decoration: BoxDecoration(
            color: QuantColors.elevatedCard,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: QuantColors.hairlineBorder),
          ),
          child: const Center(
            child: Icon(
              Icons.chat_bubble_outline_rounded,
              color: QuantColors.cosmicCyan,
              size: 18,
            ),
          ),
        ),
        title: Row(
          children: [
            Expanded(
              child: Text(
                thread.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: QuantColors.textPrimary,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Text(
              thread.timestamp,
              style: const TextStyle(
                fontSize: 10,
                color: QuantColors.textMuted,
              ),
            ),
          ],
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                thread.preview,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 11,
                  color: QuantColors.textSecondary,
                ),
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                    decoration: BoxDecoration(
                      color: QuantColors.voidObsidian,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      thread.modelId,
                      style: const TextStyle(
                        fontSize: 9,
                        fontFamily: 'monospace',
                        color: QuantColors.cosmicCyan,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '${thread.messageCount} messages',
                    style: const TextStyle(
                      fontSize: 10,
                      color: QuantColors.textMuted,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        trailing: IconButton(
          icon: Icon(
            thread.isStarred
                ? Icons.star_rounded
                : Icons.star_outline_rounded,
            color: thread.isStarred
                ? QuantColors.sunsetGold
                : QuantColors.textMuted,
            size: 20,
          ),
          onPressed: () => _toggleStar(thread.id),
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return const Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.search_off_rounded,
            size: 40,
            color: QuantColors.textMuted,
          ),
          SizedBox(height: 12),
          Text(
            'No matching conversation threads found.',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: QuantColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

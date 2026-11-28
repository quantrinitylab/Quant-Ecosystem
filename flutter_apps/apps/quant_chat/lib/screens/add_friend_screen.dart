// QuantChat Add Friends — Phase 2A.
// Strictly ZERO raw Unicode emojis throughout this file.
//
// Friend search/add destination opened from the chat list header's add-friend
// button, the overflow menu, and the empty state. Search filters the people
// the user may know; Add buttons move a suggestion into "Added Me".
//
// Privacy honesty: end-to-end encryption is NOT enabled yet — nothing here
// claims it.

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';

import '../models/chat_list_models.dart';

/// Friend search + add screen.
///
/// [addedMe] / [suggestions] are the live lists from the chat list
/// repository; the callbacks mutate the repository so the chat list reflects
/// every change when this screen pops.
class AddFriendScreen extends StatefulWidget {
  final List<FriendRequest> addedMe;
  final List<FriendSuggestion> suggestions;
  final ValueChanged<String> onAccept;
  final ValueChanged<String> onIgnore;
  final ValueChanged<String> onAdd;
  final ValueChanged<String> onDismiss;

  const AddFriendScreen({
    super.key,
    required this.addedMe,
    required this.suggestions,
    required this.onAccept,
    required this.onIgnore,
    required this.onAdd,
    required this.onDismiss,
  });

  @override
  State<AddFriendScreen> createState() => _AddFriendScreenState();
}

class _AddFriendScreenState extends State<AddFriendScreen> {
  String _query = '';
  final TextEditingController _searchController = TextEditingController();
  final Set<String> _addedIds = <String>{};

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  List<FriendSuggestion> get _filteredSuggestions {
    if (_query.isEmpty) return widget.suggestions;
    final q = _query.toLowerCase();
    return widget.suggestions
        .where((s) =>
            s.name.toLowerCase().contains(q) ||
            s.handle.toLowerCase().contains(q))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final suggestions = _filteredSuggestions;
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      appBar: AppBar(
        backgroundColor: QuantColors.voidObsidian,
        elevation: 0,
        leading: IconButton(
          tooltip: 'Back to chats',
          icon: const Icon(Icons.arrow_back_rounded,
              color: QuantColors.textSecondary),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const Text(
          'Add Friends',
          style: TextStyle(
            color: Colors.white,
            fontSize: 17,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            _buildSearchField(),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.only(bottom: 32),
                children: [
                  if (widget.addedMe.isNotEmpty) ...[
                    _buildSectionHeader('ADDED YOU', count: widget.addedMe.length),
                    ...widget.addedMe.map(_buildRequestRow),
                  ],
                  _buildSectionHeader('PEOPLE YOU MAY KNOW'),
                  if (suggestions.isEmpty)
                    _buildNoResults()
                  else
                    ...suggestions.map(_buildSuggestionRow),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSearchField() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      child: Container(
        height: 46,
        decoration: BoxDecoration(
          color: QuantColors.darkSlateCard,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: QuantColors.hairlineBorder),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: Row(
          children: [
            const Icon(Icons.search_rounded,
                color: QuantColors.textMuted, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: TextField(
                controller: _searchController,
                onChanged: (val) => setState(() => _query = val),
                style: const TextStyle(
                    color: QuantColors.textPrimary, fontSize: 14),
                decoration: const InputDecoration(
                  hintText: 'Search by name or handle',
                  hintStyle:
                      TextStyle(color: QuantColors.textMuted, fontSize: 13),
                  border: InputBorder.none,
                  isDense: true,
                  contentPadding: EdgeInsets.zero,
                ),
              ),
            ),
            if (_query.isNotEmpty)
              IconButton(
                tooltip: 'Clear search',
                icon: const Icon(Icons.close_rounded,
                    size: 18, color: QuantColors.textMuted),
                onPressed: () {
                  _searchController.clear();
                  setState(() => _query = '');
                },
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionHeader(String title, {int? count}) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Row(
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.8,
              color: QuantColors.textMuted,
            ),
          ),
          if (count != null) ...[
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
              decoration: BoxDecoration(
                color: QuantColors.elevatedCard,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                '$count',
                style: const TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: QuantColors.textSecondary,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildAvatar(String initials, Color color, double size) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: color.withOpacity(0.16),
        border: Border.all(color: color.withOpacity(0.45), width: 1.2),
      ),
      child: Center(
        child: Text(
          initials,
          style: TextStyle(
            color: color,
            fontSize: size * 0.36,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }

  Widget _buildRequestRow(FriendRequest request) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 3),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: QuantColors.darkSlateCard,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: QuantColors.hairlineBorder),
        ),
        child: Row(
          children: [
            _buildAvatar(
                request.avatarInitials, request.avatarColor, 46),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    request.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    '${request.mutualFriends} mutual friends · added you ${request.timeLabel}',
                    style: const TextStyle(
                      fontSize: 12,
                      color: QuantColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            ElevatedButton(
              onPressed: () => widget.onAccept(request.id),
              style: ElevatedButton.styleFrom(
                backgroundColor: QuantColors.moltenOrange,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(18),
                ),
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: const Text(
                'Accept',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
              ),
            ),
            TextButton(
              onPressed: () => widget.onIgnore(request.id),
              child: const Text(
                'Ignore',
                style: TextStyle(
                  color: QuantColors.textMuted,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSuggestionRow(FriendSuggestion suggestion) {
    final added = _addedIds.contains(suggestion.id);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 3),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: QuantColors.darkSlateCard,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: QuantColors.hairlineBorder),
        ),
        child: Row(
          children: [
            _buildAvatar(
                suggestion.avatarInitials, suggestion.avatarColor, 46),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    suggestion.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    suggestion.subtitle,
                    style: const TextStyle(
                      fontSize: 12,
                      color: QuantColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            if (added)
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 8),
                child: Text(
                  'Added',
                  style: TextStyle(
                    color: QuantColors.statusSuccess,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              )
            else
              OutlinedButton(
                onPressed: () {
                  widget.onAdd(suggestion.id);
                  setState(() => _addedIds.add(suggestion.id));
                },
                style: OutlinedButton.styleFrom(
                  foregroundColor: QuantColors.moltenOrange,
                  side: const BorderSide(color: QuantColors.moltenOrange),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(18),
                  ),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: const Text(
                  'Add',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                ),
              ),
            Semantics(
              label: 'Dismiss ${suggestion.name}',
              button: true,
              child: IconButton(
                tooltip: 'Dismiss ${suggestion.name}',
                onPressed: () => widget.onDismiss(suggestion.id),
                icon: const Icon(
                  Icons.close_rounded,
                  color: QuantColors.textMuted,
                  size: 18,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNoResults() {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 40, horizontal: 24),
      child: Center(
        child: Text(
          'No people match your search.',
          style: TextStyle(
            fontSize: 13,
            color: QuantColors.textSecondary,
          ),
        ),
      ),
    );
  }
}

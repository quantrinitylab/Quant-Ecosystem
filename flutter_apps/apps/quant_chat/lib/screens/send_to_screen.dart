// Sovereign Quant Ecosystem - QuantChat Send To sheet.
// Strictly ZERO raw Unicode emojis throughout this file.
//
// Upgraded recipient picker opened from the snap editor's "Send To" action.
// Sections: Expiry (must be chosen before send), Stories (stub rows with
// TODOs), Recents (recipients), Quick Add (stub). Selecting any row reveals
// an accent bottom action bar with the expiry + destination pill and a
// circular send button.

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';

import 'snap_editor_screen.dart';

/// Result returned when the user confirms a send destination.
class SendToResult {
  /// Recipient rows selected for a direct send.
  final List<SnapRecipient> recipients;

  /// Non-null when a story row was selected (posting is not implemented
  /// yet; the editor shows the stub message instead of sending).
  final String? storyDestination;

  /// Expiry chosen in the sheet.
  final SnapExpiry expiry;

  const SendToResult({
    required this.recipients,
    this.storyDestination,
    required this.expiry,
  });
}

class _StoryOption {
  final String title;
  final String subtitle;

  const _StoryOption(this.title, this.subtitle);
}

const List<_StoryOption> _storyOptions = [
  _StoryOption('My Story · Friends Only', 'Just for friends'),
  _StoryOption('My Story · Public', 'Friends, followers and everyone'),
  _StoryOption('Place story', 'Add to the map and place story'),
];

/// Tall bottom sheet: pick where this snap goes and how long it lives.
class SendToSheet extends StatefulWidget {
  final List<SnapRecipient> recipients;
  final SnapExpiry initialExpiry;

  const SendToSheet({
    super.key,
    this.recipients = const [],
    this.initialExpiry = SnapExpiry.tenSeconds,
  });

  @override
  State<SendToSheet> createState() => _SendToSheetState();
}

class _SendToSheetState extends State<SendToSheet> {
  late SnapExpiry _expiry;
  int? _storyIndex;
  final Set<String> _selectedRecipientIds = <String>{};
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _expiry = widget.initialExpiry;
  }

  bool get _hasSelection =>
      _storyIndex != null || _selectedRecipientIds.isNotEmpty;

  String get _destinationLabel {
    if (_storyIndex != null) {
      return _storyOptions[_storyIndex!].title;
    }
    final names = widget.recipients
        .where((r) => _selectedRecipientIds.contains(r.id))
        .map((r) => r.displayName)
        .toList();
    if (names.isEmpty) return '';
    if (names.length == 1) return names.first;
    return '${names.first} +${names.length - 1}';
  }

  List<SnapRecipient> get _filteredRecipients {
    if (_searchQuery.isEmpty) return widget.recipients;
    final q = _searchQuery.toLowerCase();
    return widget.recipients
        .where((r) => r.displayName.toLowerCase().contains(q))
        .toList();
  }

  void _selectStory(int index) {
    setState(() {
      _storyIndex = _storyIndex == index ? null : index;
      if (_storyIndex != null) _selectedRecipientIds.clear();
    });
  }

  void _toggleRecipient(String id) {
    setState(() {
      if (_selectedRecipientIds.remove(id)) {
        // Deselected.
      } else {
        _selectedRecipientIds.add(id);
        _storyIndex = null;
      }
    });
  }

  void _confirmSend() {
    if (_storyIndex != null) {
      // TODO: post to the story destination once the story backend exists.
      Navigator.of(context).pop(SendToResult(
        recipients: const [],
        storyDestination: _storyOptions[_storyIndex!].title,
        expiry: _expiry,
      ));
      return;
    }
    final audience = widget.recipients
        .where((r) => _selectedRecipientIds.contains(r.id))
        .toList();
    if (audience.isEmpty) return;
    Navigator.of(context).pop(SendToResult(
      recipients: audience,
      expiry: _expiry,
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.88,
      ),
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(24),
          topRight: Radius.circular(24),
        ),
        border: Border(
          top: BorderSide(color: QuantColors.hairlineBorder, width: 1.5),
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 12),
          Center(
            child: Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: QuantColors.activeBorder,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          _buildHeader(),
          Flexible(
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.only(bottom: 8),
              children: [
                _buildSectionTitle('EXPIRY'),
                for (final option in SnapExpiry.values) _buildExpiryRow(option),
                _buildSectionTitle(
                  'STORIES',
                  trailing: TextButton(
                    onPressed: () {
                      // TODO: implement creating a new story destination.
                      _showMessage('New stories are not implemented yet.');
                    },
                    style: TextButton.styleFrom(
                      foregroundColor: QuantColors.neonGreen,
                    ),
                    child: const Text(
                      '+ New Story',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
                for (var i = 0; i < _storyOptions.length; i++)
                  _buildStoryRow(i),
                _buildSectionTitle('RECENTS'),
                if (_filteredRecipients.isEmpty)
                  const Padding(
                    padding: EdgeInsets.fromLTRB(20, 8, 20, 16),
                    child: Text(
                      'No recipients yet. Add contacts to send snaps.',
                      style: TextStyle(
                        color: QuantColors.textMuted,
                        fontSize: 13,
                      ),
                    ),
                  )
                else
                  for (final recipient in _filteredRecipients)
                    _buildRecipientRow(recipient),
                _buildSectionTitle('QUICK ADD'),
                const Padding(
                  padding: EdgeInsets.fromLTRB(20, 8, 20, 16),
                  child: Text(
                    'Friend suggestions are not implemented yet.',
                    style: TextStyle(
                      color: QuantColors.textMuted,
                      fontSize: 13,
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (_hasSelection) _buildActionBar(),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------- header

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 4),
      child: Row(
        children: [
          IconButton(
            tooltip: 'Back',
            onPressed: () => Navigator.of(context).pop(),
            icon: const Icon(
              Icons.keyboard_arrow_down_rounded,
              color: Colors.white,
            ),
          ),
          Expanded(
            child: Container(
              height: 40,
              decoration: BoxDecoration(
                color: QuantColors.elevatedCard,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: QuantColors.hairlineBorder),
              ),
              child: TextField(
                onChanged: (v) => setState(() => _searchQuery = v.trim()),
                style: const TextStyle(
                  color: QuantColors.textPrimary,
                  fontSize: 14,
                ),
                decoration: const InputDecoration(
                  hintText: 'Search',
                  hintStyle: TextStyle(
                    color: QuantColors.textMuted,
                    fontSize: 14,
                  ),
                  prefixIcon: Icon(
                    Icons.search_rounded,
                    color: QuantColors.textMuted,
                    size: 18,
                  ),
                  border: InputBorder.none,
                  contentPadding: EdgeInsets.symmetric(vertical: 10),
                ),
              ),
            ),
          ),
          const SizedBox(width: 4),
          const IconButton(
            tooltip: 'Recipients',
            onPressed: null,
            icon: Icon(
              Icons.people_rounded,
              color: QuantColors.textMuted,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionTitle(String title, {Widget? trailing}) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 12, 2),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: const TextStyle(
                color: QuantColors.textMuted,
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.5,
              ),
            ),
          ),
          if (trailing != null) trailing,
        ],
      ),
    );
  }

  // ----------------------------------------------------------------- rows

  Widget _buildExpiryRow(SnapExpiry option) {
    return RadioListTile<SnapExpiry>(
      value: option,
      groupValue: _expiry,
      activeColor: QuantColors.neonGreen,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12),
      dense: true,
      title: Text(
        option.label,
        style: const TextStyle(
          color: QuantColors.textPrimary,
          fontSize: 14,
          fontWeight: FontWeight.w600,
        ),
      ),
      onChanged: (v) {
        if (v != null) setState(() => _expiry = v);
      },
    );
  }

  Widget _buildStoryRow(int index) {
    final option = _storyOptions[index];
    final selected = _storyIndex == index;
    return _buildSelectRow(
      selected: selected,
      onTap: () => _selectStory(index),
      avatar: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: QuantColors.elevatedCard,
          shape: BoxShape.circle,
          border: Border.all(color: QuantColors.hairlineBorder),
        ),
        child: const Icon(
          Icons.auto_stories_rounded,
          color: QuantColors.textMuted,
          size: 20,
        ),
      ),
      title: option.title,
      subtitle: option.subtitle,
    );
  }

  Widget _buildRecipientRow(SnapRecipient recipient) {
    final selected = _selectedRecipientIds.contains(recipient.id);
    return _buildSelectRow(
      selected: selected,
      onTap: () => _toggleRecipient(recipient.id),
      avatar: Container(
        width: 44,
        height: 44,
        decoration: const BoxDecoration(
          color: QuantColors.elevatedCard,
          shape: BoxShape.circle,
        ),
        alignment: Alignment.center,
        child: Text(
          recipient.displayName.isNotEmpty
              ? recipient.displayName[0].toUpperCase()
              : '?',
          style: const TextStyle(
            color: QuantColors.textSecondary,
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      title: recipient.displayName,
      subtitle: 'Recent contact',
    );
  }

  Widget _buildSelectRow({
    required bool selected,
    required VoidCallback onTap,
    required Widget avatar,
    required String title,
    required String subtitle,
  }) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
        child: Row(
          children: [
            avatar,
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      color: QuantColors.textPrimary,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      color: QuantColors.textMuted,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            _buildSelectCircle(selected),
          ],
        ),
      ),
    );
  }

  Widget _buildSelectCircle(bool selected) {
    return Container(
      width: 24,
      height: 24,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: selected ? QuantColors.neonGreen : Colors.transparent,
        border: Border.all(
          color: selected ? QuantColors.neonGreen : QuantColors.activeBorder,
          width: 1.5,
        ),
      ),
      child: selected
          ? const Icon(Icons.check_rounded, color: Colors.white, size: 15)
          : null,
    );
  }

  // ------------------------------------------------------------ action bar

  /// Accent action bar revealed when a row is selected: expiry pill,
  /// destination pill and a circular send button.
  Widget _buildActionBar() {
    return Container(
      color: QuantColors.neonGreen,
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            _buildPill(
              _expiry.label,
              background: Colors.black.withOpacity(0.22),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _buildPill(
                _destinationLabel,
                background: Colors.white.withOpacity(0.18),
              ),
            ),
            const SizedBox(width: 8),
            GestureDetector(
              onTap: _confirmSend,
              child: Container(
                width: 48,
                height: 48,
                decoration: const BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.send_rounded,
                  color: QuantColors.neonGreen,
                  size: 20,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPill(String label, {required Color background}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 13,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }

  void _showMessage(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        content: Text(
          message,
          style: const TextStyle(color: QuantColors.textPrimary),
        ),
      ),
    );
  }
}

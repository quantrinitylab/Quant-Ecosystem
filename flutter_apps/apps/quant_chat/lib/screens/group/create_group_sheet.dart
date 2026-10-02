// Sovereign Quant Ecosystem - QuantChat Create Group Sheet
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_theme/quant_theme.dart';
import '../../models/chat_models.dart';
import '../../services/chat_mock_data.dart';

class CreateGroupSheet extends StatefulWidget {
  final Function(ChatConversation)? onGroupCreated;

  const CreateGroupSheet({
    super.key,
    this.onGroupCreated,
  });

  static Future<ChatConversation?> show(
    BuildContext context, {
    Function(ChatConversation)? onCreated,
  }) {
    return showModalBottomSheet<ChatConversation>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => CreateGroupSheet(onGroupCreated: onCreated),
    );
  }

  @override
  State<CreateGroupSheet> createState() => _CreateGroupSheetState();
}

class _CreateGroupSheetState extends State<CreateGroupSheet> {
  final TextEditingController _subjectController = TextEditingController();
  final TextEditingController _descriptionController = TextEditingController();
  final TextEditingController _searchController = TextEditingController();

  late List<ChatGroupMember> _availableContacts;
  final Set<String> _selectedContactIds = {};
  String _searchFilter = '';

  // Avatar & Theme customization
  Color _selectedAvatarColor = QuantColors.sovereignCyan;
  final List<Color> _avatarColorPalette = const [
    QuantColors.sovereignCyan,
    QuantColors.moltenOrange,
    QuantColors.obsidianPurple,
    QuantColors.emeraldMatrix,
    QuantColors.sunsetGold,
    QuantColors.crimsonRed,
  ];

  // Admin toggles
  bool _onlyAdminsSendMessages = false;
  bool _onlyAdminsEditInfo = true;
  bool _approveNewMembers = false;

  // Disappearing messages timer
  DisappearingTimerOption _selectedDisappearingOption = DisappearingTimerOption.off;

  @override
  void initState() {
    super.initState();
    _availableContacts = ChatMockData.getInitialGroupMembers();
    // Pre-select first 2 contacts as default invitees
    if (_availableContacts.length >= 2) {
      _selectedContactIds.add(_availableContacts[0].id);
      _selectedContactIds.add(_availableContacts[1].id);
    }
  }

  @override
  void dispose() {
    _subjectController.dispose();
    _descriptionController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  List<ChatGroupMember> get _filteredContacts {
    if (_searchFilter.trim().isEmpty) return _availableContacts;
    return _availableContacts.where((c) {
      return c.name.toLowerCase().contains(_searchFilter.toLowerCase()) ||
          c.phoneOrHandle.toLowerCase().contains(_searchFilter.toLowerCase());
    }).toList();
  }

  List<ChatGroupMember> get _selectedContacts {
    return _availableContacts
        .where((c) => _selectedContactIds.contains(c.id))
        .toList();
  }

  void _handleCreateGroup() {
    final subject = _subjectController.text.trim();
    if (subject.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          backgroundColor: QuantColors.darkSlateCard,
          content: Text(
            'Please enter a group subject.',
            style: TextStyle(color: QuantColors.statusError),
          ),
        ),
      );
      return;
    }

    if (_selectedContactIds.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          backgroundColor: QuantColors.darkSlateCard,
          content: Text(
            'Select at least one member to join the group.',
            style: TextStyle(color: QuantColors.statusError),
          ),
        ),
      );
      return;
    }

    final initials = subject
        .split(' ')
        .where((w) => w.isNotEmpty)
        .take(2)
        .map((w) => w[0].toUpperCase())
        .join();

    final newConversation = ChatConversation(
      id: 'grp-${DateTime.now().millisecondsSinceEpoch}',
      contactId: 'group-broadcast',
      name: subject,
      avatarInitials: initials.isEmpty ? 'GP' : initials,
      avatarColor: _selectedAvatarColor,
      lastMessage: 'Group created with ${_selectedContactIds.length + 1} members',
      lastMessageTime: 'Just now',
      unreadCount: 0,
      isOnline: true,
      isGroup: true,
      memberCount: _selectedContactIds.length + 1,
      groupDescription: _descriptionController.text.trim(),
      disappearingOption: _selectedDisappearingOption,
      isDisappearingModeEnabled: _selectedDisappearingOption != DisappearingTimerOption.off,
      defaultDisappearingDurationSeconds: _selectedDisappearingOption.seconds,
    );

    widget.onGroupCreated?.call(newConversation);
    Navigator.of(context).pop(newConversation);
  }

  @override
  Widget build(BuildContext context) {
    final height = MediaQuery.of(context).size.height * 0.90;
    final selectedList = _selectedContacts;

    return Container(
      height: height,
      decoration: const BoxDecoration(
        color: QuantColors.voidObsidian,
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(24),
          topRight: Radius.circular(24),
        ),
        border: Border(
          top: BorderSide(color: QuantColors.hairlineBorder, width: 1.5),
          left: BorderSide(color: QuantColors.hairlineBorder, width: 1),
          right: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: Column(
        children: [
          // Drag handle & Header
          _buildDragHandleAndHeader(),

          // Scrollable Body
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
              children: [
                // Avatar Picker & Group Subject Input
                _buildAvatarAndSubjectInput(),

                const SizedBox(height: 18),

                // Selected Contact Chips (Multi-contact selection chips)
                if (selectedList.isNotEmpty) ...[
                  _buildSelectedChipsRow(selectedList),
                  const SizedBox(height: 18),
                ],

                // Disappearing Messages Dropdown
                _buildDisappearingDropdown(),

                const SizedBox(height: 18),

                // Group Governance & Admin Toggles
                _buildAdminTogglesCard(),

                const SizedBox(height: 20),

                // Member Discovery & Search Header
                _buildContactSearchHeader(),

                const SizedBox(height: 10),

                // Contact Selection List
                _buildContactSelectionList(),
              ],
            ),
          ),

          // Bottom Action Bar
          _buildBottomActionBar(),
        ],
      ),
    );
  }

  Widget _buildDragHandleAndHeader() {
    return Container(
      padding: const EdgeInsets.only(top: 10, bottom: 12, left: 20, right: 12),
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(24),
          topRight: Radius.circular(24),
        ),
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: Column(
        children: [
          Container(
            width: 38,
            height: 4,
            decoration: BoxDecoration(
              color: QuantColors.activeBorder,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: QuantColors.sovereignCyan.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: QuantColors.sovereignCyan.withOpacity(0.4),
                  ),
                ),
                child: const Icon(
                  Icons.group_add_rounded,
                  color: QuantColors.sovereignCyan,
                  size: 20,
                ),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Create Sovereign Group',
                      style: TextStyle(
                        color: QuantColors.textPrimary,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      'End-to-End Encrypted Group Mesh',
                      style: TextStyle(
                        color: QuantColors.textSecondary,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close_rounded, color: QuantColors.textSecondary),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildAvatarAndSubjectInput() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Avatar Placeholder Squircle with Camera Badge
              InkWell(
                onTap: _showAvatarPaletteSelector,
                borderRadius: BorderRadius.circular(18),
                child: Container(
                  width: 60,
                  height: 60,
                  decoration: BoxDecoration(
                    color: _selectedAvatarColor.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: _selectedAvatarColor, width: 2),
                  ),
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      Icon(
                        Icons.groups_rounded,
                        color: _selectedAvatarColor,
                        size: 30,
                      ),
                      Positioned(
                        right: 0,
                        bottom: 0,
                        child: Container(
                          padding: const EdgeInsets.all(3),
                          decoration: const BoxDecoration(
                            color: QuantColors.voidObsidian,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.camera_alt_rounded,
                            color: Colors.white,
                            size: 13,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 14),

              // Group Subject TextField
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    TextField(
                      controller: _subjectController,
                      maxLength: 40,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                      decoration: const InputDecoration(
                        labelText: 'Group Subject',
                        labelStyle: TextStyle(color: QuantColors.textSecondary, fontSize: 13),
                        hintText: 'Enter sovereign channel name...',
                        hintStyle: TextStyle(color: QuantColors.textMuted, fontSize: 13),
                        counterStyle: TextStyle(color: QuantColors.textMuted, fontSize: 10),
                        isDense: true,
                        contentPadding: EdgeInsets.symmetric(vertical: 8),
                        enabledBorder: UnderlineInputBorder(
                          borderSide: BorderSide(color: QuantColors.hairlineBorder),
                        ),
                        focusedBorder: UnderlineInputBorder(
                          borderSide: BorderSide(color: QuantColors.sovereignCyan),
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    TextField(
                      controller: _descriptionController,
                      maxLines: 2,
                      style: const TextStyle(
                        color: QuantColors.textPrimary,
                        fontSize: 13,
                      ),
                      decoration: const InputDecoration(
                        hintText: 'Topic / Description (Optional)',
                        hintStyle: TextStyle(color: QuantColors.textMuted, fontSize: 12),
                        isDense: true,
                        border: InputBorder.none,
                        contentPadding: EdgeInsets.zero,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Accent Color Palette
          Row(
            children: [
              const Text(
                'Avatar Tint:',
                style: TextStyle(color: QuantColors.textSecondary, fontSize: 12),
              ),
              const SizedBox(width: 10),
              ..._avatarColorPalette.map((color) {
                final isSelected = color == _selectedAvatarColor;
                return GestureDetector(
                  onTap: () => setState(() => _selectedAvatarColor = color),
                  child: Container(
                    margin: const EdgeInsets.only(right: 8),
                    width: 20,
                    height: 20,
                    decoration: BoxDecoration(
                      color: color,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: isSelected ? Colors.white : Colors.transparent,
                        width: 2,
                      ),
                    ),
                  ),
                );
              }),
            ],
          ),
        ],
      ),
    );
  }

  void _showAvatarPaletteSelector() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        content: Text(
          'Select avatar tint color from the chips above.',
          style: TextStyle(color: QuantColors.textPrimary),
        ),
      ),
    );
  }

  Widget _buildSelectedChipsRow(List<ChatGroupMember> selected) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'SELECTED MEMBERS (${selected.length})',
              style: const TextStyle(
                color: QuantColors.textMuted,
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.5,
              ),
            ),
            GestureDetector(
              onTap: () => setState(() => _selectedContactIds.clear()),
              child: const Text(
                'Clear All',
                style: TextStyle(
                  color: QuantColors.sovereignCyan,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        SizedBox(
          height: 38,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: selected.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (context, idx) {
              final member = selected[idx];
              return Container(
                padding: const EdgeInsets.only(left: 4, right: 8, top: 4, bottom: 4),
                decoration: BoxDecoration(
                  color: QuantColors.darkSlateCard,
                  borderRadius: BorderRadius.circular(19),
                  border: Border.all(color: member.avatarColor.withOpacity(0.5)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircleAvatar(
                      radius: 14,
                      backgroundColor: member.avatarColor.withOpacity(0.2),
                      child: Text(
                        member.avatarInitials,
                        style: TextStyle(
                          color: member.avatarColor,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      member.name.split(' ').first,
                      style: const TextStyle(
                        color: QuantColors.textPrimary,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(width: 4),
                    GestureDetector(
                      onTap: () => setState(() => _selectedContactIds.remove(member.id)),
                      child: const Icon(
                        Icons.cancel_rounded,
                        size: 16,
                        color: QuantColors.textMuted,
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildDisappearingDropdown() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: QuantColors.moltenOrange.withOpacity(0.15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(
              Icons.timer_outlined,
              color: QuantColors.moltenOrange,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Disappearing Messages',
                  style: TextStyle(
                    color: QuantColors.textPrimary,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  'HTTP 410 server destruction timer',
                  style: TextStyle(
                    color: QuantColors.textSecondary,
                    fontSize: 11,
                  ),
                ),
              ],
            ),
          ),
          DropdownButton<DisappearingTimerOption>(
            value: _selectedDisappearingOption,
            dropdownColor: QuantColors.elevatedCard,
            underline: const SizedBox(),
            icon: const Icon(Icons.arrow_drop_down_rounded, color: QuantColors.textSecondary),
            style: const TextStyle(
              color: QuantColors.sovereignCyan,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
            items: DisappearingTimerOption.values.map((opt) {
              return DropdownMenuItem(
                value: opt,
                child: Text(opt.label),
              );
            }).toList(),
            onChanged: (val) {
              if (val != null) {
                setState(() => _selectedDisappearingOption = val);
              }
            },
          ),
        ],
      ),
    );
  }

  Widget _buildAdminTogglesCard() {
    return Container(
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.only(left: 16, right: 16, top: 12, bottom: 8),
            child: Row(
              children: [
                Icon(Icons.shield_outlined, size: 16, color: QuantColors.obsidianPurple),
                SizedBox(width: 8),
                Text(
                  'GROUP PERMISSIONS & GOVERNANCE',
                  style: TextStyle(
                    color: QuantColors.textMuted,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                  ),
                ),
              ],
            ),
          ),
          const Divider(color: QuantColors.hairlineBorder, height: 1),

          // Toggle 1: Only Admins Send Messages
          SwitchListTile(
            value: _onlyAdminsSendMessages,
            activeColor: QuantColors.sovereignCyan,
            dense: true,
            title: const Text(
              'Only Admins Can Send Messages',
              style: TextStyle(color: QuantColors.textPrimary, fontSize: 13, fontWeight: FontWeight.w600),
            ),
            subtitle: const Text(
              'Transform channel into broadcast announcement feed',
              style: TextStyle(color: QuantColors.textSecondary, fontSize: 11),
            ),
            onChanged: (val) => setState(() => _onlyAdminsSendMessages = val),
          ),
          const Divider(color: QuantColors.hairlineBorder, height: 1),

          // Toggle 2: Only Admins Edit Info
          SwitchListTile(
            value: _onlyAdminsEditInfo,
            activeColor: QuantColors.sovereignCyan,
            dense: true,
            title: const Text(
              'Only Admins Can Edit Info',
              style: TextStyle(color: QuantColors.textPrimary, fontSize: 13, fontWeight: FontWeight.w600),
            ),
            subtitle: const Text(
              'Restrict subject, topic, and avatar changes to admins',
              style: TextStyle(color: QuantColors.textSecondary, fontSize: 11),
            ),
            onChanged: (val) => setState(() => _onlyAdminsEditInfo = val),
          ),
          const Divider(color: QuantColors.hairlineBorder, height: 1),

          // Toggle 3: Approve New Members
          SwitchListTile(
            value: _approveNewMembers,
            activeColor: QuantColors.sovereignCyan,
            dense: true,
            title: const Text(
              'Approve New Members',
              style: TextStyle(color: QuantColors.textPrimary, fontSize: 13, fontWeight: FontWeight.w600),
            ),
            subtitle: const Text(
              'Require admin signature before new peers join mesh',
              style: TextStyle(color: QuantColors.textSecondary, fontSize: 11),
            ),
            onChanged: (val) => setState(() => _approveNewMembers = val),
          ),
        ],
      ),
    );
  }

  Widget _buildContactSearchHeader() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'ADD PARTICIPANTS',
          style: TextStyle(
            color: QuantColors.textMuted,
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
          ),
        ),
        const SizedBox(height: 8),
        Container(
          height: 42,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: QuantColors.darkSlateCard,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: QuantColors.hairlineBorder),
          ),
          child: Row(
            children: [
              const Icon(Icons.search_rounded, color: QuantColors.textMuted, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: _searchController,
                  onChanged: (val) => setState(() => _searchFilter = val),
                  style: const TextStyle(color: Colors.white, fontSize: 13),
                  decoration: const InputDecoration(
                    hintText: 'Search contacts by name or @handle...',
                    hintStyle: TextStyle(color: QuantColors.textMuted, fontSize: 12),
                    border: InputBorder.none,
                    isDense: true,
                  ),
                ),
              ),
              if (_searchFilter.isNotEmpty)
                GestureDetector(
                  onTap: () {
                    _searchController.clear();
                    setState(() => _searchFilter = '');
                  },
                  child: const Icon(Icons.close_rounded, color: QuantColors.textMuted, size: 16),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildContactSelectionList() {
    final contacts = _filteredContacts;

    return Container(
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Column(
        children: contacts.asMap().entries.map((entry) {
          final idx = entry.key;
          final contact = entry.value;
          final isSelected = _selectedContactIds.contains(contact.id);

          return Column(
            children: [
              if (idx > 0) const Divider(color: QuantColors.hairlineBorder, height: 1),
              InkWell(
                onTap: () {
                  setState(() {
                    if (isSelected) {
                      _selectedContactIds.remove(contact.id);
                    } else {
                      _selectedContactIds.add(contact.id);
                    }
                  });
                },
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  child: Row(
                    children: [
                      // Avatar
                      Stack(
                        children: [
                          Container(
                            width: 38,
                            height: 38,
                            decoration: BoxDecoration(
                              color: contact.avatarColor.withOpacity(0.2),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: contact.avatarColor.withOpacity(0.6),
                              ),
                            ),
                            child: Center(
                              child: Text(
                                contact.avatarInitials,
                                style: TextStyle(
                                  color: contact.avatarColor,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ),
                          if (contact.isOnline)
                            Positioned(
                              right: 0,
                              bottom: 0,
                              child: Container(
                                width: 9,
                                height: 9,
                                decoration: BoxDecoration(
                                  color: QuantColors.statusSuccess,
                                  shape: BoxShape.circle,
                                  border: Border.all(
                                    color: QuantColors.voidObsidian,
                                    width: 1.5,
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(width: 12),

                      // Name & Handle
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              contact.name,
                              style: const TextStyle(
                                color: QuantColors.textPrimary,
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            Text(
                              contact.phoneOrHandle,
                              style: const TextStyle(
                                color: QuantColors.textSecondary,
                                fontSize: 11,
                              ),
                            ),
                          ],
                        ),
                      ),

                      // Selection Checkbox Vector
                      Container(
                        width: 22,
                        height: 22,
                        decoration: BoxDecoration(
                          color: isSelected ? QuantColors.sovereignCyan : Colors.transparent,
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(
                            color: isSelected ? QuantColors.sovereignCyan : QuantColors.activeBorder,
                            width: 1.5,
                          ),
                        ),
                        child: isSelected
                            ? const Icon(Icons.check_rounded, color: Colors.black, size: 16)
                            : null,
                      ),
                    ],
                  ),
                ),
              ),
            ],
          );
        }).toList(),
      ),
    );
  }

  Widget _buildBottomActionBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateCard,
        border: Border(
          top: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () => Navigator.of(context).pop(),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: QuantColors.hairlineBorder),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: const Text(
                  'Cancel',
                  style: TextStyle(color: QuantColors.textSecondary, fontWeight: FontWeight.w600),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              flex: 2,
              child: ElevatedButton.icon(
                onPressed: _handleCreateGroup,
                icon: const Icon(Icons.check_circle_outline_rounded, size: 18),
                label: Text(
                  'Create Group (${_selectedContactIds.length})',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: QuantColors.moltenOrange,
                  foregroundColor: Colors.white,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

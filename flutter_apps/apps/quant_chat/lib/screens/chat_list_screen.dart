// QuantChat Chat List — Phase 2A (Mobbin Flow 3).
// Strictly ZERO raw Unicode emojis throughout this file.
//
// Layout and interaction patterns are ABSTRACTED from a Mobbin screen review
// (mobbin-screen-spec.md, Flow 3). No Snapchat assets, logos, screenshots,
// branding, wording, or code are reproduced.
//
// Privacy honesty: end-to-end encryption is NOT enabled yet — no copy here
// claims it. Screenshot rows are detection + notice only, never "prevention".
//
// Data: conversations, Added Me, and Quick Add come from [ChatListRepository].
// The bundled LocalSampleChatListRepository is SAMPLE DATA for review; the
// Centrifugo-backed repository plugs into the same interface later. Unread /
// reply counts are refreshed from realtime envelopes (event_id / sequence /
// cursor) via ChatListRepository.applyEnvelope — no new realtime infra.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';

import '../data/chat_list_repository.dart';
import '../models/chat_list_models.dart';
import '../models/chat_models.dart';
import 'add_friend_screen.dart';
import 'conversation_screen.dart';
import 'group/create_group_sheet.dart';
import 'quick_capture_screen.dart';

class ChatListScreen extends StatefulWidget {
  const ChatListScreen({super.key});

  @override
  State<ChatListScreen> createState() => _ChatListScreenState();
}

class _ChatListScreenState extends State<ChatListScreen> {
  late final ChatListRepository _repository;
  StreamSubscription<ChatListSnapshot>? _subscription;
  ChatListSnapshot? _snapshot;
  ChatListFilter _filter = ChatListFilter.all;
  bool _searchOpen = false;
  String _searchQuery = '';
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _repository = LocalSampleChatListRepository();
    _repository.load().then((snapshot) {
      if (mounted) setState(() => _snapshot = snapshot);
    });
    _subscription = _repository.updates.listen((snapshot) {
      if (mounted) setState(() => _snapshot = snapshot);
    });
  }

  @override
  void dispose() {
    _subscription?.cancel();
    _repository.dispose();
    _searchController.dispose();
    super.dispose();
  }

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------

  List<ChatListEntry> get _filteredConversations {
    final all = _snapshot?.conversations ?? const <ChatListEntry>[];
    return all.where((entry) {
      final conv = entry.conversation;
      if (_searchQuery.isNotEmpty) {
        final q = _searchQuery.toLowerCase();
        final matches = conv.name.toLowerCase().contains(q) ||
            conv.lastMessage.toLowerCase().contains(q);
        if (!matches) return false;
      }
      switch (_filter) {
        case ChatListFilter.all:
          return true;
        case ChatListFilter.unread:
          return conv.unreadCount > 0;
        case ChatListFilter.reply:
          return entry.needsReply;
        case ChatListFilter.isNew:
          return entry.isNewItem;
      }
    }).toList();
  }

  int get _unreadBadge => _snapshot?.totalUnread ?? 0;
  int get _newBadge => _snapshot?.newCount ?? 0;
  int get _addedMeCount => _snapshot?.addedMe.length ?? 0;

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final conversations = _filteredConversations;
    final addedMe = _snapshot?.addedMe ?? const <FriendRequest>[];
    final quickAdd = _snapshot?.quickAdd ?? const <FriendSuggestion>[];
    final showDiscovery = _filter == ChatListFilter.all && _searchQuery.isEmpty;

    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(),
            if (_searchOpen) _buildInlineSearch(),
            _buildFilterChips(),
            Expanded(
              child: _snapshot == null
                  ? const Center(
                      child: CircularProgressIndicator(
                        color: QuantColors.moltenOrange,
                      ),
                    )
                  : ListView(
                      padding: const EdgeInsets.only(bottom: 96),
                      children: [
                        _buildSectionHeader('CONVERSATIONS'),
                        if (conversations.isEmpty)
                          _buildEmptyState()
                        else
                          ...conversations
                              .map((entry) => _buildConversationRow(entry)),
                        if (showDiscovery && addedMe.isNotEmpty) ...[
                          _buildSectionHeader('ADDED ME', count: addedMe.length),
                          ...addedMe.map(_buildAddedMeRow),
                        ],
                        if (showDiscovery && quickAdd.isNotEmpty) ...[
                          _buildSectionHeader('QUICK ADD'),
                          ...quickAdd.map(_buildQuickAddRow),
                        ],
                      ],
                    ),
            ),
          ],
        ),
      ),
      floatingActionButton: Padding(
        padding: const EdgeInsets.only(bottom: 72),
        child: FloatingActionButton.extended(
          backgroundColor: QuantColors.moltenOrange,
          foregroundColor: Colors.white,
          elevation: 4,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          onPressed: _showNewChannelDialog,
          icon: const Icon(Icons.edit_square, size: 20),
          label: const Text(
            'New chat',
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
          ),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Header — avatar + search (left), "Chat" title (center),
  // add-friend with badge + overflow (right)
  // ---------------------------------------------------------------------------

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      child: Row(
        children: [
          // Left cluster: profile avatar + search toggle.
          _buildProfileAvatar(),
          IconButton(
            tooltip: 'Search chats',
            onPressed: () => setState(() {
              _searchOpen = !_searchOpen;
              if (!_searchOpen) {
                _searchController.clear();
                _searchQuery = '';
              }
            }),
            icon: Icon(
              Icons.search_rounded,
              color: _searchOpen
                  ? QuantColors.moltenOrange
                  : QuantColors.textSecondary,
              size: 22,
            ),
          ),
          // Center title.
          const Expanded(
            child: Center(
              child: Text(
                'Chat',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.2,
                ),
              ),
            ),
          ),
          // Right cluster: add-friend with badge + overflow menu.
          _buildAddFriendButton(),
          PopupMenuButton<String>(
            tooltip: 'More options',
            icon: const Icon(
              Icons.more_horiz_rounded,
              color: QuantColors.textSecondary,
              size: 22,
            ),
            color: QuantColors.darkSlateCard,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
              side: const BorderSide(color: QuantColors.hairlineBorder),
            ),
            onSelected: _onOverflowSelected,
            itemBuilder: (context) => const [
              PopupMenuItem(
                value: 'new_group',
                child: _OverflowMenuRow(
                  icon: Icons.group_add_rounded,
                  label: 'New group',
                ),
              ),
              PopupMenuItem(
                value: 'find_friends',
                child: _OverflowMenuRow(
                  icon: Icons.person_search_rounded,
                  label: 'Find friends',
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildProfileAvatar() {
    return Semantics(
      label: 'Your profile',
      button: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: () {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              backgroundColor: QuantColors.darkSlateCard,
              content: Text('Profile opens from the Settings tab.'),
            ),
          );
        },
        child: Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: QuantColors.sovereignCyan.withOpacity(0.18),
            border: Border.all(
              color: QuantColors.sovereignCyan.withOpacity(0.5),
              width: 1.2,
            ),
          ),
          child: const Center(
            child: Text(
              'Q',
              style: TextStyle(
                color: QuantColors.sovereignCyan,
                fontSize: 15,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildAddFriendButton() {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        IconButton(
          tooltip: 'Add friends',
          onPressed: _openAddFriend,
          icon: const Icon(
            Icons.person_add_alt_rounded,
            color: QuantColors.textSecondary,
            size: 22,
          ),
        ),
        if (_addedMeCount > 0)
          Positioned(
            right: 6,
            top: 6,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              decoration: BoxDecoration(
                color: QuantColors.moltenOrange,
                borderRadius: BorderRadius.circular(9),
                border: Border.all(color: QuantColors.voidObsidian, width: 1.5),
              ),
              child: Text(
                '$_addedMeCount',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildInlineSearch() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
      child: Container(
        height: 44,
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
                autofocus: true,
                onChanged: (val) => setState(() => _searchQuery = val),
                style: const TextStyle(
                    color: QuantColors.textPrimary, fontSize: 14),
                decoration: const InputDecoration(
                  hintText: 'Search chats by name or message',
                  hintStyle:
                      TextStyle(color: QuantColors.textMuted, fontSize: 13),
                  border: InputBorder.none,
                  isDense: true,
                  contentPadding: EdgeInsets.zero,
                ),
              ),
            ),
            IconButton(
              tooltip: 'Clear search',
              icon: const Icon(Icons.close_rounded,
                  size: 18, color: QuantColors.textMuted),
              onPressed: () {
                _searchController.clear();
                setState(() => _searchQuery = '');
              },
            ),
          ],
        ),
      ),
    );
  }

  void _onOverflowSelected(String value) {
    switch (value) {
      case 'new_group':
        _showNewChannelDialog();
      case 'find_friends':
        _openAddFriend();
    }
  }

  void _openAddFriend() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => AddFriendScreen(
          addedMe: _snapshot?.addedMe ?? const [],
          suggestions: _snapshot?.quickAdd ?? const [],
          onAccept: (id) => _repository.acceptRequest(id),
          onIgnore: (id) => _repository.ignoreRequest(id),
          onAdd: (id) => _repository.addSuggestion(id),
          onDismiss: (id) => _repository.dismissSuggestion(id),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Filter chips — All / Unread / Reply / New (badges on Unread + New)
  // ---------------------------------------------------------------------------

  Widget _buildFilterChips() {
    final chips = <_FilterChipData>[
      _FilterChipData(filter: ChatListFilter.all, badge: null),
      _FilterChipData(filter: ChatListFilter.unread, badge: _unreadBadge),
      _FilterChipData(filter: ChatListFilter.reply, badge: null),
      _FilterChipData(filter: ChatListFilter.isNew, badge: _newBadge),
    ];

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: SizedBox(
        height: 34,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: chips.length,
          separatorBuilder: (_, __) => const SizedBox(width: 8),
          itemBuilder: (context, idx) {
            final data = chips[idx];
            final isSelected = _filter == data.filter;
            final showBadge = data.badge != null && data.badge! > 0;
            return Semantics(
              label: '${data.filter.label} filter'
                  '${showBadge ? ', ${data.badge} items' : ''}',
              button: true,
              selected: isSelected,
              child: InkWell(
                borderRadius: BorderRadius.circular(20),
                onTap: () => setState(() => _filter = data.filter),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  decoration: BoxDecoration(
                    color: isSelected
                        ? QuantColors.moltenOrange.withOpacity(0.18)
                        : QuantColors.darkSlateCard,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: isSelected
                          ? QuantColors.moltenOrange
                          : QuantColors.hairlineBorder,
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        data.filter.label,
                        style: TextStyle(
                          fontSize: 12.5,
                          fontWeight:
                              isSelected ? FontWeight.w700 : FontWeight.w500,
                          color: isSelected
                              ? QuantColors.moltenOrange
                              : QuantColors.textSecondary,
                        ),
                      ),
                      if (showBadge) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(
                            color: QuantColors.moltenOrange,
                            borderRadius: BorderRadius.circular(9),
                          ),
                          child: Text(
                            '${data.badge}',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Sections + rows
  // ---------------------------------------------------------------------------

  Widget _buildSectionHeader(String title, {int? count}) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
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

  /// Conversation row: circular avatar, bold display name, status line beneath,
  /// timestamp or quick-action glyph on the right.
  Widget _buildConversationRow(ChatListEntry entry) {
    final conv = entry.conversation;
    final hasUnread = conv.unreadCount > 0;
    final isSnapRow = entry.activityKind == ChatActivityKind.newSnap;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 3),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => _openConversation(entry),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: QuantColors.darkSlateCard,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: hasUnread
                  ? QuantColors.moltenOrange.withOpacity(0.3)
                  : QuantColors.hairlineBorder,
            ),
          ),
          child: Row(
            children: [
              _buildCircularAvatar(
                initials: conv.avatarInitials,
                color: conv.avatarColor,
                size: 48,
                isOnline: conv.isOnline,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      conv.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 14.5,
                        fontWeight:
                            hasUnread ? FontWeight.w800 : FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 3),
                    _buildStatusLine(entry),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              // Right side: quick-action camera for unopened snaps,
              // otherwise the timestamp.
              if (isSnapRow)
                Semantics(
                  label: 'Quick snap to ${conv.name}',
                  button: true,
                  child: IconButton(
                    tooltip: 'Quick snap to ${conv.name}',
                    onPressed: () => _openQuickCapture(conv),
                    icon: const Icon(
                      Icons.photo_camera_rounded,
                      color: QuantColors.moltenOrange,
                      size: 22,
                    ),
                  ),
                )
              else
                Text(
                  conv.lastMessageTime,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight:
                        hasUnread ? FontWeight.w600 : FontWeight.w400,
                    color: hasUnread
                        ? QuantColors.moltenOrange
                        : QuantColors.textMuted,
                  ),
                ),
              if (hasUnread) ...[
                const SizedBox(width: 6),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(
                    color: QuantColors.moltenOrange,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    '${conv.unreadCount}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  /// Status line beneath the display name:
  /// New Snap · just now / Screenshot · 3h / Tap to chat / Seen/Delivered · 1d.
  Widget _buildStatusLine(ChatListEntry entry) {
    final conv = entry.conversation;
    final hasUnread = conv.unreadCount > 0;

    TextStyle styleFor({bool accent = false}) => TextStyle(
          fontSize: 13,
          fontWeight: hasUnread ? FontWeight.w600 : FontWeight.w400,
          color: accent
              ? QuantColors.moltenOrange
              : hasUnread
                  ? QuantColors.textPrimary
                  : QuantColors.textSecondary,
        );

    switch (entry.activityKind) {
      case ChatActivityKind.tapToChat:
        return Text('Tap to chat', style: styleFor());
      case ChatActivityKind.newSnap:
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.photo_camera_rounded,
                size: 14, color: QuantColors.moltenOrange),
            const SizedBox(width: 5),
            Flexible(
              child: Text(
                'New Snap${conv.lastMessageTime.isNotEmpty ? ' · ${conv.lastMessageTime}' : ''}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: styleFor(accent: true),
              ),
            ),
          ],
        );
      case ChatActivityKind.unreadMessage:
        return Text(
          conv.lastMessage,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: styleFor(),
        );
      case ChatActivityKind.snapDelivered:
        return Text(
          'Delivered${conv.lastMessageTime.isNotEmpty ? ' · ${conv.lastMessageTime}' : ''}',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: styleFor(),
        );
      case ChatActivityKind.screenshot:
        // Detection + notice only: the row tells the user a screenshot was
        // taken; nothing here claims to prevent screenshots.
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.screenshot_monitor_rounded,
                size: 14, color: QuantColors.textMuted),
            const SizedBox(width: 5),
            Flexible(
              child: Text(
                'Screenshot${conv.lastMessageTime.isNotEmpty ? ' · ${conv.lastMessageTime}' : ''}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: styleFor(),
              ),
            ),
          ],
        );
      case ChatActivityKind.chat:
        final status = conv.lastMessageStatus;
        if (status != null) {
          return Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              DeliveryTickWidget(status: status, size: 14),
              const SizedBox(width: 5),
              Flexible(
                child: Text(
                  '${_receiptWord(status)}${conv.lastMessageTime.isNotEmpty ? ' · ${conv.lastMessageTime}' : ''}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: styleFor(),
                ),
              ),
            ],
          );
        }
        return Text(
          conv.lastMessage,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: styleFor(),
        );
    }
  }

  String _receiptWord(MessageDeliveryStatus status) {
    switch (status) {
      case MessageDeliveryStatus.pending:
        return 'Sending';
      case MessageDeliveryStatus.sent:
        return 'Sent';
      case MessageDeliveryStatus.delivered:
        return 'Delivered';
      case MessageDeliveryStatus.read:
        return 'Seen';
      case MessageDeliveryStatus.notSent:
        return 'Not sent';
    }
  }

  Widget _buildCircularAvatar({
    required String initials,
    required Color color,
    required double size,
    bool isOnline = false,
  }) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
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
        ),
        if (isOnline)
          Positioned(
            right: 0,
            bottom: 0,
            child: Container(
              width: size * 0.26,
              height: size * 0.26,
              decoration: BoxDecoration(
                color: QuantColors.statusSuccess,
                shape: BoxShape.circle,
                border: Border.all(
                  color: QuantColors.voidObsidian,
                  width: 2,
                ),
              ),
            ),
          ),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Added Me — incoming-friend rows with snap + chat quick buttons
  // ---------------------------------------------------------------------------

  Widget _buildAddedMeRow(FriendRequest request) {
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
            _buildCircularAvatar(
              initials: request.avatarInitials,
              color: request.avatarColor,
              size: 46,
            ),
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
                    '${request.mutualFriends} mutual friends · ${request.timeLabel}',
                    style: const TextStyle(
                      fontSize: 12,
                      color: QuantColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            // Quick buttons: snap + chat, both labeled for accessibility.
            Semantics(
              label: 'Send snap to ${request.name}',
              button: true,
              child: IconButton(
                tooltip: 'Send snap to ${request.name}',
                onPressed: () => _openQuickCapture(request.toConversation()),
                icon: const Icon(
                  Icons.photo_camera_rounded,
                  color: QuantColors.moltenOrange,
                  size: 21,
                ),
              ),
            ),
            Semantics(
              label: 'Chat with ${request.name}',
              button: true,
              child: IconButton(
                tooltip: 'Chat with ${request.name}',
                onPressed: () =>
                    _openConversation(ChatListEntry(
                      conversation: request.toConversation(),
                    )),
                icon: const Icon(
                  Icons.chat_bubble_outline_rounded,
                  color: QuantColors.sovereignCyan,
                  size: 21,
                ),
              ),
            ),
            TextButton(
              onPressed: () => _repository.ignoreRequest(request.id),
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

  // ---------------------------------------------------------------------------
  // Quick Add — suggested rows with Add buttons, X to dismiss
  // ---------------------------------------------------------------------------

  Widget _buildQuickAddRow(FriendSuggestion suggestion) {
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
            _buildCircularAvatar(
              initials: suggestion.avatarInitials,
              color: suggestion.avatarColor,
              size: 46,
            ),
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
            OutlinedButton(
              onPressed: () => _repository.addSuggestion(suggestion.id),
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
              label: 'Dismiss suggestion ${suggestion.name}',
              button: true,
              child: IconButton(
                tooltip: 'Dismiss suggestion',
                onPressed: () => _repository.dismissSuggestion(suggestion.id),
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

  // ---------------------------------------------------------------------------
  // Empty state + new-chat sheet
  // ---------------------------------------------------------------------------

  Widget _buildEmptyState() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 24),
      child: Center(
        child: Column(
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: QuantColors.elevatedCard,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: QuantColors.hairlineBorder),
              ),
              child: const Icon(
                Icons.chat_bubble_outline_rounded,
                size: 28,
                color: QuantColors.textMuted,
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'No chats here yet',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Try a different filter, or find friends to start chatting.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 12,
                color: QuantColors.textSecondary,
              ),
            ),
            const SizedBox(height: 14),
            OutlinedButton.icon(
              onPressed: _openAddFriend,
              icon: const Icon(Icons.person_add_alt_rounded, size: 16),
              label: const Text('Find friends'),
              style: OutlinedButton.styleFrom(
                foregroundColor: QuantColors.moltenOrange,
                side: const BorderSide(color: QuantColors.moltenOrange),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(18),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showNewChannelDialog() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
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
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
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
            const SizedBox(height: 16),
            const Text(
              'START A NEW CHAT',
              style: TextStyle(
                color: QuantColors.textMuted,
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(height: 12),
            ListTile(
              leading: Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: QuantColors.sovereignCyan.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.group_add_rounded,
                    color: QuantColors.sovereignCyan),
              ),
              title: const Text(
                'New group',
                style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 14),
              ),
              subtitle: const Text(
                'Chat with several friends at once',
                style:
                    TextStyle(color: QuantColors.textSecondary, fontSize: 12),
              ),
              onTap: () {
                Navigator.of(ctx).pop();
                CreateGroupSheet.show(
                  context,
                  onCreated: (newGroup) {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => ConversationScreen(
                          conversation: newGroup,
                        ),
                      ),
                    );
                  },
                );
              },
            ),
            const Divider(color: QuantColors.hairlineBorder, height: 16),
            ListTile(
              leading: Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: QuantColors.moltenOrange.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.person_add_alt_rounded,
                    color: QuantColors.moltenOrange),
              ),
              title: const Text(
                'New 1-on-1 chat',
                style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 14),
              ),
              subtitle: const Text(
                'Find a friend and start chatting',
                style:
                    TextStyle(color: QuantColors.textSecondary, fontSize: 12),
              ),
              onTap: () {
                Navigator.of(ctx).pop();
                _openAddFriend();
              },
            ),
          ],
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  Future<void> _openConversation(ChatListEntry entry) async {
    await _repository.markAsRead(entry.conversation.id);
    if (!mounted) return;
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) =>
            ConversationScreen(conversation: entry.conversation),
      ),
    );
  }

  void _openQuickCapture(ChatConversation recipient) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => QuickCaptureScreen(
          recipient: recipient,
          onSnapReady: (result) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                backgroundColor: QuantColors.darkSlateCard,
                content: Text(
                  'Snap captured for ${result.recipientName}. Sending is wired in a later phase.',
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _FilterChipData {
  final ChatListFilter filter;
  final int? badge;
  const _FilterChipData({required this.filter, this.badge});
}

class _OverflowMenuRow extends StatelessWidget {
  final IconData icon;
  final String label;
  const _OverflowMenuRow({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 18, color: QuantColors.textSecondary),
        const SizedBox(width: 10),
        Text(
          label,
          style: const TextStyle(color: Colors.white, fontSize: 13),
        ),
      ],
    );
  }
}

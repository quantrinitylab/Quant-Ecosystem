// Sovereign Quant Ecosystem - QuantChat Active Conversations List Screen
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../models/chat_models.dart';
import '../services/chat_mock_data.dart';
import 'conversation_screen.dart';

class ChatListScreen extends StatefulWidget {
  const ChatListScreen({super.key});

  @override
  State<ChatListScreen> createState() => _ChatListScreenState();
}

class _ChatListScreenState extends State<ChatListScreen> {
  late List<ChatConversation> _conversations;
  String _searchQuery = '';
  String _selectedFilter = 'all'; // all, unread, direct, groups
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _conversations = ChatMockData.getInitialConversations();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  List<ChatConversation> get _filteredConversations {
    return _conversations.where((conv) {
      final matchesQuery = _searchQuery.isEmpty ||
          conv.name.toLowerCase().contains(_searchQuery.toLowerCase()) ||
          conv.lastMessage.toLowerCase().contains(_searchQuery.toLowerCase());

      if (!matchesQuery) return false;

      if (_selectedFilter == 'unread') {
        return conv.unreadCount > 0;
      } else if (_selectedFilter == 'pinned') {
        return conv.isPinned;
      }
      return true;
    }).toList();
  }

  List<ChatConversation> get _pinnedConversations {
    return _conversations.where((c) => c.isPinned).toList();
  }

  @override
  Widget build(BuildContext context) {
    final pinned = _pinnedConversations;
    final allList = _filteredConversations;

    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: SafeArea(
        child: Column(
          children: [
            // Sticky Search & Discovery Bar
            _buildStickySearchBar(),

            // Filter Filter Chips Bar
            _buildFilterChipsBar(),

            // Main Conversation Stream
            Expanded(
              child: ListView(
                padding: const EdgeInsets.only(bottom: 96),
                children: [
                  // Pinned VIP Section
                  if (pinned.isNotEmpty && _selectedFilter != 'unread') ...[
                    _buildSectionHeader('PINNED CONVERSATIONS', Icons.push_pin_rounded),
                    _buildPinnedHorizontalCards(pinned),
                    const SizedBox(height: 12),
                  ],

                  // All Direct Messages & Channels
                  _buildSectionHeader(
                    _selectedFilter == 'unread'
                        ? 'UNREAD MESSAGES'
                        : 'ALL CONVERSATIONS',
                    Icons.chat_bubble_outline_rounded,
                  ),

                  if (allList.isEmpty)
                    _buildEmptyState()
                  else
                    ...allList.map((conv) => _buildConversationTile(conv)),
                ],
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: Padding(
        padding: const EdgeInsets.only(bottom: 72),
        child: FloatingActionButton(
          backgroundColor: QuantColors.moltenOrange,
          foregroundColor: Colors.white,
          elevation: 4,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          onPressed: () {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                backgroundColor: QuantColors.darkSlateCard,
                content: Text(
                  'Starting new sovereign E2EE channel...',
                  style: TextStyle(color: QuantColors.textPrimary),
                ),
              ),
            );
          },
          child: const Icon(Icons.edit_square, size: 24),
        ),
      ),
    );
  }

  Widget _buildStickySearchBar() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Container(
        height: 48,
        decoration: BoxDecoration(
          color: QuantColors.darkSlateCard,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: QuantColors.hairlineBorder),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: Row(
          children: [
            const Icon(
              Icons.search_rounded,
              color: QuantColors.textMuted,
              size: 20,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: TextField(
                controller: _searchController,
                onChanged: (val) => setState(() => _searchQuery = val),
                style: const TextStyle(
                  color: QuantColors.textPrimary,
                  fontSize: 14,
                ),
                decoration: const InputDecoration(
                  hintText: 'Search encrypted chats & sovereign peers...',
                  hintStyle: TextStyle(
                    color: QuantColors.textMuted,
                    fontSize: 13,
                  ),
                  border: InputBorder.none,
                  isDense: true,
                  contentPadding: EdgeInsets.zero,
                ),
              ),
            ),
            if (_searchQuery.isNotEmpty)
              IconButton(
                icon: const Icon(Icons.close_rounded, size: 18, color: QuantColors.textMuted),
                onPressed: () {
                  _searchController.clear();
                  setState(() => _searchQuery = '');
                },
              )
            else
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: QuantColors.elevatedCard,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(
                  Icons.mic_none_rounded,
                  size: 16,
                  color: QuantColors.moltenOrange,
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildFilterChipsBar() {
    final filters = [
      {'key': 'all', 'label': 'All Chats', 'icon': Icons.all_inclusive_rounded},
      {'key': 'unread', 'label': 'Unread (4)', 'icon': Icons.mark_chat_unread_rounded},
      {'key': 'pinned', 'label': 'Pinned', 'icon': Icons.push_pin_rounded},
    ];

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: SizedBox(
        height: 34,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: filters.length,
          separatorBuilder: (_, __) => const SizedBox(width: 8),
          itemBuilder: (context, idx) {
            final f = filters[idx];
            final isSelected = _selectedFilter == f['key'];
            return InkWell(
              borderRadius: BorderRadius.circular(20),
              onTap: () {
                setState(() => _selectedFilter = f['key'] as String);
              },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12),
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
                  children: [
                    Icon(
                      f['icon'] as IconData,
                      size: 14,
                      color: isSelected ? QuantColors.moltenOrange : QuantColors.textMuted,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      f['label'] as String,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                        color: isSelected ? QuantColors.moltenOrange : QuantColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildSectionHeader(String title, IconData icon) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
      child: Row(
        children: [
          Icon(icon, size: 14, color: QuantColors.textMuted),
          const SizedBox(width: 6),
          Text(
            title,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.8,
              color: QuantColors.textMuted,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPinnedHorizontalCards(List<ChatConversation> pinned) {
    return SizedBox(
      height: 104,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        scrollDirection: Axis.horizontal,
        itemCount: pinned.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, idx) {
          final conv = pinned[idx];
          return InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: () => _openConversation(conv),
            child: Container(
              width: 148,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: QuantColors.darkSlateCard,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: conv.avatarColor.withOpacity(0.35),
                  width: 1,
                ),
                boxShadow: [
                  BoxShadow(
                    color: conv.avatarColor.withOpacity(0.08),
                    blurRadius: 12,
                    spreadRadius: 1,
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _buildAvatarWithBeacon(conv, size: 32),
                      const Icon(
                        Icons.push_pin_rounded,
                        size: 14,
                        color: QuantColors.moltenOrange,
                      ),
                    ],
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        conv.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        conv.isTyping ? 'Typing...' : conv.lastSeenText,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: conv.isTyping ? FontWeight.w600 : FontWeight.w400,
                          color: conv.isTyping
                              ? QuantColors.statusSuccess
                              : QuantColors.textMuted,
                        ),
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

  Widget _buildConversationTile(ChatConversation conv) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 3),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => _openConversation(conv),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: QuantColors.darkSlateCard,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: conv.unreadCount > 0
                  ? QuantColors.moltenOrange.withOpacity(0.25)
                  : QuantColors.hairlineBorder,
            ),
          ),
          child: Row(
            children: [
              // Avatar with Online Presence Beacon
              _buildAvatarWithBeacon(conv, size: 46),
              const SizedBox(width: 12),

              // Conversation Metadata & Message Snippet
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Flexible(
                          child: Row(
                            children: [
                              Flexible(
                                child: Text(
                                  conv.name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontSize: 14,
                                    fontWeight: conv.unreadCount > 0
                                        ? FontWeight.w700
                                        : FontWeight.w600,
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                              if (conv.isPinned) ...[
                                const SizedBox(width: 4),
                                const Icon(
                                  Icons.push_pin_rounded,
                                  size: 13,
                                  color: QuantColors.moltenOrange,
                                ),
                              ],
                            ],
                          ),
                        ),
                        Text(
                          conv.lastMessageTime,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: conv.unreadCount > 0
                                ? FontWeight.w600
                                : FontWeight.w400,
                            color: conv.unreadCount > 0
                                ? QuantColors.moltenOrange
                                : QuantColors.textMuted,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        // Outgoing delivery status indicator
                        if (conv.lastMessageStatus != null) ...[
                          _buildDeliveryTick(conv.lastMessageStatus!),
                          const SizedBox(width: 4),
                        ],

                        // Typing indicator or last message
                        Expanded(
                          child: conv.isTyping
                              ? _buildTypingIndicator()
                              : Text(
                                  conv.lastMessage,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontSize: 13,
                                    color: conv.unreadCount > 0
                                        ? QuantColors.textPrimary
                                        : QuantColors.textSecondary,
                                    fontWeight: conv.unreadCount > 0
                                        ? FontWeight.w500
                                        : FontWeight.w400,
                                  ),
                                ),
                        ),

                        // Unread count badge
                        if (conv.unreadCount > 0) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                            decoration: BoxDecoration(
                              color: QuantColors.moltenOrange,
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text(
                              conv.unreadCount.toString(),
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
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildAvatarWithBeacon(ChatConversation conv, {required double size}) {
    return Stack(
      children: [
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            color: conv.avatarColor.withOpacity(0.18),
            borderRadius: BorderRadius.circular(size * 0.35),
            border: Border.all(
              color: conv.avatarColor.withOpacity(0.5),
              width: 1.2,
            ),
          ),
          child: Center(
            child: Text(
              conv.avatarInitials,
              style: TextStyle(
                color: conv.avatarColor,
                fontSize: size * 0.38,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ),
        if (conv.isOnline)
          Positioned(
            right: 0,
            bottom: 0,
            child: Container(
              width: size * 0.28,
              height: size * 0.28,
              decoration: BoxDecoration(
                color: QuantColors.statusSuccess,
                shape: BoxShape.circle,
                border: Border.all(
                  color: QuantColors.voidObsidian,
                  width: 2,
                ),
                boxShadow: [
                  BoxShadow(
                    color: QuantColors.statusSuccess.withOpacity(0.6),
                    blurRadius: 4,
                    spreadRadius: 1,
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildDeliveryTick(MessageDeliveryStatus status) {
    switch (status) {
      case MessageDeliveryStatus.sending:
        return const Icon(Icons.access_time_rounded, size: 14, color: QuantColors.textMuted);
      case MessageDeliveryStatus.sent:
        return const Icon(Icons.check_rounded, size: 14, color: QuantColors.textMuted);
      case MessageDeliveryStatus.delivered:
        return const Icon(Icons.done_all_rounded, size: 14, color: QuantColors.textMuted);
      case MessageDeliveryStatus.read:
        return const Icon(Icons.done_all_rounded, size: 14, color: QuantColors.sovereignCyan);
    }
  }

  Widget _buildTypingIndicator() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Text(
          'Typing',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: QuantColors.statusSuccess,
          ),
        ),
        const SizedBox(width: 4),
        Container(
          width: 4,
          height: 4,
          decoration: const BoxDecoration(
            color: QuantColors.statusSuccess,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 3),
        Container(
          width: 4,
          height: 4,
          decoration: const BoxDecoration(
            color: QuantColors.statusSuccess,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 3),
        Container(
          width: 4,
          height: 4,
          decoration: const BoxDecoration(
            color: QuantColors.statusSuccess,
            shape: BoxShape.circle,
          ),
        ),
      ],
    );
  }

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
                Icons.search_off_rounded,
                size: 28,
                color: QuantColors.textMuted,
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'No Encrypted Conversations Found',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Try searching with a different sovereign peer name or clear filter.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 12,
                color: QuantColors.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _openConversation(ChatConversation conv) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ConversationScreen(conversation: conv),
      ),
    );
  }
}

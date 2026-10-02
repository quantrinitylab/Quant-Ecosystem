import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import '../../data/gram_repository.dart';
import '../../models/gram_models.dart';

/// Sovereign High-Density Direct Messages & Ephemeral Notes Screen for QuantGram
/// 
/// Key Features:
/// - Top 24-hour ephemeral status thoughts with squircle avatar halo
/// - Dynamic search bar with real-time filtering and tab categories (Primary, General, Requests, Unread)
/// - Conversation cards with real-time online beacons, unread badges, and quick camera action
/// - Interactive quick note creation and note response modals
/// 
/// Strict Invariants:
/// - 100% ZERO raw Unicode emojis (strictly Material 3 vector Icon(Icons.xxx)).
/// - 100% ZERO Skia clipPath method calls (pure Impeller hardware acceleration).
/// - High density, enterprise obsidian luxury palette (QuantColors.voidObsidian, #12151E, #1E222A).
class DmsInboxScreen extends StatefulWidget {
  const DmsInboxScreen({super.key});

  @override
  State<DmsInboxScreen> createState() => _DmsInboxScreenState();
}

class _DmsInboxScreenState extends State<DmsInboxScreen> {
  late List<DirectNote> _notes;
  late List<DirectMessageThread> _threads;
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';
  String _selectedTab = 'Primary'; // Primary, General, Requests, Unread

  @override
  void initState() {
    super.initState();
    _notes = List.from(GramRepository.getNotes());
    _threads = List.from(GramRepository.getDirectMessages());
    _searchController.addListener(_onSearchChanged);
  }

  @override
  void dispose() {
    _searchController.removeListener(_onSearchChanged);
    _searchController.dispose();
    super.dispose();
  }

  void _onSearchChanged() {
    setState(() {
      _searchQuery = _searchController.text.trim().toLowerCase();
    });
  }

  List<DirectMessageThread> get _filteredThreads {
    return _threads.where((thread) {
      // Tab filtering
      if (_selectedTab == 'Unread' && thread.unreadCount == 0) {
        return false;
      }
      if (_selectedTab == 'Requests') {
        // Show simulated requests threads
        if (thread.id != 'dm-4') return false;
      } else if (_selectedTab == 'General') {
        if (thread.id != 'dm-3') return false;
      } else if (_selectedTab == 'Primary') {
        if (thread.id == 'dm-4') return false;
      }

      // Search query filtering
      if (_searchQuery.isEmpty) return true;
      final nameMatches = thread.recipientName.toLowerCase().contains(_searchQuery);
      final handleMatches = thread.recipientHandle.toLowerCase().contains(_searchQuery);
      final messageMatches = thread.lastMessage.toLowerCase().contains(_searchQuery);
      return nameMatches || handleMatches || messageMatches;
    }).toList();
  }

  List<DirectNote> get _filteredNotes {
    if (_searchQuery.isEmpty) return _notes;
    return _notes.where((note) {
      final userMatches = note.username.toLowerCase().contains(_searchQuery);
      final noteMatches = note.noteText.toLowerCase().contains(_searchQuery);
      return userMatches || noteMatches;
    }).toList();
  }

  void _openAddNoteDialog() {
    final noteInputController = TextEditingController();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return Container(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
            top: 24,
            left: 20,
            right: 20,
          ),
          decoration: const BoxDecoration(
            color: QuantColors.darkSlateCard,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
            border: Border(
              top: BorderSide(color: QuantColors.hairlineBorder, width: 1.2),
              left: BorderSide(color: QuantColors.hairlineBorder, width: 1.2),
              right: BorderSide(color: QuantColors.hairlineBorder, width: 1.2),
            ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Share 24h Note',
                    style: QuantTypography.titleMedium.copyWith(
                      color: QuantColors.textPrimary,
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close_rounded, color: QuantColors.textSecondary),
                    onPressed: () => Navigator.of(ctx).pop(),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                'Share a thought with your sovereign connections. Notes vanish in 24 hours.',
                style: QuantTypography.bodySmall.copyWith(color: QuantColors.textMuted),
              ),
              const SizedBox(height: 16),
              Container(
                decoration: BoxDecoration(
                  color: QuantColors.elevatedCard,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: QuantColors.hairlineBorder),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                child: TextField(
                  controller: noteInputController,
                  maxLength: 60,
                  maxLines: 2,
                  autofocus: true,
                  style: QuantTypography.bodyMedium.copyWith(color: QuantColors.textPrimary),
                  decoration: InputDecoration(
                    hintText: 'What is on your mind? (up to 60 chars)',
                    hintStyle: QuantTypography.bodySmall.copyWith(color: QuantColors.textMuted),
                    border: InputBorder.none,
                    counterStyle: QuantTypography.bodySmall.copyWith(color: QuantColors.textMuted),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              GestureDetector(
                onTap: () {
                  final text = noteInputController.text.trim();
                  if (text.isNotEmpty) {
                    setState(() {
                      if (_notes.isNotEmpty && _notes.first.userId == 'current-user') {
                        _notes[0] = DirectNote(
                          id: 'note-0',
                          userId: 'current-user',
                          username: 'Your Note',
                          avatarUrl: _notes[0].avatarUrl,
                          noteText: text,
                        );
                      }
                    });
                    Navigator.of(ctx).pop();
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        backgroundColor: QuantColors.elevatedCard,
                        content: Row(
                          children: [
                            const Icon(Icons.check_circle_rounded, color: QuantColors.statusSuccess, size: 18),
                            const SizedBox(width: 8),
                            Text('24h Note posted to sovereign followers', style: QuantTypography.bodyMedium),
                          ],
                        ),
                      ),
                    );
                  }
                },
                child: Container(
                  height: 48,
                  width: double.infinity,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    gradient: const LinearGradient(
                      colors: [QuantColors.sunriseRose, QuantColors.moltenAmber],
                    ),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    'Share Thought',
                    style: QuantTypography.titleMedium.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  void _openNoteView(DirectNote note) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        final replyController = TextEditingController();
        return Container(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
            top: 24,
            left: 20,
            right: 20,
          ),
          decoration: const BoxDecoration(
            color: QuantColors.darkSlateCard,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
            border: Border(
              top: BorderSide(color: QuantColors.hairlineBorder, width: 1.2),
            ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: QuantColors.sunriseRose, width: 2),
                      image: DecorationImage(
                        image: NetworkImage(note.avatarUrl),
                        fit: BoxFit.cover,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        note.username,
                        style: QuantTypography.titleMedium.copyWith(
                          color: QuantColors.textPrimary,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(
                        '24h Ephemeral Note',
                        style: QuantTypography.bodySmall.copyWith(
                          color: QuantColors.textMuted,
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(Icons.close_rounded, color: QuantColors.textSecondary),
                    onPressed: () => Navigator.of(ctx).pop(),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                decoration: BoxDecoration(
                  color: QuantColors.elevatedCard,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: QuantColors.hairlineBorder),
                ),
                child: Text(
                  note.noteText,
                  style: QuantTypography.bodyMedium.copyWith(
                    color: QuantColors.textPrimary,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: Container(
                      height: 44,
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      decoration: BoxDecoration(
                        color: QuantColors.voidObsidian,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: QuantColors.hairlineBorder),
                      ),
                      child: TextField(
                        controller: replyController,
                        style: QuantTypography.bodyMedium.copyWith(color: QuantColors.textPrimary),
                        decoration: InputDecoration(
                          hintText: 'Reply to ${note.username}...',
                          hintStyle: QuantTypography.bodySmall.copyWith(color: QuantColors.textMuted),
                          border: InputBorder.none,
                          isDense: true,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  GestureDetector(
                    onTap: () {
                      if (replyController.text.trim().isNotEmpty) {
                        Navigator.of(ctx).pop();
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            backgroundColor: QuantColors.elevatedCard,
                            content: Text('Reply sent to ${note.username}'),
                          ),
                        );
                      }
                    },
                    child: Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: QuantColors.sunriseRose,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(Icons.send_rounded, color: Colors.white, size: 20),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  void _openChatThread(DirectMessageThread thread) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        final messageController = TextEditingController();
        return Container(
          height: MediaQuery.of(ctx).size.height * 0.85,
          decoration: const BoxDecoration(
            color: QuantColors.voidObsidian,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
            border: Border(
              top: BorderSide(color: QuantColors.hairlineBorder, width: 1.2),
            ),
          ),
          child: Column(
            children: [
              // Chat Header
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: const BoxDecoration(
                  color: QuantColors.darkSlateCard,
                  borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
                  border: Border(
                    bottom: BorderSide(color: QuantColors.hairlineBorder),
                  ),
                ),
                child: Row(
                  children: [
                    Stack(
                      children: [
                        Container(
                          width: 42,
                          height: 42,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(12),
                            image: DecorationImage(
                              image: NetworkImage(thread.avatarUrl),
                              fit: BoxFit.cover,
                            ),
                          ),
                        ),
                        if (thread.isOnline)
                          Positioned(
                            right: 0,
                            bottom: 0,
                            child: Container(
                              width: 12,
                              height: 12,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: QuantColors.statusSuccess,
                                border: Border.all(color: QuantColors.darkSlateCard, width: 2),
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(
                                thread.recipientName,
                                style: QuantTypography.titleMedium.copyWith(
                                  color: QuantColors.textPrimary,
                                  fontSize: 15,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(width: 4),
                              const Icon(Icons.verified_rounded, color: QuantColors.sovereignCyan, size: 14),
                            ],
                          ),
                          Text(
                            thread.isOnline ? 'Active now' : 'Seen ${thread.timestampText}',
                            style: QuantTypography.bodySmall.copyWith(
                              color: thread.isOnline ? QuantColors.statusSuccess : QuantColors.textMuted,
                              fontSize: 11,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.videocam_rounded, color: QuantColors.textPrimary),
                      onPressed: () {},
                    ),
                    IconButton(
                      icon: const Icon(Icons.close_rounded, color: QuantColors.textSecondary),
                      onPressed: () => Navigator.of(ctx).pop(),
                    ),
                  ],
                ),
              ),

              // Chat Message Stream
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Center(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: QuantColors.elevatedCard,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: QuantColors.hairlineBorder),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.lock_outline_rounded, color: QuantColors.textMuted, size: 12),
                            const SizedBox(width: 6),
                            Text(
                              'End-to-end encrypted with Sovereign Hardware Keys',
                              style: QuantTypography.bodySmall.copyWith(
                                fontSize: 10,
                                color: QuantColors.textMuted,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),

                    // Received message
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Container(
                        constraints: BoxConstraints(maxWidth: MediaQuery.of(ctx).size.width * 0.75),
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        decoration: BoxDecoration(
                          color: QuantColors.darkSlateCard,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: QuantColors.hairlineBorder),
                        ),
                        child: Text(
                          thread.lastMessage,
                          style: QuantTypography.bodyMedium.copyWith(color: QuantColors.textPrimary),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Sent response
                    Align(
                      alignment: Alignment.centerRight,
                      child: Container(
                        constraints: BoxConstraints(maxWidth: MediaQuery.of(ctx).size.width * 0.75),
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [QuantColors.sunriseRose, QuantColors.moltenAmber],
                          ),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Text(
                          'Acknowledged. Impeller 120Hz pipeline verified.',
                          style: QuantTypography.bodyMedium.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              // Chat Input Bar
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: const BoxDecoration(
                  color: QuantColors.darkSlateCard,
                  border: Border(top: BorderSide(color: QuantColors.hairlineBorder)),
                ),
                child: SafeArea(
                  top: false,
                  child: Row(
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        decoration: const BoxDecoration(
                          color: QuantColors.sunriseRose,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.camera_alt_rounded, color: Colors.white, size: 20),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Container(
                          height: 40,
                          padding: const EdgeInsets.symmetric(horizontal: 14),
                          decoration: BoxDecoration(
                            color: QuantColors.voidObsidian,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: QuantColors.hairlineBorder),
                          ),
                          child: TextField(
                            controller: messageController,
                            style: QuantTypography.bodyMedium.copyWith(color: QuantColors.textPrimary),
                            decoration: InputDecoration(
                              hintText: 'Message @${thread.recipientHandle}...',
                              hintStyle: QuantTypography.bodySmall.copyWith(color: QuantColors.textMuted),
                              border: InputBorder.none,
                              isDense: true,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton(
                        icon: const Icon(Icons.mic_none_rounded, color: QuantColors.textSecondary),
                        onPressed: () {},
                      ),
                      IconButton(
                        icon: const Icon(Icons.image_outlined, color: QuantColors.textSecondary),
                        onPressed: () {},
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final filteredThreads = _filteredThreads;
    final filteredNotes = _filteredNotes;

    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      appBar: AppBar(
        backgroundColor: QuantColors.voidObsidian,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        title: Row(
          children: [
            Text(
              'quantrinity',
              style: QuantTypography.titleLarge.copyWith(
                color: QuantColors.textPrimary,
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(width: 4),
            const Icon(
              Icons.keyboard_arrow_down_rounded,
              color: QuantColors.textSecondary,
              size: 20,
            ),
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: QuantColors.sovereignCyan.withOpacity(0.15),
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: QuantColors.sovereignCyan.withOpacity(0.3)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.shield_outlined, color: QuantColors.sovereignCyan, size: 10),
                  const SizedBox(width: 3),
                  Text(
                    'E2EE',
                    style: QuantTypography.bodySmall.copyWith(
                      color: QuantColors.sovereignCyan,
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.video_call_outlined, color: QuantColors.textPrimary, size: 26),
            onPressed: () {},
          ),
          IconButton(
            icon: const Icon(Icons.edit_note_rounded, color: QuantColors.textPrimary, size: 26),
            onPressed: _openAddNoteDialog,
          ),
        ],
      ),
      body: Column(
        children: [
          // High-Density Search Bar
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: Container(
              height: 40,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(
                color: QuantColors.darkSlateCard,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: QuantColors.hairlineBorder),
              ),
              child: Row(
                children: [
                  const Icon(Icons.search_rounded, color: QuantColors.textSecondary, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(
                      controller: _searchController,
                      style: QuantTypography.bodyMedium.copyWith(color: QuantColors.textPrimary),
                      decoration: InputDecoration(
                        hintText: 'Search sovereign chats...',
                        hintStyle: QuantTypography.bodySmall.copyWith(color: QuantColors.textMuted),
                        border: InputBorder.none,
                        isDense: true,
                      ),
                    ),
                  ),
                  if (_searchQuery.isNotEmpty)
                    GestureDetector(
                      onTap: () => _searchController.clear(),
                      child: const Icon(Icons.clear_rounded, color: QuantColors.textMuted, size: 16),
                    ),
                ],
              ),
            ),
          ),

          // 24h Ephemeral Direct Notes Tray (Squircle Halo & Bubble Strip)
          Container(
            height: 114,
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: filteredNotes.length,
              separatorBuilder: (_, __) => const SizedBox(width: 14),
              itemBuilder: (context, index) {
                final note = filteredNotes[index];
                final isSelf = note.userId == 'current-user';

                return GestureDetector(
                  onTap: () {
                    if (isSelf) {
                      _openAddNoteDialog();
                    } else {
                      _openNoteView(note);
                    }
                  },
                  child: SizedBox(
                    width: 78,
                    child: Stack(
                      alignment: Alignment.topCenter,
                      clipBehavior: Clip.none,
                      children: [
                        // Avatar in Squircle Frame with Halo
                        Positioned(
                          top: 26,
                          child: Column(
                            children: [
                              Stack(
                                alignment: Alignment.bottomRight,
                                children: [
                                  Container(
                                    width: 54,
                                    height: 54,
                                    decoration: BoxDecoration(
                                      // Pure Squircle via RoundedRectangleBorder / BorderRadius (ZERO clipPath)
                                      borderRadius: BorderRadius.circular(16),
                                      border: Border.all(
                                        color: isSelf
                                            ? QuantColors.activeBorder
                                            : QuantColors.sunriseRose,
                                        width: 2,
                                      ),
                                      image: DecorationImage(
                                        image: NetworkImage(note.avatarUrl),
                                        fit: BoxFit.cover,
                                      ),
                                    ),
                                  ),
                                  if (isSelf)
                                    Container(
                                      width: 18,
                                      height: 18,
                                      decoration: BoxDecoration(
                                        color: QuantColors.sunriseRose,
                                        shape: BoxShape.circle,
                                        border: Border.all(color: QuantColors.voidObsidian, width: 2),
                                      ),
                                      child: const Icon(Icons.add_rounded, color: Colors.white, size: 12),
                                    ),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Text(
                                note.username,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: QuantTypography.bodySmall.copyWith(
                                  fontSize: 11,
                                  color: QuantColors.textSecondary,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                        ),

                        // Ephemeral Thought Bubble Capsule
                        Positioned(
                          top: 0,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            constraints: const BoxConstraints(maxWidth: 82),
                            decoration: BoxDecoration(
                              color: QuantColors.elevatedCard,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: isSelf
                                    ? QuantColors.hairlineBorder
                                    : QuantColors.sunriseRose.withOpacity(0.4),
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withOpacity(0.5),
                                  blurRadius: 4,
                                  offset: const Offset(0, 2),
                                ),
                              ],
                            ),
                            child: Text(
                              note.noteText,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              textAlign: TextAlign.center,
                              style: QuantTypography.bodySmall.copyWith(
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                                color: QuantColors.textPrimary,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),

          // Direct Message Category Filter Tabs
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Row(
              children: [
                _buildFilterTab('Primary'),
                const SizedBox(width: 8),
                _buildFilterTab('General'),
                const SizedBox(width: 8),
                _buildFilterTab('Requests'),
                const SizedBox(width: 8),
                _buildFilterTab('Unread'),
              ],
            ),
          ),

          const SizedBox(height: 4),
          const Divider(color: QuantColors.hairlineBorder, height: 1),

          // Conversation Cards List
          Expanded(
            child: filteredThreads.isEmpty
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.mark_email_unread_outlined,
                            size: 40, color: QuantColors.textDisabled),
                        const SizedBox(height: 10),
                        Text(
                          'No direct messages found',
                          style: QuantTypography.titleMedium.copyWith(color: QuantColors.textMuted),
                        ),
                      ],
                    ),
                  )
                : ListView.builder(
                    itemCount: filteredThreads.length,
                    itemBuilder: (context, index) {
                      final thread = filteredThreads[index];
                      final hasUnread = thread.unreadCount > 0;

                      return InkWell(
                        onTap: () => _openChatThread(thread),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                          decoration: const BoxDecoration(
                            border: Border(
                              bottom: BorderSide(
                                color: QuantColors.hairlineBorder,
                                width: 0.5,
                              ),
                            ),
                          ),
                          child: Row(
                            children: [
                              // Avatar with Online Beacon
                              Stack(
                                clipBehavior: Clip.none,
                                children: [
                                  Container(
                                    width: 52,
                                    height: 52,
                                    decoration: BoxDecoration(
                                      borderRadius: BorderRadius.circular(16),
                                      border: Border.all(
                                        color: hasUnread
                                            ? QuantColors.sunriseRose
                                            : QuantColors.hairlineBorder,
                                        width: hasUnread ? 1.8 : 1.0,
                                      ),
                                      image: DecorationImage(
                                        image: NetworkImage(thread.avatarUrl),
                                        fit: BoxFit.cover,
                                      ),
                                    ),
                                  ),
                                  if (thread.isOnline)
                                    Positioned(
                                      right: -2,
                                      bottom: -2,
                                      child: Container(
                                        width: 14,
                                        height: 14,
                                        decoration: BoxDecoration(
                                          shape: BoxShape.circle,
                                          color: QuantColors.statusSuccess,
                                          border: Border.all(
                                            color: QuantColors.voidObsidian,
                                            width: 2.2,
                                          ),
                                          boxShadow: [
                                            BoxShadow(
                                              color: QuantColors.statusSuccess.withOpacity(0.5),
                                              blurRadius: 4,
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                              const SizedBox(width: 12),

                              // Name, snippet and timestamp
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Text(
                                          thread.recipientName,
                                          style: QuantTypography.titleMedium.copyWith(
                                            fontSize: 14,
                                            color: QuantColors.textPrimary,
                                            fontWeight:
                                                hasUnread ? FontWeight.w700 : FontWeight.w500,
                                          ),
                                        ),
                                        const SizedBox(width: 4),
                                        const Icon(
                                          Icons.verified_rounded,
                                          color: QuantColors.sovereignCyan,
                                          size: 13,
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 3),
                                    Text(
                                      '${thread.lastMessage} · ${thread.timestampText}',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: QuantTypography.bodySmall.copyWith(
                                        color: hasUnread
                                            ? QuantColors.textPrimary
                                            : QuantColors.textMuted,
                                        fontWeight:
                                            hasUnread ? FontWeight.w600 : FontWeight.w400,
                                      ),
                                    ),
                                  ],
                                ),
                              ),

                              // Trailing Badges and Action
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  if (hasUnread) ...[
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 6, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: QuantColors.sunriseRose,
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                      child: Text(
                                        '${thread.unreadCount}',
                                        style: QuantTypography.bodySmall.copyWith(
                                          color: Colors.white,
                                          fontSize: 11,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 10),
                                  ],
                                  IconButton(
                                    icon: const Icon(
                                      Icons.camera_alt_outlined,
                                      color: QuantColors.textSecondary,
                                      size: 20,
                                    ),
                                    onPressed: () {
                                      ScaffoldMessenger.of(context).showSnackBar(
                                        SnackBar(
                                          backgroundColor: QuantColors.elevatedCard,
                                          content: Text('Disappearing camera mode for ${thread.recipientName}'),
                                        ),
                                      );
                                    },
                                  ),
                                ],
                              ),
                            ],
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

  Widget _buildFilterTab(String label) {
    final isSelected = _selectedTab == label;

    return GestureDetector(
      onTap: () {
        setState(() {
          _selectedTab = label;
        });
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
        decoration: BoxDecoration(
          color: isSelected ? QuantColors.activeBorder : QuantColors.darkSlateCard,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: isSelected ? QuantColors.sovereignCyan : QuantColors.hairlineBorder,
          ),
        ),
        child: Text(
          label,
          style: QuantTypography.bodySmall.copyWith(
            color: isSelected ? QuantColors.textPrimary : QuantColors.textSecondary,
            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
            fontSize: 12,
          ),
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import '../data/gram_repository.dart';
import '../models/gram_models.dart';

/// Direct Messages & Ephemeral Notes Screen for QuantGram
/// Strictly ZERO raw Unicode emojis throughout this file (Material 3 vector icons only).
/// Strictly ZERO Skia clipPath calls (pure Impeller hardware acceleration).
class InboxScreen extends StatefulWidget {
  const InboxScreen({super.key});

  @override
  State<InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends State<InboxScreen> {
  late List<DirectNote> _notes;
  late List<DirectMessageThread> _threads;
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _notes = GramRepository.getNotes();
    _threads = GramRepository.getDirectMessages();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      appBar: AppBar(
        backgroundColor: QuantColors.voidObsidian,
        elevation: 0,
        title: Row(
          children: [
            Text(
              'quantrinity',
              style: QuantTypography.titleLarge.copyWith(
                color: QuantColors.textPrimary,
                fontSize: 18,
              ),
            ),
            const SizedBox(width: 4),
            const Icon(Icons.keyboard_arrow_down_rounded, color: QuantColors.textSecondary, size: 20),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.edit_note_rounded, color: QuantColors.textPrimary, size: 26),
            onPressed: () {},
          ),
        ],
      ),
      body: Column(
        children: [
          // Search Bar
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Container(
              height: 40,
              padding: const EdgeInsets.symmetric(horizontal: 14),
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
                ],
              ),
            ),
          ),

          // 24-Hour Ephemeral Direct Notes Tray (Instagram feature)
          Container(
            height: 110,
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: _notes.length,
              separatorBuilder: (_, __) => const SizedBox(width: 16),
              itemBuilder: (context, index) {
                final note = _notes[index];
                final isSelf = index == 0;

                return SizedBox(
                  width: 76,
                  child: Stack(
                    alignment: Alignment.topCenter,
                    clipBehavior: Clip.none,
                    children: [
                      // Avatar & Username
                      Positioned(
                        top: 26,
                        child: Column(
                          children: [
                            Container(
                              width: 54,
                              height: 54,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: isSelf ? QuantColors.activeBorder : QuantColors.sunriseRose,
                                  width: 2,
                                ),
                                image: DecorationImage(
                                  image: NetworkImage(note.avatarUrl),
                                  fit: BoxFit.cover,
                                ),
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              note.username,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: QuantTypography.bodySmall.copyWith(
                                fontSize: 11,
                                color: QuantColors.textSecondary,
                              ),
                            ),
                          ],
                        ),
                      ),

                      // Floating Thought Bubble Capsule
                      Positioned(
                        top: 0,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          constraints: const BoxConstraints(maxWidth: 82),
                          decoration: BoxDecoration(
                            color: QuantColors.elevatedCard,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: QuantColors.hairlineBorder),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withOpacity(0.4),
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
                );
              },
            ),
          ),

          const Divider(color: QuantColors.hairlineBorder, height: 1),

          // Messages Section Header
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
            child: Row(
              children: [
                Text(
                  'Messages',
                  style: QuantTypography.titleMedium.copyWith(
                    color: QuantColors.textPrimary,
                    fontSize: 15,
                  ),
                ),
                const Spacer(),
                Text(
                  'Requests (3)',
                  style: QuantTypography.bodySmall.copyWith(
                    color: QuantColors.sovereignCyan,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),

          // Direct Message Threads List
          Expanded(
            child: ListView.builder(
              itemCount: _threads.length,
              itemBuilder: (context, index) {
                final thread = _threads[index];

                return ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                  leading: Stack(
                    children: [
                      Container(
                        width: 50,
                        height: 50,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
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
                            width: 14,
                            height: 14,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: QuantColors.statusSuccess,
                              border: Border.all(color: QuantColors.voidObsidian, width: 2),
                            ),
                          ),
                        ),
                    ],
                  ),
                  title: Text(
                    thread.recipientName,
                    style: QuantTypography.titleMedium.copyWith(
                      fontSize: 14,
                      color: QuantColors.textPrimary,
                      fontWeight: thread.unreadCount > 0 ? FontWeight.w700 : FontWeight.w500,
                    ),
                  ),
                  subtitle: Text(
                    '${thread.lastMessage} · ${thread.timestampText}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: QuantTypography.bodySmall.copyWith(
                      color: thread.unreadCount > 0 ? QuantColors.textPrimary : QuantColors.textMuted,
                      fontWeight: thread.unreadCount > 0 ? FontWeight.w600 : FontWeight.w400,
                    ),
                  ),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (thread.unreadCount > 0) ...[
                        Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            color: QuantColors.sunriseRose,
                          ),
                        ),
                        const SizedBox(width: 12),
                      ],
                      IconButton(
                        icon: const Icon(Icons.camera_alt_outlined, color: QuantColors.textSecondary, size: 20),
                        onPressed: () {},
                      ),
                    ],
                  ),
                  onTap: () {
                    // Open DM thread modal / snackbar
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        backgroundColor: QuantColors.elevatedCard,
                        content: Text('Opening secure chat with ${thread.recipientName}...'),
                        duration: const Duration(seconds: 1),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

// ============================================================================
// quant_chat - chat list tile (QuantChat, shift 2)
//
// One conversation row for the chat list: avatar, display name, last-message
// preview, time-ago and unread badge. The row's slot is 76px tall and owned
// by the list (`itemExtent: 76` — the fixed-extent perf lesson); this widget
// only lays out its content inside that slot. Colors come from the ambient
// QuantChat theme — nothing is hardcoded.
//
// NOTE: the chat layer lives in chat_core's `src/chat/` barrel, deliberately
// not yet wired into `package:chat_core/chat_core.dart` (W2: "W1/W4 wire this
// in when ready"). Until then this file imports the barrel directly.

import 'package:chat_core/src/chat/chat.dart';
import 'package:flutter/material.dart';

/// One row in the conversation list.
///
/// Tap handling is owned by the caller ([onTap]) so the tile stays dumb and
/// testable. Archived conversations render dimmed; the archive filter UI is
/// a later shift.
class ChatListTile extends StatelessWidget {
  /// Creates a tile for [conversation].
  const ChatListTile({
    super.key,
    required this.conversation,
    required this.onTap,
  });

  /// The conversation rendered by this tile.
  final Conversation conversation;

  /// Called when the row is tapped (navigates to the conversation view).
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final ColorScheme scheme = theme.colorScheme;

    final Conversation c = conversation;
    final bool isGroup = c.type == 'group';
    final String name = _displayName(c);
    final String preview = c.lastMessage?.content ?? 'No messages yet';
    final int unread = c.unreadCount;

    final Widget tile = InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Row(
          children: <Widget>[
            _Avatar(isGroup: isGroup, name: name, scheme: scheme),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight:
                          unread > 0 ? FontWeight.w600 : FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    preview,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: <Widget>[
                Text(
                  _timeAgo(c.updatedAt),
                  style: theme.textTheme.labelSmall?.copyWith(
                    color:
                        unread > 0 ? scheme.primary : scheme.onSurfaceVariant,
                  ),
                ),
                if (unread > 0) const SizedBox(height: 4),
                if (unread > 0) _UnreadBadge(count: unread, scheme: scheme),
              ],
            ),
          ],
        ),
      ),
    );

    if (c.isArchived) {
      return Opacity(opacity: 0.55, child: tile);
    }
    return tile;
  }
}

/// Display name: the conversation's own [Conversation.name] when it is
/// non-empty, otherwise the participant ids joined (local helper — W2's model
/// owns the domain, so the getter lives here, not on the model).
String _displayName(Conversation conversation) {
  final String? name = conversation.name?.trim();
  if (name != null && name.isNotEmpty) {
    return name;
  }
  return conversation.participantIds.join(', ');
}

/// Leading avatar: group icon for group chats, person initial for directs.
///
/// TODO(UNVERIFIED): avatar URL is not in the spec — placeholder
/// initial/group-icon until the user-directory contract lands.
class _Avatar extends StatelessWidget {
  const _Avatar({
    required this.isGroup,
    required this.name,
    required this.scheme,
  });

  final bool isGroup;
  final String name;
  final ColorScheme scheme;

  @override
  Widget build(BuildContext context) {
    final String trimmed = name.trim();
    final String initial =
        trimmed.isEmpty ? '?' : trimmed[0].toUpperCase();
    return CircleAvatar(
      radius: 24,
      backgroundColor: scheme.secondary.withValues(alpha: 0.16),
      child: isGroup
          ? Icon(Icons.group_outlined, color: scheme.secondary)
          : Text(
              initial,
              style: TextStyle(
                color: scheme.secondary,
                fontWeight: FontWeight.w600,
                fontSize: 20,
              ),
            ),
    );
  }
}

/// Filled unread-count badge shown when [count] > 0.
class _UnreadBadge extends StatelessWidget {
  const _UnreadBadge({required this.count, required this.scheme});

  final int count;
  final ColorScheme scheme;

  @override
  Widget build(BuildContext context) {
    final String label = count > 99 ? '99+' : '$count';
    return Container(
      constraints: const BoxConstraints(minWidth: 20, minHeight: 20),
      padding: const EdgeInsets.symmetric(horizontal: 6),
      decoration: BoxDecoration(
        color: scheme.primary,
        borderRadius: BorderRadius.circular(10),
      ),
      alignment: Alignment.center,
      child: Text(
        label,
        style: TextStyle(
          color: scheme.onPrimary,
          fontSize: 11,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

/// Compact relative timestamp for [updatedAt]: `now`, `5m`, `3h`, `2d`;
/// older than a week falls back to `d/M`.
String _timeAgo(DateTime? updatedAt) {
  if (updatedAt == null) return '';
  final Duration diff = DateTime.now().difference(updatedAt);
  if (diff.isNegative || diff.inMinutes < 1) return 'now';
  if (diff.inHours < 1) return '${diff.inMinutes}m';
  if (diff.inDays < 1) return '${diff.inHours}h';
  if (diff.inDays < 7) return '${diff.inDays}d';
  return '${updatedAt.day}/${updatedAt.month}';
}

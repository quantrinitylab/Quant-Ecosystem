import 'package:flutter/material.dart';

import '../../design/components/components.dart';
import '../../design/quant_mail_tokens.dart';

/// Sticky day header for a sliver list.
class DayHeaderDelegate extends SliverPersistentHeaderDelegate {
  const DayHeaderDelegate(this.label);

  final String label;

  @override
  double get minExtent => QmDayHeader.height;

  @override
  double get maxExtent => QmDayHeader.height;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) => QmDayHeader(label: label);

  @override
  bool shouldRebuild(DayHeaderDelegate oldDelegate) => oldDelegate.label != label;
}

/// "Inbox, 12 unread" style title above the list.
class InboxTitleRow extends StatelessWidget {
  const InboxTitleRow({super.key, required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    return Semantics(
      header: true,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(QmSpace.gutter + 4, QmSpace.sm, QmSpace.gutter, QmSpace.sm),
        child: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.subject),
      ),
    );
  }
}

/// Filter chips: All, Unread, Starred, Has files. One is active at a time.
class InboxFilterRow extends StatelessWidget {
  const InboxFilterRow({
    super.key,
    required this.allSelected,
    required this.unreadSelected,
    required this.starredSelected,
    required this.filesSelected,
    required this.onAll,
    required this.onUnread,
    required this.onStarred,
    required this.onFiles,
  });

  final bool allSelected;
  final bool unreadSelected;
  final bool starredSelected;
  final bool filesSelected;
  final VoidCallback onAll;
  final VoidCallback onUnread;
  final VoidCallback onStarred;
  final VoidCallback onFiles;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: QmSpace.minTarget,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: QmSpace.gutter),
        children: <Widget>[
          QmFilterChip(label: 'All', selected: allSelected, onSelected: (_) => onAll()),
          const SizedBox(width: QmSpace.sm),
          QmFilterChip(label: 'Unread', selected: unreadSelected, onSelected: (_) => onUnread()),
          const SizedBox(width: QmSpace.sm),
          QmFilterChip(label: 'Starred', selected: starredSelected, onSelected: (_) => onStarred()),
          const SizedBox(width: QmSpace.sm),
          QmFilterChip(label: 'Has files', selected: filesSelected, onSelected: (_) => onFiles()),
        ],
      ),
    );
  }
}

/// Bulk bar that replaces the search pill in multi-select mode.
class InboxSelectionBar extends StatelessWidget {
  const InboxSelectionBar({
    super.key,
    required this.count,
    required this.onClose,
    required this.onSelectAll,
    this.onArchive,
    this.onDelete,
    required this.readLabel,
    required this.onToggleRead,
    required this.onStar,
    required this.onUnstar,
  });

  final int count;
  final VoidCallback onClose;
  final VoidCallback onSelectAll;
  final VoidCallback? onArchive;
  final VoidCallback? onDelete;

  /// "Mark read" or "Mark unread".
  final String readLabel;
  final VoidCallback onToggleRead;
  final VoidCallback onStar;
  final VoidCallback onUnstar;

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    return Container(
      height: QmSpace.minTarget + 4,
      margin: const EdgeInsets.fromLTRB(QmSpace.md, QmSpace.sm, QmSpace.md, QmSpace.xs),
      decoration: BoxDecoration(
        color: t.panelRaised,
        borderRadius: BorderRadius.circular(QmRadius.chip),
        border: Border.all(color: t.hairline),
      ),
      child: Row(
        children: <Widget>[
          IconButton(
            tooltip: 'Cancel selection',
            onPressed: onClose,
            icon: Icon(Icons.close_rounded, color: t.textPrimary),
            constraints: const BoxConstraints(minWidth: QmSpace.minTarget, minHeight: QmSpace.minTarget),
          ),
          Expanded(
            child: Semantics(
              liveRegion: true,
              child: Text('$count selected', maxLines: 1, overflow: TextOverflow.ellipsis, style: t.subject),
            ),
          ),
          if (onArchive != null)
            IconButton(
              tooltip: 'Archive',
              onPressed: onArchive,
              icon: Icon(Icons.archive_outlined, color: t.textPrimary),
              constraints: const BoxConstraints(minWidth: QmSpace.minTarget, minHeight: QmSpace.minTarget),
            ),
          if (onDelete != null)
            IconButton(
              tooltip: 'Delete',
              onPressed: onDelete,
              icon: Icon(Icons.delete_outline_rounded, color: t.textPrimary),
              constraints: const BoxConstraints(minWidth: QmSpace.minTarget, minHeight: QmSpace.minTarget),
            ),
          IconButton(
            tooltip: readLabel,
            onPressed: onToggleRead,
            icon: Icon(
              readLabel == 'Mark read' ? Icons.mark_email_read_outlined : Icons.mark_email_unread_outlined,
              color: t.textPrimary,
            ),
            constraints: const BoxConstraints(minWidth: QmSpace.minTarget, minHeight: QmSpace.minTarget),
          ),
          PopupMenuButton<String>(
            tooltip: 'More actions',
            color: t.panelRaised,
            icon: Icon(Icons.more_vert_rounded, color: t.textPrimary),
            onSelected: (String v) {
              switch (v) {
                case 'all':
                  onSelectAll();
                case 'star':
                  onStar();
                case 'unstar':
                  onUnstar();
              }
            },
            itemBuilder: (BuildContext _) => <PopupMenuEntry<String>>[
              PopupMenuItem<String>(value: 'all', child: Text('Select all loaded', style: t.body)),
              PopupMenuItem<String>(value: 'star', child: Text('Add star', style: t.body)),
              PopupMenuItem<String>(value: 'unstar', child: Text('Remove star', style: t.body)),
            ],
          ),
        ],
      ),
    );
  }
}

/// Footer of the list: loading spinner, or the inline "Couldn't load more" row.
class InboxListFooter extends StatelessWidget {
  const InboxListFooter({super.key, required this.loading, required this.failed, required this.onRetry});

  final bool loading;
  final bool failed;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    if (loading) {
      return Padding(
        padding: const EdgeInsets.all(QmSpace.lg),
        child: Center(
          child: SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(strokeWidth: 2.4, color: t.accent),
          ),
        ),
      );
    }
    if (failed) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: QmSpace.gutter, vertical: QmSpace.sm),
        child: Row(
          children: <Widget>[
            Icon(Icons.error_outline_rounded, size: 18, color: t.danger),
            const SizedBox(width: QmSpace.sm),
            Expanded(child: Text("Couldn't load more.", style: t.caption.copyWith(color: t.textPrimary))),
            TextButton(
              onPressed: onRetry,
              style: TextButton.styleFrom(
                minimumSize: const Size(QmSpace.minTarget, QmSpace.minTarget),
                foregroundColor: t.accentText,
              ),
              child: Text('Retry', style: t.label.copyWith(color: t.accentText)),
            ),
          ],
        ),
      );
    }
    return const SizedBox.shrink();
  }
}

/// Note above a locally filtered list: says plainly that only loaded mail is
/// filtered, and offers to load more while the server has more.
class LocalFilterNote extends StatelessWidget {
  const LocalFilterNote({super.key, required this.text, this.onLoadMore, this.onClear});

  final String text;
  final VoidCallback? onLoadMore;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(QmSpace.gutter + 4, 0, QmSpace.xs, QmSpace.xs),
      child: Row(
        children: <Widget>[
          Expanded(child: Text(text, style: t.caption)),
          if (onLoadMore != null)
            TextButton(
              onPressed: onLoadMore,
              style: TextButton.styleFrom(
                minimumSize: const Size(QmSpace.minTarget, QmSpace.minTarget),
                foregroundColor: t.accentText,
              ),
              child: Text('Load more', style: t.label.copyWith(color: t.accentText)),
            ),
          if (onClear != null)
            TextButton(
              onPressed: onClear,
              style: TextButton.styleFrom(
                minimumSize: const Size(QmSpace.minTarget, QmSpace.minTarget),
                foregroundColor: t.accentText,
              ),
              child: Text('Clear', style: t.label.copyWith(color: t.accentText)),
            ),
        ],
      ),
    );
  }
}

// ============================================================================
// quant_app - Inbox screen (M4)
// ============================================================================
//
// Real inbox list: Login (M2) -> Inbox (this) -> Thread. All mail data comes
// from [inboxProvider] (AsyncNotifierProvider<InboxListNotifier,
// InboxListState>) — built by the W4 worker in the same shift; this screen
// only consumes the contract:
//
//   inboxProvider : AsyncNotifierProvider<InboxListNotifier, InboxListState>
//   InboxListState(threads, isLoadingMore, hasMore, errorMessage)
//   InboxListNotifier.refresh() / .loadMore()
//
// No fake mail data: rows render whatever the provider holds.
//
// PERF: the list uses a fixed [itemExtent] (76) so the 10k-row scroll target
// never measures rows; rows are cheap stateless widgets with no nested
// scrollables.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:quant_app/src/widgets/failed_ops_banner.dart';
import 'package:quant_app/src/widgets/sender_avatar.dart';
import 'package:quant_app/src/widgets/send_undo_host.dart';
import 'package:quant_core/quant_core.dart';

/// Inbox list screen: watches [inboxProvider] and renders loading / error /
/// empty / list states. Pull-to-refresh and paged load-more are driven by the
/// notifier; this widget never touches the network or the cache itself.
///
/// A [FailedOpsBannerHost] sits above the list: permanently-failed outbox
/// ops (from the M6 modifier queue) surface there with retry/discard
/// affordances.
class InboxScreen extends ConsumerStatefulWidget {
  const InboxScreen({
    super.key,
    this.initialFilterTab = InboxFilterTab.focused,
    this.initialFlaggedFilter = false,
  });

  /// The initially selected filter tab (Focused vs Other, Outlook parity).
  final InboxFilterTab initialFilterTab;

  /// Whether the Flagged filter is initially active.
  final bool initialFlaggedFilter;

  @override
  ConsumerState<InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends ConsumerState<InboxScreen> {
  late InboxFilterTab _selectedTab;
  late bool _filterFlagged;

  @override
  void initState() {
    super.initState();
    _selectedTab = widget.initialFilterTab;
    _filterFlagged = widget.initialFlaggedFilter;
  }

  Future<void> _refresh() => ref.read(inboxProvider.notifier).refresh();

  @override
  Widget build(BuildContext context) {
    final AsyncValue<InboxListState> inbox = ref.watch(inboxProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Inbox'),
        // VQA-P2-07: bottom hairline — the bar (surface #111318) otherwise
        // blends straight into the list with no structural edge.
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1, thickness: 1),
        ),
        actions: <Widget>[
          IconButton(
            icon: const Icon(Icons.search),
            tooltip: 'Search mail',
            onPressed: () => context.pushNamed('search'),
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh inbox',
            onPressed: () => unawaited(_refresh()),
          ),
        ],
      ),
      floatingActionButton: _buildDualFab(context),
      bottomNavigationBar: _buildBottomNav(context),
      body: Column(
        children: <Widget>[
          const FailedOpsBannerHost(),
          // Server-confirmed sends surface here ("Message sent" + Undo)
          // via W2's sentMessagesProvider; sits next to the failed-ops
          // banner so both queue surfaces live in one place.
          const SendUndoHost(),
          _buildFilterBar(),
          Expanded(
            child: inbox.when(
              // First load with nothing cached yet: full-screen spinner.
              // Refreshing with rows on screen: keep the list
              // (stale-while-refresh).
              loading: () {
                final InboxListState? previous = inbox.valueOrNull;
                if (previous != null && previous.threads.isNotEmpty) {
                  return _buildFilteredList(previous);
                }
                return const Center(child: CircularProgressIndicator());
              },
              // Hard failure with no rows to show: error + retry.
              // Failure with rows on screen: keep the list (data wins).
              error: (Object err, StackTrace _) {
                final InboxListState? previous = inbox.valueOrNull;
                if (previous != null && previous.threads.isNotEmpty) {
                  return _buildFilteredList(previous);
                }
                return _buildError(_errorMessage(err));
              },
              data: (InboxListState state) {
                if (state.threads.isEmpty) {
                  // The notifier can surface a soft failure as errorMessage
                  // on an otherwise-valid (empty) state; treat it like a
                  // hard error.
                  final String? softError = state.errorMessage;
                  if (softError != null) return _buildError(softError);
                  return _buildEmpty();
                }
                return _buildFilteredList(state);
              },
            ),
          ),
        ],
      ),
    );
  }

  /// Outlook Mobile Parity: Focused | Other tabs + Flagged filter chip.
  Widget _buildFilterBar() {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(
            color: scheme.outlineVariant.withValues(alpha: 0.5),
            width: 0.5,
          ),
        ),
      ),
      child: Row(
        children: <Widget>[
          // Focused tab
          InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: () {
              if (_selectedTab != InboxFilterTab.focused) {
                setState(() => _selectedTab = InboxFilterTab.focused);
              }
            },
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              child: Text(
                'Focused',
                style: textTheme.titleSmall?.copyWith(
                  fontWeight: _selectedTab == InboxFilterTab.focused
                      ? FontWeight.bold
                      : FontWeight.normal,
                  color: _selectedTab == InboxFilterTab.focused
                      ? scheme.primary
                      : scheme.onSurfaceVariant,
                ),
              ),
            ),
          ),
          const SizedBox(width: 4),
          // Other tab
          InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: () {
              if (_selectedTab != InboxFilterTab.other) {
                setState(() => _selectedTab = InboxFilterTab.other);
              }
            },
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              child: Text(
                'Other',
                style: textTheme.titleSmall?.copyWith(
                  fontWeight: _selectedTab == InboxFilterTab.other
                      ? FontWeight.bold
                      : FontWeight.normal,
                  color: _selectedTab == InboxFilterTab.other
                      ? scheme.primary
                      : scheme.onSurfaceVariant,
                ),
              ),
            ),
          ),
          const Spacer(),
          // Flagged filter chip
          FilterChip(
            avatar: Icon(
              _filterFlagged ? Icons.flag : Icons.flag_outlined,
              size: 16,
              color: _filterFlagged ? scheme.primary : scheme.onSurfaceVariant,
            ),
            label: const Text('Flagged'),
            selected: _filterFlagged,
            onSelected: (bool selected) {
              setState(() => _filterFlagged = selected);
            },
            visualDensity: VisualDensity.compact,
            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
        ],
      ),
    );
  }

  /// Outlook Mobile Parity: Dual AI + Compose floating pill.
  Widget _buildDualFab(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Material(
      elevation: 4,
      borderRadius: BorderRadius.circular(28),
      color: scheme.primaryContainer,
      clipBehavior: Clip.antiAlias,
      child: Container(
        height: 52,
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            // Quanty AI sparkle button
            Semantics(
              button: true,
              label: 'Quanty AI',
              child: InkWell(
                borderRadius: BorderRadius.circular(24),
                onTap: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Quanty AI assistant activated'),
                      duration: Duration(seconds: 2),
                    ),
                  );
                },
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      Icon(
                        Icons.auto_awesome,
                        color: scheme.onPrimaryContainer,
                        size: 20,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        'Quanty AI',
                        style: TextStyle(
                          color: scheme.onPrimaryContainer,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            Container(
              height: 24,
              width: 1,
              margin: const EdgeInsets.symmetric(horizontal: 2),
              color: scheme.onPrimaryContainer.withValues(alpha: 0.2),
            ),
            // Compose button
            Semantics(
              button: true,
              label: 'Compose',
              child: InkWell(
                borderRadius: BorderRadius.circular(24),
                onTap: () => context.pushNamed('compose'),
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      Icon(
                        Icons.edit_outlined,
                        color: scheme.onPrimaryContainer,
                        size: 20,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        'Compose',
                        style: TextStyle(
                          color: scheme.onPrimaryContainer,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Outlook Mobile Parity: 3-tab bottom navigation bar (Email, Calendar, Apps).
  Widget _buildBottomNav(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;
    return Container(
      height: 58,
      decoration: BoxDecoration(
        color: scheme.surface,
        border: Border(
          top: BorderSide(
            color: scheme.outlineVariant.withValues(alpha: 0.45),
            width: 0.5,
          ),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: <Widget>[
          _BottomNavItem(
            icon: Icons.mail,
            label: 'Email',
            active: true,
            color: scheme.primary,
            textStyle: textTheme.labelSmall,
            onTap: () {},
          ),
          _BottomNavItem(
            icon: Icons.calendar_today_outlined,
            label: 'Calendar',
            active: false,
            color: scheme.onSurfaceVariant,
            textStyle: textTheme.labelSmall,
            onTap: () {},
          ),
          _BottomNavItem(
            icon: Icons.grid_view_outlined,
            label: 'Apps',
            active: false,
            color: scheme.onSurfaceVariant,
            textStyle: textTheme.labelSmall,
            onTap: () => context.pushNamed('search'),
          ),
        ],
      ),
    );
  }

  /// Filters the raw threads by Focused/Other tab and Flagged state.
  Widget _buildFilteredList(InboxListState state) {
    final List<ThreadSummary> filtered = state.threads.where((ThreadSummary t) {
      if (_selectedTab == InboxFilterTab.focused) {
        if (t.isFocused == false) return false;
      } else {
        if (t.isFocused != false) return false;
      }
      if (_filterFlagged && !t.isFlagged) return false;
      return true;
    }).toList();

    if (filtered.isEmpty) {
      return _buildEmptyFiltered();
    }
    return _buildList(filtered, state);
  }

  /// Empty state when all threads are filtered out by tab or flag.
  Widget _buildEmptyFiltered() {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(
              _filterFlagged ? Icons.flag_outlined : Icons.inbox_outlined,
              size: 48,
              color: scheme.onSurfaceVariant,
            ),
            const SizedBox(height: 16),
            Text(
              _filterFlagged
                  ? 'No flagged messages'
                  : (_selectedTab == InboxFilterTab.focused
                      ? 'No focused messages'
                      : 'No other messages'),
              style: textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              _filterFlagged
                  ? 'Flag messages to keep track of them here.'
                  : 'Your ${_selectedTab.name} inbox is empty.',
              style: textTheme.bodyMedium?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  /// The scrollable thread list with pull-to-refresh and a load-more tail.
  Widget _buildList(List<ThreadSummary> threads, InboxListState state) {
    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView.builder(
        // Fixed row height: no measurement pass, jank-free for 10k rows.
        // 76 row + 1 divider (VQA-P2-01).
        itemExtent: 77,
        itemCount: threads.length + (state.hasMore ? 1 : 0),
        physics: const AlwaysScrollableScrollPhysics(),
        itemBuilder: (BuildContext context, int index) {
          if (index >= threads.length) {
            return _LoadMoreItem(
              // Re-arm per page: each appended page gets a fresh item (keyed
              // by thread count) that fires loadMore exactly once.
              key: ValueKey<int>(threads.length),
              shouldTrigger: !state.isLoadingMore,
              onLoadMore: () =>
                  unawaited(ref.read(inboxProvider.notifier).loadMore()),
            );
          }
          // VQA-P2-01: hairline divider between rows (theme `dividerColor`
          // via DividerThemeData). It lives inside the fixed-extent item so
          // the list keeps its jank-free itemExtent.
          return Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              SizedBox(
                height: 76,
                child: _ThreadRow(
                  thread: threads[index],
                  // The injectable clock (VQA-P2-10): golden-safe labels.
                  clock: ref.watch(clockProvider),
                ),
              ),
              const Divider(height: 1),
            ],
          );
        },
      ),
    );
  }

  /// Error state: icon, message, retry.
  Widget _buildError(String message) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(Icons.error_outline, size: 48, color: scheme.error),
            const SizedBox(height: 16),
            Text('Something went wrong', style: textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(
              message,
              style: textTheme.bodyMedium
                  ?.copyWith(color: scheme.onSurfaceVariant),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              // VQA-P2-06: touch target >= 48dp (program standard).
              style: FilledButton.styleFrom(
                minimumSize: const Size(64, 48),
              ),
              onPressed: () => unawaited(_refresh()),
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }

  /// Empty inbox: nothing to do.
  Widget _buildEmpty() {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(
              Icons.inbox_outlined,
              size: 64,
              color: scheme.onSurfaceVariant,
            ),
            const SizedBox(height: 16),
            Text('Sab padh liya! 🎉', style: textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              'Naya mail aate hi yahan dikhega.',
              style: textTheme.bodyMedium
                  ?.copyWith(color: scheme.onSurfaceVariant),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  /// Best-effort human message for a provider failure.
  String _errorMessage(Object err) {
    if (err is Exception) {
      final String text = err.toString().replaceFirst('Exception: ', '');
      if (text.trim().isNotEmpty) return text;
    }
    return 'Could not load your inbox. Check your connection and try again.';
  }
}

/// Tail spinner of the list: fires [onLoadMore] exactly once (post-frame)
/// when it first appears, i.e. when the user scrolls near the end of the
/// loaded page. Guarded by [shouldTrigger] so an in-flight page fetch is
/// never duplicated.
class _LoadMoreItem extends StatefulWidget {
  const _LoadMoreItem({
    super.key,
    required this.shouldTrigger,
    required this.onLoadMore,
  });

  final bool shouldTrigger;
  final VoidCallback onLoadMore;

  @override
  State<_LoadMoreItem> createState() => _LoadMoreItemState();
}

class _LoadMoreItemState extends State<_LoadMoreItem> {
  bool _triggered = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _triggered || !widget.shouldTrigger) return;
      _triggered = true;
      widget.onLoadMore();
    });
  }

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: SizedBox(
        height: 24,
        width: 24,
        child: CircularProgressIndicator(strokeWidth: 2),
      ),
    );
  }
}

/// One inbox row: avatar, subject/snippet, date + unread dot / count badge.
///
/// Taps PUSH the named 'thread' route (app_router.dart) so the system
/// back gesture and the thread screen's explicit back button both return
/// to the inbox — VQA-P1-02: the thread view is never a dead end.
class _ThreadRow extends StatelessWidget {
  const _ThreadRow({required this.thread, required this.clock});

  final ThreadSummary thread;

  /// Injectable clock for golden-deterministic relative dates (VQA-P2-10).
  final QuantClock clock;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;
    final bool unread = !thread.isRead;
    final String subject = thread.subject?.trim() ?? '';
    final String snippet = thread.snippet?.trim() ?? '';

    return Semantics(
      button: true,
      label: _rowSemanticsLabel(subject, snippet),
      child: InkWell(
        onTap: () => context.pushNamed(
          'thread',
          pathParameters: <String, String>{'threadId': thread.id},
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: <Widget>[
              // VQA-P2-02: per-sender hue variation (Gmail/Superhuman
              // pattern) — hashed from the thread id across a small
              // brand-token-derived palette instead of one orange wall.
              SenderAvatar(
                seed: _avatarSeed(),
                initial: _avatarInitial(subject),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      subject.isEmpty ? '(No subject)' : subject,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: textTheme.bodyLarge?.copyWith(
                        fontWeight:
                            unread ? FontWeight.bold : FontWeight.normal,
                      ),
                    ),
                    if (snippet.isNotEmpty) ...<Widget>[
                      const SizedBox(height: 2),
                      Row(
                        children: <Widget>[
                          if (thread.colorCategories.isNotEmpty) ...<Widget>[
                            _CategoryChip(name: thread.colorCategories.first),
                            const SizedBox(width: 6),
                          ],
                          Expanded(
                            child: Text(
                              snippet,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: textTheme.bodyMedium?.copyWith(
                                color: scheme.onSurfaceVariant,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: <Widget>[
                  Text(
                    formatRelativeDate(thread.lastMessageDate, clock),
                    style: textTheme.labelSmall?.copyWith(
                      color:
                          unread ? scheme.primary : scheme.onSurfaceVariant,
                      fontWeight:
                          unread ? FontWeight.bold : FontWeight.normal,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      if (thread.isPinned)
                        Padding(
                          padding: const EdgeInsets.only(right: 4),
                          child: Icon(
                            Icons.push_pin,
                            size: 14,
                            color: scheme.primary,
                          ),
                        ),
                      if (thread.isFlagged)
                        Padding(
                          padding: const EdgeInsets.only(right: 4),
                          child: const Icon(
                            Icons.flag,
                            size: 14,
                            color: Colors.redAccent,
                          ),
                        ),
                      _trailingBadge(context, unread),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Right-column marker: unread dot, else the message-count badge, else a
  /// fixed spacer so rows line up.
  Widget _trailingBadge(BuildContext context, bool unread) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    if (unread) {
      return Semantics(
        label: 'Unread',
        child: Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(
            color: scheme.primary,
            shape: BoxShape.circle,
          ),
        ),
      );
    }
    final int? count = thread.messageCount;
    if (count != null && count > 1) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(
          '$count',
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
        ),
      );
    }
    return const SizedBox(width: 10, height: 10);
  }

  String _rowSemanticsLabel(String subject, String snippet) {
    final StringBuffer label = StringBuffer();
    if (thread.isPinned) label.write('Pinned. ');
    if (thread.isFlagged) label.write('Flagged. ');
    if (!thread.isRead) label.write('Unread. ');
    label.write('Thread');
    if (subject.isNotEmpty) label.write(': $subject');
    if (snippet.isNotEmpty) label.write('. $snippet');
    final String date = formatRelativeDate(thread.lastMessageDate, clock);
    if (date.isNotEmpty) label.write('. $date');
    return label.toString();
  }

  /// First letter of the first participant, else of the subject.
  String _avatarInitial(String subject) {
    for (final String name in thread.participantNames) {
      final String trimmed = name.trim();
      if (trimmed.isNotEmpty) {
        return trimmed.characters.first.toUpperCase();
      }
    }
    if (subject.isNotEmpty) return subject.characters.first.toUpperCase();
    return '?';
  }

  /// Hash seed for the avatar hue: the stable thread id, falling back to
  /// the first participant name.
  String _avatarSeed() {
    if (thread.id.isNotEmpty) return thread.id;
    for (final String name in thread.participantNames) {
      if (name.trim().isNotEmpty) return name.trim();
    }
    return '?';
  }
}

class _BottomNavItem extends StatelessWidget {
  const _BottomNavItem({
    required this.icon,
    required this.label,
    required this.active,
    required this.color,
    required this.textStyle,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool active;
  final Color color;
  final TextStyle? textStyle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(icon, size: 20, color: color),
            const SizedBox(height: 2),
            Text(
              label,
              style: textStyle?.copyWith(
                color: color,
                fontWeight: active ? FontWeight.w600 : FontWeight.normal,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CategoryChip extends StatelessWidget {
  const _CategoryChip({required this.name});

  final String name;

  Color _resolveColor() {
    final String lower = name.toLowerCase();
    if (lower.contains('red')) return const Color(0xFFEF4444);
    if (lower.contains('orange')) return const Color(0xFFFF6B35);
    if (lower.contains('yellow')) return const Color(0xFFF59E0B);
    if (lower.contains('green')) return const Color(0xFF10B981);
    if (lower.contains('blue')) return const Color(0xFF38BDF8);
    if (lower.contains('purple')) return const Color(0xFF8B5CF6);
    return const Color(0xFFFF6B35);
  }

  @override
  Widget build(BuildContext context) {
    final Color c = _resolveColor();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: c.withValues(alpha: 0.45), width: 0.5),
      ),
      child: Text(
        name.replaceAll(' Category', '').replaceAll(' category', ''),
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: c,
        ),
      ),
    );
  }
}


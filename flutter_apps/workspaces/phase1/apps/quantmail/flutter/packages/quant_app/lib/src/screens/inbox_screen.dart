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
import 'package:quant_core/quant_core.dart';

/// Inbox list screen: watches [inboxProvider] and renders loading / error /
/// empty / list states. Pull-to-refresh and paged load-more are driven by the
/// notifier; this widget never touches the network or the cache itself.
class InboxScreen extends ConsumerStatefulWidget {
  const InboxScreen({super.key});

  @override
  ConsumerState<InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends ConsumerState<InboxScreen> {
  Future<void> _refresh() => ref.read(inboxProvider.notifier).refresh();

  @override
  Widget build(BuildContext context) {
    final AsyncValue<InboxListState> inbox = ref.watch(inboxProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Inbox'),
        actions: <Widget>[
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh inbox',
            onPressed: () => unawaited(_refresh()),
          ),
        ],
      ),
      body: inbox.when(
        // First load with nothing cached yet: full-screen spinner.
        // Refreshing with rows on screen: keep the list (stale-while-refresh).
        loading: () {
          final InboxListState? previous = inbox.valueOrNull;
          if (previous != null && previous.threads.isNotEmpty) {
            return _buildList(previous);
          }
          return const Center(child: CircularProgressIndicator());
        },
        // Hard failure with no rows to show: error + retry.
        // Failure with rows on screen: keep the list (data wins).
        error: (Object err, StackTrace _) {
          final InboxListState? previous = inbox.valueOrNull;
          if (previous != null && previous.threads.isNotEmpty) {
            return _buildList(previous);
          }
          return _buildError(_errorMessage(err));
        },
        data: (InboxListState state) {
          if (state.threads.isEmpty) {
            // The notifier can surface a soft failure as errorMessage on an
            // otherwise-valid (empty) state; treat it like a hard error.
            final String? softError = state.errorMessage;
            if (softError != null) return _buildError(softError);
            return _buildEmpty();
          }
          return _buildList(state);
        },
      ),
    );
  }

  /// The scrollable thread list with pull-to-refresh and a load-more tail.
  Widget _buildList(InboxListState state) {
    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView.builder(
        // Fixed row height: no measurement pass, jank-free for 10k rows.
        itemExtent: 76,
        itemCount: state.threads.length + (state.hasMore ? 1 : 0),
        physics: const AlwaysScrollableScrollPhysics(),
        itemBuilder: (BuildContext context, int index) {
          if (index >= state.threads.length) {
            return _LoadMoreItem(
              // Re-arm per page: each appended page gets a fresh item (keyed
              // by thread count) that fires loadMore exactly once.
              key: ValueKey<int>(state.threads.length),
              shouldTrigger: !state.isLoadingMore,
              onLoadMore: () =>
                  unawaited(ref.read(inboxProvider.notifier).loadMore()),
            );
          }
          return _ThreadRow(thread: state.threads[index]);
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
            Text("You're all caught up", style: textTheme.titleMedium),
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
/// Taps navigate to the named 'thread' route (app_router.dart).
class _ThreadRow extends StatelessWidget {
  const _ThreadRow({required this.thread});

  final ThreadSummary thread;

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
        onTap: () => context.goNamed(
          'thread',
          pathParameters: <String, String>{'threadId': thread.id},
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: <Widget>[
              CircleAvatar(
                radius: 20,
                backgroundColor: scheme.primaryContainer,
                child: Text(
                  _avatarInitial(subject),
                  style: textTheme.titleMedium?.copyWith(
                    color: scheme.onPrimaryContainer,
                  ),
                ),
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
                      Text(
                        snippet,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: textTheme.bodyMedium?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
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
                    _relativeDate(thread.lastMessageDate),
                    style: textTheme.labelSmall?.copyWith(
                      color:
                          unread ? scheme.primary : scheme.onSurfaceVariant,
                      fontWeight:
                          unread ? FontWeight.bold : FontWeight.normal,
                    ),
                  ),
                  const SizedBox(height: 4),
                  _trailingBadge(context, unread),
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
    if (!thread.isRead) label.write('Unread. ');
    label.write('Thread');
    if (subject.isNotEmpty) label.write(': $subject');
    if (snippet.isNotEmpty) label.write('. $snippet');
    final String date = _relativeDate(thread.lastMessageDate);
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
}

/// Compact relative date for the row: "now" / "5m" / "2h" / "Tue" /
/// "Oct 2" / "Oct 2, 2025".
String _relativeDate(DateTime? date) {
  if (date == null) return '';
  final DateTime now = DateTime.now();
  final Duration diff = now.difference(date);
  if (diff.isNegative || diff.inMinutes < 1) return 'now';
  if (diff.inHours < 1) return '${diff.inMinutes}m';
  if (diff.inHours < 24) return '${diff.inHours}h';
  if (diff.inDays < 7) return _weekdayShort(date.weekday);
  if (now.year == date.year) return '${_monthShort(date.month)} ${date.day}';
  return '${_monthShort(date.month)} ${date.day}, ${date.year}';
}

String _weekdayShort(int weekday) {
  const List<String> names = <String>[
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
    'Sun'
  ];
  return names[weekday - 1];
}

String _monthShort(int month) {
  const List<String> names = <String>[
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec'
  ];
  return names[month - 1];
}

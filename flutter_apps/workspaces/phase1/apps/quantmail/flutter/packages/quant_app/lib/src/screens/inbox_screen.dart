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
        // VQA-P2-07: bottom hairline — the bar (surface #111318) otherwise
        // blends straight into the list with no structural edge.
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1, thickness: 1),
        ),
        actions: <Widget>[
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh inbox',
            onPressed: () => unawaited(_refresh()),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.pushNamed('compose'),
        icon: const Icon(Icons.edit_outlined),
        label: const Text('Compose'),
      ),
      body: Column(
        children: <Widget>[
          const FailedOpsBannerHost(),
          // Server-confirmed sends surface here ("Message sent" + Undo)
          // via W2's sentMessagesProvider; sits next to the failed-ops
          // banner so both queue surfaces live in one place.
          const SendUndoHost(),
          Expanded(
            child: inbox.when(
              // First load with nothing cached yet: full-screen spinner.
              // Refreshing with rows on screen: keep the list
              // (stale-while-refresh).
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
                  // The notifier can surface a soft failure as errorMessage
                  // on an otherwise-valid (empty) state; treat it like a
                  // hard error.
                  final String? softError = state.errorMessage;
                  if (softError != null) return _buildError(softError);
                  return _buildEmpty();
                }
                return _buildList(state);
              },
            ),
          ),
        ],
      ),
    );
  }

  /// The scrollable thread list with pull-to-refresh and a load-more tail.
  Widget _buildList(InboxListState state) {
    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView.builder(
        // Fixed row height: no measurement pass, jank-free for 10k rows.
        // 76 row + 1 divider (VQA-P2-01).
        itemExtent: 77,
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
          // VQA-P2-01: hairline divider between rows (theme `dividerColor`
          // via DividerThemeData). It lives inside the fixed-extent item so
          // the list keeps its jank-free itemExtent.
          return Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              SizedBox(
                height: 76,
                child: _ThreadRow(
                  thread: state.threads[index],
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
            Text("You're all caught up", style: textTheme.titleMedium),
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
              CircleAvatar(
                radius: 20,
                // VQA-P2-02: per-sender hue variation (Gmail/Superhuman
                // pattern) — hashed from the thread id across a small
                // brand-token-derived palette instead of one orange wall.
                backgroundColor:
                    _avatarBackground(_avatarSeed(), scheme),
                child: Text(
                  _avatarInitial(subject),
                  style: textTheme.titleMedium?.copyWith(
                    color: _avatarForeground(_avatarSeed(), scheme),
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
                    formatRelativeDate(thread.lastMessageDate, clock),
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

/// VQA-P2-02: brand-derived avatar palette. The theme primary's hue is
/// rotated across 6 stops, so per-sender avatars vary (Gmail/Superhuman
/// scanning aid) while staying on-brand. FNV-1a keeps the seed -> hue
/// mapping deterministic across runs (golden-safe; `String.hashCode`
/// is not stable across executions).
double _avatarHue(String seed, ColorScheme scheme) {
  final double baseHue = HSLColor.fromColor(scheme.primary).hue;
  return (baseHue + (_fnv1a32(seed) % 6) * 60.0) % 360.0;
}

/// Muted container tint for the avatar at the row's seed hue.
Color _avatarBackground(String seed, ColorScheme scheme) {
  final bool isDark = scheme.brightness == Brightness.dark;
  return HSLColor.fromAHSL(
    1,
    _avatarHue(seed, scheme),
    isDark ? 0.45 : 0.55,
    isDark ? 0.30 : 0.86,
  ).toColor();
}

/// Legible initial color on [_avatarBackground] at the same hue.
Color _avatarForeground(String seed, ColorScheme scheme) {
  final bool isDark = scheme.brightness == Brightness.dark;
  return HSLColor.fromAHSL(
    1,
    _avatarHue(seed, scheme),
    isDark ? 0.50 : 0.45,
    isDark ? 0.90 : 0.25,
  ).toColor();
}

/// FNV-1a 32-bit: tiny, dependency-free, deterministic string hash.
int _fnv1a32(String s) {
  int hash = 0x811C9DC5;
  for (int i = 0; i < s.length; i++) {
    hash ^= s.codeUnitAt(i);
    hash = (hash * 0x01000193) & 0xFFFFFFFF;
  }
  return hash;
}

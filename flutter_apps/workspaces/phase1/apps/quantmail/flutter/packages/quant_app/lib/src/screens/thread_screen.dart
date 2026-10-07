// ============================================================================
// quant_app - Thread view (M5: W2 - UI layer)
// ============================================================================
//
// Real thread view: watches W1's `threadDetailProvider` family (quant_core)
// and renders the conversation's messages. No fake mail data anywhere.
//
// Verified contracts (do NOT guess field names):
// - `threadDetailProvider`:
//   `AsyncNotifierProviderFamily<ThreadDetailNotifier, ThreadDetail, String>`
//   (quant_core `src/mail/thread_detail_providers.dart`).
//   `ref.watch(threadDetailProvider(threadId))` -> `AsyncValue<ThreadDetail>`;
//   `ref.read(threadDetailProvider(threadId).notifier).refresh()` for
//   pull-to-refresh; `.markReadOptimistic()` (Future<bool>) on open.
// - `ThreadDetail(summary: ThreadSummary, messages: List<Email>)`
//   (quant_core `src/mail/threads_api.dart`).
// - `Email`: id, threadId?, subject?, snippet?, from (EmailAddress.display),
//   to, cc, date (DateTime?), labels, isRead, isStarred, hasAttachments,
//   folderId?. There is NO `body` field — the repaired OpenAPI `Email`
//   schema carries no message body, so cards render `snippet`.
//   TODO(UNVERIFIED): full bodyHtml/bodyText rendering needs a body-capable
//   message endpoint + Email model extension (M6+).
// - Actions row uses the M6 modifier queue: Archive / Mark-unread / Delete
//   go through W2's `ThreadMutationService` (synchronous local flip +
//   persistent outbox op + async drain) via `threadMutationServiceProvider`.
//   The screen never calls `POST /emails/batch` directly anymore — the
//   drainer owns every server write.
// - Reply: the AppBar Reply action pushes the `/compose` route prefilled
//   with the last message's sender (`To`), `Re: <subject>` and the reply
//   linkage (`threadId`/`inReplyTo`) — M7 compose UI. Forward is still out
//   of scope: the backend exposes no forward endpoint.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:quant_app/src/widgets/failed_ops_banner.dart';
import 'package:quant_app/src/widgets/sender_avatar.dart';
import 'package:quant_app/src/widgets/send_undo_host.dart';
import 'package:quant_core/quant_core.dart';

/// Thread detail screen: AppBar with the thread subject, a message list,
/// and an actions row (Archive / Mark unread / Delete) wired to the real
/// `POST /emails/batch` via the [ThreadMutationService] modifier queue
/// (synchronous local flip + persistent outbox op + async drain — the
/// screen never touches the batch endpoint directly).
///
/// A [FailedOpsBannerHost] sits above the list: permanently-failed outbox
/// ops surface there with retry/discard affordances.
///
/// The constructor signature is pinned: visual-qa's golden test instantiates
/// `ThreadScreen(threadId: ...)` — do not change it.
class ThreadScreen extends ConsumerStatefulWidget {
  const ThreadScreen({super.key, required this.threadId});

  /// Path parameter from `/thread/:threadId`. The backend resolves either a
  /// thread id or an email id (threads are created lazily), so this is
  /// passed through untouched — see `ThreadsApi.resolveThread`.
  final String threadId;

  @override
  ConsumerState<ThreadScreen> createState() => _ThreadScreenState();
}

class _ThreadScreenState extends ConsumerState<ThreadScreen> {
  /// Single-fire guard for the post-frame mark-read.
  bool _markReadFired = false;

  /// True while an Archive / Mark-unread / Delete batch is in flight.
  bool _actionInFlight = false;

  @override
  void didUpdateWidget(covariant ThreadScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.threadId != widget.threadId) {
      _markReadFired = false;
    }
  }

  /// Fires [ThreadDetailNotifier.markReadOptimistic] once, after the first
  /// frame that has data. The notifier flips the UI to read instantly and
  /// confirms/rolls back against the server underneath.
  void _fireMarkReadOnce(AsyncValue<ThreadDetail> thread) {
    if (_markReadFired || !thread.hasValue) return;
    _markReadFired = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      unawaited(
        ref
            .read(threadDetailProvider(widget.threadId).notifier)
            .markReadOptimistic(),
      );
    });
  }

  Future<void> _refresh() =>
      ref.read(threadDetailProvider(widget.threadId).notifier).refresh();

  /// Runs one modifier-queue action against every message in the thread.
  /// Archive and Delete leave the thread view (the thread is gone from the
  /// inbox); Mark-unread stays and re-reads the thread from the caches.
  ///
  /// The [ThreadMutationService] never throws: the local flip already
  /// applied and the op is persisted + draining, so confirmations are
  /// optimistic-queued ("Archived" = queued, not server-confirmed).
  Future<void> _runBatchAction(
    String action, {
    required bool popOnSuccess,
  }) async {
    if (_actionInFlight) return;
    final List<String> ids = <String>[
      for (final Email message
          in ref.read(threadDetailProvider(widget.threadId)).valueOrNull?.messages ??
              const <Email>[])
        if (message.id.isNotEmpty) message.id,
    ];
    if (ids.isEmpty) {
      _showSnack('Thread abhi load ho raha hai — thoda ruko.');
      return;
    }
    setState(() => _actionInFlight = true);
    try {
      final ThreadMutationService service =
          ref.read(threadMutationServiceProvider);
      switch (action) {
        case 'archive':
          await service.archive(widget.threadId, ids);
        case 'markUnread':
          await service.markUnread(widget.threadId, ids);
        case 'delete':
          await service.deleteThread(widget.threadId, ids);
        default:
          // Unreachable: the actions row only offers these three.
          return;
      }
      if (!mounted) return;
      // The caches already carry the optimistic flip — re-read from them
      // (offline-first) instead of forcing a network refresh.
      //
      // The confirmation goes out BEFORE the pop: popping the route clears
      // snackbars tied to it, so a post-pop _showSnack would vanish with
      // the transition instead of reaching the user.
      _showSnack(_confirmationFor(action));
      if (popOnSuccess) {
        // Plain Navigator pop (not go_router's context.pop()): identical
        // behavior under the app's single Navigator, and testable without
        // a GoRouter in the tree.
        Navigator.of(context).pop();
      } else {
        ref.invalidate(threadDetailProvider(widget.threadId));
      }
    } finally {
      if (mounted) setState(() => _actionInFlight = false);
    }
  }

  /// Brief optimistic-queued confirmation per action.
  String _confirmationFor(String action) {
    switch (action) {
      case 'archive':
        return 'Thread archived';
      case 'markUnread':
        return 'Marked as unread';
      case 'delete':
        return 'Thread deleted';
      default:
        return 'Done';
    }
  }

  Future<void> _confirmDelete() async {
    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (BuildContext context) => AlertDialog(
        title: const Text('Delete thread?'),
        content: const Text(
          'Every message in this thread moves to Trash.',
        ),
        actions: <Widget>[
          TextButton(
            // VQA-P2-06: touch target >= 48dp (program standard).
            style: TextButton.styleFrom(
              minimumSize: const Size(64, 48),
            ),
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              minimumSize: const Size(64, 48),
            ),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await _runBatchAction('delete', popOnSuccess: true);
    }
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  /// Opens the composer prefilled as a reply to the thread's last message
  /// (messages are oldest-first, so `messages.last` is the reply target).
  ///
  /// Subject keeps an existing `Re:` (no `Re: Re: …`); the compose screen
  /// receives the reply linkage (`threadId`/`inReplyTo`) through the
  /// `/compose` query parameters.
  void _openReply() {
    final ThreadDetail? detail =
        ref.read(threadDetailProvider(widget.threadId)).valueOrNull;
    final List<Email>? messages = detail?.messages;
    if (messages == null || messages.isEmpty) return;
    final Email last = messages.last;
    final String subject = detail?.summary.subject?.trim() ?? '';
    final String replySubject = subject.isEmpty
        ? ''
        : subject.toLowerCase().startsWith('re:')
            ? subject
            : 'Re: $subject';
    final Map<String, String> query = <String, String>{
      'threadId': widget.threadId,
      if (last.id.isNotEmpty) 'inReplyTo': last.id,
      if (last.from.email.isNotEmpty) 'to': last.from.email,
      if (replySubject.isNotEmpty) 'subject': replySubject,
    };
    context.pushNamed('compose', queryParameters: query);
  }

  @override
  Widget build(BuildContext context) {
    final AsyncValue<ThreadDetail> thread =
        ref.watch(threadDetailProvider(widget.threadId));
    _fireMarkReadOnce(thread);

    final ThreadSummary? summary = thread.valueOrNull?.summary;
    final String? subject = summary?.subject;
    final bool canAct = thread.hasValue && !_actionInFlight;
    final bool canReply = thread.hasValue &&
        (thread.valueOrNull?.messages.isNotEmpty ?? false);

    return Scaffold(
      appBar: AppBar(
        // VQA-P1-02: the thread view is never a navigation dead end — an
        // explicit leading back button (iOS-mail style) plus the inbox's
        // pushNamed means back always returns to the inbox.
        leading: BackButton(
          onPressed: () => context.pop(),
        ),
        // VQA-P2-07: bottom hairline — the bar blends into the cards
        // without a structural edge.
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1, thickness: 1),
        ),
        title: Text(
          (subject != null && subject.isNotEmpty) ? subject : 'Thread',
          overflow: TextOverflow.ellipsis,
        ),
        actions: <Widget>[
          IconButton(
            icon: const Icon(Icons.reply_outlined),
            // The tooltip doubles as the semantics label for the action.
            tooltip: 'Reply',
            // Enabled only once the thread loaded with messages: the reply
            // prefill needs the last message (messages are oldest-first).
            onPressed: canReply ? _openReply : null,
          ),
          IconButton(
            icon: const Icon(Icons.archive_outlined),
            // The tooltip doubles as the semantics label for the action.
            tooltip: 'Archive thread',
            onPressed: canAct
                ? () => unawaited(
                      _runBatchAction('archive', popOnSuccess: true),
                    )
                : null,
          ),
          IconButton(
            icon: const Icon(Icons.mark_email_unread_outlined),
            tooltip: 'Mark thread unread',
            onPressed: canAct
                ? () => unawaited(
                      _runBatchAction('markUnread', popOnSuccess: false),
                    )
                : null,
          ),
          IconButton(
            icon: const Icon(Icons.delete_outline),
            tooltip: 'Delete thread',
            onPressed: canAct ? _confirmDelete : null,
          ),
        ],
      ),
      body: Column(
        children: <Widget>[
          const FailedOpsBannerHost(),
          // Server-confirmed sends surface here ("Message sent" + Undo)
          // via W2's sentMessagesProvider; sits next to the failed-ops
          // banner so both queue surfaces live in one place.
          const SendUndoHost(),
          Expanded(
            child: thread.when(
              // First load with nothing yet: full-screen spinner. Refreshing
              // with a detail on screen: keep the list (stale-while-refresh).
              loading: () {
                final ThreadDetail? previous = thread.valueOrNull;
                if (previous != null && previous.messages.isNotEmpty) {
                  return _buildList(previous);
                }
                return const Center(child: CircularProgressIndicator());
              },
              // Hard failure with no detail to show: error + retry. Failure
              // with a detail on screen: keep the list (data wins).
              error: (Object err, StackTrace _) {
                final ThreadDetail? previous = thread.valueOrNull;
                if (previous != null && previous.messages.isNotEmpty) {
                  return _buildList(previous);
                }
                return _ErrorView(
                  message: _errorMessage(err),
                  onRetry: () => unawaited(_refresh()),
                );
              },
              data: (ThreadDetail detail) {
                if (detail.messages.isEmpty) return const _EmptyView();
                return _buildList(detail);
              },
            ),
          ),
        ],
      ),
    );
  }

  /// The scrollable message list with pull-to-refresh.
  Widget _buildList(ThreadDetail detail) {
    // Injectable clock (VQA-P2-10): golden-safe relative timestamps.
    final QuantClock clock = ref.watch(clockProvider);
    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: detail.messages.length,
        itemBuilder: (BuildContext context, int index) {
          final Email message = detail.messages[index];
          return RepaintBoundary(
            child: _MessageCard(
              message: message,
              // The thread subject is shown once, on the first message.
              showSubject: index == 0,
              clock: clock,
            ),
          );
        },
      ),
    );
  }
}

/// Human-readable error text. W1 normalizes provider failures to
/// [ThreadDetailException]; anything else is an unexpected failure.
String _errorMessage(Object err) {
  if (err is ThreadDetailException) return err.message;
  return 'Thread load nahi ho payi — internet check karke dobara try karo.';
}

/// One message in the thread: sender, relative date, subject (first message
/// only) and the snippet as content. Unread messages render bold with an
/// unread dot; star and attachment state surface as icons (VQA-P2-09,
/// Gmail parity); everything is colorScheme-driven (dark-theme safe).
class _MessageCard extends StatelessWidget {
  const _MessageCard({
    required this.message,
    required this.showSubject,
    required this.clock,
  });

  final Email message;
  final bool showSubject;

  /// Injectable clock for golden-deterministic relative dates (VQA-P2-10).
  final QuantClock clock;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;
    final bool unread = !message.isRead;
    final String sender = message.from.display;
    final String? subject = message.subject;
    final String? snippet = message.snippet;

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      // VQA-P3-01: unread tint — `primaryContainer` at 35% rendered muddy
      // (#C4B7AF). A 10% primary overlay, alpha-blended over the card
      // surface, keeps the unread emphasis without the mud.
      color: unread
          ? Color.alphaBlend(
              scheme.primary.withValues(alpha: 0.10),
              scheme.surfaceContainer,
            )
          : null,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                // VQA-P2-21: per-sender hue variation, same palette as the
                // inbox (SenderAvatar = one palette authority).
                SenderAvatar(
                  seed: sender,
                  initial: sender.isEmpty ? '?' : sender.characters.first,
                  semanticsLabel: 'Avatar for $sender',
                  // Thread cards keep the default body text inside the
                  // avatar (inbox uses titleMedium) — pass null to preserve
                  // the existing card rendering.
                  textStyle: const TextStyle(),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        sender.isEmpty ? '(Unknown sender)' : sender,
                        style: textTheme.titleSmall?.copyWith(
                          fontWeight:
                              unread ? FontWeight.bold : FontWeight.normal,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (message.date != null)
                        Text(
                          formatRelativeDate(message.date, clock),
                          style: textTheme.bodySmall?.copyWith(
                            color: scheme.onSurfaceVariant,
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                // VQA-P2-09: star + attachment affordances (Gmail parity).
                // Star is filled when starred, outlined otherwise; both are
                // colorScheme-driven so they stay legible on OLED dark.
                // P2-11: single orange accent — the filled star uses primary,
                // not the blue tertiary.
                if (message.isStarred)
                  Semantics(
                    label: 'Starred',
                    child: Icon(
                      Icons.star,
                      size: 18,
                      color: scheme.primary,
                    ),
                  )
                else
                  Semantics(
                    label: 'Not starred',
                    child: Icon(
                      Icons.star_outline,
                      size: 18,
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                if (message.hasAttachments) ...<Widget>[
                  const SizedBox(width: 8),
                  Semantics(
                    label: 'Has attachments',
                    child: Icon(
                      Icons.attach_file,
                      size: 18,
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                ],
                const SizedBox(width: 8),
                if (unread)
                  Semantics(
                    label: 'Unread message',
                    child: Container(
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(
                        color: scheme.primary,
                        shape: BoxShape.circle,
                      ),
                    ),
                  ),
              ],
            ),
            if (showSubject && subject != null && subject.isNotEmpty) ...<Widget>[
              const SizedBox(height: 12),
              Text(subject, style: textTheme.titleMedium),
            ],
            // Email carries no body field (verified model + spec) — the
            // snippet is the full message content available.
            if (snippet != null && snippet.isNotEmpty) ...<Widget>[
              const SizedBox(height: 8),
              Text(snippet, style: textTheme.bodyMedium),
            ],
          ],
        ),
      ),
    );
  }
}

/// Error state: icon, message, retry button (48dp touch target).
class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(
              Icons.error_outline,
              size: 48,
              color: scheme.error,
              semanticLabel: 'Error',
            ),
            const SizedBox(height: 16),
            Text(
              'Something went wrong',
              style: textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              message,
              style: textTheme.bodyMedium?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            // VQA-P2-08: unified with the inbox error state — the brand
            // primary FilledButton (not tonal). 48dp touch target kept.
            FilledButton.icon(
              style: FilledButton.styleFrom(
                minimumSize: const Size(64, 48),
              ),
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Empty state: the thread resolved but carries no messages.
class _EmptyView extends StatelessWidget {
  const _EmptyView();

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(
              Icons.mail_outline,
              size: 48,
              color: scheme.onSurfaceVariant,
              semanticLabel: 'Koi message nahi',
            ),
            const SizedBox(height: 16),
            Text(
              'Koi message nahi',
              style: textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              'Messages abhi nahi mile — neeche kheenchke refresh karo.',
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
}

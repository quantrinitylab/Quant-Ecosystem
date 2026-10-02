// ============================================================================
// quantai_app - conversations list screen, the /home content (W2)
// ============================================================================
//
// Quanty ki saari conversations yahan dikhti hain. W1 ke chat providers se
// wired (contract `package:quantai_core/quantai_core.dart`):
//
//   conversationsProvider          FutureProvider<List<ChatSession>>
//   chatRepositoryProvider         Provider<ChatRepository>
//   ChatRepository.createSession({title, model})
//   ChatRepository.archiveSession(id) / deleteSession(id)
//
// D5: list `ListView.builder` se render hoti hai; pull-to-refresh sirf
// provider ko invalidate karta hai (koi extra fetch layer nahi).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:quantai_core/quantai_core.dart';

/// Conversations list — the authenticated landing (`/home`).
///
/// Har tile me title, relative updated-time aur pinned indicator. Long-press
/// par archive/delete ka bottom sheet; FAB se nayi conversation.
class ConversationsScreen extends ConsumerWidget {
  /// Creates the conversations screen.
  const ConversationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ColorScheme scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('QuantAI'),
        actions: <Widget>[
          IconButton(
            tooltip: 'Sign out',
            icon: const Icon(Icons.logout_outlined),
            onPressed: () =>
                ref.read(authSessionProvider.notifier).logout(),
          ),
        ],
      ),
      body: Builder(
        builder: (BuildContext context) {
          final AsyncValue<List<ChatSession>> conversations =
              ref.watch(conversationsProvider);
          return conversations.when(
            data: (List<ChatSession> sessions) {
              if (sessions.isEmpty) {
                return _EmptyConversations(
                  onStart: () => _startNewChat(context, ref),
                );
              }
              return RefreshIndicator(
                color: scheme.secondary,
                onRefresh: () async {
                  ref.invalidate(conversationsProvider);
                  // Invalidation ke baad fresh load ka intezaar — provider
                  // dobara build hota hai; RefreshIndicator ko ek frame do.
                  await ref.read(conversationsProvider.future);
                },
                child: ListView.builder(
                  itemCount: sessions.length,
                  itemBuilder: (BuildContext context, int index) {
                    final ChatSession session = sessions[index];
                    return _ConversationTile(session: session);
                  },
                ),
              );
            },
            loading: () =>
                const Center(child: CircularProgressIndicator.adaptive()),
            error: (Object error, StackTrace stack) => _ConversationsError(
              onRetry: () => ref.invalidate(conversationsProvider),
            ),
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _startNewChat(context, ref),
        tooltip: 'Nayi conversation',
        icon: const Icon(Icons.add),
        label: const Text('Nayi baat-cheet'),
      ),
    );
  }

  /// Nayi session banao aur seedha uske chat route par le jao.
  Future<void> _startNewChat(BuildContext context, WidgetRef ref) async {
    try {
      final ChatSession session =
          await ref.read(chatRepositoryProvider).createSession();
      ref.invalidate(conversationsProvider);
      if (context.mounted) {
        context.push('/chat/${session.id}');
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Nayi conversation nahi ban payi: $e')),
        );
      }
    }
  }
}

/// Ek conversation ki tile: title, relative time, pinned icon, long-press
/// par archive/delete ka bottom sheet.
class _ConversationTile extends ConsumerWidget {
  const _ConversationTile({required this.session});

  final ChatSession session;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;
    final String subtitle = _relativeTime(session.updatedAt);

    return ListTile(
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      leading: CircleAvatar(
        backgroundColor: scheme.secondary.withValues(alpha: 0.15),
        child: Icon(
          session.pinned ? Icons.push_pin : Icons.chat_bubble_outline,
          color: scheme.secondary,
          size: 20,
        ),
      ),
      title: Text(
        session.title.isEmpty ? 'Bina title wali baat-cheet' : session.title,
        style: textTheme.titleMedium,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      subtitle: subtitle.isEmpty
          ? null
          : Text(
              subtitle,
              style: textTheme.bodySmall
                  ?.copyWith(color: scheme.onSurfaceVariant),
            ),
      trailing: session.messageCount != null && session.messageCount! > 0
          ? Text(
              '${session.messageCount}',
              style: textTheme.labelSmall
                  ?.copyWith(color: scheme.onSurfaceVariant),
            )
          : null,
      onTap: () => context.push('/chat/${session.id}'),
      onLongPress: () => _showSessionActions(context, ref),
    );
  }

  /// Archive / Delete ka bottom sheet.
  Future<void> _showSessionActions(BuildContext context, WidgetRef ref) {
    return showModalBottomSheet<void>(
      context: context,
      builder: (BuildContext sheetContext) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              ListTile(
                leading: const Icon(Icons.archive_outlined),
                title: const Text('Archive karo'),
                onTap: () async {
                  Navigator.of(sheetContext).pop();
                  await ref
                      .read(chatRepositoryProvider)
                      .archiveSession(session.id);
                  ref.invalidate(conversationsProvider);
                },
              ),
              ListTile(
                leading: Icon(
                  Icons.delete_outline,
                  color: Theme.of(sheetContext).colorScheme.error,
                ),
                title: Text(
                  'Delete karo',
                  style: TextStyle(
                    color: Theme.of(sheetContext).colorScheme.error,
                  ),
                ),
                onTap: () async {
                  Navigator.of(sheetContext).pop();
                  await ref
                      .read(chatRepositoryProvider)
                      .deleteSession(session.id);
                  ref.invalidate(conversationsProvider);
                },
              ),
            ],
          ),
        );
      },
    );
  }
}

/// Empty state: pehli conversation shuru karne ka invitation.
class _EmptyConversations extends StatelessWidget {
  const _EmptyConversations({required this.onStart});

  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(
              Icons.auto_awesome,
              size: 64,
              color: scheme.secondary,
            ),
            const SizedBox(height: 24),
            Semantics(
              header: true,
              child: Text(
                'Quanty se kuch poochho',
                style: textTheme.headlineSmall,
                textAlign: TextAlign.center,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Nayi conversation shuru karo — Quanty yahin hai',
              style: textTheme.bodyMedium
                  ?.copyWith(color: scheme.onSurfaceVariant),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: onStart,
              icon: const Icon(Icons.add),
              label: const Text('Nayi baat-cheet shuru karo'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Error state: retry ke saath.
class _ConversationsError extends StatelessWidget {
  const _ConversationsError({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(
              Icons.cloud_off_outlined,
              size: 48,
              color: scheme.onSurfaceVariant,
            ),
            const SizedBox(height: 16),
            Text(
              'Conversations load nahi hui',
              style: textTheme.titleMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              'Network check karo aur dobara try karo',
              style: textTheme.bodyMedium
                  ?.copyWith(color: scheme.onSurfaceVariant),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Dobara try karo'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Hinglish relative time ("5m pehle"). `timeago` dep add kiye bina chhota
/// local helper — pubspec touch nahi karna tha (W1/W3 ki file hai).
String _relativeTime(DateTime? dt) {
  if (dt == null) return '';
  final Duration diff = DateTime.now().difference(dt);
  if (diff.isNegative) return 'abhi';
  if (diff.inMinutes < 1) return 'abhi';
  if (diff.inHours < 1) return '${diff.inMinutes}m pehle';
  if (diff.inDays < 1) return '${diff.inHours}h pehle';
  if (diff.inDays < 7) return '${diff.inDays}d pehle';
  if (diff.inDays < 30) return '${diff.inDays ~/ 7}w pehle';
  return '${dt.day}/${dt.month}/${dt.year}';
}

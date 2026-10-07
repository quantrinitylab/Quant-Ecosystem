// ============================================================================
// quant_chat - chat list screen (QuantChat, shift 2)
//
// Real conversation list against the quantchat spec, fed by chat_core's
// `conversationListProvider`
// (NotifierProvider<ConversationListNotifier, AsyncValue<List<Conversation>>>).
// One vertical slice: list → tap → conversation view (`/chat/:conversationId`
// route, already in the router).
//
// NOTE: the chat layer lives in chat_core's `src/chat/` barrel, deliberately
// not yet wired into `package:chat_core/chat_core.dart` (W2: "W1/W4 wire this
// in when ready"). Until then this file imports the barrel directly; switch
// to `chat_core.dart` alone once the main barrel exports it.

import 'package:chat_core/chat_core.dart';
import 'package:chat_core/src/chat/chat.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../widgets/chat_list_tile.dart';

/// Chat list landing: the conversation list for the signed-in user.
class ChatsScreen extends ConsumerStatefulWidget {
  const ChatsScreen({super.key});

  @override
  ConsumerState<ChatsScreen> createState() => _ChatsScreenState();
}

class _ChatsScreenState extends ConsumerState<ChatsScreen> {
  @override
  void initState() {
    super.initState();
    // First page load, post-frame: pagination + refresh are owned by the
    // notifier.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        ref.read(conversationListProvider.notifier).loadInitial();
      }
    });
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<List<Conversation>> conversations =
        ref.watch(conversationListProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('QuantChat'),
        actions: <Widget>[
          IconButton(
            tooltip: 'Sign out',
            icon: const Icon(Icons.logout_outlined),
            onPressed: () =>
                ref.read(authSessionProvider.notifier).logout(),
          ),
        ],
      ),
      body: conversations.when(
        loading: () => const _ChatsLoadingView(),
        error: (Object _, StackTrace _) => _ChatsErrorView(
          onRetry: () =>
              ref.read(conversationListProvider.notifier).refresh(),
        ),
        data: (List<Conversation> list) {
          if (list.isEmpty) {
            return const _ChatsEmptyView();
          }
          return RefreshIndicator(
            onRefresh: () =>
                ref.read(conversationListProvider.notifier).refresh(),
            child: NotificationListener<ScrollNotification>(
              onNotification: (ScrollNotification notification) {
                // Near the end of the list: ask for the next page. The
                // notifier no-ops when there is nothing more to load or a
                // load is already in flight.
                if (notification is ScrollUpdateNotification &&
                    notification.metrics.extentAfter < 200) {
                  ref.read(conversationListProvider.notifier).loadMore();
                }
                return false;
              },
              child: ListView.builder(
                // Fixed extent: no per-row measurement, no shrinkWrap
                // (perf lesson from the QuantMail build).
                itemExtent: 76,
                itemCount: list.length,
                itemBuilder: (BuildContext context, int index) {
                  final Conversation conversation = list[index];
                  return ChatListTile(
                    key: ValueKey<String>(conversation.id),
                    conversation: conversation,
                    onTap: () => context.push('/chat/${conversation.id}'),
                  );
                },
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Loading state: skeleton rows in the theme's surface color ("shimmer-ish"
/// without a shimmer dependency).
class _ChatsLoadingView extends StatelessWidget {
  const _ChatsLoadingView();

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Semantics(
      label: 'Loading chats',
      child: ListView.builder(
        key: const Key('chats-loading'),
        itemExtent: 76,
        itemCount: 8,
        physics: const NeverScrollableScrollPhysics(),
        itemBuilder: (BuildContext context, int index) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: <Widget>[
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: scheme.surfaceContainerHigh,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Container(
                      height: 14,
                      width: 140,
                      decoration: BoxDecoration(
                        color: scheme.surfaceContainerHigh,
                        borderRadius: BorderRadius.circular(7),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Container(
                      height: 12,
                      width: 220,
                      decoration: BoxDecoration(
                        color: scheme.surfaceContainerHigh,
                        borderRadius: BorderRadius.circular(6),
                      ),
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
}

/// Error state with a retry button wired to the notifier's [refresh].
class _ChatsErrorView extends StatelessWidget {
  const _ChatsErrorView({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final ColorScheme scheme = theme.colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
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
              "Couldn't load your chats",
              style: theme.textTheme.titleMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              'Check your connection and try again.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: onRetry,
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Empty state: the user has no conversations yet.
class _ChatsEmptyView extends StatelessWidget {
  const _ChatsEmptyView();

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final ColorScheme scheme = theme.colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(
              Icons.chat_bubble_outline,
              size: 48,
              color: scheme.secondary,
            ),
            const SizedBox(height: 16),
            Text(
              'No conversations yet',
              style: theme.textTheme.titleMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              'Start a new chat and it will show up here.',
              style: theme.textTheme.bodyMedium?.copyWith(
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

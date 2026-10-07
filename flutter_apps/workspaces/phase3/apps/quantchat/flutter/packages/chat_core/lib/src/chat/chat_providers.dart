// ============================================================================
// chat_core - Riverpod provider graph for the chat data layer
// (QuantChat, shift 2 / W2)
//
// Provider graph:
//
//   apiClientProvider (../providers/core_providers.dart)
//        │  QuantApiClient.dio — foundation interceptor stack
//        │  (Bearer JWT audience `quantchat`, refresh, retry)
//        ▼
//   chatApiProvider (ChatApi) ──▶ chatRepositoryProvider (ChatRepository)
//                                        │
//                    ┌───────────────────┼───────────────────┐
//                    ▼                   ▼                   ▼
//         conversationListProvider   conversationProvider(id)
//         (NotifierProvider,          (autoDispose family
//          AsyncValue<List>)          FutureProvider)
//
// Plain Riverpod providers (no codegen / riverpod_generator), mirroring the
// style of `../providers/core_providers.dart`. Everything is
// override-friendly: tests override [chatApiProvider] or
// [chatRepositoryProvider] and the rest of the graph follows.
// ============================================================================

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/core_providers.dart';
import 'chat_api.dart';
import 'chat_repository.dart';
import 'conversation.dart';

/// Chat REST client wired to the shared foundation [Dio] (auth/refresh/retry
/// interceptors) and the configured API base URL.
///
/// Uses the real `apiClientProvider` / `appConfigProvider` accessors from
/// `../providers/core_providers.dart` — verified, not assumed.
final chatApiProvider = Provider<ChatApi>(
  (Ref ref) {
    final dio = ref.watch(apiClientProvider).dio;
    final String baseUrl = ref.watch(appConfigProvider).apiBaseUrl;
    return ChatApi(dio: dio, baseUrl: baseUrl);
  },
  name: 'chatApiProvider',
);

/// Conversation repository with an in-memory cache over [chatApiProvider].
final chatRepositoryProvider = Provider<ChatRepository>(
  (Ref ref) => ChatRepository(ref.watch(chatApiProvider)),
  name: 'chatRepositoryProvider',
);

/// Conversation list state machine.
///
/// Starts in [AsyncLoading]; call [ConversationListNotifier.loadInitial]
/// after first frame (e.g. from the chat list screen's `initState` via
/// `ref.read(conversationListProvider.notifier)`), [loadMore] at the end of
/// the list, and [refresh] on pull-to-refresh.
final conversationListProvider =
    NotifierProvider<ConversationListNotifier, AsyncValue<List<Conversation>>>(
  ConversationListNotifier.new,
  name: 'conversationListProvider',
);

/// Single conversation, cache-first through [chatRepositoryProvider].
///
/// Auto-disposed when no listener remains; re-created on next watch.
final conversationProvider =
    FutureProvider.autoDispose.family<Conversation, String>(
  (Ref ref, String id) => ref.watch(chatRepositoryProvider).getConversation(id),
  name: 'conversationProvider',
);

/// Notifier driving [conversationListProvider].
///
/// All list state flows from the repository's cache, so the notifier and the
/// repository can never disagree about what the list contains.
class ConversationListNotifier
    extends Notifier<AsyncValue<List<Conversation>>> {
  @override
  AsyncValue<List<Conversation>> build() =>
      const AsyncLoading<List<Conversation>>();

  ChatRepository get _repository => ref.read(chatRepositoryProvider);

  /// Loads the first page, replacing the list state.
  Future<void> loadInitial() async {
    state = const AsyncLoading<List<Conversation>>();
    try {
      final List<Conversation> conversations =
          await _repository.getConversations(refresh: true);
      state = AsyncData<List<Conversation>>(conversations);
    } catch (error, stackTrace) {
      state = AsyncError<List<Conversation>>(error, stackTrace);
    }
  }

  /// Loads the next page and appends it to the current list.
  Future<void> loadMore() async {
    final List<Conversation>? current = state.valueOrNull;
    if (current == null) {
      await loadInitial();
      return;
    }
    try {
      final List<Conversation> conversations =
          await _repository.loadMoreConversations();
      state = AsyncData<List<Conversation>>(conversations);
    } catch (error, stackTrace) {
      state = AsyncError<List<Conversation>>(error, stackTrace);
    }
  }

  /// Re-fetches the first page (pull-to-refresh).
  Future<void> refresh() => loadInitial();
}

// ============================================================================
// chat_core - chat repository with in-memory cache (QuantChat, shift 2 / W2)
//
// [ChatRepository] fronts [ChatApi] with a process-lifetime in-memory cache
// of conversations. List reads are cache-first (network only on first load
// or explicit refresh); single-conversation reads hit the cache before the
// network; creates write through to the cache. Pagination state for the list
// (`_page`, `_hasMore`) lives here so the UI notifier stays thin.
// ============================================================================

import 'chat_api.dart';
import 'conversation.dart';
import 'pagination.dart';

/// Conversation data access with an in-memory cache.
///
/// All list results are served cache-first unless [refresh] is requested;
/// [getConversation] is cache-first by id; [createConversation] updates the
/// cache with the created conversation.
class ChatRepository {
  /// Creates the repository over [api].
  ChatRepository(this._api);

  final ChatApi _api;

  /// Process-lifetime conversation cache, keyed by conversation id.
  final Map<String, Conversation> _conversations = <String, Conversation>{};

  int _page = 0;
  int _pageSize = 20;
  bool _hasMore = true;

  /// Snapshot of the currently cached conversations (insertion order).
  List<Conversation> get cachedConversations =>
      List<Conversation>.unmodifiable(_conversations.values);

  /// Whether another list page is expected from the server.
  bool get hasMore => _hasMore;

  /// Returns the cached conversation list, fetching page 1 when the cache
  /// is empty or [refresh] is true.
  Future<List<Conversation>> getConversations({bool refresh = false}) async {
    if (!refresh && _conversations.isNotEmpty) {
      return cachedConversations;
    }
    await _fetchPage(1);
    return cachedConversations;
  }

  /// Fetches the next list page and merges it into the cache; no-op when the
  /// server reported no more pages.
  Future<List<Conversation>> loadMoreConversations() async {
    if (!_hasMore) return cachedConversations;
    await _fetchPage(_page + 1);
    return cachedConversations;
  }

  /// Returns the conversation for [id], cache-first.
  Future<Conversation> getConversation(String id) async {
    final Conversation? cached = _conversations[id];
    if (cached != null) return cached;
    final Conversation fetched = await _api.getConversation(id);
    _conversations[fetched.id] = fetched;
    return fetched;
  }

  /// Creates a conversation and stores it in the cache.
  Future<Conversation> createConversation({
    required List<String> participantIds,
    required String type,
    String? name,
    String? description,
  }) async {
    final Conversation created = await _api.createConversation(
      participantIds: participantIds,
      type: type,
      name: name,
      description: description,
    );
    _conversations[created.id] = created;
    return created;
  }

  /// Updates a single cached conversation (e.g. after a realtime event or a
  /// detail refresh performed elsewhere).
  void updateCached(Conversation conversation) {
    _conversations[conversation.id] = conversation;
  }

  /// Drops a conversation from the cache.
  void evict(String id) {
    _conversations.remove(id);
  }

  /// Clears the cache and resets pagination state.
  void clear() {
    _conversations.clear();
    _page = 0;
    _hasMore = true;
  }

  Future<void> _fetchPage(int page) async {
    final Paginated<Conversation> result = await _api.listConversations(
      page: page,
      pageSize: _pageSize,
    );
    if (page == 1) {
      _conversations.clear();
    }
    for (final Conversation conversation in result.items) {
      _conversations[conversation.id] = conversation;
    }
    _page = result.page;
    _pageSize = result.pageSize;
    _hasMore = result.hasMore;
  }
}

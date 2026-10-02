// ============================================================================
// chat_core - chat data layer barrel (QuantChat, shift 2 / W2)
//
// Domain models + REST client + repository + Riverpod providers for the
// conversation/message surface. Exported separately from `chat_core.dart`
// (W1's barrel) so parallel workstreams do not clash; W1/W4 wire this in
// when ready.
//
// - `conversation.dart`  [Conversation], [ChatMessagePreview]
// - `message.dart`       [ChatMessage]
// - `pagination.dart`    [Paginated]
// - `chat_api.dart`      [ChatApi]
// - `chat_repository.dart` [ChatRepository]
// - `chat_providers.dart` [chatApiProvider], [chatRepositoryProvider],
//                        [conversationListProvider],
//                        [conversationProvider], [ConversationListNotifier]
// ============================================================================

export 'chat_api.dart';
export 'chat_providers.dart';
export 'chat_repository.dart';
export 'conversation.dart';
export 'message.dart';
export 'pagination.dart';

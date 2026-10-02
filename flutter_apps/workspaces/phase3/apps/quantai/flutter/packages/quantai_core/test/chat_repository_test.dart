// W1 chat data layer — repository tests with a fake SessionsApi.
//
// The SSE transport ([QuantAiSseClient]) is deliberately NOT mocked: stream
// assembly is covered through the pure [parseStreamFrame] function (see the
// group below + chat_models_test.dart), keeping this test free of network
// fakes.

import 'package:flutter_test/flutter_test.dart';
import 'package:quant_foundation/quant_foundation.dart';
import 'package:quantai_core/quantai_core.dart';

/// SessionsApi with canned responses; records feedback calls.
class FakeSessionsApi extends SessionsApi {
  static final QuantAiApiClient _sharedClient = _dummyClient();

  FakeSessionsApi() : super(client: _sharedClient);

  static QuantAiApiClient _dummyClient() => QuantAiApiClient.create(
        config: const AppConfig(apiBaseUrl: 'https://127.0.0.1'),
        tokenManager: TokenManager(storage: InMemoryTokenStorage()),
      );

  /// A throwaway SSE client sharing the dummy client's Dio (never streams in
  /// these tests; avoids importing `dio` directly in the test).
  QuantAiSseClient get dummySseClient => QuantAiSseClient(
        dio: _sharedClient.dio,
        tokenManager: TokenManager(storage: InMemoryTokenStorage()),
      );

  final List<({String sessionId, String messageId, bool? positive})>
      feedbackCalls = [];

  @override
  Future<ChatPage<ChatSession>> listSessions({
    int page = 1,
    int pageSize = 20,
  }) async =>
      ChatPage<ChatSession>(
        items: const [
          ChatSession(id: 's1', title: 'One'),
          ChatSession(id: 's2', title: 'Two'),
        ],
        page: page,
        pageSize: pageSize,
      );

  @override
  Future<ChatSession> createSession({
    String? title,
    String? model,
    String? systemPrompt,
  }) async =>
      ChatSession(id: 'new', title: title ?? 'Untitled', model: model);

  @override
  Future<ChatPage<ChatMessage>> listMessages(
    String sessionId, {
    int page = 1,
    int pageSize = 50,
  }) async =>
      ChatPage<ChatMessage>(
        items: [
          const ChatMessage(
            id: 'm1',
            sessionId: 's1',
            role: ChatRole.user,
            content: 'hi',
          ),
        ],
      );

  @override
  Future<ChatMessage> sendMessage(String sessionId, String content) async =>
      ChatMessage(
        id: 'm2',
        sessionId: sessionId,
        role: ChatRole.assistant,
        content: 'reply to: $content',
      );

  @override
  Future<void> deleteSession(String id) async {}

  @override
  Future<ChatSession> archiveSession(String id) async =>
      ChatSession(id: id, title: 'Archived');

  @override
  Future<void> sendFeedback({
    required String sessionId,
    required String messageId,
    required bool? positive,
  }) async {
    feedbackCalls.add(
      (sessionId: sessionId, messageId: messageId, positive: positive),
    );
  }
}

ChatRepository _repository(FakeSessionsApi api) => ChatRepository(
      api: api,
      sseClient: api.dummySseClient,
      config: const AppConfig(apiBaseUrl: 'https://127.0.0.1'),
    );

void main() {
  late FakeSessionsApi api;
  late ChatRepository repository;

  setUp(() {
    api = FakeSessionsApi();
    repository = _repository(api);
  });

  test('listSessions returns the page items', () async {
    final sessions = await repository.listSessions();
    expect(sessions.map((s) => s.id), ['s1', 's2']);
  });

  test('createSession forwards fields', () async {
    final session =
        await repository.createSession(title: 'T', model: 'quant-1');
    expect(session.id, 'new');
    expect(session.title, 'T');
    expect(session.model, 'quant-1');
  });

  test('listMessages returns the session messages', () async {
    final messages = await repository.listMessages('s1');
    expect(messages, hasLength(1));
    expect(messages.first.role, ChatRole.user);
  });

  test('sendMessage returns the assistant reply', () async {
    final message =
        await repository.sendMessage(sessionId: 's1', content: 'hi');
    expect(message.role, ChatRole.assistant);
    expect(message.content, contains('hi'));
  });

  test('deleteSession and archiveSession complete', () async {
    await repository.deleteSession('s1');
    final archived = await repository.archiveSession('s1');
    expect(archived.id, 's1');
  });

  test('sendFeedback records the wire vocabulary mapping', () async {
    await repository.sendFeedback(
      sessionId: 's1',
      messageId: 'm1',
      positive: true,
    );
    await repository.sendFeedback(
      sessionId: 's1',
      messageId: 'm2',
      positive: false,
    );
    await repository.sendFeedback(
      sessionId: 's1',
      messageId: 'm3',
      positive: null,
    );
    expect(api.feedbackCalls, hasLength(3));
    expect(api.feedbackCalls[0].positive, isTrue);
    expect(api.feedbackCalls[1].positive, isFalse);
    expect(api.feedbackCalls[2].positive, isNull);
    // The API layer maps positive → "POSITIVE", negative → "NEGATIVE",
    // null → null (spec L2512); the mapping itself is a pure enum lookup:
    expect(MessageFeedback.positive.wireValue, 'POSITIVE');
    expect(MessageFeedback.negative.wireValue, 'NEGATIVE');
  });

  group('parseStreamFrame (stream assembly unit)', () {
    test('delta frames assemble into reply text', () {
      const frames = [
        '{"content":"Hello"}',
        '{"content":" world"}',
        '{"delta":"!"}',
      ];
      final assembled = frames.map(parseStreamFrame).join();
      expect(assembled, 'Hello world!');
    });

    test('non-JSON frames pass through untouched', () {
      expect(parseStreamFrame('raw chunk'), 'raw chunk');
    });
  });
}

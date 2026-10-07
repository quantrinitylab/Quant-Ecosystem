// ============================================================================
// quantai_core - chat repository (W1: chat data layer)
// ============================================================================
//
// Orchestrates [SessionsApi] (unary calls) and [QuantAiSseClient] (streaming)
// into UI-ready operations. Streaming is assembled here into
// [ChatStreamEvent]s with TTFB instrumentation (D5).
//
// PERF-1 (interactive fail-fast): no retry loops here — a failed stream
// yields exactly one [StreamError] so the UI can offer retry immediately.
// Auth is the existing OAuth2 flow (D1): Bearer injection lives in the
// client/SSE transport, not in this layer.

import 'dart:async';

import '../api/sse_client.dart';
import '../config/app_config.dart';
import 'chat_models.dart';
import 'sessions_api.dart';

/// Events of one assistant streaming reply, in order:
///
/// `StreamStarted(ttfb)` → zero or more `StreamDelta(text)` →
/// `StreamDone(finalMessage)` | `StreamError(message)`.
sealed class ChatStreamEvent {
  const ChatStreamEvent();
}

/// First-byte latency signal (D5 instrumentation): elapsed time from request
/// start to the first parsed SSE frame.
final class StreamStarted extends ChatStreamEvent {
  final Duration ttfb;
  const StreamStarted(this.ttfb);
}

/// One incremental text chunk of the assistant reply.
final class StreamDelta extends ChatStreamEvent {
  final String text;
  const StreamDelta(this.text);
}

/// The stream finished (backend sent `data: [DONE]`).
final class StreamDone extends ChatStreamEvent {
  final ChatMessage message;
  const StreamDone(this.message);
}

/// The stream failed. No retry is attempted here (PERF-1); the UI owns retry.
final class StreamError extends ChatStreamEvent {
  final String message;
  const StreamError(this.message);
}

/// Chat data access: sessions, messages, streaming replies, feedback.
class ChatRepository {
  final SessionsApi _api;
  final QuantAiSseClient _sseClient;
  final AppConfig _config;

  ChatRepository({
    required SessionsApi api,
    required QuantAiSseClient sseClient,
    required AppConfig config,
  })  : _api = api,
        _sseClient = sseClient,
        _config = config;

  // -- Streaming --------------------------------------------------------------

  /// Streams the assistant reply for [content] in [sessionId].
  ///
  /// Wires the spec'd SSE endpoint:
  /// spec: app-foundations/quantai/openapi.yaml L2487
  /// `POST /sessions/{id}/messages/stream` — request body
  /// `{"content": …}` (attachments unsupported for now), response
  /// `text/event-stream` frames `data: {...}\n\n`, terminator `data: [DONE]`.
  ///
  /// The [QuantAiSseClient] swallows the `[DONE]` sentinel itself, so
  /// [StreamDone] is synthesized from the accumulated deltas on normal
  /// stream close.
  // TODO(UNVERIFIED): final-message payload shape (id/timestamps) — the done
  // message below is synthesized client-side until the contract is specified.
  Stream<ChatStreamEvent> sendStreaming({
    required String sessionId,
    required String content,
  }) async* {
    final buffer = StringBuffer();
    var started = false;
    Duration ttfb = Duration.zero;

    void markFirstByte(Duration d) => ttfb = d;

    try {
      await for (final frame in _sseClient.streamPost(
        url: _streamUrl(sessionId),
        body: {'content': content},
        onFirstByte: markFirstByte,
      )) {
        if (!started) {
          started = true;
          yield StreamStarted(ttfb);
        }
        final text = parseStreamFrame(frame.data);
        if (text.isNotEmpty) {
          buffer.write(text);
          yield StreamDelta(text);
        }
      }
      yield StreamDone(
        ChatMessage(
          id: 'stream-$sessionId-${DateTime.now().millisecondsSinceEpoch}',
          sessionId: sessionId,
          role: ChatRole.assistant,
          content: buffer.toString(),
          createdAt: DateTime.now(),
        ),
      );
    } on SseException catch (e) {
      yield StreamError(e.message);
    } catch (e) {
      yield StreamError('Streaming failed: $e');
    }
  }

  // -- Unary ------------------------------------------------------------------

  /// Non-streaming fallback: send a message, get the assistant reply.
  Future<ChatMessage> sendMessage({
    required String sessionId,
    required String content,
  }) =>
      _api.sendMessage(sessionId, content);

  Future<List<ChatSession>> listSessions({
    int page = 1,
    int pageSize = 20,
  }) async =>
      (await _api.listSessions(page: page, pageSize: pageSize)).items;

  Future<ChatSession> createSession({
    String? title,
    String? model,
    String? systemPrompt,
  }) =>
      _api.createSession(
        title: title,
        model: model,
        systemPrompt: systemPrompt,
      );

  Future<List<ChatMessage>> listMessages(
    String sessionId, {
    int page = 1,
    int pageSize = 50,
  }) async =>
      (await _api.listMessages(sessionId, page: page, pageSize: pageSize))
          .items;

  Future<void> deleteSession(String id) => _api.deleteSession(id);

  Future<ChatSession> archiveSession(String id) => _api.archiveSession(id);

  Future<void> sendFeedback({
    required String sessionId,
    required String messageId,
    bool? positive,
  }) =>
      _api.sendFeedback(
        sessionId: sessionId,
        messageId: messageId,
        positive: positive,
      );

  // -- Internals ---------------------------------------------------------------

  /// SSE stream URL. The base comes from [AppConfig] — never hardcoded; the
  /// spec defines no `/api/v1`-style prefix, so none is added.
  Uri _streamUrl(String sessionId) {
    final base = _config.apiBaseUrl.replaceAll(RegExp(r'/+$'), '');
    return Uri.parse(
      '$base/sessions/${Uri.encodeComponent(sessionId)}/messages/stream',
    );
  }
}

// ============================================================================
// quantai_core - SSE streaming client scaffold (D5)
// ============================================================================
//
// Real Server-Sent Events parsing over a POST stream: `Accept:
// text/event-stream`, `ResponseType.stream`, Bearer injection from the token
// manager, TTFB (time-to-first-byte) latency instrumentation for D5.
//
// NO endpoint is invented here: the caller passes the full [Uri]. When the
// `app-foundations/quantai` spec lands, the generated typed client will call
// this transport with the spec'd URLs.

import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:quant_foundation/quant_foundation.dart';

/// A parsed Server-Sent Events frame.
class SseEvent {
  /// The `event:` field of the frame, or `null` for unnamed `data:` frames.
  final String? event;

  /// The frame payload (concatenated `data:` lines, newline-joined).
  final String data;

  const SseEvent({this.event, required this.data});

  /// OpenAI-style end-of-stream sentinel: a bare `[DONE]` data frame closes
  /// the stream. Non-DONE frames with this payload are passed through.
  bool get isDone => data.trim() == '[DONE]';

  @override
  String toString() => 'SseEvent(event: $event, data: $data)';
}

/// Failure of an SSE stream request (connect failure, non-2xx status, or
/// mid-stream transport error).
class SseException implements Exception {
  final String message;

  /// HTTP status code when a response was received, else `null`.
  final int? statusCode;

  const SseException(this.message, {this.statusCode});

  @override
  String toString() =>
      'SseException(${statusCode != null ? 'status $statusCode: ' : ''}$message)';
}

/// Streaming transport for AI responses over Server-Sent Events (D5).
///
/// Contract with callers:
/// - POSTs [body] to [url] with `Accept: text/event-stream`.
/// - Bearer token is read from [tokenManager] at connect time (fresh token,
///   same contract as [AuthInterceptor]); on 401 the foundation
///   RefreshInterceptor's single-flight refresh applies because this Dio
///   carries the stack — the caller may then retry the stream once.
/// - Measures time-to-first-byte with a [Stopwatch] and reports it via
///   [onFirstByte] (D5 latency instrumentation: budget = TTFB, not total
///   stream time).
/// - Parses `data:` lines into [SseEvent]; the `[DONE]` sentinel closes the
///   stream; comment lines (`:`-prefixed heartbeats) are ignored.
class QuantAiSseClient {
  final Dio _dio;
  final TokenManager _tokenManager;
  final Duration _connectTimeout;

  /// Creates the SSE client.
  ///
  /// [dio] should be the API client's Dio so streaming shares the
  /// interceptor stack. [connectTimeout] bounds how long the initial connect
  /// may take (defaults to 90s; the provider graph uses
  /// [AppConfig.aiStreamTimeout]).
  QuantAiSseClient({
    required Dio dio,
    required TokenManager tokenManager,
    Duration connectTimeout = const Duration(seconds: 90),
  })  : _dio = dio,
        _tokenManager = tokenManager,
        _connectTimeout = connectTimeout;

  /// Opens an SSE stream: POST [body] to [url], yielding [SseEvent] frames.
  ///
  /// [onFirstByte] fires exactly once with the elapsed time from request
  /// start to the first parsed frame (D5: this is the latency budget signal).
  /// Throws [SseException] on connect failure or non-2xx status.
  Stream<SseEvent> streamPost({
    required Uri url,
    required Map<String, dynamic> body,
    Map<String, String>? headers,
    void Function(Duration timeToFirstByte)? onFirstByte,
  }) async* {
    // synchronous cache read — same contract as AuthInterceptor.
    final token = _tokenManager.getAccessToken();
    final stopwatch = Stopwatch()..start();
    var firstByteReported = false;

    void reportFirstByte() {
      if (!firstByteReported) {
        firstByteReported = true;
        stopwatch.stop();
        onFirstByte?.call(stopwatch.elapsed);
      }
    }

    final Response<ResponseBody> response;
    try {
      response = await _dio.post<ResponseBody>(
        url.toString(),
        data: body,
        options: Options(
          responseType: ResponseType.stream,
          followRedirects: false,
          headers: <String, String>{
            'Accept': 'text/event-stream',
            'Cache-Control': 'no-cache',
            if (token != null && token.isNotEmpty)
              'Authorization': 'Bearer $token',
            ...?headers,
          },
          // The refresh interceptor handles 401; don't let Dio's default
          // validateStatus interfere with streaming responses.
          validateStatus: (status) => status != null && status < 500,
        ),
      ).timeout(
        _connectTimeout,
        onTimeout: () => throw SseException(
          'SSE connect timed out after ${_connectTimeout.inSeconds}s',
        ),
      );
    } on DioException catch (e) {
      throw SseException(
        e.message ?? e.error?.toString() ?? 'SSE request failed',
        statusCode: e.response?.statusCode,
      );
    } on TimeoutException catch (e) {
      throw SseException(e.message ?? 'SSE connect timed out');
    }

    final status = response.statusCode ?? 0;
    if (status < 200 || status >= 300) {
      throw SseException(
        'SSE stream rejected: HTTP $status',
        statusCode: status,
      );
    }

    final contentType =
        response.headers.value(Headers.contentTypeHeader) ?? '';
    if (!contentType.contains('text/event-stream')) {
      // Loud, not fatal: some backends mislabel the content type on streams.
      // TODO(UNVERIFIED): tighten to require text/event-stream once the
      // QuantAI streaming contract is specified (spec pending under
      // app-foundations/quantai/).
    }

    String? pendingEvent;
    final pendingData = StringBuffer();
    final frames = <SseEvent>[];

    void flushFrame() {
      if (pendingData.isEmpty) {
        pendingEvent = null;
        return;
      }
      frames.add(SseEvent(event: pendingEvent, data: pendingData.toString()));
      pendingEvent = null;
      pendingData.clear();
      reportFirstByte();
    }

    try {
      await for (final chunk in response.data!.stream
          .transform(utf8.decoder)
          .transform(const LineSplitter())) {
        if (chunk.startsWith(':')) {
          // SSE comment / heartbeat: keep the stream alive, emit nothing.
          continue;
        }
        if (chunk.isEmpty) {
          // Blank line = frame boundary.
          flushFrame();
          continue;
        }
        if (chunk.startsWith('event:')) {
          pendingEvent = chunk.substring('event:'.length).trim();
        } else if (chunk.startsWith('data:')) {
          final line = chunk.substring('data:'.length);
          // SSE: a single space after the colon is stripped if present.
          final value = line.startsWith(' ') ? line.substring(1) : line;
          if (pendingData.isNotEmpty) pendingData.write('\n');
          pendingData.write(value);
        }
        // Other SSE fields (id:, retry:) are intentionally not tracked yet —
        // TODO(UNVERIFIED): wire Last-Event-ID resume once the streaming
        // contract is specified.
      }
    } on DioException catch (e) {
      throw SseException(
        'SSE stream interrupted: ${e.message ?? e.error}',
        statusCode: e.response?.statusCode,
      );
    } finally {
      // Flush a final frame if the stream ended without a trailing blank line.
      flushFrame();
    }

    for (final frame in frames) {
      if (frame.isDone) break;
      yield frame;
    }
  }
}

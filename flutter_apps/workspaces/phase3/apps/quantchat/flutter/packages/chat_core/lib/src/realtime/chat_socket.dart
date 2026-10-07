// ============================================================================
// chat_core - WebSocket transport for QuantChat realtime
// ============================================================================
//
// Wraps `package:web_socket_channel` (dep owned by W1's pubspec work — do NOT
// add it here) with the /ws/chat contract:
//
//   GET /ws/chat  (?conversationId=<id> joins a room on connect)
//   rate limit 20 conn/min; JWT in the upgrade handshake; auth failure ->
//   {type:'error'} then close 4001; 1s→30s reconnect backoff.
//
// Pure Dart + web_socket_channel. No UI code.
//
// TODO(UNVERIFIED) ×3:
//   1. WS JWT audience is `quant-ecosystem`, REST audience is `quantchat`
//      (API_NOTES.md). [tokenProvider] is deliberately pluggable — the caller
//      supplies whichever token source/audience the backend ends up requiring.
//   2. Exact handshake mechanism (Authorization header vs query param) is not
//      confirmed against the backend. See [WsAuthHandshake]; the client
//      supports both and defaults to the query param (works through the
//      browser WebSocket API, which can't set headers).
//   3. Query-param name (`token`) is a guess until the backend confirms it.

import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/io.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'chat_socket_events.dart';

/// Connection lifecycle of [ChatSocket].
enum SocketConnectionState {
  /// No live socket (never connected, manually disconnected, or reconnect
  /// attempts exhausted).
  disconnected,

  /// A connect (or reconnect) attempt is in flight.
  connecting,

  /// Socket open; heartbeat running; [ChatSocket.events] flowing.
  connected,

  /// Waiting out the backoff before the next reconnect attempt.
  reconnecting,
}

/// How the JWT reaches the server during the WebSocket upgrade handshake.
enum WsAuthHandshake {
  /// `?token=<jwt>` on the connect URL (works everywhere, including the
  /// browser WebSocket API).
  queryParam,

  /// `Authorization: Bearer <jwt>` header on the upgrade request.
  authorizationHeader,
}

/// WebSocket client for the QuantChat `/ws/chat` endpoint.
///
///   final socket = ChatSocket(
///     url: Uri.parse('wss://chatapi.quantrinity.in/ws/chat'),
///     tokenProvider: () => tokenManager.getValidToken(),
///   );
///   await socket.connect();
///   socket.events.listen((event) { ... });
///
/// Reconnect: unexpected closes re-enter [connect] with exponential backoff
/// (1 s → 30 s per the backend contract), fetching a FRESH token per attempt
/// via [tokenProvider]. [disconnect] is the only thing that stops the
/// backoff. A 4001 close (auth failure) never reconnects — it emits a
/// [SocketErrorEvent] and lands on [SocketConnectionState.disconnected].
///
/// Tokens are never logged.
class ChatSocket {
  /// Base socket URL (e.g. `wss://<host>/ws/chat`). A `conversationId`
  /// query param is appended on connect when [conversationId] is set.
  final Uri url;

  /// Supplies a fresh JWT for every (re)connect attempt. Return `null`
  /// when signed out — [connect] then throws [ChatSocketAuthException]
  /// instead of opening an unauthenticated socket.
  final Future<String?> Function() tokenProvider;

  /// Interval between outbound heartbeat (`ping`) frames. The backend treats
  /// heartbeat/ping as a last-seen refresh (30 s freshness).
  final Duration heartbeatInterval;

  /// First reconnect delay; doubles per attempt.
  final Duration initialBackoff;

  /// Backoff ceiling (backend contract: 1 s → 30 s).
  final Duration maxBackoff;

  /// Reconnect attempts before giving up. Exhaustion lands on `disconnected`.
  final int maxReconnectAttempts;

  /// Handshake mechanism — see [WsAuthHandshake] (TODO(UNVERIFIED)).
  final WsAuthHandshake handshake;

  /// Optional conversation room to join on every connect (via the
  /// `?conversationId=` query param per the /ws/chat contract).
  final String? conversationId;

  /// Hook invoked before each reconnect attempt (attempts are 1-based).
  final void Function(int attempt)? onReconnect;

  ChatSocket({
    required this.url,
    required this.tokenProvider,
    this.heartbeatInterval = const Duration(seconds: 30),
    this.initialBackoff = const Duration(seconds: 1),
    this.maxBackoff = const Duration(seconds: 30),
    this.maxReconnectAttempts = 8,
    this.handshake = WsAuthHandshake.queryParam,
    this.conversationId,
    this.onReconnect,
  });

  final _events = StreamController<ChatSocketEvent>.broadcast();
  final _state = StreamController<SocketConnectionState>.broadcast();

  WebSocketChannel? _channel;
  Timer? _heartbeatTimer;
  Timer? _reconnectTimer;
  SocketConnectionState _connectionState = SocketConnectionState.disconnected;
  int _reconnectAttempt = 0;
  bool _manualDisconnect = false;
  bool _disposed = false;

  /// Broadcast stream of typed inbound events.
  Stream<ChatSocketEvent> get events => _events.stream;

  /// Broadcast stream of connection-state transitions.
  Stream<SocketConnectionState> get connectionStateStream => _state.stream;

  /// Current connection state.
  SocketConnectionState get connectionState => _connectionState;

  /// Opens the socket. Safe to call while already connected (no-op).
  ///
  /// Throws [ChatSocketAuthException] when [tokenProvider] yields no token.
  Future<void> connect() async {
    if (_disposed) return;
    if (_connectionState == SocketConnectionState.connecting ||
        _connectionState == SocketConnectionState.connected) {
      return;
    }
    _setState(SocketConnectionState.connecting);

    final token = await tokenProvider();
    if (token == null || token.isEmpty) {
      _setState(SocketConnectionState.disconnected);
      throw ChatSocketAuthException(
        'No access token available for the WebSocket handshake.',
      );
    }

    try {
      _channel = _openChannel(token);
      await _channel!.ready;
    } catch (_) {
      _channel = null;
      _scheduleReconnect();
      return;
    }

    _reconnectAttempt = 0;
    _setState(SocketConnectionState.connected);
    _startHeartbeat();
    _channel!.stream.listen(
      _onRawMessage,
      onError: (_) => _onTransportGone(),
      onDone: _onTransportGone,
      cancelOnError: true,
    );
  }

  /// Sends a raw outbound frame (built with the `build*` helpers).
  ///
  /// Throws [StateError] when not connected.
  void send(Map<String, dynamic> frame) {
    final channel = _channel;
    if (_connectionState != SocketConnectionState.connected || channel == null) {
      throw StateError('ChatSocket.send: not connected.');
    }
    channel.sink.add(jsonEncode(frame));
  }

  /// Sends a `chat_message` frame for [conversationId]/[content].
  void sendChatMessage({
    required String conversationId,
    required String content,
    String type = 'text',
    String? replyToId,
  }) =>
      send(buildChatMessage(
        conversationId: conversationId,
        content: content,
        type: type,
        replyToId: replyToId,
      ));

  /// Sends a `typing` frame.
  void sendTyping({required String conversationId, required bool isTyping}) =>
      send(buildTyping(conversationId: conversationId, isTyping: isTyping));

  /// Sends a `join_conversation` frame.
  void joinConversation(String conversationId) =>
      send(buildJoinConversation(conversationId));

  /// Sends a `delivery_ack` frame.
  void sendDeliveryAck({
    required String messageId,
    required String conversationId,
  }) =>
      send(buildDeliveryAck(
        messageId: messageId,
        conversationId: conversationId,
      ));

  /// Sends a `read_receipt` frame.
  void sendReadReceipt({
    required String messageId,
    required String conversationId,
  }) =>
      send(buildReadReceipt(
        messageId: messageId,
        conversationId: conversationId,
      ));

  /// Closes the socket and cancels any pending reconnect. The event/state
  /// streams stay open so the socket can be reused via [connect].
  Future<void> disconnect() async {
    _manualDisconnect = true;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    _stopHeartbeat();
    await _closeChannel();
    _setState(SocketConnectionState.disconnected);
  }

  /// Releases everything. The socket must not be used afterwards.
  Future<void> dispose() async {
    _disposed = true;
    await disconnect();
    await _events.close();
    await _state.close();
  }

  // -- internals ---------------------------------------------------------------

  WebSocketChannel _openChannel(String token) {
    // NOTE: the token is placed in the URL/header only — never logged.
    switch (handshake) {
      case WsAuthHandshake.queryParam:
        // TODO(UNVERIFIED): query-param name `token` — confirm with backend.
        final query = Map<String, String>.from(url.queryParameters)
          ..['token'] = token;
        if (conversationId != null) {
          query['conversationId'] = conversationId!;
        }
        return WebSocketChannel.connect(url.replace(queryParameters: query));
      case WsAuthHandshake.authorizationHeader:
        // NOTE: IOWebSocketChannel is IO-only (mobile/desktop). The browser
        // WebSocket API cannot set headers, so web builds must use
        // [WsAuthHandshake.queryParam].
        final withRoom = conversationId == null
            ? url
            : url.replace(queryParameters: {
                ...url.queryParameters,
                'conversationId': conversationId!,
              });
        return IOWebSocketChannel.connect(
          withRoom,
          headers: {'Authorization': 'Bearer $token'},
        );
    }
  }

  void _onRawMessage(dynamic data) {
    if (_disposed) return;
    if (data is! String) {
      _events.add(UnknownEvent({'raw': data.toString()}));
      return;
    }
    Object? decoded;
    try {
      decoded = jsonDecode(data);
    } catch (_) {
      _events.add(UnknownEvent({'raw': data}));
      return;
    }
    if (decoded is Map<String, dynamic>) {
      _events.add(ChatSocketEvent.fromJson(decoded));
    } else {
      _events.add(UnknownEvent({'raw': decoded}));
    }
  }

  void _onTransportGone() {
    if (_manualDisconnect || _disposed) return;
    final code = _channel?.closeCode;
    _stopHeartbeat();
    _closeChannel();
    if (code == 4001) {
      // Auth failure per the /ws/chat contract: the server already sent
      // {type:'error'}; reconnecting with the same token would just loop.
      _events.add(const SocketErrorEvent(
        code: 4001,
        message: 'WebSocket authentication failed.',
      ));
      _reconnectAttempt = 0;
      _setState(SocketConnectionState.disconnected);
      return;
    }
    _scheduleReconnect();
  }

  void _scheduleReconnect() {
    if (_manualDisconnect || _disposed) return;
    _reconnectAttempt++;
    if (_reconnectAttempt > maxReconnectAttempts) {
      _reconnectAttempt = 0;
      _setState(SocketConnectionState.disconnected);
      return;
    }
    _setState(SocketConnectionState.reconnecting);
    var delay = initialBackoff * (1 << (_reconnectAttempt - 1));
    if (delay > maxBackoff) delay = maxBackoff;
    final attempt = _reconnectAttempt;
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(delay, () {
      _reconnectTimer = null;
      if (_manualDisconnect || _disposed) return;
      onReconnect?.call(attempt);
      // Fresh token per attempt — the old one may have been the problem.
      connect();
    });
  }

  void _startHeartbeat() {
    _stopHeartbeat();
    _heartbeatTimer = Timer.periodic(heartbeatInterval, (_) {
      if (_connectionState == SocketConnectionState.connected) {
        try {
          send(buildHeartbeat());
        } catch (_) {
          // Transport died between ticks — the stream's onDone handles it.
        }
      }
    });
  }

  void _stopHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
  }

  Future<void> _closeChannel() async {
    final channel = _channel;
    _channel = null;
    if (channel != null) {
      try {
        await channel.sink.close();
      } catch (_) {
        // Already closed — nothing to do.
      }
    }
  }

  void _setState(SocketConnectionState next) {
    _connectionState = next;
    if (!_disposed) _state.add(next);
  }
}

/// Thrown by [ChatSocket.connect] when no access token is available.
class ChatSocketAuthException implements Exception {
  final String message;
  const ChatSocketAuthException(this.message);
  @override
  String toString() => 'ChatSocketAuthException: $message';
}

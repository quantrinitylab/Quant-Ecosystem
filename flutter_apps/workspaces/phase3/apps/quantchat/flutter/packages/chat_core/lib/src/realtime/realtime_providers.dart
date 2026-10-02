// ============================================================================
// chat_core - Riverpod wiring for the QuantChat realtime socket (W4)
// ============================================================================
//
// Provider graph (plain Riverpod, override-friendly like core_providers.dart):
//
//   appConfigProvider ──▶ chatSocketUrlProvider (wss://<host>/ws/chat)
//   tokenManagerProvider ─┐
//                         ├──▶ chatSocketProvider (ChatSocket, lazy, disposed
//   appConfigProvider ────┘      with the container; NOT auto-connected)
//                                │
//                                ├──▶ socketConnectionProvider
//                                │         (StreamProvider<SocketConnectionState>)
//                                │
//                                └──▶ chatEventsProvider
//                                          (StreamProvider<ChatSocketEvent>)
//
// Connection lifecycle is driven by the app layer (next shift): call
// `ref.read(chatSocketProvider).connect()` after login, `disconnect()` on
// sign-out. The socket is NOT connected automatically so tests and
// background flows can observe it without opening a transport.

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';
import '../providers/core_providers.dart';
import 'chat_socket.dart';
import 'chat_socket_events.dart';

/// Derives the `/ws/chat` URL from [AppConfig.apiBaseUrl].
///
/// Scheme mapping: `https` → `wss`, `http` → `ws` (env-dependent —
/// production must be `wss`; see TODO(UNVERIFIED) below).
Uri chatSocketUrl(AppConfig config) {
  final api = Uri.parse(config.apiBaseUrl);
  final wsScheme = switch (api.scheme) {
    'https' => 'wss',
    'http' => 'ws',
    _ => api.scheme,
  };
  // TODO(UNVERIFIED): ws vs wss is env-dependent — confirm production uses
  // wss (AppConfig asserts https for the REST base, so this maps to wss).
  return api.replace(
    scheme: wsScheme,
    path: '/ws/chat',
    query: null,
    fragment: null,
  );
}

/// The shared socket URL, override-friendly per flavor / test.
final chatSocketUrlProvider = Provider<Uri>(
  (ref) => chatSocketUrl(ref.watch(appConfigProvider)),
  name: 'chatSocketUrlProvider',
);

/// The shared [ChatSocket], wired to the token manager for fresh JWTs on
/// every (re)connect attempt.
///
/// The socket is created lazily and disposed with the container. It does NOT
/// connect itself — the app layer calls `connect()` after login.
///
/// TODO(UNVERIFIED): the WS JWT audience is `quant-ecosystem`, not the REST
/// `quantchat` audience (API_NOTES.md). `getValidToken()` currently returns
/// the SSO/REST token; if the backend requires a different audience for the
/// WS handshake, override this provider with a token source that mints one.
final chatSocketProvider = Provider<ChatSocket>(
  (ref) {
    final url = ref.watch(chatSocketUrlProvider);
    final tokenManager = ref.watch(tokenManagerProvider);
    final socket = ChatSocket(
      url: url,
      tokenProvider: () => tokenManager.getValidToken(),
    );
    ref.onDispose(() {
      // ignore: discarded_futures
      socket.dispose();
    });
    return socket;
  },
  name: 'chatSocketProvider',
);

/// Broadcast connection-state stream of the shared socket.
final socketConnectionProvider = StreamProvider<SocketConnectionState>(
  (ref) => ref.watch(chatSocketProvider).connectionStateStream,
  name: 'socketConnectionProvider',
);

/// Broadcast typed-event stream of the shared socket.
final chatEventsProvider = StreamProvider<ChatSocketEvent>(
  (ref) => ref.watch(chatSocketProvider).events,
  name: 'chatEventsProvider',
);

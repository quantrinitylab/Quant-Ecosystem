// ============================================================================
// chat_core - realtime (WebSocket) barrel for QuantChat
// ============================================================================
//
// Typed event model + WebSocket transport + Riverpod wiring for the
// `/ws/chat` endpoint (contract: app-foundations/quantchat/openapi.yaml).
// No UI code — UI wiring is a later shift.

export 'chat_socket.dart';
export 'chat_socket_events.dart';
export 'realtime_providers.dart';

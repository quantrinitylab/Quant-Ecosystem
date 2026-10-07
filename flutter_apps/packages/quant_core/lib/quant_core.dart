// Sovereign Core Client Engine for Quant Ecosystem.
// Hardware keystore secure storage, multi-tenant session management,
// Dio API client with race-free 401 token refresh queue, telemetry latency tracking,
// domain models for 5 sovereign productivity pillars, SQLite FTS5 instant search blueprint,
// offline Drift DB, mutation sync queue, and Omni-Presence Deep-Link Mesh.
// Strictly ZERO raw Unicode emojis throughout this library.

library quant_core;

export 'storage/quant_secure_storage.dart';
export 'auth/quant_session_state.dart';
export 'auth/quant_auth_service.dart';
export 'api/quant_api_client.dart';
export 'models/pillar_models.dart';
export 'bridges/quant_webrtc_bridge.dart';
export 'bridges/quant_media_bridge.dart';
export 'bridges/quant_document_bridge.dart';
export 'models/sync_operation.dart';
export 'data/quant_offline_database.dart';
export 'database/quant_database.dart';
export 'database/quant_offline_store.dart';

// Sovereign Omni-Presence & Deep-Link Mesh
export 'omnipresence/quant_app_registry.dart';
export 'omnipresence/quant_omni_route.dart';
export 'omnipresence/quant_fallback_web_resolver.dart';
export 'omnipresence/quant_cross_app_sso.dart';
export 'omnipresence/quant_omni_router.dart';

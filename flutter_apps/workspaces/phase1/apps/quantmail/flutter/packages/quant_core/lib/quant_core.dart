// ============================================================================
// quant_core - app config, DI providers, bootstrap helpers
// ============================================================================
//
// Shared core for the QuantMail Flutter clients. Depends on
// `quant_foundation` (phase0) for the API client, token management and theme;
// owned by workstream W3 in Phase 1.
//
// - `src/config/`     Compile-time [AppConfig] (`--dart-define` backed).
// - `src/providers/`  Riverpod provider graph (override-friendly, no codegen).
// - `src/bootstrap/`  [AppBootstrap] cold-start sequence + [AppLogger].

export 'src/config/app_config.dart';
export 'src/providers/core_providers.dart';
export 'src/auth/auth_exceptions.dart';
export 'src/auth/auth_repository.dart';
export 'src/auth/auth_providers.dart';
export 'src/auth/silent_refresh.dart';
export 'src/auth/refresh_coordinator.dart';
export 'src/bootstrap/app_bootstrap.dart';
export 'src/mail/mail.dart';
// M4 (W4): inbox repository + providers. cache/sync barrels land with W1/W3.
// Note: `src/mail/cache/cache.dart` barrel does not exist yet (W1 owns the
// cache dir; their seam is `cache/thread_cache.dart`). Add that barrel
// export here when W1 creates it.
export 'src/mail/cache/thread_cache.dart';
export 'src/mail/thread_list_repository.dart';
export 'src/mail/inbox_providers.dart';
export 'src/mail/sync/sync.dart';

// ============================================================================
// ads_core - app config, DI providers, bootstrap helpers
// ============================================================================
//
// Shared core for the QuantAds Flutter clients. Depends on
// `quant_foundation` (phase0) for the API client, token management and theme,
// and on `ads_theme` (sibling) for the QuantAds design tokens.
//
// - `src/config/`     Compile-time [AdsConfig] (`--dart-define` backed).
// - `src/auth/`       [AuthRepository], auth providers, silent refresh.
// - `src/providers/`  Riverpod provider graph (override-friendly, no codegen).
// - `src/bootstrap/`  [AppBootstrap] cold-start sequence + [AppLogger].

library;

export 'src/config/ads_config.dart';
export 'src/providers/core_providers.dart';
export 'src/auth/auth_exceptions.dart';
export 'src/auth/auth_repository.dart';
export 'src/auth/auth_providers.dart';
export 'src/auth/silent_refresh.dart';
export 'src/bootstrap/app_bootstrap.dart';

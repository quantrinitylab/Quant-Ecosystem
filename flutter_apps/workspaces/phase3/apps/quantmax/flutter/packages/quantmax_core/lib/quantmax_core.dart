// ============================================================================
// quantmax_core - app config, DI providers, theme, auth, API client
// ============================================================================
//
// Shared core for the QuantMax Flutter clients. Shift 1 ownership:
//   - W1 (scaffold): config/app_config.dart, bootstrap/app_bootstrap.dart,
//     providers/core_providers.dart  [THIS SHIFT — landed]
//   - W2 (theme): theme/quant_colors.dart, theme/quant_typography.dart,
//     theme/quant_motion.dart, theme/quantmax_theme.dart  [LANDED — real]
//   - W3 (auth/api): auth/*, api/*  [PENDING except token_manager.dart and
//     auth/refresh_mutex.dart, which landed]
//
// The barrel is pre-wired for the full contract so dependents can import
// one root. Exports whose files have not landed yet WILL fail analysis
// until their owner shift lands them — expected in this SDK-less env.

library quantmax_core;

export 'src/config/app_config.dart';
export 'src/bootstrap/app_bootstrap.dart';
export 'src/providers/core_providers.dart';

// --- theme (W2) ---
export 'src/theme/quant_colors.dart';
export 'src/theme/quant_typography.dart';
export 'src/theme/quant_motion.dart';
export 'src/theme/quantmax_theme.dart';

// --- auth (W3; token_manager.dart + refresh_mutex.dart landed, rest pending) ---
export 'src/auth/auth_exceptions.dart';
export 'src/auth/auth_providers.dart';
export 'src/auth/auth_repository.dart';
export 'src/auth/auth_api.dart';
export 'src/auth/token_manager.dart';
export 'src/auth/silent_refresh.dart';
export 'src/auth/refresh_mutex.dart';

// --- api (W3; pending) ---
export 'src/api/api_result.dart';
export 'src/api/quant_api_client.dart';
export 'src/api/interceptors/auth_interceptor.dart';
export 'src/api/interceptors/refresh_interceptor.dart';
export 'src/api/interceptors/retry_interceptor.dart';

// --- feed (W2) ---
export 'src/feed/feed.dart';

// --- player (W2) ---
export 'src/player/player.dart';

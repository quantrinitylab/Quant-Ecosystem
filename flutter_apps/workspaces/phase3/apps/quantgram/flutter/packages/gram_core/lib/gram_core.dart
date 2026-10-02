// ============================================================================
// gram_core - QuantGram shared core: config + bootstrap
// ============================================================================
//
// Shift 1 ownership: W1. Exported today: config + bootstrap only.
// - `src/config/`     Compile-time [AppConfig] (`--dart-define` backed).
// - `src/bootstrap/`  [AppBootstrap] cold-start sequence + [AppLogger].
//
// TODO(shift): W2 adds theme exports (buildGramTheme) — see app.dart.
// W3 ownership: OAuth2+PKCE auth (QuantMail SSO) + Dio API client.
// - `src/auth/`  PkcePair, TokenManager, GramAuthApi, RefreshMutex (S1 fix),
//                AuthRepository, SilentRefreshScheduler (+ F2-injectable
//                silentRefreshSchedulerProvider), auth exceptions,
//                Riverpod providers + AuthSessionState/AuthSessionNotifier.
// - `src/api/`   GramApiClient (S3: followRedirects=false), ApiResult,
//                Auth/Refresh(mutex-backed)/Retry(PERF-1 dual schedule)/
//                Logging(debug-only) interceptors.
export 'src/auth/pkce.dart';
export 'src/auth/token_manager.dart';
export 'src/auth/auth_api.dart';
export 'src/auth/refresh_mutex.dart';
export 'src/auth/auth_exceptions.dart';
export 'src/auth/auth_repository.dart';
export 'src/auth/auth_providers.dart';
export 'src/auth/silent_refresh.dart';
export 'src/api/api_result.dart';
export 'src/api/gram_api_client.dart';
export 'src/api/interceptors/auth_interceptor.dart';
export 'src/api/interceptors/refresh_interceptor.dart';
export 'src/api/interceptors/retry_interceptor.dart';
export 'src/api/interceptors/logging_interceptor.dart';

export 'src/config/app_config.dart';
export 'src/bootstrap/app_bootstrap.dart';

// W2 ownership: QuantGram design tokens (colors, typography, motion) + the
// Material 3 light/dark themes built from them. Dark is the default.
export 'src/theme/gram_colors.dart';
export 'src/theme/gram_typography.dart';
export 'src/theme/gram_motion.dart';
export 'src/theme/gram_theme.dart';

// Shift 2 (W1) ownership: feed domain (spec-pending UI entities, placeholder
// repository, Riverpod providers). Wire models (fromJson) land with the
// app-foundations/quantgram API spec — invented parsing is theatre.
export 'src/feed/gram_feed_models.dart';
export 'src/feed/feed_repository.dart';
export 'src/feed/feed_providers.dart';

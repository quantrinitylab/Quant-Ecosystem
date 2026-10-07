// ============================================================================
// chat_core - app config + auth layer for the QuantChat Flutter clients
// ============================================================================
//
// Shared core for QuantChat. Depends on `quant_foundation` (phase0) for the
// API client, token management and theme; auth shape mirrors the QuantMail
// `quant_core` package (phase1) because QuantChat authenticates through the
// QuantMail SSO (OAuth2 + PKCE, D1 — no new endpoints).
//
// - `src/config/`  Compile-time [AppConfig] (`--dart-define` backed).
// - `src/auth/`    [AuthRepository] + auth exceptions + login result types,
//   Riverpod auth providers (`authApiProvider`, `authRepositoryProvider`,
//   `pendingOAuthRedirectProvider`, sealed `AuthSessionState` + subclasses,
//   `AuthSessionNotifier`, `authSessionProvider`) + [SilentRefreshScheduler].
// - `src/providers/` shared core providers (app config, token manager,
//   auth-state stream, API client, auth guard).
// - `src/bootstrap/` [AppBootstrap] (wires everything at startup) +
//   [AppLogger].

export 'src/config/app_config.dart';
export 'src/auth/auth_exceptions.dart';
export 'src/auth/auth_repository.dart';
export 'src/auth/auth_providers.dart';
export 'src/auth/silent_refresh.dart';
export 'src/providers/core_providers.dart';
export 'src/bootstrap/app_bootstrap.dart';

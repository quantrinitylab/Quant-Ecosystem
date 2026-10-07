// quant_foundation
//
// Foundation package for the QuantMail omnipresent Flutter clients.
//
// Contents:
// - `lib/src/api/`        Dio-based API client (port of TS `packages/api-client`
//                         HttpClient): Bearer injection, single-flight 401 token
//                         refresh, idempotent retry with exponential backoff.
// - `lib/src/auth/`       TokenManager (secure storage + in-memory cache +
//                         auth-state stream) and OAuth2 PKCE helpers.
// - `lib/src/codegen/`    openapi-generator config for the typed API client.
//                         Generated code is NOT committed (CI step).
//
// See `../API_CLIENT.md` (phase0 root) for the full design doc.

export 'src/api/api_result.dart';
export 'src/api/quant_api_client.dart';
export 'src/api/interceptors/auth_interceptor.dart';
export 'src/api/interceptors/refresh_interceptor.dart';
export 'src/api/interceptors/retry_interceptor.dart';
export 'src/auth/token_manager.dart';
export 'src/auth/auth_api.dart';

// Theme: @quant/brand design tokens (colors, typography, motion) + the
// Material 3 light/dark themes built from them. Dark is the default.
export 'src/theme/quant_colors.dart';
export 'src/theme/quant_typography.dart';
export 'src/theme/quant_motion.dart';
export 'src/theme/quant_theme.dart';

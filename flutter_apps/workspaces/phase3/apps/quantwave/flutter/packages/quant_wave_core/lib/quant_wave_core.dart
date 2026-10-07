// quant_wave_core — Core package for the QuantWave Flutter app.
//
// Contents:
// - `lib/src/theme/`: @quant/brand design tokens (colors, typography, motion)
//   adapted for QuantWave (wave_*.dart) + the Material 3 light/dark themes
//   built from them (`wave_theme.dart`). Dark is the default.

library;

// Theme: @quant/brand design tokens (colors, typography, motion) + the
// Material 3 light/dark themes built from them. Dark is the default.
// NOTE: single barrel for the package: theme (W2) + auth/config/api (W3).
export 'src/theme/wave_colors.dart';
export 'src/theme/wave_typography.dart';
export 'src/theme/wave_motion.dart';
export 'src/theme/wave_theme.dart';

// Auth/config/api (W3) — OAuth2+PKCE core adapted from phase1 quant_core +
// phase0 foundation, QuantWave-branded. All provider/state names are
// reference-identical so quant_wave_app imports compile unchanged.
export 'src/config/app_config.dart';
export 'src/auth/auth_exceptions.dart';
export 'src/auth/token_manager.dart';
export 'src/auth/auth_api.dart';
export 'src/auth/auth_repository.dart';
export 'src/auth/auth_providers.dart';
export 'src/auth/silent_refresh.dart';
export 'src/api/api_result.dart';
export 'src/api/quant_api_client.dart';
export 'src/api/interceptors/auth_interceptor.dart';
export 'src/api/interceptors/refresh_interceptor.dart';
export 'src/api/interceptors/retry_interceptor.dart';
export 'src/providers/core_providers.dart';
export 'src/bootstrap/app_bootstrap.dart';

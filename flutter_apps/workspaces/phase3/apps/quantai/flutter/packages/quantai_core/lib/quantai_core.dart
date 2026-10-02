/// QuantAI shared core: config, auth, API client, SSE streaming, providers.
///
/// W1 owns `src/config/`, `src/auth/`; W3 owns `src/api/` and
/// `src/providers/core_providers.dart`. Do not import individual files —
/// import this barrel from app code.
export 'src/config/app_config.dart';
export 'src/auth/auth_exceptions.dart';
export 'src/auth/auth_repository.dart';
export 'src/auth/auth_providers.dart';
export 'src/auth/silent_refresh.dart';
export 'src/api/quantai_api_client.dart';
export 'src/api/usage_gate.dart';
export 'src/api/sse_client.dart';
export 'src/providers/core_providers.dart';
export 'src/chat/chat.dart';
export 'src/sentinel/sentinel.dart';

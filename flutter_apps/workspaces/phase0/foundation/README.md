# quant_foundation

Foundation package for the QuantMail omnipresent Flutter clients.

- **API client** (`lib/src/api/`): Dio-based port of the TS
  `packages/api-client` `HttpClient` — Bearer injection, single-flight 401
  token refresh, and idempotent retry with the web-outbox backoff schedule.
  Returns the TS-style `{ success, data, error }` envelope (`ApiResult`).
- **Auth** (`lib/src/auth/`): `TokenManager` (secure storage + in-memory
  cache + auth-state stream) and OAuth2 PKCE helpers (`AuthApi`).
- **Codegen** (`lib/src/codegen/`): `openapi-generator` (dart-dio) config.
  Generated code is **not** committed — CI regenerates it from
  `phase0/openapi.repaired.yaml`.

Full design doc: `phase0/API_CLIENT.md`.

## Usage

```dart
import 'package:quant_foundation/quant_foundation.dart';

final tokenManager = TokenManager();
await tokenManager.hydrate(); // warm the in-memory cache once at startup

final api = QuantApiClient(
  config: QuantApiConfig(
    baseUrl: 'https://api.quant.app',
    // TODO(UNVERIFIED): confirm with the auth-contract workstream (C).
    refreshEndpoint: '/oauth/token',
    onAuthFailure: () => navigatorKey.currentState?.pushNamed('/login'),
  ),
  tokenManager: tokenManager,
);

final result = await api.get<Map<String, dynamic>>('/v1/threads');
if (result.success) {
  // result.data
} else {
  // result.error -> ApiError(code, message, statusCode, details)
}

// Pass the shared Dio to the generated typed client so it reuses the
// interceptor stack:
//   final threads = ThreadsApi(ApiClient(dio: api.dio));
```

## Develop

```sh
flutter pub get
flutter test            # unit tests (retry schedule, PKCE vectors, TokenManager)
flutter analyze
```

Dependency versions in `pubspec.yaml` are the latest stable known at
scaffolding time — re-verify against pub.dev before first release
(see `API_CLIENT.md`).

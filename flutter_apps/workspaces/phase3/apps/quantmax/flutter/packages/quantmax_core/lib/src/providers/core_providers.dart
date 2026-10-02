// ============================================================================
// quantmax_core - Riverpod provider graph (Shift 1 skeleton)
// ============================================================================
//
// Plain Riverpod providers (no codegen / riverpod_generator). Every provider
// is override-friendly: tests and flavors override [appConfigProvider] or
// [secureStorageProvider] and the rest of the graph follows.
//
// Provider graph (Shift 1):
//
//   appConfigProvider ──────▶ dioProvider (base Dio, timeouts from config)
//   secureStorageProvider ──▶ (W3: token manager + auth providers)
//
// W3 coordination (resolved Shift 1):
//   - `api/quant_api_client.dart` + interceptor stack build on [dioProvider]
//     (or replace it) so there is exactly one Dio instance.
//   - `authStateProvider` (`auth/auth_providers.dart`) is the canonical auth
//     gate; `quantmax_app`'s login screen + router import it from the
//     `quantmax_core` barrel — no shim.

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:quant_foundation/quant_foundation.dart';

import '../config/app_config.dart';

/// Compile-time configuration, override-friendly per flavor / test.
///
/// Defaults come from `--dart-define` flags (see [AppConfig]); override with
/// `appConfigProvider.overrideWithValue(AppConfig(apiBaseUrl: ...))`.
final appConfigProvider = Provider<AppConfig>(
  (ref) => AppConfig(),
  name: 'appConfigProvider',
);

/// Shared secure storage backed by the platform keystore.
///
/// Android uses encryptedSharedPreferences (S5: tokens must never sit in
/// plaintext prefs); iOS uses the keychain after-first-unlock. Tests
/// override with an in-memory double.
final secureStorageProvider = Provider<FlutterSecureStorage>(
  (ref) => FlutterSecureStorage(
    aOptions: const AndroidOptions(encryptedSharedPreferences: true),
  ),
  name: 'secureStorageProvider',
);

/// Secure token store (foundation [TokenManager]), the single source of
/// truth for the OAuth2 token pair.
///
/// Disposed with the container. Override-friendly: tests inject an
/// in-memory double via `tokenManagerProvider.overrideWithValue(...)`.
final tokenManagerProvider = Provider<TokenManager>(
  (ref) {
    final manager = TokenManager();
    ref.onDispose(manager.dispose);
    return manager;
  },
  name: 'tokenManagerProvider',
);

/// Base HTTP client configured from [AppConfig].
///
/// Timeouts mirror the whole-request budget split per Dio phase. No
/// interceptors are attached here — W3's `QuantApiClient` owns the
/// auth/refresh/retry stack and builds on (or supersedes) this instance.
/// Exactly one Dio per container: disposed with it.
final dioProvider = Provider<Dio>(
  (ref) {
    final config = ref.watch(appConfigProvider);
    final dio = Dio(
      BaseOptions(
        baseUrl: config.apiBaseUrl,
        connectTimeout: config.requestTimeout,
        sendTimeout: config.requestTimeout,
        receiveTimeout: config.requestTimeout,
      ),
    );
    ref.onDispose(dio.close);
    return dio;
  },
  name: 'dioProvider',
);

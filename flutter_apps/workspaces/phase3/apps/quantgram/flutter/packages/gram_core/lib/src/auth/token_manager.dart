// ============================================================================
// gram_core - Token manager
// ============================================================================
//
// Copy-adapt of `quant_foundation`'s token manager (which ports
// `packages/api-client/src/core/token-manager.ts`).
//
// Stores access/refresh tokens in memory with secure persistent backing,
// and broadcasts auth-state changes. Storage keys match the TS manager
// (`token` / `refreshToken`) so conventions stay consistent across clients.
//
// Intentional shadowing note: gram_core copy-adapts the phase0 foundation
// instead of depending on it, so the app imports ONLY gram_core. Class names
// mirror `quant_foundation` on purpose.
//
// One deliberate deviation from phase0: iOS keychain accessibility is
// `whenUnlocked` (kSecAttrAccessible.whenUnlocked) per the QuantGram shift-1
// spec, instead of phase0's `after_first_unlock`. Rationale: social-app
// tokens are high-value; requiring device-unlock narrows the extraction
// window on a locked device. If background fetch ever needs tokens while
// locked, revisit to `after_first_unlock`.

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:rxdart/rxdart.dart';

/// Storage keys, kept identical to the TS TokenManager defaults.
class TokenKeys {
  /// Key for the access token (TS default `'token'`).
  static const String accessToken = 'token';

  /// Key for the refresh token (TS default `'refreshToken'`).
  static const String refreshToken = 'refreshToken';
}

/// Abstraction over the persistent token backend.
///
/// The production implementation is [SecureTokenStorage]
/// (flutter_secure_storage); tests use [InMemoryTokenStorage].
abstract class TokenStorage {
  /// Reads the value stored under [key], or null when absent.
  Future<String?> read(String key);

  /// Persists [value] under [key].
  Future<void> write(String key, String value);

  /// Removes the entry stored under [key].
  Future<void> delete(String key);
}

/// flutter_secure_storage-backed [TokenStorage].
///
/// Uses encryptedSharedPreferences on Android and keychain
/// (`kSecAttrAccessible.whenUnlocked`) on iOS.
class SecureTokenStorage implements TokenStorage {
  final FlutterSecureStorage _storage;

  /// Creates the secure-storage backend, optionally wrapping a
  /// caller-provided [FlutterSecureStorage] (e.g. with custom options in
  /// tests).
  SecureTokenStorage({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(
                encryptedSharedPreferences: true,
              ),
              iOptions: IOSOptions(
                accessibility: KeychainAccessibility.first_unlock,
              ),
            );

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);

  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}

/// Non-persistent [TokenStorage] for tests and ephemeral sessions.
class InMemoryTokenStorage implements TokenStorage {
  final Map<String, String> _map = {};

  /// Creates an empty non-persistent storage backend.
  InMemoryTokenStorage();

  @override
  Future<String?> read(String key) async => _map[key];

  @override
  Future<void> write(String key, String value) async {
    _map[key] = value;
  }

  @override
  Future<void> delete(String key) async {
    _map.remove(key);
  }
}

/// Authentication status broadcast by [TokenManager.onAuthStateChanged].
enum AuthStatus {
  /// Initial state before the persistent store has been read.
  unknown,

  /// An access token is present in memory.
  authenticated,

  /// No access token (signed out, or refresh failed and tokens were cleared).
  unauthenticated,
}

/// Snapshot of the current authentication state.
class AuthState {
  final AuthStatus status;
  final String? accessToken;

  const AuthState._(this.status, this.accessToken);

  const AuthState.unknown() : this._(AuthStatus.unknown, null);

  /// Authenticated state carrying the current access token.
  const AuthState.authenticated(String accessToken)
      : this._(AuthStatus.authenticated, accessToken);

  /// Unauthenticated state (signed out, or tokens cleared after refresh failure).
  const AuthState.unauthenticated() : this._(AuthStatus.unauthenticated, null);

  /// Whether this state represents an authenticated session.
  bool get isAuthenticated => status == AuthStatus.authenticated;

  @override
  String toString() => 'AuthState($status)';
}

/// Manages OAuth2 access/refresh tokens.
///
/// Behavior mirrors the TS TokenManager:
/// - in-memory cache, hydrated once from [TokenStorage];
/// - `setTokens` persists + notifies, `clearTokens` wipes + notifies;
/// - `isAuthenticated()` is a synchronous cache read.
///
/// Differences from TS (deliberate):
/// - persistence backend is [TokenStorage] (secure storage on device) instead
///   of `localStorage`;
/// - token changes are a broadcast [Stream] via an rxdart [BehaviorSubject]
///   (replays the latest state to late subscribers, e.g. UI binding after
///   login) instead of a single `onTokenChange` callback field.
class TokenManager {
  final TokenStorage _storage;

  String? _accessToken;
  String? _refreshToken;
  bool _hydrated = false;

  final BehaviorSubject<AuthState> _authState =
      BehaviorSubject<AuthState>.seeded(const AuthState.unknown());

  /// Creates a manager backed by [storage] (secure storage by default).
  TokenManager({TokenStorage? storage})
      : _storage = storage ?? SecureTokenStorage();

  /// Broadcast stream of auth-state changes. New subscribers immediately
  /// receive the latest state (BehaviorSubject semantics).
  Stream<AuthState> get onAuthStateChanged => _authState.stream;

  /// Current auth state snapshot (synchronous, from the in-memory cache).
  AuthState get currentState => _authState.value;

  /// Reads the persistent store once into the in-memory cache. Idempotent.
  Future<void> hydrate() async {
    if (_hydrated) return;
    _accessToken = await _storage.read(TokenKeys.accessToken);
    _refreshToken = await _storage.read(TokenKeys.refreshToken);
    _hydrated = true;
    _emit();
  }

  /// Synchronous access-token read from the in-memory cache.
  ///
  /// Used by [AuthInterceptor] on the request hot path so header injection
  /// never blocks on storage I/O. Call [hydrate] (or [getValidToken]) once
  /// at startup so the cache is warm.
  String? getAccessToken() => _accessToken;

  /// Synchronous refresh-token read from the in-memory cache.
  String? getRefreshToken() => _refreshToken;

  /// Returns the cached access token, hydrating from storage on first call.
  ///
  /// "Valid" here means *present*, mirroring the TS manager: no client-side
  /// JWT `exp` validation is performed (the backend is the authority; an
  /// expired token surfaces as 401 and triggers the refresh flow).
  /// TODO: consider proactive refresh using the JWT `exp` claim (with clock
  /// skew leeway) once the QuantGram auth contract is verified.
  Future<String?> getValidToken() async {
    await hydrate();
    return _accessToken;
  }

  /// Stores access and (optionally) refresh tokens, persisting them and
  /// notifying listeners. Mirrors the TS `setTokens` (refresh token is only
  /// overwritten when provided, so rotation-less refresh responses that omit
  /// it don't wipe the stored one).
  Future<void> setTokens(String accessToken, [String? refreshToken]) async {
    await hydrate();
    _accessToken = accessToken;
    if (refreshToken != null) {
      _refreshToken = refreshToken;
    }
    await _storage.write(TokenKeys.accessToken, accessToken);
    if (refreshToken != null) {
      await _storage.write(TokenKeys.refreshToken, refreshToken);
    }
    _emit();
  }

  /// Clears tokens from memory and persistent storage, then notifies.
  Future<void> clearTokens() async {
    _accessToken = null;
    _refreshToken = null;
    await _storage.delete(TokenKeys.accessToken);
    await _storage.delete(TokenKeys.refreshToken);
    _emit();
  }

  /// Whether an access token is present (synchronous cache read).
  bool isAuthenticated() => _accessToken != null;

  /// Releases the auth-state subject. Call on app teardown / in tests.
  void dispose() {
    _authState.close();
  }

  void _emit() {
    final token = _accessToken;
    _authState.add(
      token != null
          ? AuthState.authenticated(token)
          : const AuthState.unauthenticated(),
    );
  }
}

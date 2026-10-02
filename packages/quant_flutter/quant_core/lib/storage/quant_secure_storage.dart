import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Hardware-backed Encrypted Keystore & Keychain wrapper for Quant Sovereign Ecosystem.
///
/// Uses Android Keystore (AES-256 GCM) with EncryptedSharedPreferences and
/// Apple Keychain with kSecAttrAccessibleAfterFirstUnlock.
class QuantSecureStorage {
  final FlutterSecureStorage _storage;

  QuantSecureStorage({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(
                encryptedSharedPreferences: true,
              ),
              iOptions: IOSOptions(
                accessibility: KeychainAccessibility.first_unlock,
              ),
            );

  static const String _keyAccessToken = 'quant_access_token';
  static const String _keyRefreshToken = 'quant_refresh_token';
  static const String _keyTenantId = 'quant_tenant_id';
  static const String _keyUserId = 'quant_user_id';
  static const String _keyUserEmail = 'quant_user_email';

  /// Save access and refresh tokens securely
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    await Future.wait([
      _storage.write(key: _keyAccessToken, value: accessToken),
      _storage.write(key: _keyRefreshToken, value: refreshToken),
    ]);
  }

  /// Retrieve the current access token
  Future<String?> getAccessToken() async {
    return _storage.read(key: _keyAccessToken);
  }

  /// Retrieve the current refresh token
  Future<String?> getRefreshToken() async {
    return _storage.read(key: _keyRefreshToken);
  }

  /// Save workspace tenant context
  Future<void> saveTenantId(String tenantId) async {
    await _storage.write(key: _keyTenantId, value: tenantId);
  }

  /// Get active workspace tenant ID
  Future<String?> getTenantId() async {
    return _storage.read(key: _keyTenantId);
  }

  /// Save user identity
  Future<void> saveUserIdentity({
    required String userId,
    required String email,
  }) async {
    await Future.wait([
      _storage.write(key: _keyUserId, value: userId),
      _storage.write(key: _keyUserEmail, value: email),
    ]);
  }

  /// Retrieve user ID
  Future<String?> getUserId() async {
    return _storage.read(key: _keyUserId);
  }

  /// Retrieve user email
  Future<String?> getUserEmail() async {
    return _storage.read(key: _keyUserEmail);
  }

  /// Completely wipe all stored credentials on logout
  Future<void> clearAll() async {
    await _storage.deleteAll();
  }
}

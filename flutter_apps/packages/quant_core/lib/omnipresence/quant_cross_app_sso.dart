// Sovereign Quant Ecosystem - Cross-App SSO Session Sharing
// Shared Keychain Access Group (group.com.quant.ecosystem) & Android SharedKeyStore definitions.
// The shared-session vault lets a sibling app read a published session from secure
// storage. Deep-link SSO *handoff tokens* are DISABLED (QC-F-307): the previous
// unsigned base64 design was forgeable, so no handoff token is minted or accepted
// until a signed / exchange-first design lands.
// Invariants: Strictly ZERO raw Unicode emojis, ZERO Skia clipPath.

import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../auth/quant_auth_service.dart';

/// Representation of an ecosystem-wide shared Single Sign-On session.
class QuantSsoSharedSession {
  final String accessToken;
  final String refreshToken;
  final String userId;
  final String email;
  final String activeWorkspaceId;
  final String userName;
  final String? avatarUrl;
  final String tier;
  final DateTime? expiresAt;
  final DateTime syncTimestamp;
  final String sourceAppPackage;

  const QuantSsoSharedSession({
    required this.accessToken,
    required this.refreshToken,
    required this.userId,
    required this.email,
    required this.activeWorkspaceId,
    required this.userName,
    this.avatarUrl,
    this.tier = 'enterprise',
    this.expiresAt,
    required this.syncTimestamp,
    this.sourceAppPackage = 'com.quant.mail',
  });

  /// True if the session has tokens and is within its validity lifespan.
  bool get isValid {
    if (accessToken.isEmpty || refreshToken.isEmpty || email.isEmpty) {
      return false;
    }
    if (expiresAt != null && DateTime.now().isAfter(expiresAt!)) {
      return false;
    }
    return true;
  }

  /// Converts this shared SSO session into a full QuantAuthSession.
  QuantAuthSession toAuthSession() {
    return QuantAuthSession(
      accessToken: accessToken,
      refreshToken: refreshToken,
      user: QuantUserProfile(
        id: userId,
        email: email,
        name: userName,
        avatarUrl: avatarUrl,
        tier: tier,
      ),
      activeWorkspaceId: activeWorkspaceId,
      expiresAt: expiresAt,
    );
  }

  /// Factory creating an SSO session from an active QuantAuthSession.
  factory QuantSsoSharedSession.fromAuthSession(
    QuantAuthSession session, {
    String sourceAppPackage = 'com.quant.mail',
  }) {
    return QuantSsoSharedSession(
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      userId: session.user.id,
      email: session.user.email,
      activeWorkspaceId: session.activeWorkspaceId,
      userName: session.user.name,
      avatarUrl: session.user.avatarUrl,
      tier: session.user.tier,
      expiresAt: session.expiresAt,
      syncTimestamp: DateTime.now().toUtc(),
      sourceAppPackage: sourceAppPackage,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'accessToken': accessToken,
      'refreshToken': refreshToken,
      'userId': userId,
      'email': email,
      'activeWorkspaceId': activeWorkspaceId,
      'userName': userName,
      'avatarUrl': avatarUrl,
      'tier': tier,
      'expiresAt': expiresAt?.toIso8601String(),
      'syncTimestamp': syncTimestamp.toIso8601String(),
      'sourceAppPackage': sourceAppPackage,
    };
  }

  factory QuantSsoSharedSession.fromJson(Map<String, dynamic> json) {
    return QuantSsoSharedSession(
      accessToken: json['accessToken'] as String? ?? '',
      refreshToken: json['refreshToken'] as String? ?? '',
      userId: json['userId'] as String? ?? '',
      email: json['email'] as String? ?? '',
      activeWorkspaceId: json['activeWorkspaceId'] as String? ?? 'ws_default',
      userName: json['userName'] as String? ?? 'Quant User',
      avatarUrl: json['avatarUrl'] as String?,
      tier: json['tier'] as String? ?? 'enterprise',
      expiresAt: json['expiresAt'] != null ? DateTime.tryParse(json['expiresAt'] as String) : null,
      syncTimestamp: json['syncTimestamp'] != null
          ? DateTime.tryParse(json['syncTimestamp'] as String) ?? DateTime.now().toUtc()
          : DateTime.now().toUtc(),
      sourceAppPackage: json['sourceAppPackage'] as String? ?? 'com.quant.mail',
    );
  }
}

/// Abstract storage interface for cross-app SSO session sharing.
abstract class QuantSsoStorageAdapter {
  Future<void> write(String key, String value);
  Future<String?> read(String key);
  Future<void> delete(String key);
  Future<void> deleteAll();
}

/// Hardware-backed secure storage adapter targeting Shared Keychain & Shared KeyStore.
class QuantHardwareSsoStorageAdapter implements QuantSsoStorageAdapter {
  final FlutterSecureStorage _storage;

  QuantHardwareSsoStorageAdapter({
    FlutterSecureStorage? storage,
    String keychainGroup = QuantCrossAppSsoVault.keychainAccessGroup,
    String sharedPrefsName = QuantCrossAppSsoVault.androidSharedPrefsName,
  }) : _storage = storage ??
            FlutterSecureStorage(
              aOptions: AndroidOptions(
                encryptedSharedPreferences: true,
                sharedPreferencesName: sharedPrefsName,
                resetOnError: true,
              ),
              iOptions: IOSOptions(
                groupId: keychainGroup,
                accessibility: KeychainAccessibility.first_unlock,
              ),
              mOptions: MacOsOptions(
                groupId: keychainGroup,
                accessibility: KeychainAccessibility.first_unlock,
              ),
            );

  @override
  Future<void> write(String key, String value) => _storage.write(key: key, value: value);

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> delete(String key) => _storage.delete(key: key);

  @override
  Future<void> deleteAll() => _storage.deleteAll();
}

/// In-memory storage adapter for unit tests, Linux, Windows desktop, and fallback environments.
class QuantInMemorySsoStorageAdapter implements QuantSsoStorageAdapter {
  final Map<String, String> _data = {};

  @override
  Future<void> write(String key, String value) async {
    _data[key] = value;
  }

  @override
  Future<String?> read(String key) async {
    return _data[key];
  }

  @override
  Future<void> delete(String key) async {
    _data.remove(key);
  }

  @override
  Future<void> deleteAll() async {
    _data.clear();
  }
}

/// Cross-App SSO Master Vault.
///
/// Encapsulates the Shared Keychain Access Group (group.com.quant.ecosystem) on Apple platforms
/// and the Android SharedKeyStore / EncryptedSharedPreferences on Android.
class QuantCrossAppSsoVault {
  /// Apple Keychain Access Group shared across all 10 apps.
  static const String keychainAccessGroup = 'group.com.quant.ecosystem';

  /// Android SharedPreferences file name protected by hardware Keystore AES-256 GCM.
  static const String androidSharedPrefsName = 'quant_shared_sso_vault';

  /// Secret key under which the serialized SSO session is stored.
  static const String storageKey = 'quant_sso_master_session_payload';

  final QuantSsoStorageAdapter _adapter;

  QuantCrossAppSsoVault({QuantSsoStorageAdapter? adapter})
      : _adapter = adapter ?? QuantHardwareSsoStorageAdapter();

  /// Creates a test vault backed by fast in-memory storage.
  factory QuantCrossAppSsoVault.inMemory() {
    return QuantCrossAppSsoVault(adapter: QuantInMemorySsoStorageAdapter());
  }

  /// Publishes an authenticated session to the shared ecosystem vault.
  /// Once called by QuantMail, any other sibling app can read it and auto-authenticate.
  Future<void> publishSession(
    QuantAuthSession session, {
    String sourceAppPackage = 'com.quant.mail',
  }) async {
    try {
      final ssoSession = QuantSsoSharedSession.fromAuthSession(
        session,
        sourceAppPackage: sourceAppPackage,
      );
      final raw = jsonEncode(ssoSession.toJson());
      await _adapter.write(storageKey, raw);
      debugPrint('[QuantCrossAppSso] Published shared session from $sourceAppPackage for ${session.user.email}');
    } catch (e) {
      debugPrint('[QuantCrossAppSso] Failed to publish shared session: $e');
      rethrow;
    }
  }

  /// Acquires the shared SSO session from the shared keystore / keychain.
  /// Returns null if no session exists or if the session has expired.
  Future<QuantSsoSharedSession?> acquireSharedSession() async {
    try {
      final raw = await _adapter.read(storageKey);
      if (raw == null || raw.trim().isEmpty) {
        return null;
      }

      final json = jsonDecode(raw) as Map<String, dynamic>;
      final session = QuantSsoSharedSession.fromJson(json);

      if (!session.isValid) {
        debugPrint('[QuantCrossAppSso] Shared session is expired or invalid. Revoking.');
        await revokeSharedSession();
        return null;
      }

      debugPrint('[QuantCrossAppSso] Acquired valid SSO session for ${session.email} from ${session.sourceAppPackage}');
      return session;
    } catch (e) {
      debugPrint('[QuantCrossAppSso] Error acquiring shared SSO session: $e');
      return null;
    }
  }

  /// Checks if a valid, unexpired shared SSO session exists without hydrating it completely.
  Future<bool> hasValidSharedSession() async {
    final session = await acquireSharedSession();
    return session != null && session.isValid;
  }

  /// Revokes and deletes the shared session across all apps on global sign-out.
  Future<void> revokeSharedSession() async {
    try {
      await _adapter.delete(storageKey);
      debugPrint('[QuantCrossAppSso] Revoked shared SSO session across all ecosystem apps.');
    } catch (e) {
      debugPrint('[QuantCrossAppSso] Failed to revoke shared SSO session: $e');
    }
  }

  /// Generates a tamper-evident ephemeral handoff payload for deep-link cross-app transitions.
  ///
  /// DISABLED (QC-F-307): the previous implementation merely base64-encoded an
  /// unverified JSON payload containing the raw access and refresh tokens, while
  /// the doc-comment claimed it was "tamper-evident". Anyone could forge such a
  /// token for any user (aud/expiry were the only checks on the receiving side),
  /// so this API must not be used. Always throws [UnsupportedError].
  ///
  /// The replacement design (when it lands) is a single-use opaque ticket that the
  /// receiving app exchanges over a back channel (like the QuantChat backend's
  /// POST /auth/sso/exchange). Raw access/refresh tokens must NEVER travel in a
  /// payload or a URL.
  @Deprecated(
    'Disabled by QC-F-307: unsigned handoff tokens are forgeable. '
    'No replacement API exists yet; cross-app navigation proceeds without SSO handoff.',
  )
  String generateHandoffToken({
    required QuantSsoSharedSession session,
    required String targetAppPackage,
    Duration validity = const Duration(minutes: 5),
  }) {
    throw UnsupportedError(
      '[QuantCrossAppSso] generateHandoffToken is disabled (QC-F-307): '
      'unsigned handoff tokens are forgeable (P0-A-class identity forgery). '
      'Handoff will be re-enabled only with a signed or exchange-first design.',
    );
  }

  /// Verifies and consumes an ephemeral deep-link handoff token.
  ///
  /// FAIL-CLOSED (QC-F-307): there is no signing infrastructure in the ecosystem,
  /// so NO handoff token can be authenticated. Every token is rejected with null,
  /// including tokens minted by the pre-QC-F-307 unsigned implementation. This is
  /// deliberate: accepting an unverifiable payload as an identity is forgery.
  QuantSsoSharedSession? verifyHandoffToken(
    String token, {
    required String expectedTargetAppPackage,
  }) {
    debugPrint(
      '[QuantCrossAppSso] Handoff token REJECTED (QC-F-307): unsigned handoff '
      'tokens cannot be verified, so all are rejected fail-closed. '
      'Expected target: $expectedTargetAppPackage.',
    );
    return null;
  }
}

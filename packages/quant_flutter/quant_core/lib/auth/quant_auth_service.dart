// Sovereign Quant Ecosystem - Secure Auth Service
// Strictly ZERO raw Unicode emojis throughout this file.

import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Authentication state machine.
enum QuantAuthState {
  initial,
  unauthenticated,
  authenticating,
  authenticated,
  refreshing,
  error,
}

/// Domain model representing the authenticated Quant Ecosystem user profile.
class QuantUserProfile {
  final String id;
  final String email;
  final String name;
  final String? avatarUrl;
  final bool isPhoneVerified;
  final String? phoneNumber;
  final String role;
  final String tier;
  final DateTime? createdAt;

  const QuantUserProfile({
    required this.id,
    required this.email,
    required this.name,
    this.avatarUrl,
    this.isPhoneVerified = false,
    this.phoneNumber,
    this.role = 'member',
    this.tier = 'enterprise',
    this.createdAt,
  });

  /// Initials generated from user name or email for fallback avatar.
  String get initials {
    if (name.trim().isNotEmpty) {
      final parts = name.trim().split(RegExp(r'\s+'));
      if (parts.length >= 2) {
        return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
      }
      return name.trim().substring(0, name.trim().length >= 2 ? 2 : 1).toUpperCase();
    }
    if (email.isNotEmpty) {
      return email.substring(0, email.length >= 2 ? 2 : 1).toUpperCase();
    }
    return 'QE';
  }

  QuantUserProfile copyWith({
    String? id,
    String? email,
    String? name,
    String? avatarUrl,
    bool? isPhoneVerified,
    String? phoneNumber,
    String? role,
    String? tier,
    DateTime? createdAt,
  }) {
    return QuantUserProfile(
      id: id ?? this.id,
      email: email ?? this.email,
      name: name ?? this.name,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      isPhoneVerified: isPhoneVerified ?? this.isPhoneVerified,
      phoneNumber: phoneNumber ?? this.phoneNumber,
      role: role ?? this.role,
      tier: tier ?? this.tier,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'email': email,
      'name': name,
      'avatarUrl': avatarUrl,
      'isPhoneVerified': isPhoneVerified,
      'phoneNumber': phoneNumber,
      'role': role,
      'tier': tier,
      'createdAt': createdAt?.toIso8601String(),
    };
  }

  factory QuantUserProfile.fromJson(Map<String, dynamic> json) {
    return QuantUserProfile(
      id: json['id'] as String? ?? '',
      email: json['email'] as String? ?? '',
      name: json['name'] as String? ?? json['username'] as String? ?? 'Quant User',
      avatarUrl: json['avatarUrl'] as String? ?? json['avatar'] as String?,
      isPhoneVerified: json['isPhoneVerified'] as bool? ?? json['phoneVerified'] as bool? ?? false,
      phoneNumber: json['phoneNumber'] as String? ?? json['phone'] as String?,
      role: json['role'] as String? ?? 'member',
      tier: json['tier'] as String? ?? 'enterprise',
      createdAt: json['createdAt'] != null ? DateTime.tryParse(json['createdAt'] as String) : null,
    );
  }
}

/// Workspace domain model for multi-tenant isolation.
class QuantWorkspace {
  final String id;
  final String name;
  final String slug;
  final String role;
  final bool isDefault;

  const QuantWorkspace({
    required this.id,
    required this.name,
    required this.slug,
    this.role = 'owner',
    this.isDefault = false,
  });

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'slug': slug,
      'role': role,
      'isDefault': isDefault,
    };
  }

  factory QuantWorkspace.fromJson(Map<String, dynamic> json) {
    return QuantWorkspace(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'Primary Workspace',
      slug: json['slug'] as String? ?? 'primary',
      role: json['role'] as String? ?? 'owner',
      isDefault: json['isDefault'] as bool? ?? false,
    );
  }
}

/// Active authentication session holding tokens and identity.
class QuantAuthSession {
  final String accessToken;
  final String refreshToken;
  final QuantUserProfile user;
  final String activeWorkspaceId;
  final DateTime? expiresAt;

  const QuantAuthSession({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
    required this.activeWorkspaceId,
    this.expiresAt,
  });

  bool get isExpired {
    if (expiresAt == null) return false;
    return DateTime.now().isAfter(expiresAt!);
  }

  QuantAuthSession copyWith({
    String? accessToken,
    String? refreshToken,
    QuantUserProfile? user,
    String? activeWorkspaceId,
    DateTime? expiresAt,
  }) {
    return QuantAuthSession(
      accessToken: accessToken ?? this.accessToken,
      refreshToken: refreshToken ?? this.refreshToken,
      user: user ?? this.user,
      activeWorkspaceId: activeWorkspaceId ?? this.activeWorkspaceId,
      expiresAt: expiresAt ?? this.expiresAt,
    );
  }
}

/// Core authentication service managing keystore storage, token lifecycle, and session state.
class QuantAuthService {
  static const String _keyAccessToken = 'quant_auth_access_token';
  static const String _keyRefreshToken = 'quant_auth_refresh_token';
  static const String _keyActiveWorkspaceId = 'quant_auth_active_workspace_id';
  static const String _keyUserProfile = 'quant_auth_user_profile';
  static const String _keyWorkspaces = 'quant_auth_workspaces';
  static const String _keyTokenExpiresAt = 'quant_auth_token_expires_at';

  final FlutterSecureStorage _secureStorage;
  final ValueNotifier<QuantAuthState> authStateNotifier = ValueNotifier<QuantAuthState>(QuantAuthState.initial);
  final ValueNotifier<QuantAuthSession?> sessionNotifier = ValueNotifier<QuantAuthSession?>(null);
  final StreamController<QuantAuthSession?> _sessionStreamController = StreamController<QuantAuthSession?>.broadcast();

  void Function()? onSessionExpired;

  QuantAuthService({FlutterSecureStorage? secureStorage})
      : _secureStorage = secureStorage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(
                encryptedSharedPreferences: true,
                resetOnError: true,
              ),
              iOptions: IOSOptions(
                accessibility: KeychainAccessibility.first_unlock,
              ),
            );

  Stream<QuantAuthSession?> get sessionStream => _sessionStreamController.stream;
  QuantAuthSession? get currentSession => sessionNotifier.value;
  QuantUserProfile? get currentUser => sessionNotifier.value?.user;
  String? get currentWorkspaceId => sessionNotifier.value?.activeWorkspaceId;
  bool get isAuthenticated => sessionNotifier.value != null && sessionNotifier.value!.accessToken.isNotEmpty;

  /// Initializes authentication state by restoring hardware-encrypted credentials.
  Future<void> init() async {
    try {
      final accessToken = await _secureStorage.read(key: _keyAccessToken);
      final refreshToken = await _secureStorage.read(key: _keyRefreshToken);
      final workspaceId = await _secureStorage.read(key: _keyActiveWorkspaceId) ?? 'ws_default';
      final profileRaw = await _secureStorage.read(key: _keyUserProfile);
      final expiresAtRaw = await _secureStorage.read(key: _keyTokenExpiresAt);

      if (accessToken != null && accessToken.isNotEmpty && refreshToken != null && refreshToken.isNotEmpty) {
        QuantUserProfile profile;
        if (profileRaw != null) {
          try {
            final json = jsonDecode(profileRaw) as Map<String, dynamic>;
            profile = QuantUserProfile.fromJson(json);
          } catch (_) {
            profile = _defaultFallbackProfile();
          }
        } else {
          profile = _defaultFallbackProfile();
        }

        DateTime? expiresAt;
        if (expiresAtRaw != null) {
          expiresAt = DateTime.tryParse(expiresAtRaw);
        }

        final session = QuantAuthSession(
          accessToken: accessToken,
          refreshToken: refreshToken,
          user: profile,
          activeWorkspaceId: workspaceId,
          expiresAt: expiresAt,
        );

        sessionNotifier.value = session;
        _sessionStreamController.add(session);
        authStateNotifier.value = QuantAuthState.authenticated;
        debugPrint('[QuantAuthService] Session successfully restored for \${profile.email}');
      } else {
        sessionNotifier.value = null;
        _sessionStreamController.add(null);
        authStateNotifier.value = QuantAuthState.unauthenticated;
        debugPrint('[QuantAuthService] No cached session found. Ready for sign-in.');
      }
    } catch (e, st) {
      debugPrint('[QuantAuthService] Error reading secure keystore: \$e\\n\$st');
      sessionNotifier.value = null;
      _sessionStreamController.add(null);
      authStateNotifier.value = QuantAuthState.unauthenticated;
    }
  }

  /// Persists full authentication credentials into hardware keystore.
  Future<void> saveSession({
    required String accessToken,
    required String refreshToken,
    required QuantUserProfile user,
    String activeWorkspaceId = 'ws_default',
    DateTime? expiresAt,
  }) async {
    try {
      await _secureStorage.write(key: _keyAccessToken, value: accessToken);
      await _secureStorage.write(key: _keyRefreshToken, value: refreshToken);
      await _secureStorage.write(key: _keyActiveWorkspaceId, value: activeWorkspaceId);
      await _secureStorage.write(key: _keyUserProfile, value: jsonEncode(user.toJson()));
      if (expiresAt != null) {
        await _secureStorage.write(key: _keyTokenExpiresAt, value: expiresAt.toIso8601String());
      }

      final session = QuantAuthSession(
        accessToken: accessToken,
        refreshToken: refreshToken,
        user: user,
        activeWorkspaceId: activeWorkspaceId,
        expiresAt: expiresAt,
      );

      sessionNotifier.value = session;
      _sessionStreamController.add(session);
      authStateNotifier.value = QuantAuthState.authenticated;
      debugPrint('[QuantAuthService] Session saved securely for \${user.email}');
    } catch (e) {
      debugPrint('[QuantAuthService] Failed to write session to keystore: \$e');
      rethrow;
    }
  }

  /// Atomically updates active tokens upon successful token refresh.
  Future<void> updateTokens({
    required String accessToken,
    String? refreshToken,
    DateTime? expiresAt,
  }) async {
    try {
      await _secureStorage.write(key: _keyAccessToken, value: accessToken);
      if (refreshToken != null && refreshToken.isNotEmpty) {
        await _secureStorage.write(key: _keyRefreshToken, value: refreshToken);
      }
      if (expiresAt != null) {
        await _secureStorage.write(key: _keyTokenExpiresAt, value: expiresAt.toIso8601String());
      }

      final current = sessionNotifier.value;
      if (current != null) {
        final updatedSession = current.copyWith(
          accessToken: accessToken,
          refreshToken: refreshToken ?? current.refreshToken,
          expiresAt: expiresAt ?? current.expiresAt,
        );
        sessionNotifier.value = updatedSession;
        _sessionStreamController.add(updatedSession);
      }
      debugPrint('[QuantAuthService] JWT Access Token refreshed successfully.');
    } catch (e) {
      debugPrint('[QuantAuthService] Failed to update refreshed tokens: \$e');
      rethrow;
    }
  }

  /// Switches active workspace context.
  Future<void> switchWorkspace(String workspaceId) async {
    try {
      await _secureStorage.write(key: _keyActiveWorkspaceId, value: workspaceId);
      final current = sessionNotifier.value;
      if (current != null) {
        final updatedSession = current.copyWith(activeWorkspaceId: workspaceId);
        sessionNotifier.value = updatedSession;
        _sessionStreamController.add(updatedSession);
      }
      debugPrint('[QuantAuthService] Active workspace switched to \$workspaceId');
    } catch (e) {
      debugPrint('[QuantAuthService] Failed to switch workspace: \$e');
      rethrow;
    }
  }

  /// Retrieves current access token directly from secure memory or keystore.
  Future<String?> getAccessToken() async {
    final memoryToken = sessionNotifier.value?.accessToken;
    if (memoryToken != null && memoryToken.isNotEmpty) {
      return memoryToken;
    }
    return await _secureStorage.read(key: _keyAccessToken);
  }

  /// Retrieves current refresh token directly from secure storage.
  Future<String?> getRefreshToken() async {
    final memoryToken = sessionNotifier.value?.refreshToken;
    if (memoryToken != null && memoryToken.isNotEmpty) {
      return memoryToken;
    }
    return await _secureStorage.read(key: _keyRefreshToken);
  }

  /// Retrieves current workspace ID.
  Future<String?> getActiveWorkspaceId() async {
    final memoryWs = sessionNotifier.value?.activeWorkspaceId;
    if (memoryWs != null && memoryWs.isNotEmpty) {
      return memoryWs;
    }
    return await _secureStorage.read(key: _keyActiveWorkspaceId);
  }

  /// Retrieves cached workspaces list.
  Future<List<QuantWorkspace>> getWorkspaces() async {
    try {
      final raw = await _secureStorage.read(key: _keyWorkspaces);
      if (raw == null || raw.isEmpty) return const [];
      final list = jsonDecode(raw) as List<dynamic>;
      return list.map((item) => QuantWorkspace.fromJson(item as Map<String, dynamic>)).toList();
    } catch (_) {
      return const [];
    }
  }

  /// Persists workspaces list into secure storage.
  Future<void> saveWorkspaces(List<QuantWorkspace> workspaces) async {
    try {
      final raw = jsonEncode(workspaces.map((w) => w.toJson()).toList());
      await _secureStorage.write(key: _keyWorkspaces, value: raw);
    } catch (e) {
      debugPrint('[QuantAuthService] Failed to save workspaces: \$e');
    }
  }

  /// Completely wipes all session tokens and identity from hardware keystore.
  Future<void> logout() async {
    try {
      await _secureStorage.delete(key: _keyAccessToken);
      await _secureStorage.delete(key: _keyRefreshToken);
      await _secureStorage.delete(key: _keyActiveWorkspaceId);
      await _secureStorage.delete(key: _keyUserProfile);
      await _secureStorage.delete(key: _keyWorkspaces);
      await _secureStorage.delete(key: _keyTokenExpiresAt);

      sessionNotifier.value = null;
      _sessionStreamController.add(null);
      authStateNotifier.value = QuantAuthState.unauthenticated;

      onSessionExpired?.call();
      debugPrint('[QuantAuthService] User logged out and secure keystore wiped cleanly.');
    } catch (e) {
      debugPrint('[QuantAuthService] Error during secure logout: \$e');
      sessionNotifier.value = null;
      authStateNotifier.value = QuantAuthState.unauthenticated;
    }
  }

  QuantUserProfile _defaultFallbackProfile() {
    return const QuantUserProfile(
      id: 'usr_default',
      email: 'user@quantmail.in',
      name: 'Quant Operator',
      role: 'member',
      tier: 'enterprise',
    );
  }

  void dispose() {
    _sessionStreamController.close();
  }
}

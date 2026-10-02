import 'dart:async';
import 'package:flutter/foundation.dart';
import '../storage/quant_secure_storage.dart';
import 'quant_session_state.dart';

/// Sovereign Auth Session Manager.
/// Coordinates JWT lifecycle, hardware keystore persistence, and multi-tenant workspace context.
class QuantAuthSession extends ChangeNotifier {
  final QuantSecureStorage _secureStorage;
  QuantSessionState _state = QuantSessionState.unauthenticated();

  final _sessionController = StreamController<QuantSessionState>.broadcast();

  QuantAuthSession({QuantSecureStorage? secureStorage})
      : _secureStorage = secureStorage ?? QuantSecureStorage();

  QuantSessionState get state => _state;
  Stream<QuantSessionState> get sessionStream => _sessionController.stream;
  bool get isAuthenticated => _state.isAuthenticated;
  String? get accessToken => _state.accessToken;
  String? get tenantId => _state.tenantId;

  /// Initialize session from secure hardware keystore on app startup
  Future<void> initialize() async {
    _updateState(_state.copyWith(isLoading: true));

    try {
      final token = await _secureStorage.getAccessToken();
      final refresh = await _secureStorage.getRefreshToken();
      final tenant = await _secureStorage.getTenantId();
      final userId = await _secureStorage.getUserId();
      final email = await _secureStorage.getUserEmail();

      if (token != null && token.isNotEmpty) {
        _updateState(QuantSessionState(
          userId: userId,
          email: email,
          tenantId: tenant ?? 'default',
          accessToken: token,
          refreshToken: refresh,
          isLoading: false,
        ));
      } else {
        _updateState(QuantSessionState.unauthenticated());
      }
    } catch (e) {
      _updateState(QuantSessionState.unauthenticated());
    }
  }

  /// Store new authenticated session credentials
  Future<void> setAuthenticatedSession({
    required String userId,
    required String email,
    required String accessToken,
    String? refreshToken,
    String tenantId = 'default',
    DateTime? expiresAt,
    List<String> roles = const [],
  }) async {
    await _secureStorage.saveTokens(
      accessToken: accessToken,
      refreshToken: refreshToken ?? '',
    );
    await _secureStorage.saveUserIdentity(userId: userId, email: email);
    await _secureStorage.saveTenantId(tenantId);

    _updateState(QuantSessionState(
      userId: userId,
      email: email,
      tenantId: tenantId,
      accessToken: accessToken,
      refreshToken: refreshToken,
      expiresAt: expiresAt,
      roles: roles,
      isLoading: false,
    ));
  }

  /// Switch active multi-tenant workspace
  Future<void> switchWorkspace(String newTenantId) async {
    await _secureStorage.saveTenantId(newTenantId);
    _updateState(_state.copyWith(tenantId: newTenantId));
  }

  /// Update JWT tokens after background refresh
  Future<void> updateTokens({
    required String newAccessToken,
    String? newRefreshToken,
    DateTime? expiresAt,
  }) async {
    await _secureStorage.saveTokens(
      accessToken: newAccessToken,
      refreshToken: newRefreshToken ?? _state.refreshToken ?? '',
    );

    _updateState(_state.copyWith(
      accessToken: newAccessToken,
      refreshToken: newRefreshToken ?? _state.refreshToken,
      expiresAt: expiresAt,
    ));
  }

  /// Set offline mode toggle
  void setOfflineMode(bool isOffline) {
    _updateState(_state.copyWith(isOffline: isOffline));
  }

  /// Completely logout and purge credentials from hardware keystore
  Future<void> logout() async {
    await _secureStorage.clearAll();
    _updateState(QuantSessionState.unauthenticated());
  }

  void _updateState(QuantSessionState newState) {
    _state = newState;
    _sessionController.add(_state);
    notifyListeners();
  }

  @override
  void dispose() {
    _sessionController.close();
    super.dispose();
  }
}

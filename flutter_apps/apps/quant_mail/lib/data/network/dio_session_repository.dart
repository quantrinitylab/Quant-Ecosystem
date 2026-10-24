import 'dart:async';

import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:flutter/foundation.dart';

import '../../services/quant_auth_service.dart';
import '../mail_exception.dart';
import '../models/session_models.dart';
import '../repositories/repositories.dart';
import 'session_refresh_interceptor.dart';

/// Session on top of the existing [QuantAuthService] (access token in the
/// keystore) and the shared cookie jar (HttpOnly refresh cookie).
///
/// Backend contract (apps/quantmail/backend/routes/auth.ts, lib/auth-session.ts):
/// login sets `quantmail_refresh` (HttpOnly, host-only, Path=/, 30 days) and
/// never returns the refresh token in JSON. `POST /auth/refresh` reads only
/// that cookie, rotates it (new Set-Cookie) and returns a new access token.
/// Every failure answer clears the cookie.
class DioSessionRepository implements SessionRepository {
  DioSessionRepository({
    required QuantAuthService authService,
    required CookieJar cookieJar,
    required String baseUrl,
    required String origin,
    HttpClientAdapter? httpClientAdapter,
    Duration logoutTimeout = const Duration(seconds: 5),
  })  : _auth = authService,
        _jar = cookieJar,
        _logoutTimeout = logoutTimeout,
        _dio = Dio(
          BaseOptions(
            baseUrl: baseUrl,
            connectTimeout: const Duration(seconds: 10),
            receiveTimeout: const Duration(seconds: 20),
            sendTimeout: const Duration(seconds: 15),
            headers: <String, dynamic>{'Accept': 'application/json', 'Origin': origin},
          ),
        ) {
    // This client has NO refresh interceptor: a refresh can never trigger a
    // refresh. It shares the cookie jar with the login and API clients.
    if (httpClientAdapter != null) _dio.httpClientAdapter = httpClientAdapter;
    _dio.interceptors.add(CookieManager(_jar));
    _state = _stateFromAuth();
    _auth.sessionNotifier.addListener(_onAuthChanged);
  }

  final QuantAuthService _auth;
  final CookieJar _jar;
  final Dio _dio;
  final Duration _logoutTimeout;
  final StreamController<SessionState> _changes = StreamController<SessionState>.broadcast();

  late SessionState _state;
  Future<bool>? _inflight;
  String? _endedMessage;

  @override
  SessionState get state => _state;

  @override
  Stream<SessionState> get changes => _changes.stream;

  @override
  String? get accessToken => _auth.currentSession?.accessToken;

  SessionState _stateFromAuth() {
    final QuantUserProfile? user = _auth.currentUser;
    if (_auth.isAuthenticated && user != null) {
      return SessionState.signedIn(SessionUser(id: user.id, email: user.email, displayName: user.name));
    }
    return SessionState.signedOut(endedMessage: _endedMessage);
  }

  void _onAuthChanged() {
    final SessionState next = _stateFromAuth();
    if (next.isSignedIn) _endedMessage = null;
    _state = next;
    if (!_changes.isClosed) _changes.add(next);
  }

  @override
  Future<bool> refreshAccessToken() {
    if (!_state.isSignedIn) return Future<bool>.value(false);
    return _inflight ??= _refreshOnce().whenComplete(() => _inflight = null);
  }

  Future<bool> _refreshOnce() async {
    try {
      final Response<dynamic> response = await _dio.post<dynamic>(
        '/auth/refresh',
        options: Options(extra: <String, dynamic>{kNoAuthExtra: true}),
      );
      final Object? body = response.data;
      final Object? data = body is Map && body['success'] == true ? body['data'] : null;
      final Object? token = data is Map ? data['accessToken'] : null;
      if (token is! String || token.isEmpty) {
        await _endSession(kSessionEndedMessage);
        return false;
      }
      final Object? expiresIn = (data as Map)['expiresIn'];
      await _auth.updateTokens(
        accessToken: token,
        expiresAt: expiresIn is num && expiresIn > 0
            ? DateTime.now().add(Duration(seconds: expiresIn.toInt()))
            : null,
      );
      return true;
    } on DioException catch (e) {
      if (e.response == null) {
        // Nothing came back (offline, timeout): not a rejection. Keep the
        // session so the user can retry; this never grants access.
        throw MailException.fromDio(e);
      }
      // Any answer other than 2xx means the server refused: fail closed.
      await _endSession(kSessionEndedMessage);
      return false;
    }
  }

  Future<void> _endSession(String message) async {
    _endedMessage = message;
    await _auth.logout();
    await _clearCookies();
  }

  Future<void> _clearCookies() async {
    try {
      await _jar.deleteAll();
    } catch (e) {
      debugPrint('[DioSessionRepository] Could not clear cookie jar: ${e.runtimeType}');
    }
  }

  @override
  Future<void> signOut({String? message}) async {
    _endedMessage = message;
    // Cookie must still be in the jar when the logout request is built.
    final Future<void> serverSide = _dio
        .post<dynamic>('/auth/logout', options: Options(extra: <String, dynamic>{kNoAuthExtra: true}))
        .timeout(_logoutTimeout)
        .then<void>((_) {}, onError: (Object _) {});
    await _auth.logout();
    await serverSide;
    await _clearCookies();
  }

  void dispose() {
    _auth.sessionNotifier.removeListener(_onAuthChanged);
    _changes.close();
    _dio.close(force: true);
  }
}

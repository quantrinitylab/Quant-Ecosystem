import 'package:dio/dio.dart';

import '../models/session_models.dart';
import '../repositories/repositories.dart';

/// Marks a request that must not carry a bearer token or trigger a refresh.
const String kNoAuthExtra = 'qm_no_auth';

/// Marks a request that was already retried after a refresh.
const String kRetriedExtra = 'qm_retried';

/// Attaches the bearer token and handles 401 exactly once per request:
/// refresh (shared by concurrent requests), then retry the request once.
/// If the refresh is rejected the session repository has already signed the
/// user out; if the retry is rejected too, the user is signed out here
/// (fail closed).
class SessionRefreshInterceptor extends Interceptor {
  SessionRefreshInterceptor({required this.session, required this.dio});

  final SessionRepository session;

  /// The client this interceptor is installed on (used to retry).
  final Dio dio;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (options.extra[kNoAuthExtra] != true) {
      final String? token = session.accessToken;
      if (token != null && token.isNotEmpty) {
        options.headers['Authorization'] = 'Bearer $token';
      }
    }
    handler.next(options);
  }

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final RequestOptions request = err.requestOptions;
    final bool eligible = err.response?.statusCode == 401 && request.extra[kNoAuthExtra] != true;
    if (!eligible || !session.state.isSignedIn) {
      handler.next(err);
      return;
    }

    // Second 401 for the same request: a fresh token was refused too.
    if (request.extra[kRetriedExtra] == true) {
      await session.signOut(message: kSessionEndedMessage);
      handler.next(err);
      return;
    }

    // Another request may have refreshed already while this one was in
    // flight; only refresh when the rejected token is still the current one.
    final String? current = session.accessToken;
    final bool staleToken = current != null && request.headers['Authorization'] != 'Bearer $current';
    if (!staleToken) {
      final bool refreshed;
      try {
        refreshed = await session.refreshAccessToken();
      } on Object catch (e) {
        // No answer from the server (offline): keep the session, report a
        // connectivity failure for this request.
        handler.reject(DioException.connectionError(requestOptions: request, reason: 'Session refresh unreachable', error: e));
        return;
      }
      if (!refreshed) {
        handler.next(err);
        return;
      }
    }

    try {
      final Response<dynamic> retried = await dio.fetch<dynamic>(
        request.copyWith(extra: <String, dynamic>{...request.extra, kRetriedExtra: true}),
      );
      handler.resolve(retried);
    } on DioException catch (e) {
      handler.next(e);
    }
  }
}

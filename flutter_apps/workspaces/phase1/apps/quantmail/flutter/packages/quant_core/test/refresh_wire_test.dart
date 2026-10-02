// ============================================================================
// quant_core - production refresh-path wire tests (S2)
// ============================================================================
//
// S2 RATIONALE (security audit): the production 401-refresh path had zero
// test coverage — the existing `oauth_refresh_test.dart` only exercises a
// canned `tokenRefresher` delegate. These tests drive the REAL production
// wiring end to end, with mock HTTP transports only (no real network):
//
//   apiClientProvider (QuantApiClient + RefreshInterceptor)
//     -> tokenRefresher delegate
//       -> refreshCoordinatorProvider.runSingleFlight(...)
//         -> authRepositoryProvider.refreshSession() — the REAL
//            AuthRepository over a REAL AuthApi with a mock Dio transport
//            (rotation-aware; invalid_grant clears tokens and throws
//            AuthSignedOutException)
//       -> the delegate re-reads the pair from TokenManager
//     -> the original request is retried with the fresh Bearer token
//
// The silent-refresh fire() branches are covered with a controllable fake
// [TimerFactory] (no waiting on the real 900 s TTL).
//
// Run: `flutter test test/refresh_wire_test.dart` from the package root.

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_foundation/quant_foundation.dart';

/// A single HTTP request observed by [RecordingAdapter].
class RecordedRequest {
  /// HTTP method, e.g. `GET`, `POST`.
  final String method;

  /// Request path, e.g. `/emails`, `/oauth/token`.
  final String path;

  /// Request headers as seen by the transport (Authorization redacted by no
  /// one here — tests assert the exact Bearer values).
  final Map<String, dynamic> headers;

  /// Decoded JSON body for requests with one; null otherwise.
  final Map<String, dynamic>? jsonBody;

  const RecordedRequest({
    required this.method,
    required this.path,
    required this.headers,
    this.jsonBody,
  });
}

/// Test-double [HttpClientAdapter]: records every request and answers from a
/// scripted responder. No real network is ever touched.
class RecordingAdapter implements HttpClientAdapter {
  /// Every request seen, in order.
  final List<RecordedRequest> requests = <RecordedRequest>[];

  /// Answers each recorded request. Set before the test drives traffic.
  Future<ResponseBody> Function(RecordedRequest request)? responder;

  /// Requests matching [test], in order.
  List<RecordedRequest> where(bool Function(RecordedRequest) test) =>
      requests.where(test).toList();

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    Map<String, dynamic>? body;
    if (requestStream != null) {
      final bytes = await requestStream.fold<List<int>>(
        <int>[],
        (acc, chunk) => acc..addAll(chunk),
      );
      if (bytes.isNotEmpty) {
        final decoded = jsonDecode(utf8.decode(bytes));
        if (decoded is Map<String, dynamic>) body = decoded;
      }
    }
    final recorded = RecordedRequest(
      method: options.method,
      path: options.uri.path,
      headers: Map<String, dynamic>.from(options.headers),
      jsonBody: body,
    );
    requests.add(recorded);
    final respond = responder;
    if (respond == null) {
      throw StateError('RecordingAdapter.responder not configured');
    }
    return respond(recorded);
  }

  @override
  void close({bool force = false}) {}
}

/// Builds a JSON [ResponseBody] with the given status code.
ResponseBody jsonResponse(Map<String, dynamic> json, int statusCode) =>
    ResponseBody.fromString(
      jsonEncode(json),
      statusCode,
      headers: const {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

/// Snake-case OAuth2 token response (the verified native contract).
Map<String, dynamic> tokenResponse({
  required String accessToken,
  required String refreshToken,
}) =>
    <String, dynamic>{
      'access_token': accessToken,
      'refresh_token': refreshToken,
      'token_type': 'Bearer',
      'expires_in': 900,
      'scope': '',
    };

/// Everything a wire test needs: the container, both mock transports, and
/// the preloaded token manager.
class WireHarness {
  final ProviderContainer container;
  final RecordingAdapter apiTransport;
  final RecordingAdapter authTransport;
  final TokenManager tokens;

  const WireHarness({
    required this.container,
    required this.apiTransport,
    required this.authTransport,
    required this.tokens,
  });

  QuantApiClient get client => container.read(apiClientProvider);
}

/// Builds a container wired exactly like production, except the two HTTP
/// transports are [RecordingAdapter] doubles:
///
/// - the API client's Dio answers from [apiResponder] (e.g. 401 then 200);
/// - the [AuthRepository]'s [AuthApi] (injected mock Dio) answers from
///   [authResponder] (the `/oauth/token` refresh endpoint).
///
/// The token manager is preloaded with the `old-access` / `old-refresh` pair.
Future<WireHarness> makeWireHarness({
  required Future<ResponseBody> Function(RecordedRequest) apiResponder,
  required Future<ResponseBody> Function(RecordedRequest) authResponder,
}) async {
  final tokens = TokenManager(storage: InMemoryTokenStorage());
  addTearDown(tokens.dispose);
  await tokens.setTokens('old-access', 'old-refresh');

  final apiTransport = RecordingAdapter()..responder = apiResponder;
  final authTransport = RecordingAdapter()..responder = authResponder;

  // The repository's AuthApi gets the mock transport — this is the exact
  // seam AuthApi documents (`dio` is an injectable bare-Dio override).
  final authDio = Dio(BaseOptions(baseUrl: 'https://test.invalid'))
    ..httpClientAdapter = authTransport;

  final repository = AuthRepository(
    authApi: AuthApi(baseUrl: 'https://test.invalid', dio: authDio),
    tokenManager: tokens,
    apiBaseUrl: 'https://test.invalid',
    webOrigin: 'https://web.test.invalid',
    oauthClientId: 'test-client',
  );

  final container = ProviderContainer(
    overrides: [
      appConfigProvider.overrideWithValue(
        const AppConfig(
          apiBaseUrl: 'https://test.invalid',
          oauthClientId: 'test-client',
          webOrigin: 'https://web.test.invalid',
        ),
      ),
      tokenManagerProvider.overrideWithValue(tokens),
      authRepositoryProvider.overrideWithValue(repository),
    ],
  );
  addTearDown(container.dispose);

  // Swap the production client's transport for the recording double after
  // construction (Dio supports replacing the adapter post-construction).
  container.read(apiClientProvider).dio.httpClientAdapter = apiTransport;

  return WireHarness(
    container: container,
    apiTransport: apiTransport,
    authTransport: authTransport,
    tokens: tokens,
  );
}

/// Drives the event queue so async stream deliveries and interceptor chains
/// settle. Broadcast-stream listener hops need several turns.
Future<void> pumpEventQueue({int turns = 10}) async {
  for (var i = 0; i < turns; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

void main() {
  group('production 401 refresh wire path', () {
    test(
        '401 triggers exactly one refresh POST and retries with the rotated '
        'bearer', () async {
      var emailCalls = 0;
      final harness = await makeWireHarness(
        apiResponder: (request) async {
          if (request.path == '/emails' && request.method == 'GET') {
            emailCalls++;
            // First attempt is unauthorized; the retried attempt succeeds.
            if (emailCalls == 1) {
              return jsonResponse(const {'error': 'unauthorized'}, 401);
            }
            return jsonResponse(const {'ok': true}, 200);
          }
          return jsonResponse(const {'error': 'not_found'}, 404);
        },
        authResponder: (request) async => jsonResponse(
          tokenResponse(
            accessToken: 'new-access',
            refreshToken: 'new-refresh',
          ),
          200,
        ),
      );

      final result = await harness.client.get('/emails');

      expect(result.success, isTrue);
      expect(result.data, const {'ok': true});

      // Exactly ONE refresh HTTP call, with the verified native wire shape,
      // presenting the OLD refresh token.
      final refreshCalls = harness.authTransport.where(
        (r) => r.method == 'POST' && r.path == '/oauth/token',
      );
      expect(refreshCalls, hasLength(1));
      expect(
        refreshCalls.single.jsonBody,
        const {
          'grant_type': 'refresh_token',
          'refresh_token': 'old-refresh',
        },
      );

      // Rotation: BOTH new tokens are stored; the presented (old) refresh
      // token is gone.
      expect(harness.tokens.getAccessToken(), 'new-access');
      expect(harness.tokens.getRefreshToken(), 'new-refresh');

      // Two API attempts: the first carried the stale bearer, the retried
      // one carries the FRESH bearer (never the stale one).
      final emailAttempts =
          harness.apiTransport.where((r) => r.path == '/emails');
      expect(emailAttempts, hasLength(2));
      expect(
        emailAttempts[0].headers['Authorization'],
        'Bearer old-access',
      );
      expect(
        emailAttempts[1].headers['Authorization'],
        'Bearer new-access',
      );
    });

    test('invalid_grant clears tokens and surfaces the failure (sign-out)',
        () async {
      final harness = await makeWireHarness(
        apiResponder: (request) async =>
            jsonResponse(const {'error': 'unauthorized'}, 401),
        authResponder: (request) async => jsonResponse(
          const {
            'error': 'invalid_grant',
            'error_description': 'token revoked',
          },
          400,
        ),
      );

      final result = await harness.client.get('/emails');

      // The caller sees the failure (the TS-style envelope never throws).
      expect(result.success, isFalse);

      // The repository cleared the tokens on invalid_grant (sign-out path).
      expect(harness.tokens.getAccessToken(), isNull);
      expect(harness.tokens.getRefreshToken(), isNull);
      expect(harness.tokens.isAuthenticated(), isFalse);

      // The refresh was attempted exactly once — no retry storm.
      final refreshCalls = harness.authTransport.where(
        (r) => r.method == 'POST' && r.path == '/oauth/token',
      );
      expect(refreshCalls, hasLength(1));

      // No retried API call after a dead session.
      final emailAttempts =
          harness.apiTransport.where((r) => r.path == '/emails');
      expect(emailAttempts, hasLength(1));
    });

    test('two concurrent 401s collapse into a single refresh HTTP call',
        () async {
      var emailCalls = 0;
      final harness = await makeWireHarness(
        apiResponder: (request) async {
          if (request.path == '/emails' && request.method == 'GET') {
            emailCalls++;
            // Both initial attempts 401; both retried attempts succeed.
            if (emailCalls <= 2) {
              return jsonResponse(const {'error': 'unauthorized'}, 401);
            }
            return jsonResponse(const {'ok': true}, 200);
          }
          return jsonResponse(const {'error': 'not_found'}, 404);
        },
        authResponder: (request) async => jsonResponse(
          tokenResponse(
            accessToken: 'new-access',
            refreshToken: 'new-refresh',
          ),
          200,
        ),
      );

      final results = await Future.wait([
        harness.client.get('/emails'),
        harness.client.get('/emails'),
      ]);

      expect(results, hasLength(2));
      for (final result in results) {
        expect(result.success, isTrue);
      }

      // Single-flight: exactly ONE POST /oauth/token for both 401s. (The
      // backend rotates refresh tokens compare-and-set — a second call
      // would present the revoked token and kill the whole family.)
      final refreshCalls = harness.authTransport.where(
        (r) => r.method == 'POST' && r.path == '/oauth/token',
      );
      expect(refreshCalls, hasLength(1));

      // Both retried attempts carry the fresh bearer.
      final emailAttempts =
          harness.apiTransport.where((r) => r.path == '/emails');
      expect(emailAttempts, hasLength(4));
      final retried = emailAttempts
          .where((r) => r.headers['Authorization'] == 'Bearer new-access')
          .toList();
      expect(retried, hasLength(2));
    });
  });

  group('silentRefreshProvider fire() branches (fake timers)', () {
    late TokenManager tokens;
    late _SilentFakeRepository repository;
    late _FakeTimerFactory timerFactory;

    ProviderContainer makeContainer() {
      return ProviderContainer(
        overrides: [
          appConfigProvider.overrideWithValue(
            const AppConfig(
              apiBaseUrl: 'https://test.invalid',
              oauthClientId: 'test-client',
              webOrigin: 'https://web.test.invalid',
              // 900 s TTL - 120 s leeway = 780 s arming delay (asserted below).
              refreshLeeway: Duration(seconds: 120),
            ),
          ),
          tokenManagerProvider.overrideWithValue(tokens),
          authRepositoryProvider.overrideWithValue(repository),
          silentRefreshTimerFactoryProvider
              .overrideWithValue(timerFactory.call),
        ],
      );
    }

    setUp(() {
      tokens = TokenManager(storage: InMemoryTokenStorage());
      addTearDown(tokens.dispose);
      repository = _SilentFakeRepository(tokens);
      timerFactory = _FakeTimerFactory();
    });

    /// Reads the provider, arms the scheduler via an authenticated emission,
    /// and returns the armed fake timer.
    Future<(_FakeTimer, ProviderContainer)> armScheduler() async {
      final container = makeContainer();
      addTearDown(container.dispose);
      container.read(silentRefreshProvider);

      await tokens.setTokens('access-1', 'refresh-1');
      await pumpEventQueue();

      expect(
        timerFactory.timers,
        hasLength(1),
        reason: 'authenticated emission arms the scheduler once',
      );
      expect(
        timerFactory.delays.single,
        const Duration(seconds: 780),
        reason: 'fires at expiresIn(900s) - leeway(120s)',
      );
      return (timerFactory.timers.single, container);
    }

    test('successful silent refresh re-arms the scheduler', () async {
      repository.refreshBehavior = () => tokens.setTokens(
            'access-2',
            'refresh-2',
          );
      final (timer, _) = await armScheduler();

      timer.fire(); // -> unawaited(fire()) -> refreshSession()
      await pumpEventQueue(turns: 20);

      expect(repository.refreshSessionCalls, 1);
      expect(tokens.getAccessToken(), 'access-2');
      expect(tokens.getRefreshToken(), 'refresh-2');
      // The rotated pair re-emitted `authenticated`, re-arming the scheduler
      // for the next cycle — the loop is self-sustaining.
      expect(
        timerFactory.timers,
        hasLength(2),
        reason: 'scheduler re-armed after the rotated pair was stored',
      );
    });

    test('AuthSignedOutException is swallowed and the scheduler is cancelled',
        () async {
      // Mirrors the real repository: clear first, then throw.
      repository.refreshBehavior = () async {
        await tokens.clearTokens();
        throw const AuthSignedOutException();
      };
      final (timer, _) = await armScheduler();

      timer.fire();
      await pumpEventQueue(turns: 20);

      // Swallowed: no crash, no unhandled error — the test completing is
      // the assertion.
      expect(repository.refreshSessionCalls, 1);
      expect(tokens.getAccessToken(), isNull);
      expect(tokens.isAuthenticated(), isFalse);
      // The unauthenticated emission cancelled the scheduler: no re-arm.
      expect(timerFactory.timers, hasLength(1));
    });

    test('transient failure is swallowed and the scheduler stays live',
        () async {
      repository.refreshBehavior = () => throw Exception('network down');
      final (timer, _) = await armScheduler();

      timer.fire();
      await pumpEventQueue(turns: 20);

      // Swallowed: the session survives a transient blip (no sign-out).
      expect(repository.refreshSessionCalls, 1);
      expect(tokens.getAccessToken(), 'access-1');
      expect(tokens.getRefreshToken(), 'refresh-1');
      expect(timerFactory.timers, hasLength(1));

      // The scheduler was not disposed/cancelled: the next token issuance
      // re-arms it for the next fire cycle (and the 401-reactive path
      // remains the backstop in between).
      await tokens.setTokens('access-3', 'refresh-3');
      await pumpEventQueue();
      expect(timerFactory.timers, hasLength(2));
    });
  });
}

/// Fake [Timer] controllable by tests: [fire] runs the scheduled callback.
class _FakeTimer implements Timer {
  void Function()? onFire;
  bool _active = true;
  int _tick = 0;

  @override
  void cancel() => _active = false;

  @override
  bool get isActive => _active;

  @override
  int get tick => _tick;

  /// Runs the scheduled callback once, if still active.
  void fire() {
    if (!_active) return;
    _active = false;
    _tick++;
    onFire?.call();
  }
}

/// Controllable [TimerFactory]: every scheduled timer is captured so tests
/// can fire it on demand and count re-arms.
class _FakeTimerFactory {
  final List<_FakeTimer> timers = <_FakeTimer>[];
  final List<Duration> delays = <Duration>[];

  Timer call(Duration duration, void Function() callback) {
    final timer = _FakeTimer()..onFire = callback;
    timers.add(timer);
    delays.add(duration);
    return timer;
  }
}

/// Scriptable [AuthRepository] double for the silent-refresh fire branches.
///
/// [refreshBehavior] runs inside [refreshSession] after the call is counted;
/// leave it null for a no-op success.
class _SilentFakeRepository extends AuthRepository {
  final TokenManager tokens;

  /// Number of [refreshSession] calls observed.
  int refreshSessionCalls = 0;

  /// Scripted refresh behavior (success / throw), run per call.
  Future<void> Function()? refreshBehavior;

  _SilentFakeRepository(this.tokens)
      : super(
          // Never hit: refreshSession is overridden. The bare Dio is only
          // constructed, never used.
          authApi: AuthApi(baseUrl: 'https://auth.test.invalid'),
          tokenManager: tokens,
          apiBaseUrl: 'https://api.test.invalid',
          webOrigin: 'https://web.test.invalid',
          oauthClientId: 'test-client',
        );

  @override
  Future<void> refreshSession() async {
    refreshSessionCalls++;
    final behavior = refreshBehavior;
    if (behavior != null) await behavior();
  }
}

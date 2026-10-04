// ============================================================================
// quant_core - search provider tests (Search slice: W1, quant_core lane)
//
// Tests for `search/search_providers.dart`:
//
// - [parsedSearchQueryProvider] parses synchronously (instant chips, zero
//   network — the Superhuman <50ms local bar).
// - [recentSearchesProvider]: most-recent-first, dedupe, 20-entry cap.
// - [mailSearchResultsProvider]: blank query -> immediate empty state with
//   NO repository call; non-blank -> 250ms debounce then search; rapid
//   retyping fires only the last query; `refreshNow()` bypasses the
//   debounce; backend failures become error state (never throw).
//
// The repository is faked by subclassing [SearchRepository] (overriding
// [SearchRepository.searchRaw]); the wrapped [SearchApi] is a never-called
// dummy so a bug that hits the real API fails loudly.
//
// Run: `flutter test test/search_providers_test.dart` from the package root.
// ============================================================================

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/src/mail/models/email.dart';
import 'package:quant_core/src/mail/models/pagination.dart';
import 'package:quant_core/src/mail/search/search_api.dart';
import 'package:quant_core/src/mail/search/search_providers.dart';
import 'package:quant_core/src/mail/search/search_query.dart';
import 'package:quant_core/src/mail/search/search_repository.dart';
import 'package:quant_foundation/quant_foundation.dart';

/// Minimal email for fake search results (Email.fromJson is forgiving).
Email _email(String id, [String? subject]) => Email.fromJson(
      <String, dynamic>{'id': id, 'subject': subject ?? 'Subject $id'},
    );

/// Fake [SearchRepository]: records calls and answers from a scripted
/// handler. The real [SearchApi] is never constructed meaningfully —
///
/// any accidental real-API call throws.
class _StubSearchRepository extends SearchRepository {
  _StubSearchRepository(this.handler) : super(SearchApi(_neverClient()));

  /// Every raw query string received, in order.
  final List<String> calls = <String>[];

  /// Answers each search. May return failures to test error state.
  final Future<ApiResult<PaginatedEmails>> Function(String query) handler;

  static QuantApiClient _neverClient() {
    final dio = Dio(BaseOptions(baseUrl: 'https://never.invalid'));
    final tokens = TokenManager(storage: InMemoryTokenStorage());
    return QuantApiClient(
      config: const QuantApiConfig(
        baseUrl: 'https://never.invalid',
        refreshEndpoint: '/oauth/token',
      ),
      tokenManager: tokens,
      dio: dio,
    );
  }

  @override
  Future<ApiResult<PaginatedEmails>> searchRaw(
    String queryText, {
    int page = 1,
    int pageSize = 25,
  }) {
    calls.add(queryText);
    return handler(queryText);
  }
}

ApiResult<PaginatedEmails> _okPage(List<String> ids) =>
    ApiResult<PaginatedEmails>.ok(
      PaginatedEmails(
        emails: [for (final id in ids) _email(id)],
        pageInfo: PageInfo(page: 1, pageSize: 25, total: ids.length),
      ),
    );

ProviderContainer _container(_StubSearchRepository stub) {
  final container = ProviderContainer(
    overrides: [searchRepositoryProvider.overrideWithValue(stub)],
  );
  addTearDown(container.dispose);
  return container;
}

/// Fake [SearchApi] that counts `searchMail` calls and answers from a
/// scripted handler. Used with the REAL [SearchRepository] so the
/// repository's own cache/dedupe logic is what gets tested.
class _CountingSearchApi extends SearchApi {
  _CountingSearchApi(this.handler)
      : super(_StubSearchRepository._neverClient());

  /// Every query received, in order.
  final List<String> calls = <String>[];

  /// Answers each search.
  final Future<ApiResult<PaginatedEmails>> Function(String query) handler;

  @override
  Future<ApiResult<PaginatedEmails>> searchMail(
    String query, {
    int page = 1,
    int pageSize = 25,
  }) {
    calls.add(query);
    return handler(query);
  }
}

void main() {
  group('parsedSearchQueryProvider', () {
    test('parses synchronously with zero network', () {
      final container = ProviderContainer(
        overrides: [
          searchQueryTextProvider.overrideWith((ref) => 'from:ada is:unread'),
        ],
      );
      addTearDown(container.dispose);
      final q = container.read(parsedSearchQueryProvider);
      expect(q.from, 'ada');
      expect(q.isUnread, isTrue);
      expect(q.hasOperators, isTrue);
    });

    test('blank text parses to an empty query', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);
      expect(container.read(parsedSearchQueryProvider).isEmpty, isTrue);
    });
  });

  group('recentSearchesProvider', () {
    test('most-recent-first with dedupe (re-record moves to front)', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);
      final notifier = container.read(recentSearchesProvider.notifier);
      notifier.record('invoice');
      notifier.record('from:ada');
      notifier.record('invoice');
      expect(
        container.read(recentSearchesProvider),
        ['invoice', 'from:ada'],
      );
    });

    test('caps at 20 entries, drops the oldest', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);
      final notifier = container.read(recentSearchesProvider.notifier);
      for (var i = 0; i < 25; i++) {
        notifier.record('q$i');
      }
      final recent = container.read(recentSearchesProvider);
      expect(recent, hasLength(20));
      expect(recent.first, 'q24');
      expect(recent.last, 'q5');
    });

    test('blank queries are ignored; clear() empties', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);
      final notifier = container.read(recentSearchesProvider.notifier);
      notifier.record('   ');
      notifier.record('x');
      expect(container.read(recentSearchesProvider), ['x']);
      notifier.clear();
      expect(container.read(recentSearchesProvider), isEmpty);
    });
  });

  group('mailSearchResultsProvider', () {
    test('blank query resolves to empty immediately, no repository call',
        () async {
      final stub = _StubSearchRepository((_) async => _okPage(['e1']));
      final container = _container(stub);
      final state = await container.read(mailSearchResultsProvider.future);
      expect(state.emails, isEmpty);
      expect(state.errorMessage, isNull);
      expect(stub.calls, isEmpty);
    });

    test('non-blank query searches after the 250ms debounce', () async {
      final stub =
          _StubSearchRepository((q) async => _okPage(['e1', 'e2']));
      final container = _container(stub);
      container.read(searchQueryTextProvider.notifier).state = 'invoice';
      final state = await container.read(mailSearchResultsProvider.future);
      expect(stub.calls, ['invoice']);
      expect(state.emails.map((e) => e.id), ['e1', 'e2']);
      expect(state.errorMessage, isNull);
      // Successful search is recorded in recent searches.
      expect(container.read(recentSearchesProvider), ['invoice']);
    });

    test('rapid retyping fires only the last query (debounce cancel)',
        () async {
      final stub = _StubSearchRepository((_) async => _okPage(['e9']));
      final container = _container(stub);
      container.read(searchQueryTextProvider.notifier).state = 'aaa';
      await Future<void>.delayed(const Duration(milliseconds: 50));
      container.read(searchQueryTextProvider.notifier).state = 'bbb';
      await container.read(mailSearchResultsProvider.future);
      expect(stub.calls, ['bbb']);
    });

    test('refreshNow() bypasses the debounce', () async {
      final stub = _StubSearchRepository((_) async => _okPage(['e1']));
      final container = _container(stub);
      container.read(searchQueryTextProvider.notifier).state = 'urgent';
      await container.read(mailSearchResultsProvider.notifier).refreshNow();
      expect(stub.calls, ['urgent']);
      final state = container.read(mailSearchResultsProvider);
      expect(state, isA<AsyncData<MailSearchState>>());
      expect(state.value!.emails.map((e) => e.id), ['e1']);
      // The cancelled debounce timer must not fire a second search.
      await Future<void>.delayed(const Duration(milliseconds: 350));
      expect(stub.calls, ['urgent']);
    });

    test('repository failure becomes error state, never a throw', () async {
      final stub = _StubSearchRepository(
        (_) async => ApiResult<PaginatedEmails>.failure(
          const ApiError(code: 'E', message: 'backend down', statusCode: 500),
        ),
      );
      final container = _container(stub);
      container.read(searchQueryTextProvider.notifier).state = 'x';
      final state = await container.read(mailSearchResultsProvider.future);
      expect(state.errorMessage, 'backend down');
      expect(state.emails, isEmpty);
    });
  });

  group('SearchRepository session cache (real repository, counting API)',
      () {
    test('blank SearchQuery short-circuits without network', () async {
      final api = _CountingSearchApi((_) async => _okPage(['e1']));
      final repo = SearchRepository(api);
      final result = await repo.search(const SearchQuery(raw: '   '));
      expect(result.success, isTrue);
      expect(result.data!.emails, isEmpty);
      expect(api.calls, isEmpty);
    });

    test('in-flight dedupe: concurrent identical searches share one future',
        () async {
      final api = _CountingSearchApi((_) async {
        await Future<void>.delayed(const Duration(milliseconds: 50));
        return _okPage(['e1']);
      });
      final repo = SearchRepository(api);
      final results = await Future.wait([
        repo.searchRaw('same'),
        repo.searchRaw('same'),
        repo.searchRaw('same'),
      ]);
      expect(api.calls, ['same']);
      expect(results, hasLength(3));
      for (final r in results) {
        expect(r.data!.emails.map((e) => e.id), ['e1']);
      }
    });

    test('LRU cache evicts the oldest query past 50 entries', () async {
      final api = _CountingSearchApi((q) async => _okPage([q]));
      final repo = SearchRepository(api);
      for (var i = 0; i < 55; i++) {
        await repo.searchRaw('q$i');
      }
      expect(repo.cacheSize, SearchRepository.maxCachedQueries);
      // q0 was evicted -> a new network call; q54 is cached -> no call.
      final before = api.calls.length;
      await repo.searchRaw('q0');
      expect(api.calls.length, before + 1);
      await repo.searchRaw('q54');
      expect(api.calls.length, before + 1);
    });

    test('failures are not cached: a retry hits the network again', () async {
      var attempts = 0;
      final api = _CountingSearchApi((_) async {
        attempts++;
        if (attempts == 1) {
          return ApiResult<PaginatedEmails>.failure(
            const ApiError(
                code: 'E', message: 'flaky', statusCode: 500),
          );
        }
        return _okPage(['e1']);
      });
      final repo = SearchRepository(api);
      final first = await repo.searchRaw('flaky');
      expect(first.success, isFalse);
      final second = await repo.searchRaw('flaky');
      expect(second.success, isTrue);
      expect(api.calls, ['flaky', 'flaky']);
    });
  });
}

// ============================================================================
// quant_app - SearchScreen widget tests (Search slice, W2 quant_app lane)
// ============================================================================
//
// The search screen consumes W1's (quant_core lane, names LOCKED) search
// contract:
//
//   searchQueryTextProvider   StateProvider<String>
//   parsedSearchQueryProvider Provider<SearchQuery> (W1's local parse)
//   mailSearchResultsProvider AsyncNotifierProvider<MailSearchNotifier,
//                             MailSearchState> — blank -> empty data,
//                             failures -> data with errorMessage
//   recentSearchesProvider    NotifierProvider<RecentSearchesNotifier,
//                             List<String>> — record()/clear()
//
// All four are overridden with deterministic fakes here, so no test ever
// touches the network. The real debounce/timer logic lives in W1's
// notifier and is their lane's unit-test responsibility.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:quant_app/src/router/app_router.dart';
import 'package:quant_app/src/screens/search_screen.dart';
import 'package:quant_app/src/widgets/search_filter_chips.dart';
import 'package:quant_app/src/widgets/sender_avatar.dart';
import 'package:quant_core/quant_core.dart';

import 'helpers/fake_auth_session.dart';

enum _Mode { data, loading, errorMessage, throws }

/// Deterministic [MailSearchNotifier]: serves scripted results without the
/// debounce timer or the repository, and records `refreshNow` calls
/// (pull-to-refresh / retry / submit paths).
class _FakeMailSearchNotifier extends MailSearchNotifier {
  _FakeMailSearchNotifier.data(this._emails)
      : _mode = _Mode.data,
        _message = null;

  _FakeMailSearchNotifier.loading()
      : _mode = _Mode.loading,
        _emails = const <Email>[],
        _message = null;

  _FakeMailSearchNotifier.errorMessage(this._message)
      : _mode = _Mode.errorMessage,
        _emails = const <Email>[];

  _FakeMailSearchNotifier.throws()
      : _mode = _Mode.throws,
        _emails = const <Email>[],
        _message = null;

  final _Mode _mode;
  final List<Email> _emails;
  final String? _message;

  /// True once [refreshNow] was called.
  bool refreshNowCalled = false;

  @override
  Future<MailSearchState> build() {
    switch (_mode) {
      case _Mode.data:
        return Future<MailSearchState>.value(
          MailSearchState(emails: _emails),
        );
      case _Mode.loading:
        return Completer<MailSearchState>().future;
      case _Mode.errorMessage:
        return Future<MailSearchState>.value(
          MailSearchState(errorMessage: _message),
        );
      case _Mode.throws:
        throw Exception('boom');
    }
  }

  @override
  Future<void> refreshNow() async {
    refreshNowCalled = true;
  }
}

Email _email({
  required String id,
  String? threadId,
  String subject = 'Subject',
  String snippet = 'Snippet',
  String name = 'Asha',
  String address = 'asha@example.com',
  bool isRead = false,
  bool hasAttachments = false,
  DateTime? date,
}) =>
    Email(
      id: id,
      threadId: threadId,
      subject: subject,
      snippet: snippet,
      from: EmailAddress(email: address, name: name),
      date: date ?? DateTime(2026, 10, 3, 10, 0),
      isRead: isRead,
      hasAttachments: hasAttachments,
    );

/// Pumps [SearchScreen] with the four W1 contract providers overridden.
/// Returns the container for provider assertions.
Future<ProviderContainer> _pumpSearch(
  WidgetTester tester, {
  String query = '',
  _FakeMailSearchNotifier? results,
  bool pinClock = true,
}) async {
  final ProviderContainer container = ProviderContainer(
    overrides: <Override>[
      searchQueryTextProvider.overrideWith((ref) => query),
      mailSearchResultsProvider.overrideWith(
        () => results ?? _FakeMailSearchNotifier.data(const <Email>[]),
      ),
      if (pinClock)
        clockProvider.overrideWithValue(
          FakeQuantClock(DateTime(2026, 10, 3, 12, 0)),
        ),
    ],
  );
  addTearDown(container.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: SearchScreen()),
    ),
  );
  // Frame 1: field paints. Frame 2: the fake's completed future paints.
  await tester.pump();
  await tester.pump();
  return container;
}

void main() {
  group('search token helpers', () {
    test('toggleQueryToken appends and removes', () {
      expect(toggleQueryToken('', 'is:unread'), 'is:unread');
      expect(toggleQueryToken('hello', 'is:unread'), 'hello is:unread');
      expect(
        toggleQueryToken('hello is:unread', 'is:unread'),
        'hello',
      );
    });

    test('removeQueryToken is boundary-aware', () {
      // Partial matches are left alone.
      expect(removeQueryToken('is:unreadx', 'is:unread'), 'is:unreadx');
      expect(removeQueryToken('xis:unread', 'is:unread'), 'xis:unread');
      // Quoted multi-word tokens remove as one unit.
      expect(
        removeQueryToken('from:"Ada Lovelace" hello', 'from:"Ada Lovelace"'),
        'hello',
      );
      // Case-insensitive, like W1's parse.
      expect(removeQueryToken('IS:UNREAD hello', 'is:unread'), 'hello');
      // Absent token: no-op.
      expect(removeQueryToken('hello', 'is:unread'), 'hello');
    });

    test('queryHasToken matches whole tokens only', () {
      expect(queryHasToken('a is:unread b', 'is:unread'), isTrue);
      expect(queryHasToken('a is:unreadx', 'is:unread'), isFalse);
      expect(queryHasToken('', 'is:unread'), isFalse);
    });
  });

  group('SearchScreen', () {
    testWidgets('renders an autofocused search field with a hint',
        (WidgetTester tester) async {
      await _pumpSearch(tester);

      final TextField field =
          tester.widget<TextField>(find.byType(TextField));
      expect(field.autofocus, isTrue);
      expect(
        (field.decoration as InputDecoration).hintText,
        'Search mail',
      );
    });

    testWidgets('blank query shows a hint when there are no recents',
        (WidgetTester tester) async {
      await _pumpSearch(tester);

      expect(find.textContaining('Search across all your mail'), findsOneWidget);
    });

    testWidgets('blank query lists recent searches with a working Clear',
        (WidgetTester tester) async {
      final ProviderContainer container = await _pumpSearch(tester);
      container.read(recentSearchesProvider.notifier).record('quarterly');
      container.read(recentSearchesProvider.notifier).record('from:asha');
      await tester.pump();

      expect(find.text('Recent searches'), findsOneWidget);
      expect(find.text('from:asha'), findsOneWidget);
      expect(find.text('quarterly'), findsOneWidget);

      await tester.tap(find.text('Clear'));
      await tester.pump();

      expect(
        container.read(recentSearchesProvider),
        isEmpty,
      );
      expect(find.textContaining('Search across all your mail'), findsOneWidget);
    });

    testWidgets('tapping a recent search fills the query',
        (WidgetTester tester) async {
      final ProviderContainer container = await _pumpSearch(tester);
      container.read(recentSearchesProvider.notifier).record('old query');
      await tester.pump();

      await tester.tap(find.text('old query'));
      await tester.pump();

      expect(container.read(searchQueryTextProvider), 'old query');
    });

    testWidgets('typing updates the query text provider',
        (WidgetTester tester) async {
      final ProviderContainer container = await _pumpSearch(tester);

      await tester.enterText(find.byType(TextField), 'hello');
      await tester.pump();

      expect(container.read(searchQueryTextProvider), 'hello');
    });

    testWidgets('clear button empties the query', (WidgetTester tester) async {
      final ProviderContainer container =
          await _pumpSearch(tester, query: 'hello');

      await tester.tap(find.byTooltip('Clear search'));
      await tester.pump();

      expect(container.read(searchQueryTextProvider), '');
    });

    testWidgets('operator chips render from the parsed query',
        (WidgetTester tester) async {
      await _pumpSearch(tester, query: 'from:asha is:unread hello');

      // One chip per structured operator; the free-text term gets none.
      expect(find.text('from:asha'), findsOneWidget);
      expect(find.text('is:unread'), findsOneWidget);
      expect(find.byType(InputChip), findsNWidgets(2));
    });

    testWidgets('deleting an operator chip removes it from the query text',
        (WidgetTester tester) async {
      final ProviderContainer container =
          await _pumpSearch(tester, query: 'from:asha is:unread hello');

      // InputChip's default delete glyph is Icons.clear in this SDK
      // (verified against the rendered tree); scope to the chips so the
      // field's own clear button is excluded.
      final Finder chipDeletes = find.descendant(
        of: find.byType(InputChip),
        matching: find.byIcon(Icons.clear),
      );
      expect(chipDeletes, findsNWidgets(2));
      await tester.tap(chipDeletes.first);
      await tester.pump();

      // Real text manipulation on the single source of truth.
      expect(container.read(searchQueryTextProvider), 'is:unread hello');
      expect(find.text('from:asha'), findsNothing);
      expect(find.text('is:unread'), findsOneWidget);
    });

    testWidgets('Unread filter chip toggles is:unread in the query text',
        (WidgetTester tester) async {
      final ProviderContainer container =
          await _pumpSearch(tester, query: 'hello');

      await tester.tap(find.text('Unread'));
      await tester.pump();
      expect(container.read(searchQueryTextProvider), 'hello is:unread');

      await tester.tap(find.text('Unread'));
      await tester.pump();
      expect(container.read(searchQueryTextProvider), 'hello');
    });

    testWidgets('Has attachments chip toggles has:attachment',
        (WidgetTester tester) async {
      final ProviderContainer container =
          await _pumpSearch(tester, query: 'hello');

      await tester.tap(find.text('Has attachments'));
      await tester.pump();
      expect(
        container.read(searchQueryTextProvider),
        'hello has:attachment',
      );

      await tester.tap(find.text('Has attachments'));
      await tester.pump();
      expect(container.read(searchQueryTextProvider), 'hello');
    });

    testWidgets('filter chips reflect hand-typed operators',
        (WidgetTester tester) async {
      await _pumpSearch(tester, query: 'is:unread');

      final FilterChip unread =
          tester.widget<FilterChip>(find.widgetWithText(FilterChip, 'Unread'));
      expect(unread.selected, isTrue);
    });

    testWidgets('results render rows with sender, subject, relative date',
        (WidgetTester tester) async {
      await _pumpSearch(
        tester,
        query: 'quarterly',
        results: _FakeMailSearchNotifier.data(<Email>[
          _email(id: 'm-1', threadId: 't-1', subject: 'Quarterly planning'),
          _email(
            id: 'm-2',
            subject: 'Lunch?',
            snippet: 'Tomorrow at noon',
            name: 'Ravi',
            address: 'ravi@example.com',
            isRead: true,
            date: DateTime(2026, 10, 3, 9, 30),
          ),
        ]),
      );

      expect(find.text('Asha'), findsOneWidget);
      expect(find.text('Quarterly planning'), findsOneWidget);
      expect(find.text('Ravi'), findsOneWidget);
      // 12:00 fake clock: 10:00 -> '2h', 09:30 -> '2h'.
      expect(find.text('2h'), findsNWidgets(2));
    });

    testWidgets('rows render SenderAvatar seeded by sender email (VQA-P2-23)',
        (WidgetTester tester) async {
      await _pumpSearch(
        tester,
        query: 'quarterly',
        results: _FakeMailSearchNotifier.data(<Email>[
          _email(id: 'm-1', threadId: 't-1', subject: 'Quarterly planning'),
          _email(
            id: 'm-2',
            subject: 'Lunch?',
            snippet: 'Tomorrow at noon',
            name: 'Ravi',
            address: 'ravi@example.com',
            isRead: true,
            date: DateTime(2026, 10, 3, 9, 30),
          ),
        ]),
      );

      // VQA-P2-23: the uniform-orange CircleAvatar wall is gone — each row
      // uses the shared SenderAvatar authority, seeded by the sender's
      // email so hues vary per sender.
      expect(
        find.byWidgetPredicate(
          (Widget w) => w is SenderAvatar && w.seed == 'asha@example.com',
        ),
        findsOneWidget,
      );
      expect(
        find.byWidgetPredicate(
          (Widget w) => w is SenderAvatar && w.seed == 'ravi@example.com',
        ),
        findsOneWidget,
      );
      expect(find.byType(SenderAvatar), findsNWidgets(2));
    });

    testWidgets('loading shows a spinner', (WidgetTester tester) async {
      await _pumpSearch(
        tester,
        query: 'quarterly',
        results: _FakeMailSearchNotifier.loading(),
      );

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('error state shows the message and Retry calls refreshNow',
        (WidgetTester tester) async {
      final _FakeMailSearchNotifier fake =
          _FakeMailSearchNotifier.errorMessage('Backend exploded');
      await _pumpSearch(tester, query: 'quarterly', results: fake);

      expect(find.text('Backend exploded'), findsOneWidget);
      await tester.tap(find.text('Retry'));
      await tester.pump();

      expect(fake.refreshNowCalled, isTrue);
    });

    testWidgets('unexpected AsyncError shows the generic error state',
        (WidgetTester tester) async {
      await _pumpSearch(
        tester,
        query: 'quarterly',
        results: _FakeMailSearchNotifier.throws(),
      );

      expect(find.text('Something went wrong'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });

    testWidgets('empty results name the query and offer to clear it',
        (WidgetTester tester) async {
      final ProviderContainer container = await _pumpSearch(
        tester,
        query: 'zzz-no-match',
        results: _FakeMailSearchNotifier.data(const <Email>[]),
      );

      expect(find.text("No results for 'zzz-no-match'"), findsOneWidget);

      await tester.tap(find.text('Clear search'));
      await tester.pump();

      expect(container.read(searchQueryTextProvider), '');
    });

    testWidgets('pull-to-refresh calls refreshNow', (WidgetTester tester) async {
      final _FakeMailSearchNotifier fake = _FakeMailSearchNotifier.data(
        <Email>[_email(id: 'm-1', threadId: 't-1')],
      );
      await _pumpSearch(tester, query: 'quarterly', results: fake);

      await tester.fling(
        find.byType(ListView),
        const Offset(0, 300),
        1000,
      );
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));

      expect(fake.refreshNowCalled, isTrue);
    });

    testWidgets('submit records the recent search and searches immediately',
        (WidgetTester tester) async {
      final _FakeMailSearchNotifier fake =
          _FakeMailSearchNotifier.data(const <Email>[]);
      final ProviderContainer container =
          await _pumpSearch(tester, results: fake);

      await tester.enterText(find.byType(TextField), 'quarterly');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.pump();

      expect(
        container.read(recentSearchesProvider),
        contains('quarterly'),
      );
      expect(fake.refreshNowCalled, isTrue);
    });

    testWidgets('row tap without a threadId shows an honest snackbar',
        (WidgetTester tester) async {
      await _pumpSearch(
        tester,
        query: 'quarterly',
        results: _FakeMailSearchNotifier.data(
          <Email>[
            _email(
              id: 'm-1',
              threadId: null,
              subject: 'Quarterly planning',
            )
          ],
        ),
      );
      // Let the staggered entrance finish: rows start at opacity 0.
      await tester.pump(const Duration(milliseconds: 500));

      await tester.tap(find.text('Quarterly planning'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      expect(find.text('Is message ka thread nahi mila — dobara try karo.'), findsOneWidget);
    });
  });

  group('search row navigation', () {
    testWidgets('row tap with a threadId pushes the named thread route',
        (WidgetTester tester) async {
      final ProviderContainer container = ProviderContainer(
        overrides: <Override>[
          searchQueryTextProvider.overrideWith((ref) => 'quarterly'),
          mailSearchResultsProvider.overrideWith(
            () => _FakeMailSearchNotifier.data(
              <Email>[
                _email(
                  id: 'm-1',
                  threadId: 't-1',
                  subject: 'Quarterly planning',
                )
              ],
            ),
          ),
          clockProvider.overrideWithValue(
            FakeQuantClock(DateTime(2026, 10, 3, 12, 0)),
          ),
        ],
      );
      addTearDown(container.dispose);
      final GoRouter router = GoRouter(
        initialLocation: '/',
        routes: <RouteBase>[
          GoRoute(
            path: '/',
            builder: (BuildContext context, GoRouterState state) =>
                const SearchScreen(),
          ),
          GoRoute(
            path: '/thread/:threadId',
            name: 'thread',
            builder: (BuildContext context, GoRouterState state) => Scaffold(
              body: Text('thread ${state.pathParameters['threadId']}'),
            ),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp.router(routerConfig: router),
        ),
      );
      await tester.pump();
      await tester.pump();
      // Let the staggered entrance finish: rows start at opacity 0.
      await tester.pump(const Duration(milliseconds: 500));

      await tester.tap(find.text('Quarterly planning'));
      await tester.pump();
      await tester.pump();

      expect(find.text('thread t-1'), findsOneWidget);
    });
  });

  group('search route', () {
    Future<({ProviderContainer container, GoRouter router})> pumpRouter(
      WidgetTester tester,
      AuthSessionState session,
    ) async {
      final ProviderContainer container = ProviderContainer(
        overrides: <Override>[
          authSessionProvider.overrideWith(
            () => FakeAuthSessionNotifier(session),
          ),
          mailSearchResultsProvider.overrideWith(
            () => _FakeMailSearchNotifier.data(const <Email>[]),
          ),
        ],
      );
      addTearDown(container.dispose);
      final GoRouter router = container.read(appRouterProvider);
      addTearDown(router.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp.router(routerConfig: router),
        ),
      );
      await tester.pump();
      return (container: container, router: router);
    }

    testWidgets("'/search' renders SearchScreen when authenticated",
        (WidgetTester tester) async {
      final (:router, :container) =
          await pumpRouter(tester, const AuthAuthenticated());
      addTearDown(container.dispose);

      router.go('/search');
      await tester.pump();
      await tester.pump();

      expect(find.byType(SearchScreen), findsOneWidget);
      expect(find.byType(TextField), findsOneWidget);
    });

    testWidgets("'/search' bounces to /login when signed out",
        (WidgetTester tester) async {
      final (:router, :container) =
          await pumpRouter(tester, const AuthInitial());
      addTearDown(container.dispose);

      router.go('/search');
      await tester.pump();
      await tester.pump();

      expect(
        router.routerDelegate.currentConfiguration.uri.toString(),
        '/login',
      );
      expect(find.byType(SearchScreen), findsNothing);
    });
  });
}

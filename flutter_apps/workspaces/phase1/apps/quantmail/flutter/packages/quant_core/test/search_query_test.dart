// ============================================================================
// quant_core - SearchQuery parser tests (Search slice: W1, quant_core lane)
//
// Pure unit tests for the deterministic local operator parser. No I/O, no
// mocks — the parser must be allocation-light and instant (chips render on
// the first keystroke).
//
// Run: `flutter test test/search_query_test.dart` from the package root.
// ============================================================================

import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/src/mail/search/search_query.dart';

void main() {
  group('SearchQuery.parse', () {
    test('empty and whitespace-only raw text parses to an empty query', () {
      for (final raw in ['', '   ', '\t\n ']) {
        final q = SearchQuery.parse(raw);
        expect(q.isEmpty, isTrue, reason: 'raw: "$raw"');
        expect(q.hasOperators, isFalse);
        expect(q.terms, isEmpty);
        expect(q.labels, isEmpty);
      }
    });

    test('bare words become free-text terms, no operators', () {
      final q = SearchQuery.parse('invoice march 2026');
      expect(q.isEmpty, isFalse);
      expect(q.hasOperators, isFalse);
      expect(q.terms, ['invoice', 'march', '2026']);
    });

    test('parses the full Gmail operator set', () {
      final q = SearchQuery.parse(
        'from:ada@example.com to:bob@example.com subject:hello '
        'has:attachment is:unread label:work after:2026-10-01 '
        'before:2026/10/03 report',
      );
      expect(q.from, 'ada@example.com');
      expect(q.to, 'bob@example.com');
      expect(q.subject, 'hello');
      expect(q.hasAttachment, isTrue);
      expect(q.isUnread, isTrue);
      expect(q.labels, ['work']);
      expect(q.after, DateTime.utc(2026, 10, 1));
      expect(q.before, DateTime.utc(2026, 10, 3));
      expect(q.terms, ['report']);
      expect(q.hasOperators, isTrue);
    });

    test('handles quoted operator values with spaces', () {
      final q = SearchQuery.parse('from:"Ada Lovelace" subject:"Q3 results"');
      expect(q.from, 'Ada Lovelace');
      expect(q.subject, 'Q3 results');
      expect(q.terms, isEmpty);
    });

    test('handles quoted bare phrases as single terms', () {
      final q = SearchQuery.parse('"quarterly report" from:ada');
      expect(q.terms, ['quarterly report']);
      expect(q.from, 'ada');
    });

    test('is:read maps to isUnread=false', () {
      expect(SearchQuery.parse('is:read').isUnread, isFalse);
    });

    test('unknown is:/has: values are kept as literal terms', () {
      final q = SearchQuery.parse('is:muted has:drive notes');
      expect(q.isUnread, isNull);
      expect(q.hasAttachment, isNull);
      expect(q.terms, ['is:muted', 'has:drive', 'notes']);
    });

    test('unknown operators are kept as literal terms', () {
      final q = SearchQuery.parse('lang:en older_than:2d hello');
      expect(q.terms, ['lang:en', 'older_than:2d', 'hello']);
      expect(q.hasOperators, isFalse);
    });

    test('unparseable after:/before: dates are kept as literal terms', () {
      final q = SearchQuery.parse('after:yesterday before:2026-13-99 x');
      expect(q.after, isNull);
      expect(q.before, isNull);
      expect(q.terms, ['after:yesterday', 'before:2026-13-99', 'x']);
    });

    test('operator keys are case-insensitive, last one wins', () {
      final q = SearchQuery.parse('FROM:ada From:bob');
      expect(q.from, 'bob');
    });

    test('multiple label: values accumulate in order', () {
      final q = SearchQuery.parse('label:work label:urgent');
      expect(q.labels, ['work', 'urgent']);
    });

    test('raw text is preserved verbatim (untrimmed)', () {
      const raw = '  from:ada  hello  ';
      expect(SearchQuery.parse(raw).raw, raw);
    });
  });

  group('SearchQuery value semantics', () {
    test('equal parses are == with equal hashCodes', () {
      final a = SearchQuery.parse('from:ada is:unread report');
      final b = SearchQuery.parse('from:ada is:unread report');
      expect(a, equals(b));
      expect(a.hashCode, equals(b.hashCode));
    });

    test('different parses are not ==', () {
      expect(
        SearchQuery.parse('from:ada'),
        isNot(equals(SearchQuery.parse('from:bob'))),
      );
      expect(
        SearchQuery.parse('hello'),
        isNot(equals(SearchQuery.parse('hello world'))),
      );
    });

    test('toString mentions raw and parsed operators', () {
      final s = SearchQuery.parse('from:ada x').toString();
      expect(s, contains('from:ada'));
      expect(s, contains('terms'));
    });
  });
}

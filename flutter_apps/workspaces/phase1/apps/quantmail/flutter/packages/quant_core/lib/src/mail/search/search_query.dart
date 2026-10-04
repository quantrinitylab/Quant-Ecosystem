// ============================================================================
// quant_core - search query value object (Search slice: W1, quant_core lane)
// ============================================================================
//
// Immutable [SearchQuery]: the RAW user-typed text plus a deterministic,
// fully LOCAL parse into Gmail-style operators. Local parse is the
// always-available truth — it runs synchronously with ZERO network, so UI
// chips appear on the first keystroke (<50ms, the Superhuman bar). The
// backend `GET /search/parse` (see `SearchApi.parseQuery`) can later
// enrich/validate this, but never replaces it offline.
//
// Supported operators (Gmail wire vocabulary):
//   from:, to:, subject:, label:
//   has:attachment / has:attachments
//   is:unread / is:read
//   after:YYYY-MM-DD (or YYYY/MM/DD), before:YYYY-MM-DD (or YYYY/MM/DD)
// Quoted values (`from:"Ada Lovelace"`) and quoted bare phrases are
// handled. Unknown `op:value` tokens are kept as literal free-text terms —
// Gmail treats them as literal text too, so search fidelity is preserved.

/// Immutable search query: raw text + local operator parse.
class SearchQuery {
  /// Creates a query from already-parsed parts (usually via [SearchQuery.parse]).
  const SearchQuery({
    required this.raw,
    this.from,
    this.to,
    this.subject,
    this.hasAttachment,
    this.isUnread,
    this.after,
    this.before,
    this.labels = const <String>[],
    this.terms = const <String>[],
  });

  /// Parses [raw] deterministically: regex tokenization, quoted values,
  /// operator extraction. Pure, synchronous, allocation-light.
  factory SearchQuery.parse(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) {
      return const SearchQuery(raw: '');
    }

    String? from;
    String? to;
    String? subject;
    bool? hasAttachment;
    bool? isUnread;
    DateTime? after;
    DateTime? before;
    final labels = <String>[];
    final terms = <String>[];

    // Tokenizer: operator-with-quoted-value, operator-with-bare-value,
    // quoted bare phrase, or a single non-whitespace word.
    final tokenRe = RegExp(
      r'''(?:[^\s"]+:"[^"]*")|(?:[^\s"]+:[^\s"]+)|(?:"[^"]*")|(?:\S+)''',
    );
    final opRe = RegExp(r'^([A-Za-z]+):(.*)$');

    for (final match in tokenRe.allMatches(trimmed)) {
      final token = match.group(0)!;
      final opMatch = opRe.firstMatch(token);
      if (opMatch == null) {
        terms.add(_unquote(token));
        continue;
      }
      final key = opMatch.group(1)!.toLowerCase();
      final value = _unquote(opMatch.group(2)!);
      switch (key) {
        case 'from':
          from = value;
        case 'to':
          to = value;
        case 'subject':
          subject = value;
        case 'label':
          if (value.isNotEmpty) labels.add(value);
        case 'has':
          if (value == 'attachment' || value == 'attachments') {
            hasAttachment = true;
          } else {
            terms.add(token); // unknown has: value -> literal text
          }
        case 'is':
          if (value == 'unread') {
            isUnread = true;
          } else if (value == 'read') {
            isUnread = false;
          } else {
            terms.add(token); // unknown is: value -> literal text
          }
        case 'after':
          final parsed = _parseDate(value);
          if (parsed != null) {
            after = parsed;
          } else {
            terms.add(token); // unparseable date -> literal text
          }
        case 'before':
          final parsed = _parseDate(value);
          if (parsed != null) {
            before = parsed;
          } else {
            terms.add(token); // unparseable date -> literal text
          }
        default:
          terms.add(token); // unknown operator -> literal text
      }
    }

    return SearchQuery(
      raw: raw,
      from: from,
      to: to,
      subject: subject,
      hasAttachment: hasAttachment,
      isUnread: isUnread,
      after: after,
      before: before,
      labels: List.unmodifiable(labels),
      terms: List.unmodifiable(terms),
    );
  }

  /// The exact text the user typed (preserved, untrimmed).
  final String raw;

  /// `from:` operator value, if present.
  final String? from;

  /// `to:` operator value, if present.
  final String? to;

  /// `subject:` operator value, if present.
  final String? subject;

  /// `has:attachment(s)` — null when the operator is absent.
  final bool? hasAttachment;

  /// `is:unread` (true) / `is:read` (false) — null when absent.
  final bool? isUnread;

  /// `after:` date filter (inclusive day), null when absent.
  final DateTime? after;

  /// `before:` date filter (exclusive day), null when absent.
  final DateTime? before;

  /// All `label:` values, in occurrence order.
  final List<String> labels;

  /// Remaining free-text terms (bare words + quoted phrases + unknown
  /// operators kept literal).
  final List<String> terms;

  /// True when the trimmed raw text is empty — nothing to search.
  bool get isEmpty => raw.trim().isEmpty;

  /// True when at least one structured operator was parsed.
  bool get hasOperators =>
      from != null ||
      to != null ||
      subject != null ||
      hasAttachment != null ||
      isUnread != null ||
      after != null ||
      before != null ||
      labels.isNotEmpty;

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is SearchQuery &&
        other.raw == raw &&
        other.from == from &&
        other.to == to &&
        other.subject == subject &&
        other.hasAttachment == hasAttachment &&
        other.isUnread == isUnread &&
        other.after == after &&
        other.before == before &&
        _listEq(other.labels, labels) &&
        _listEq(other.terms, terms);
  }

  @override
  int get hashCode => Object.hash(
        raw,
        from,
        to,
        subject,
        hasAttachment,
        isUnread,
        after,
        before,
        Object.hashAll(labels),
        Object.hashAll(terms),
      );

  @override
  String toString() =>
      'SearchQuery(raw: $raw, from: $from, to: $to, subject: $subject, '
      'hasAttachment: $hasAttachment, isUnread: $isUnread, '
      'after: $after, before: $before, labels: $labels, terms: $terms)';

  static bool _listEq(List<String> a, List<String> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }

  static String _unquote(String s) {
    if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
      return s.substring(1, s.length - 1);
    }
    return s;
  }

  /// Parses `YYYY-MM-DD` or `YYYY/MM/DD` (Gmail's documented date forms),
  /// strictly: Dart's `DateTime.parse` normalizes overflow (month 13 rolls
  /// into the next year) instead of throwing, so components are range-
  /// checked AND round-trip verified (`2026-02-30` is rejected). Returns
  /// null for anything else — the caller keeps the token literal.
  static DateTime? _parseDate(String value) {
    final match = RegExp(r'^(\d{4})[-/](\d{2})[-/](\d{2})$')
        .firstMatch(value.trim());
    if (match == null) return null;
    final year = int.parse(match.group(1)!);
    final month = int.parse(match.group(2)!);
    final day = int.parse(match.group(3)!);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    final dt = DateTime.utc(year, month, day);
    if (dt.year != year || dt.month != month || dt.day != day) return null;
    return dt;
  }
}

// ============================================================================
// quant_app - search filter chips (Search slice, W2 quant_app lane)
// ============================================================================
//
// Quick-toggle chips for the search screen: `Unread` and `Has attachments`.
// Toggles do REAL text manipulation on [searchQueryTextProvider] —
// appending/removing the `is:unread` / `has:attachment` tokens — so the
// operator chips row, the parsed query, and the debounced server search all
// stay in sync through the single source of truth (the query text).
//
// The token helpers below ([queryHasToken], [removeQueryToken],
// [toggleQueryToken]) are shared with `search_screen.dart` for operator-chip
// removal. They are boundary-aware and case-insensitive, matching W1's
// tokenizer behaviour (quoted values like `from:"Ada Lovelace"` are treated
// as one token).

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quant_core/quant_core.dart';

/// Returns true when [token] appears in [raw] as a standalone token
/// (start/end/whitespace boundaries), case-insensitively.
bool queryHasToken(String raw, String token) {
  return RegExp(
    '(?:^|\\s)${RegExp.escape(token)}(?=\\s|\$)',
    caseSensitive: false,
  ).hasMatch(raw);
}

/// Removes ONE occurrence of [token] from [raw] (standalone-token match,
/// case-insensitive), collapsing leftover whitespace. Returns [raw]
/// unchanged when the token is absent.
String removeQueryToken(String raw, String token) {
  final RegExp pattern = RegExp(
    '(?:^|\\s)${RegExp.escape(token)}(?=\\s|\$)',
    caseSensitive: false,
  );
  final String removed = raw.replaceFirst(pattern, '');
  return removed.replaceAll(RegExp(r'\s+'), ' ').trim();
}

/// Appends [token] to [raw] when absent, removes it when present.
String toggleQueryToken(String raw, String token) {
  if (queryHasToken(raw, token)) return removeQueryToken(raw, token);
  final String trimmed = raw.trimRight();
  return trimmed.isEmpty ? token : '$trimmed $token';
}

/// Quick filter chips for the search screen.
///
/// - `Unread` <-> the `is:unread` operator (enabling it also drops a stale
///   `is:read`, so the two never fight — last-writer-wins is avoided).
/// - `Has attachments` <-> the `has:attachment` operator.
///
/// Selected state is derived from W1's [parsedSearchQueryProvider] (the
/// local synchronous parse), so chips reflect hand-typed operators too.
class SearchFilterChips extends ConsumerWidget {
  /// Creates the filter chips row.
  const SearchFilterChips({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final SearchQuery parsed = ref.watch(parsedSearchQueryProvider);
    final bool unreadOnly = parsed.isUnread == true;
    final bool withAttachments = parsed.hasAttachment == true;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: <Widget>[
          FilterChip(
            label: const Text('Unread'),
            selected: unreadOnly,
            onSelected: (_) => _toggle(ref, 'is:unread'),
            tooltip: 'Show only unread mail',
          ),
          FilterChip(
            label: const Text('Has attachments'),
            selected: withAttachments,
            onSelected: (_) => _toggle(ref, 'has:attachment'),
            tooltip: 'Show only mail with attachments',
          ),
        ],
      ),
    );
  }

  void _toggle(WidgetRef ref, String token) {
    HapticFeedback.lightImpact();
    var current = ref.read(searchQueryTextProvider);
    // `is:unread` and `is:read` are mutually exclusive: enabling one drops
    // the other so the query never carries both.
    if (token == 'is:unread' && !queryHasToken(current, token)) {
      current = removeQueryToken(current, 'is:read');
    }
    ref.read(searchQueryTextProvider.notifier).state =
        toggleQueryToken(current, token);
  }
}

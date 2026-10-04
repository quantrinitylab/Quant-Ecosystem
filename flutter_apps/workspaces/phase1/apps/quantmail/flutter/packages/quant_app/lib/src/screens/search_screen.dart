// ============================================================================
// quant_app - search screen (Search slice, W2 quant_app lane)
// ============================================================================
//
// Full-text mail search: autofocus field, operator chips (from W1's
// synchronous local [parsedSearchQueryProvider] — instant, <50ms, zero
// network), quick filter chips ([SearchFilterChips]), recent searches on a
// blank query, and debounced server results from
// [mailSearchResultsProvider] with a staggered entrance.
//
// Contract notes (W1, quant_core lane — names locked, consumed as-is):
//   searchQueryTextProvider   StateProvider<String> — the single source of
//                             truth; every chip/filter edit is real text
//                             manipulation on this.
//   parsedSearchQueryProvider Provider<SearchQuery> — W1's local parse
//                             (from/to/subject/label/has:/is:/after:/before:,
//                             terms). Operator chips are derived from it.
//   mailSearchResultsProvider AsyncNotifierProvider<MailSearchNotifier,
//                             MailSearchState> — debounced server search;
//                             blank query -> empty state; failures arrive as
//                             data with [MailSearchState.errorMessage].
//                             Pull-to-refresh / retry call
//                             `notifier.refreshNow()` (debounce bypass).
//   recentSearchesProvider    NotifierProvider<RecentSearchesNotifier,
//                             List<String>> — most-recent-first; `record()`
//                             on submit (W1 also records on success),
//                             `clear()` from the recents header.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:quant_core/quant_core.dart';

import '../widgets/search_filter_chips.dart';
import '../widgets/sender_avatar.dart';

/// Mail search screen: `/search` route.
class SearchScreen extends ConsumerStatefulWidget {
  /// Creates the search screen.
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  late final TextEditingController _controller;
  late final FocusNode _focusNode;

  @override
  void initState() {
    super.initState();
    _controller =
        TextEditingController(text: ref.read(searchQueryTextProvider));
    _focusNode = FocusNode();
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _setQuery(String next) {
    ref.read(searchQueryTextProvider.notifier).state = next;
  }

  void _submit(String value) {
    final String query = value.trim();
    if (query.isNotEmpty) {
      ref.read(recentSearchesProvider.notifier).record(query);
      // Submitted queries search NOW — bypass the keystroke debounce.
      unawaited(ref.read(mailSearchResultsProvider.notifier).refreshNow());
    }
    _focusNode.unfocus();
  }

  @override
  Widget build(BuildContext context) {
    final String query = ref.watch(searchQueryTextProvider);
    final SearchQuery parsed = ref.watch(parsedSearchQueryProvider);
    final List<String> operatorTokens = _operatorTokens(parsed);

    // Keep the field in sync with programmatic edits (chip toggles and
    // operator-chip removal rewrite the query text). Typing already keeps
    // them equal, so this is a no-op on the keystroke path.
    if (_controller.text != query) {
      _controller.value = TextEditingValue(
        text: query,
        selection: TextSelection.collapsed(offset: query.length),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: TextField(
          controller: _controller,
          focusNode: _focusNode,
          autofocus: true,
          textInputAction: TextInputAction.search,
          onChanged: _setQuery,
          onSubmitted: _submit,
          decoration: InputDecoration(
            hintText: 'Search mail',
            border: InputBorder.none,
            suffixIcon: query.isEmpty
                ? null
                : IconButton(
                    icon: const Icon(Icons.clear),
                    tooltip: 'Clear search',
                    onPressed: () => _setQuery(''),
                  ),
          ),
        ),
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          if (operatorTokens.isNotEmpty)
            _OperatorChipsRow(
              tokens: operatorTokens,
              onRemoveToken: (String token) {
                _setQuery(removeQueryToken(query, token));
              },
            ),
          const SearchFilterChips(),
          const Divider(height: 1),
          Expanded(
            child: _SearchBody(
              onSelectRecent: _setQuery,
              onClearQuery: () => _setQuery(''),
            ),
          ),
        ],
      ),
    );
  }
}

/// Canonical `key:value` tokens for every structured operator W1 parsed —
/// one removable chip each. Quoted when the value contains whitespace, so
/// chip removal matches the exact raw token (`from:"Ada Lovelace"`).
List<String> _operatorTokens(SearchQuery parsed) {
  final List<String> tokens = <String>[];
  if (parsed.from != null) tokens.add(_kv('from', parsed.from!));
  if (parsed.to != null) tokens.add(_kv('to', parsed.to!));
  if (parsed.subject != null) tokens.add(_kv('subject', parsed.subject!));
  for (final String label in parsed.labels) {
    tokens.add(_kv('label', label));
  }
  if (parsed.hasAttachment == true) tokens.add('has:attachment');
  if (parsed.isUnread == true) tokens.add('is:unread');
  if (parsed.isUnread == false) tokens.add('is:read');
  if (parsed.after != null) tokens.add('after:${_ymd(parsed.after!)}');
  if (parsed.before != null) tokens.add('before:${_ymd(parsed.before!)}');
  return tokens;
}

String _kv(String key, String value) =>
    value.contains(RegExp(r'\s')) ? '$key:"$value"' : '$key:$value';

String _ymd(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-'
    '${date.month.toString().padLeft(2, '0')}-'
    '${date.day.toString().padLeft(2, '0')}';

/// Horizontal strip of removable operator chips, directly under the field.
///
/// Deleting a chip is real text manipulation: the exact token is excised
/// from [searchQueryTextProvider], which re-parses (chips update) and
/// re-searches (debounced) through the normal reactive path — no parallel
/// chip state to drift.
class _OperatorChipsRow extends StatelessWidget {
  const _OperatorChipsRow({
    required this.tokens,
    required this.onRemoveToken,
  });

  final List<String> tokens;
  final ValueChanged<String> onRemoveToken;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      child: Row(
        children: <Widget>[
          for (final String token in tokens)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: Semantics(
                button: true,
                label: 'Remove filter $token',
                child: InputChip(
                  label: Text(token),
                  onDeleted: () {
                    HapticFeedback.lightImpact();
                    onRemoveToken(token);
                  },
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Results area: blank query -> recent searches; otherwise the AsyncValue
/// states of [mailSearchResultsProvider].
class _SearchBody extends ConsumerWidget {
  const _SearchBody({
    required this.onSelectRecent,
    required this.onClearQuery,
  });

  final ValueChanged<String> onSelectRecent;
  final VoidCallback onClearQuery;

  Future<void> _retry(WidgetRef ref) =>
      ref.read(mailSearchResultsProvider.notifier).refreshNow();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final String query = ref.watch(searchQueryTextProvider);
    if (query.trim().isEmpty) {
      return _RecentSearches(onSelect: onSelectRecent);
    }

    final AsyncValue<MailSearchState> results =
        ref.watch(mailSearchResultsProvider);
    return results.when(
      // Debounce pending: keep stale rows visible (stale-while-revalidate,
      // same pattern as the inbox), spinner only on the very first search.
      loading: () {
        final MailSearchState? previous = results.valueOrNull;
        if (previous != null && previous.emails.isNotEmpty) {
          return _ResultsList(
            key: ValueKey<String>('results-$query'),
            emails: previous.emails,
            query: query,
          );
        }
        return const Center(
          child: CircularProgressIndicator(
            semanticsLabel: 'Searching mail',
          ),
        );
      },
      // W1's notifier surfaces failures as data with errorMessage, but a
      // defensive AsyncError branch costs nothing.
      error: (_, __) => _ErrorState(
        message: 'Something went wrong',
        onRetry: () => _retry(ref),
      ),
      data: (MailSearchState state) {
        final String? failure = state.errorMessage;
        if (failure != null) {
          return _ErrorState(
            message: failure,
            onRetry: () => _retry(ref),
          );
        }
        if (state.emails.isEmpty) {
          return _EmptyState(query: query, onClear: onClearQuery);
        }
        return _ResultsList(
          key: ValueKey<String>('results-$query'),
          emails: state.emails,
          query: query,
        );
      },
    );
  }
}

/// Blank-query view: recent searches (most-recent-first) with a Clear
/// affordance, or a hint when there are none yet.
class _RecentSearches extends ConsumerWidget {
  const _RecentSearches({required this.onSelect});

  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final List<String> recents = ref.watch(recentSearchesProvider);
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;

    if (recents.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(
            'Search across all your mail.\n'
            'Try from:asha, has:attachment, or is:unread.',
            textAlign: TextAlign.center,
            style: textTheme.bodyMedium?.copyWith(
              color: scheme.onSurfaceVariant,
            ),
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 8, 0),
          child: Row(
            children: <Widget>[
              Text('Recent searches', style: textTheme.titleSmall),
              const Spacer(),
              Semantics(
                button: true,
                label: 'Clear recent searches',
                child: TextButton(
                  // VQA-P2-06: touch target >= 48dp (program standard).
                  style: TextButton.styleFrom(
                    minimumSize: const Size(64, 48),
                  ),
                  onPressed: () =>
                      ref.read(recentSearchesProvider.notifier).clear(),
                  child: const Text('Clear'),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView.builder(
            itemCount: recents.length,
            itemBuilder: (BuildContext context, int index) {
              final String recent = recents[index];
              return ListTile(
                leading: const Icon(Icons.history),
                title: Text(
                  recent,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                onTap: () {
                  HapticFeedback.lightImpact();
                  onSelect(recent);
                },
              );
            },
          ),
        ),
      ],
    );
  }
}

/// Error view: message + retry (bypasses the debounce via `refreshNow`).
class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(Icons.error_outline, size: 48, color: scheme.error),
            const SizedBox(height: 16),
            Text(
              message,
              style: textTheme.bodyLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            FilledButton.tonal(
              onPressed: onRetry,
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Empty-results view: names the query, offers to clear it.
class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.query, required this.onClear});

  final String query;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(
              Icons.search_off_outlined,
              size: 48,
              color: scheme.onSurfaceVariant,
            ),
            const SizedBox(height: 16),
            Text(
              "No results for '$query'",
              style: textTheme.titleMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            TextButton(
              // VQA-P2-06: touch target >= 48dp (program standard).
              style: TextButton.styleFrom(
                minimumSize: const Size(64, 48),
              ),
              onPressed: onClear,
              child: const Text('Clear search'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Results list with pull-to-refresh and a staggered entrance.
///
/// One shared [AnimationController]; each row gets an [Interval] slice so
/// rows cascade in cheaply (opacity + a small rise — one-shot, no per-frame
/// cost after the 450ms entrance). The list is keyed by query upstream, so
/// a new search replays the entrance from a fresh state.
class _ResultsList extends ConsumerStatefulWidget {
  const _ResultsList({
    super.key,
    required this.emails,
    required this.query,
  });

  final List<Email> emails;
  final String query;

  @override
  ConsumerState<_ResultsList> createState() => _ResultsListState();
}

class _ResultsListState extends ConsumerState<_ResultsList>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 450),
  )..forward();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _refresh() =>
      ref.read(mailSearchResultsProvider.notifier).refreshNow();

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: widget.emails.length,
        itemBuilder: (BuildContext context, int index) {
          final double start = (index * 0.06).clamp(0.0, 0.6);
          final Animation<double> animation = CurvedAnimation(
            parent: _controller,
            curve: Interval(start, 1.0, curve: Curves.easeOutCubic),
          );
          return FadeTransition(
            opacity: animation,
            child: SlideTransition(
              position: Tween<Offset>(
                begin: const Offset(0, 0.08),
                end: Offset.zero,
              ).animate(animation),
              child: _SearchResultRow(email: widget.emails[index]),
            ),
          );
        },
      ),
    );
  }
}

/// One search hit: avatar, sender/subject/snippet, relative date, unread dot.
///
/// Visual language mirrors the inbox `_ThreadRow` (same avatar circle,
/// unread bolding, date column); deliberately self-contained per the lane
/// contract — the inbox row is another agent's lane history.
///
/// Tap: hits with a [Email.threadId] push the named 'thread' route (same as
/// the inbox); hits without one get an honest snackbar instead of a fake
/// preview — the field genuinely exists on [Email], never invented.
class _SearchResultRow extends ConsumerWidget {
  const _SearchResultRow({required this.email});

  final Email email;

  void _open(BuildContext context) {
    HapticFeedback.lightImpact();
    final String? threadId = email.threadId;
    if (threadId != null && threadId.isNotEmpty) {
      context.pushNamed(
        'thread',
        pathParameters: <String, String>{'threadId': threadId},
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Is message ka thread nahi mila — dobara try karo.')),
      );
    }
  }

  String _initial(String sender, String subject) {
    final String source = sender.isNotEmpty ? sender : subject;
    if (source.isEmpty) return '?';
    return source.trim().characters.first.toUpperCase();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final QuantClock clock = ref.watch(clockProvider);
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;
    final bool unread = !email.isRead;
    final String sender = email.from.display.trim();
    final String subject = (email.subject ?? '').trim();
    final String snippet = (email.snippet ?? '').trim();
    final String date = formatRelativeDate(email.date, clock);

    return Semantics(
      button: true,
      label: <String>[
        if (unread) 'Unread',
        if (sender.isNotEmpty) 'From $sender',
        if (subject.isNotEmpty) subject,
        if (snippet.isNotEmpty) snippet,
        if (date.isNotEmpty) date,
      ].join('. '),
      child: InkWell(
        onTap: () => _open(context),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              // VQA-P2-23: per-sender hue palette (shared SenderAvatar — inbox/thread
              // wali authority), uniform-orange wall nahi.
              SenderAvatar(
                seed: email.from.email,
                initial: _initial(sender, subject),
                radius: 20,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      sender.isEmpty ? '(Unknown sender)' : sender,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: textTheme.bodyLarge?.copyWith(
                        fontWeight:
                            unread ? FontWeight.bold : FontWeight.normal,
                      ),
                    ),
                    Text(
                      subject.isEmpty ? '(No subject)' : subject,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: textTheme.bodyMedium?.copyWith(
                        fontWeight:
                            unread ? FontWeight.bold : FontWeight.normal,
                      ),
                    ),
                    if (snippet.isNotEmpty)
                      Text(
                        snippet,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: textTheme.bodyMedium?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: <Widget>[
                  Text(
                    date,
                    style: textTheme.labelSmall?.copyWith(
                      color: unread ? scheme.primary : scheme.onSurfaceVariant,
                      fontWeight:
                          unread ? FontWeight.bold : FontWeight.normal,
                    ),
                  ),
                  const SizedBox(height: 6),
                  if (unread)
                    Semantics(
                      label: 'Unread',
                      child: Container(
                        width: 10,
                        height: 10,
                        decoration: BoxDecoration(
                          color: scheme.primary,
                          shape: BoxShape.circle,
                        ),
                      ),
                    )
                  else if (email.hasAttachments)
                    Icon(
                      Icons.attach_file,
                      size: 14,
                      color: scheme.onSurfaceVariant,
                      semanticLabel: 'Has attachments',
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

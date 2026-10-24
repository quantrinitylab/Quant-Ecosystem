import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/app_providers.dart';
import '../../data/models/mail_models.dart';
import '../../design/components/components.dart';

/// Which view of the mailbox is open (drawer choice). Resets the local filter.
class SelectedViewNotifier extends Notifier<MailView> {
  @override
  MailView build() => MailView.inbox;

  void select(MailView view) {
    ref.read(mailFilterProvider.notifier).set(MailFilter.all);
    ref.read(selectedLabelProvider.notifier).set(null);
    ref.read(selectedIdsProvider.notifier).clear();
    state = view;
  }
}

final NotifierProvider<SelectedViewNotifier, MailView> selectedViewProvider =
    NotifierProvider<SelectedViewNotifier, MailView>(SelectedViewNotifier.new);

/// Filters that the server cannot apply (contracts.md section 10): they act on
/// the pages that are already loaded and the screen says so.
enum MailFilter {
  all('All'),
  unread('Unread'),
  hasFiles('Has files');

  const MailFilter(this.label);

  final String label;
}

class MailFilterNotifier extends Notifier<MailFilter> {
  @override
  MailFilter build() => MailFilter.all;

  void set(MailFilter filter) => state = filter;
}

final NotifierProvider<MailFilterNotifier, MailFilter> mailFilterProvider =
    NotifierProvider<MailFilterNotifier, MailFilter>(MailFilterNotifier.new);

/// Label id used to filter the loaded mail, or null.
class SelectedLabelNotifier extends Notifier<String?> {
  @override
  String? build() => null;

  void set(String? labelId) => state = labelId;
}

final NotifierProvider<SelectedLabelNotifier, String?> selectedLabelProvider =
    NotifierProvider<SelectedLabelNotifier, String?>(SelectedLabelNotifier.new);

/// Ids of the rows selected in multi-select mode.
class SelectedIdsNotifier extends Notifier<Set<String>> {
  @override
  Set<String> build() => const <String>{};

  void toggle(String id) {
    final Set<String> next = <String>{...state};
    if (!next.remove(id)) next.add(id);
    state = next;
  }

  void addAll(Iterable<String> ids) => state = <String>{...state, ...ids};

  void clear() {
    if (state.isNotEmpty) state = const <String>{};
  }
}

final NotifierProvider<SelectedIdsNotifier, Set<String>> selectedIdsProvider =
    NotifierProvider<SelectedIdsNotifier, Set<String>>(SelectedIdsNotifier.new);

/// Folders for the drawer. Fails quietly into an AsyncError (counts omitted).
final FutureProvider<List<MailFolder>> foldersProvider = FutureProvider.autoDispose<List<MailFolder>>((Ref ref) {
  return ref.watch(folderRepositoryProvider).folders();
});

final FutureProvider<List<MailLabel>> labelsProvider = FutureProvider.autoDispose<List<MailLabel>>((Ref ref) {
  return ref.watch(folderRepositoryProvider).labels();
});

/// Counts of the drawer views, each from a one-row fetch, so a number only
/// shows when the server said it. Missing or failed = null = no number.
class DrawerCounts {
  const DrawerCounts({this.inboxUnread, this.draftsTotal});

  final int? inboxUnread;
  final int? draftsTotal;
}

final FutureProvider<DrawerCounts> drawerCountsProvider = FutureProvider.autoDispose<DrawerCounts>((Ref ref) async {
  final repo = ref.watch(mailRepositoryProvider);
  Future<MailCounts?> safe(MailView v) async {
    try {
      return await repo.counts(v);
    } on Object {
      return null;
    }
  }

  final List<MailCounts?> r = await Future.wait<MailCounts?>(<Future<MailCounts?>>[
    safe(MailView.inbox),
    safe(MailView.drafts),
  ]);
  return DrawerCounts(inboxUnread: r[0]?.unreadCount, draftsTotal: r[1]?.totalCount);
});

/// True while the OS reports no network. The list also flips to the offline
/// banner when a request fails without an answer.
final StreamProvider<bool> deviceOnlineProvider = StreamProvider<bool>((Ref ref) async* {
  try {
    final Connectivity connectivity = Connectivity();
    yield _isOnline(await connectivity.checkConnectivity());
    yield* connectivity.onConnectivityChanged.map(_isOnline);
  } on Object {
    yield true; // no plugin (tests, unsupported platform): assume online
  }
});

bool _isOnline(List<ConnectivityResult> results) =>
    results.isEmpty ? false : !results.every((ConnectivityResult r) => r == ConnectivityResult.none);

/// Rows after the local filters. Server-side filtering is the view itself.
List<MailMessage> applyLocalFilters(List<MailMessage> items, MailFilter filter, String? labelId) {
  return items.where((MailMessage m) {
    if (filter == MailFilter.unread && m.isRead) return false;
    if (filter == MailFilter.hasFiles && !m.hasAttachments) return false;
    if (labelId != null && !m.labelIds.contains(labelId)) return false;
    return true;
  }).toList();
}

/// "#RRGGBB" from the API to a Color, or null.
Color? parseLabelColor(String? hex) {
  if (hex == null) return null;
  final String h = hex.trim().replaceFirst('#', '');
  if (h.length != 6) return null;
  final int? v = int.tryParse(h, radix: 16);
  return v == null ? null : Color(0xFF000000 | v);
}

/// Row label chips for a message, from the label list.
List<QmRowLabel> rowLabelsFor(MailMessage m, List<MailLabel> labels) {
  final List<QmRowLabel> result = <QmRowLabel>[];
  for (final String id in m.labelIds) {
    for (final MailLabel l in labels) {
      if (l.id == id && l.name.isNotEmpty) result.add(QmRowLabel(l.name, parseLabelColor(l.color)));
    }
  }
  return result;
}

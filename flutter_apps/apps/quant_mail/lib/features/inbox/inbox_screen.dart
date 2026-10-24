// The one inbox: every mail view (Inbox, Starred, Sent, ...) renders through
// this screen. It replaces the two older inbox implementations.

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/app_providers.dart';
import '../../data/mail_exception.dart';
import '../../data/models/mail_models.dart';
import '../../data/models/session_models.dart';
import '../../design/components/components.dart';
import '../../design/qm_format.dart';
import '../../design/quant_mail_tokens.dart';
import '../common/error_copy.dart';
import '../thread/thread_screen.dart';
import 'inbox_state.dart';
import 'inbox_widgets.dart';
import 'mail_list_controller.dart';

class InboxScreen extends ConsumerStatefulWidget {
  const InboxScreen({super.key, required this.onOpenDrawer});

  /// Opens the shell drawer (menu button and avatar of the search pill).
  final VoidCallback onOpenDrawer;

  @override
  ConsumerState<InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends ConsumerState<InboxScreen> {
  static const CustomSemanticsAction _archiveAction = CustomSemanticsAction(label: 'Archive');
  static const CustomSemanticsAction _deleteAction = CustomSemanticsAction(label: 'Delete');
  static const CustomSemanticsAction _readAction = CustomSemanticsAction(label: 'Mark read or unread');
  static const CustomSemanticsAction _starAction = CustomSemanticsAction(label: 'Star or unstar');

  final ScrollController _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scroll.hasClients) return;
    if (_scroll.position.extentAfter < 400) {
      ref.read(mailListProvider(ref.read(selectedViewProvider)).notifier).loadMore();
    }
  }

  void _loadIfNeeded(MailView view, MailListState state) {
    if (state.hasLoaded || state.error != null || state.isLoading) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.read(mailListProvider(view).notifier).load();
    });
  }

  MailListController _ctl(MailView view) => ref.read(mailListProvider(view).notifier);

  bool _isOutgoingView(MailView view) =>
      view.kind == MailFolderKind.sent ||
      view.kind == MailFolderKind.drafts ||
      view.kind == MailFolderKind.scheduled;

  bool _canArchiveFrom(MailView view) =>
      view.kind != MailFolderKind.archive &&
      view.kind != MailFolderKind.trash &&
      view.kind != MailFolderKind.drafts &&
      view.kind != MailFolderKind.scheduled;

  bool _canDeleteFrom(MailView view) => view.kind != MailFolderKind.trash;

  // ---- actions ------------------------------------------------------------

  Future<void> _archive(MailView view, List<String> ids) async {
    final MailException? failure = await _ctl(view).applyAction(MailBatchAction.archive, ids);
    if (!mounted) return;
    if (failure != null) {
      showQmToast(context, "Couldn't archive. The mail is back in your list.");
      return;
    }
    showQmToast(
      context,
      'Archived.',
      actionLabel: 'Undo',
      onAction: () async {
        final MailException? e = await _ctl(view).undoRemoval(MailBatchAction.archive, ids);
        if (e != null && mounted) showQmToast(context, "Couldn't undo. Open Archive to move it back.");
      },
    );
  }

  Future<void> _delete(MailView view, List<String> ids) async {
    final MailException? failure = await _ctl(view).applyAction(MailBatchAction.delete, ids);
    if (!mounted) return;
    if (failure != null) {
      showQmToast(context, "Couldn't delete. The mail is back in your list.");
      return;
    }
    showQmToast(
      context,
      'Moved to Trash.',
      actionLabel: 'Undo',
      onAction: () async {
        final MailException? e = await _ctl(view).undoRemoval(MailBatchAction.delete, ids);
        if (e != null && mounted) showQmToast(context, "Couldn't undo. Open Trash to restore it.");
      },
    );
  }

  Future<void> _setRead(MailView view, List<String> ids, {required bool read}) async {
    final MailException? failure =
        await _ctl(view).applyAction(read ? MailBatchAction.markRead : MailBatchAction.markUnread, ids);
    if (!mounted) return;
    if (failure != null) {
      showQmToast(context, "Couldn't update. Try again.");
    }
  }

  Future<void> _setStar(MailView view, List<String> ids, {required bool star}) async {
    final MailException? failure =
        await _ctl(view).applyAction(star ? MailBatchAction.star : MailBatchAction.unstar, ids);
    if (!mounted) return;
    if (failure != null) {
      showQmToast(context, "Couldn't update. Try again.");
    }
  }

  void _open(MailView view, MailMessage m) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => ThreadScreen(message: m, view: view)),
    );
  }

  void _startOrToggleSelection(String id) {
    HapticFeedback.selectionClick();
    ref.read(selectedIdsProvider.notifier).toggle(id);
  }

  // ---- build --------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    final MailView view = ref.watch(selectedViewProvider);
    final MailListState state = ref.watch(mailListProvider(view));
    final MailFilter filter = ref.watch(mailFilterProvider);
    final String? labelId = ref.watch(selectedLabelProvider);
    final Set<String> selected = ref.watch(selectedIdsProvider);
    final bool sampleActive = ref.watch(sampleDataActiveProvider);
    final SessionState session = ref.watch(sessionStateProvider);
    final bool deviceOnline = ref.watch(deviceOnlineProvider).value ?? true;
    final DateTime now = ref.watch(clockProvider)();

    ref.listen<AsyncValue<bool>>(deviceOnlineProvider, (AsyncValue<bool>? prev, AsyncValue<bool> next) {
      final bool online = next.value ?? true;
      final MailListState s = ref.read(mailListProvider(ref.read(selectedViewProvider)));
      if (online && s.error?.isConnectivity == true) {
        _ctl(ref.read(selectedViewProvider)).refresh();
      }
    });

    _loadIfNeeded(view, state);

    final bool selecting = selected.isNotEmpty;
    final String accountName = session.user?.displayName ?? '';
    final String accountEmail = session.user?.email ?? '';

    final List<Widget> top = <Widget>[
      if (sampleActive) const QmSampleDataBanner(),
      if (selecting)
        _selectionBar(view, state, selected, filter, labelId)
      else
        Padding(
          padding: const EdgeInsets.fromLTRB(QmSpace.md, QmSpace.sm, QmSpace.md, QmSpace.xs),
          child: QmSearchPill(
            onMenu: widget.onOpenDrawer,
            onAccount: widget.onOpenDrawer,
            onTap: () => showQmToast(context, "Search isn't available in this version yet."),
            accountName: accountName,
            accountEmail: accountEmail,
          ),
        ),
      if (!selecting)
        InboxFilterRow(
          allSelected: filter == MailFilter.all && view.kind != MailFolderKind.starred,
          unreadSelected: filter == MailFilter.unread,
          starredSelected: view.kind == MailFolderKind.starred,
          filesSelected: filter == MailFilter.hasFiles,
          onAll: () {
            ref.read(mailFilterProvider.notifier).set(MailFilter.all);
            if (view.kind == MailFolderKind.starred) {
              ref.read(selectedViewProvider.notifier).select(MailView.inbox);
            }
          },
          onUnread: () => ref
              .read(mailFilterProvider.notifier)
              .set(filter == MailFilter.unread ? MailFilter.all : MailFilter.unread),
          onStarred: () => ref
              .read(selectedViewProvider.notifier)
              .select(view.kind == MailFolderKind.starred ? MailView.inbox : MailView.starred),
          onFiles: () => ref
              .read(mailFilterProvider.notifier)
              .set(filter == MailFilter.hasFiles ? MailFilter.all : MailFilter.hasFiles),
        ),
      ..._statusBanners(view, state, deviceOnline, now),
    ];

    return ColoredBox(
      color: t.canvas,
      child: Column(
        children: <Widget>[
          ...top,
          Expanded(child: _body(view, state, filter, labelId, selected, now)),
        ],
      ),
    );
  }

  List<Widget> _statusBanners(MailView view, MailListState state, bool deviceOnline, DateTime now) {
    final String? saved = state.lastSyncedAt == null ? null : qmRowTime(state.lastSyncedAt!, now);
    if (state.showErrorBanner) {
      if (state.isOffline) {
        return <Widget>[
          QmBanner(
            kind: QmBannerKind.offline,
            message: saved == null ? "You're offline." : "You're offline. Showing mail saved at $saved.",
            actionLabel: 'Retry',
            onAction: () => _ctl(view).refresh(),
          ),
        ];
      }
      return <Widget>[
        QmBanner(
          kind: QmBannerKind.error,
          message: "Couldn't refresh.",
          actionLabel: 'Retry',
          onAction: () => _ctl(view).refresh(),
        ),
      ];
    }
    if (!deviceOnline && state.hasLoaded) {
      return <Widget>[
        QmBanner(
          kind: QmBannerKind.offline,
          message: saved == null ? "You're offline." : "You're offline. Showing mail saved at $saved.",
        ),
      ];
    }
    return const <Widget>[];
  }

  Widget _selectionBar(
    MailView view,
    MailListState state,
    Set<String> selected,
    MailFilter filter,
    String? labelId,
  ) {
    final List<MailMessage> chosen = state.items.where((MailMessage m) => selected.contains(m.id)).toList();
    final bool anyUnread = chosen.any((MailMessage m) => !m.isRead);
    final List<String> ids = selected.toList();
    void done() => ref.read(selectedIdsProvider.notifier).clear();
    return InboxSelectionBar(
      count: selected.length,
      onClose: done,
      onSelectAll: () => ref
          .read(selectedIdsProvider.notifier)
          .addAll(applyLocalFilters(state.items, filter, labelId).map((MailMessage m) => m.id)),
      onArchive: _canArchiveFrom(view)
          ? () {
              done();
              _archive(view, ids);
            }
          : null,
      onDelete: _canDeleteFrom(view)
          ? () {
              done();
              _delete(view, ids);
            }
          : null,
      readLabel: anyUnread ? 'Mark read' : 'Mark unread',
      onToggleRead: () {
        done();
        _setRead(view, ids, read: anyUnread);
      },
      onStar: () {
        done();
        _setStar(view, ids, star: true);
      },
      onUnstar: () {
        done();
        _setStar(view, ids, star: false);
      },
    );
  }

  Widget _body(
    MailView view,
    MailListState state,
    MailFilter filter,
    String? labelId,
    Set<String> selected,
    DateTime now,
  ) {
    if (state.showSkeleton) {
      return const SingleChildScrollView(physics: NeverScrollableScrollPhysics(), child: QmMailListSkeleton());
    }
    if (state.showFullError) {
      final ErrorCopy copy = errorCopyFor(state.error!);
      return QmErrorState(title: copy.title, message: copy.message, onRetry: () => _ctl(view).load());
    }
    if (state.showEmpty) {
      return _pullable(
        view,
        view.kind == MailFolderKind.inbox
            ? const QmEmptyState(title: 'Nothing left to read.', message: 'New mail will show up here.')
            : QmEmptyState(
                title: 'Nothing in ${view.kind == MailFolderKind.custom ? 'this folder' : view.kind.title}.',
                message: 'Messages you move here will show up here.',
              ),
      );
    }
    final List<MailMessage> items = applyLocalFilters(state.items, filter, labelId);
    return _list(view, state, items, filter, labelId, selected, now);
  }

  /// Makes a non-scrolling child pull-to-refresh capable.
  Widget _pullable(MailView view, Widget child) {
    return RefreshIndicator(
      onRefresh: () => _ctl(view).refresh(),
      color: QuantMailTokens.of(context).accent,
      child: LayoutBuilder(
        builder: (BuildContext context, BoxConstraints c) => SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          child: ConstrainedBox(constraints: BoxConstraints(minHeight: c.maxHeight), child: child),
        ),
      ),
    );
  }

  String _title(MailView view, MailListState state, MailFilter filter) {
    if (filter == MailFilter.unread) return 'Unread';
    if (filter == MailFilter.hasFiles) return 'Has files';
    String name = view.kind.title;
    if (view.kind == MailFolderKind.custom) {
      final List<MailFolder> folders = ref.watch(foldersProvider).value ?? const <MailFolder>[];
      for (final MailFolder f in folders) {
        if (f.id == view.folderId) name = f.name;
      }
    }
    final int? unread = state.unreadCount;
    if (view.kind == MailFolderKind.inbox && unread != null) return '$name, $unread unread';
    return name;
  }

  Widget _list(
    MailView view,
    MailListState state,
    List<MailMessage> items,
    MailFilter filter,
    String? labelId,
    Set<String> selected,
    DateTime now,
  ) {
    final List<MailLabel> labels = ref.watch(labelsProvider).value ?? const <MailLabel>[];
    final bool localFilter = filter != MailFilter.all || labelId != null;
    final String? labelName = labelId == null
        ? null
        : labels.where((MailLabel l) => l.id == labelId).map((MailLabel l) => l.name).firstOrNull;

    final List<Widget> slivers = <Widget>[
      SliverToBoxAdapter(child: InboxTitleRow(title: _title(view, state, filter))),
      if (localFilter)
        SliverToBoxAdapter(
          child: LocalFilterNote(
            text: labelName == null ? 'Filtering loaded mail' : 'Loaded mail labelled $labelName',
            onLoadMore: state.hasMore ? () => _ctl(view).loadMore() : null,
            onClear: labelId == null ? null : () => ref.read(selectedLabelProvider.notifier).set(null),
          ),
        ),
    ];

    if (items.isEmpty) {
      slivers.add(
        SliverToBoxAdapter(
          child: QmEmptyState(
            compact: true,
            title: filter == MailFilter.unread
                ? 'No unread mail in the loaded messages.'
                : filter == MailFilter.hasFiles
                    ? 'No mail with files in the loaded messages.'
                    : 'No loaded mail has this label.',
            message: state.hasMore ? 'Load more to look further back.' : null,
            actionLabel: state.hasMore ? 'Load more' : 'Clear filter',
            onAction: state.hasMore
                ? () => _ctl(view).loadMore()
                : () {
                    ref.read(mailFilterProvider.notifier).set(MailFilter.all);
                    ref.read(selectedLabelProvider.notifier).set(null);
                  },
          ),
        ),
      );
    } else {
      int i = 0;
      while (i < items.length) {
        final String label = qmDayLabel(items[i].sortDate, now);
        int j = i;
        while (j < items.length && qmDayLabel(items[j].sortDate, now) == label) {
          j++;
        }
        final List<MailMessage> group = items.sublist(i, j);
        slivers.add(
          SliverMainAxisGroup(
            slivers: <Widget>[
              SliverPersistentHeader(pinned: true, delegate: DayHeaderDelegate(label)),
              SliverList.builder(
                itemCount: group.length,
                itemBuilder: (BuildContext _, int index) =>
                    _row(view, group[index], labels, selected, now),
              ),
            ],
          ),
        );
        i = j;
      }
    }

    slivers.add(
      SliverToBoxAdapter(
        child: InboxListFooter(
          loading: state.isLoadingMore,
          failed: state.loadMoreError != null,
          onRetry: () => _ctl(view).loadMore(),
        ),
      ),
    );
    slivers.add(const SliverToBoxAdapter(child: SizedBox(height: QmSpace.xxl)));

    return RefreshIndicator(
      onRefresh: () => _ctl(view).refresh(),
      color: QuantMailTokens.of(context).accent,
      child: CustomScrollView(
        controller: _scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: slivers,
      ),
    );
  }

  Widget _row(MailView view, MailMessage m, List<MailLabel> labels, Set<String> selected, DateTime now) {
    final bool selecting = selected.isNotEmpty;
    final bool outgoing = _isOutgoingView(view);
    final String party = outgoing
        ? (m.to.isEmpty ? 'No recipient' : 'To: ${m.to.first.displayName}')
        : m.from.displayName;
    final String partyEmail = outgoing && m.to.isNotEmpty ? m.to.first.email : m.from.email;
    final bool isSelected = selected.contains(m.id);
    final List<String> one = <String>[m.id];

    final Widget row = QmMailRow(
      key: ValueKey<String>('row-${m.id}'),
      sender: party,
      senderEmail: partyEmail,
      subject: m.subject,
      snippet: m.previewText,
      timeLabel: qmRowTime(m.sortDate, now),
      unread: !m.isRead && !outgoing,
      starred: m.isStarred,
      hasAttachments: m.hasAttachments,
      labels: rowLabelsFor(m, labels),
      selected: isSelected,
      onTap: selecting ? () => _startOrToggleSelection(m.id) : () => _open(view, m),
      onLongPress: () => _startOrToggleSelection(m.id),
      onAvatarTap: () => _startOrToggleSelection(m.id),
      semanticActions: <CustomSemanticsAction, VoidCallback>{
        if (_canArchiveFrom(view)) _archiveAction: () => _archive(view, one),
        if (_canDeleteFrom(view)) _deleteAction: () => _delete(view, one),
        _readAction: () => _setRead(view, one, read: !m.isRead),
        _starAction: () => _setStar(view, one, star: !m.isStarred),
      },
    );
    if (selecting) return row;

    final QuantMailTokens t = QuantMailTokens.of(context);
    final bool canArchive = _canArchiveFrom(view);
    return Dismissible(
      key: ValueKey<String>('swipe-${m.id}'),
      direction: canArchive ? DismissDirection.horizontal : DismissDirection.endToStart,
      dismissThresholds: const <DismissDirection, double>{
        DismissDirection.startToEnd: 0.4,
        DismissDirection.endToStart: 0.4,
      },
      resizeDuration: const Duration(milliseconds: 200),
      background: QmSwipePanel(label: 'Archive', icon: Icons.archive_outlined, color: t.success),
      secondaryBackground: QmSwipePanel(
        label: m.isRead ? 'Mark unread' : 'Mark read',
        icon: m.isRead ? Icons.mark_email_unread_outlined : Icons.mark_email_read_outlined,
        color: t.info,
        alignment: Alignment.centerRight,
      ),
      onUpdate: (DismissUpdateDetails d) {
        if (d.reached && !d.previousReached) HapticFeedback.lightImpact();
      },
      confirmDismiss: (DismissDirection direction) async {
        if (direction == DismissDirection.startToEnd) return true;
        _setRead(view, one, read: !m.isRead);
        return false;
      },
      onDismissed: (DismissDirection _) => _archive(view, one),
      child: row,
    );
  }
}

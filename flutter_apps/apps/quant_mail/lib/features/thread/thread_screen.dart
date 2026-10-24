// Thread view: one conversation, sanitised HTML, remote images blocked until
// the reader asks, honest attachment chips, floating action capsule.
// Reply, Forward and Snooze are not offered until their backends are wired.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/app_providers.dart';
import '../../data/mail_exception.dart';
import '../../data/models/mail_models.dart';
import '../../design/components/components.dart';
import '../../design/quant_mail_tokens.dart';
import '../common/error_copy.dart';
import '../inbox/mail_list_controller.dart';
import 'thread_widgets.dart';

/// Conversation for a thread id or an email id.
final conversationProvider = FutureProvider.autoDispose.family<MailConversation, String>((Ref ref, String id) {
  return ref.watch(mailRepositoryProvider).getConversation(id);
});

class ThreadScreen extends ConsumerStatefulWidget {
  const ThreadScreen({super.key, required this.message, required this.view});

  /// The list row that was opened (gives the title while loading).
  final MailMessage message;

  /// The list the row came from; archive and delete act on it.
  final MailView view;

  @override
  ConsumerState<ThreadScreen> createState() => _ThreadScreenState();
}

class _ThreadScreenState extends ConsumerState<ThreadScreen> {
  final Set<String> _imagesAllowed = <String>{};
  final Set<String> _expanded = <String>{};
  bool _earlierShown = false;
  bool _subjectExpanded = false;
  Timer? _readTimer;
  bool _readMarked = false;

  String get _id => widget.message.threadId ?? widget.message.id;

  @override
  void dispose() {
    _readTimer?.cancel();
    super.dispose();
  }

  void _scheduleMarkRead(MailConversation c) {
    if (_readMarked || _readTimer != null) return;
    if (c.messages.every((MailMessage m) => m.isRead)) return;
    // Marked read after the thread was visible for a second.
    _readTimer = Timer(const Duration(seconds: 1), () async {
      if (!mounted) return;
      _readMarked = true;
      try {
        await ref.read(mailRepositoryProvider).markThreadRead(_id);
        if (!mounted) return;
        ref.read(mailListProvider(widget.view).notifier).markConversationReadLocally(_id);
      } on MailException {
        // Quietly stays unread; nothing was claimed.
      }
    });
  }

  List<String> _idsOf(MailConversation? c) =>
      c == null || c.messages.isEmpty ? <String>[widget.message.id] : c.messages.map((MailMessage m) => m.id).toList();

  bool get _canArchive =>
      widget.view.kind != MailFolderKind.archive &&
      widget.view.kind != MailFolderKind.trash &&
      widget.view.kind != MailFolderKind.drafts &&
      widget.view.kind != MailFolderKind.scheduled;

  bool get _canDelete => widget.view.kind != MailFolderKind.trash;

  Future<void> _remove(MailConversation? c, MailBatchAction action) async {
    final List<String> ids = _idsOf(c);
    final MailListController list = ref.read(mailListProvider(widget.view).notifier);
    final NavigatorState navigator = Navigator.of(context);
    final ScaffoldMessengerState messenger = ScaffoldMessenger.of(context);
    final QuantMailTokens t = QuantMailTokens.of(context);
    final MailException? failure = await list.applyAction(action, ids);
    if (failure != null) {
      if (mounted) showQmToast(context, action == MailBatchAction.archive ? "Couldn't archive." : "Couldn't delete.");
      return;
    }
    navigator.pop();
    messenger.clearSnackBars();
    messenger.showSnackBar(
      SnackBar(
        behavior: SnackBarBehavior.floating,
        backgroundColor: t.panelRaised,
        elevation: 0,
        margin: const EdgeInsets.fromLTRB(QmSpace.lg, 0, QmSpace.lg, QmSpace.lg),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(QmRadius.field),
          side: BorderSide(color: t.hairline),
        ),
        duration: const Duration(seconds: 6),
        content: Semantics(
          liveRegion: true,
          child: Text(action == MailBatchAction.archive ? 'Archived.' : 'Moved to Trash.', style: t.body),
        ),
        action: SnackBarAction(
          label: 'Undo',
          textColor: t.accentText,
          onPressed: () => list.undoRemoval(action, ids),
        ),
      ),
    );
  }

  Future<void> _markUnread(MailConversation? c) async {
    final MailException? failure =
        await ref.read(mailListProvider(widget.view).notifier).applyAction(MailBatchAction.markUnread, _idsOf(c));
    if (!mounted) return;
    if (failure != null) {
      showQmToast(context, "Couldn't update. Try again.");
      return;
    }
    Navigator.of(context).pop();
  }

  void _showLink(String url) {
    showQmSheet<void>(
      context,
      title: 'This link goes to',
      builder: (BuildContext ctx) {
        final QuantMailTokens t = QuantMailTokens.of(ctx);
        final Uri? uri = Uri.tryParse(url);
        return Padding(
          padding: const EdgeInsets.fromLTRB(QmSpace.xl, 0, QmSpace.xl, QmSpace.xl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              if (uri != null && uri.host.isNotEmpty) Text(uri.host, style: t.subject.copyWith(color: t.accentText)),
              const SizedBox(height: QmSpace.xs),
              SelectableText(url, style: t.snippet),
              const SizedBox(height: QmSpace.md),
              Text(
                'Links do not open from the app yet. Copy it to open it in a browser you trust.',
                style: t.caption,
              ),
              const SizedBox(height: QmSpace.lg),
              Row(
                children: <Widget>[
                  QmButton(
                    label: 'Copy link',
                    icon: Icons.copy_rounded,
                    onPressed: () async {
                      await Clipboard.setData(ClipboardData(text: url));
                      if (ctx.mounted) Navigator.of(ctx).pop();
                    },
                  ),
                  const SizedBox(width: QmSpace.sm),
                  QmButton(label: 'Close', variant: QmButtonVariant.ghost, onPressed: () => Navigator.of(ctx).pop()),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    final AsyncValue<MailConversation> async = ref.watch(conversationProvider(_id));
    final bool sampleActive = ref.watch(sampleDataActiveProvider);
    final String accountEmail = ref.watch(sessionStateProvider).user?.email ?? '';
    final MailConversation? conversation = async.value;
    if (conversation != null) _scheduleMarkRead(conversation);

    final String subject = conversation?.subject.isNotEmpty == true ? conversation!.subject : widget.message.subject;

    return Scaffold(
      backgroundColor: t.canvas,
      appBar: AppBar(
        backgroundColor: t.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          tooltip: 'Back',
          icon: Icon(Icons.arrow_back_rounded, color: t.textPrimary),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        titleSpacing: 0,
        title: Semantics(
          header: true,
          button: true,
          label: subject.isEmpty ? 'No subject' : subject,
          child: ExcludeSemantics(
            child: InkWell(
              onTap: () => setState(() => _subjectExpanded = !_subjectExpanded),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: QmSpace.sm),
                child: Text(
                  subject.isEmpty ? '(no subject)' : subject,
                  maxLines: _subjectExpanded ? 8 : 2,
                  overflow: TextOverflow.ellipsis,
                  style: t.subject,
                ),
              ),
            ),
          ),
        ),
        actions: <Widget>[
          if (conversation != null)
            PopupMenuButton<String>(
              tooltip: 'More actions',
              color: t.panelRaised,
              icon: Icon(Icons.more_vert_rounded, color: t.textPrimary),
              onSelected: (String v) {
                if (v == 'unread') _markUnread(conversation);
              },
              itemBuilder: (BuildContext _) => <PopupMenuEntry<String>>[
                PopupMenuItem<String>(value: 'unread', child: Text('Mark unread', style: t.body)),
              ],
            ),
        ],
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerFloat,
      floatingActionButton: async.hasValue
          ? QmActionCapsule(
              onArchive: _canArchive ? () => _remove(conversation, MailBatchAction.archive) : null,
              onDelete: _canDelete ? () => _remove(conversation, MailBatchAction.delete) : null,
            )
          : null,
      body: Column(
        children: <Widget>[
          if (sampleActive) const QmSampleDataBanner(),
          Expanded(child: _content(async, accountEmail)),
        ],
      ),
    );
  }

  Widget _content(AsyncValue<MailConversation> async, String accountEmail) {
    if (async.hasError && !async.hasValue) {
      final Object? error = async.error;
      final ErrorCopy copy = error is MailException
          ? errorCopyFor(error, what: 'this conversation')
          : const ErrorCopy("Couldn't load this conversation.", 'Try again in a moment.');
      final bool gone = error is MailException && error.kind == MailErrorKind.notFound;
      return QmErrorState(
        title: copy.title,
        message: copy.message,
        retryLabel: gone ? 'Back' : 'Retry',
        onRetry: gone ? () => Navigator.of(context).maybePop() : () => ref.invalidate(conversationProvider(_id)),
      );
    }
    final MailConversation? c = async.value;
    if (c == null) return const SingleChildScrollView(physics: NeverScrollableScrollPhysics(), child: QmThreadSkeleton());

    final List<MailMessage> messages = c.messages;
    if (messages.isEmpty) {
      return const QmEmptyState(title: 'This conversation has no messages.', compact: true);
    }
    final List<MailMessage> earlier = messages.sublist(0, messages.length - 1);
    final MailMessage newest = messages.last;

    Widget card(MailMessage m) => ThreadMessageCard(
          key: ValueKey<String>('msg-${m.id}'),
          message: m,
          accountEmail: accountEmail,
          imagesAllowed: _imagesAllowed.contains(m.id),
          onShowImages: () => setState(() => _imagesAllowed.add(m.id)),
          onTapLink: _showLink,
        );

    return ListView(
      padding: const EdgeInsets.only(bottom: 120),
      children: <Widget>[
        if (earlier.isNotEmpty && !_earlierShown)
          EarlierMessagesTile(count: earlier.length, onTap: () => setState(() => _earlierShown = true)),
        if (_earlierShown)
          for (final MailMessage m in earlier) ...<Widget>[
            if (_expanded.contains(m.id))
              card(m)
            else
              CollapsedMessageRow(message: m, onTap: () => setState(() => _expanded.add(m.id))),
            Divider(height: 1, color: QuantMailTokens.of(context).hairline),
          ],
        card(newest),
      ],
    );
  }
}

// Left drawer: real account header, folders with counts, labels, Sign out and
// (debug builds only) the Developer section with the sample data switch.
// Settings and Help are not shown until those screens exist.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/app_providers.dart';
import '../../data/models/mail_models.dart';
import '../../design/components/components.dart';
import '../../design/quant_mail_tokens.dart';
import '../inbox/inbox_state.dart';

class MailDrawer extends ConsumerWidget {
  const MailDrawer({super.key});

  static const List<(MailView, String, IconData)> _folders = <(MailView, String, IconData)>[
    (MailView.inbox, 'Inbox', Icons.inbox_outlined),
    (MailView.starred, 'Starred', Icons.star_outline_rounded),
    (MailView.snoozed, 'Snoozed', Icons.snooze_rounded),
    (MailView.sent, 'Sent', Icons.send_outlined),
    (MailView.drafts, 'Drafts', Icons.description_outlined),
    (MailView.scheduled, 'Scheduled', Icons.schedule_send_outlined),
    (MailView.archive, 'Archive', Icons.archive_outlined),
    (MailView.spam, 'Spam', Icons.report_gmailerrorred_outlined),
    (MailView.trash, 'Trash', Icons.delete_outline_rounded),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    final user = ref.watch(sessionStateProvider).user;
    final MailView current = ref.watch(selectedViewProvider);
    final String? labelId = ref.watch(selectedLabelProvider);
    final AsyncValue<DrawerCounts> counts = ref.watch(drawerCountsProvider);
    final AsyncValue<List<MailFolder>> folders = ref.watch(foldersProvider);
    final AsyncValue<List<MailLabel>> labels = ref.watch(labelsProvider);
    final bool debug = ref.watch(debugModeProvider);
    final bool sample = ref.watch(sampleDataSwitchProvider);

    final String email = user?.email ?? '';
    final String name = (user?.displayName ?? '').trim().isNotEmpty ? user!.displayName.trim() : email;

    int? countFor(MailView v) {
      final DrawerCounts? c = counts.value;
      if (c == null) return null;
      if (v == MailView.inbox) return c.inboxUnread;
      if (v == MailView.drafts) return c.draftsTotal;
      return null;
    }

    void open(MailView v) {
      ref.read(selectedViewProvider.notifier).select(v);
      Navigator.of(context).pop();
    }

    final List<MailFolder> custom = (folders.value ?? const <MailFolder>[])
        .where((MailFolder f) => f.type == 'CUSTOM')
        .toList();

    return QmDrawer(
      children: <Widget>[
        QmDrawerHeader(name: name, email: email),
        Divider(height: 1, color: t.hairline),
        const SizedBox(height: QmSpace.sm),
        for (final (MailView, String, IconData) f in _folders)
          QmDrawerTile(
            label: f.$2,
            icon: f.$3,
            count: countFor(f.$1),
            selected: current == f.$1 && labelId == null,
            onTap: () => open(f.$1),
          ),
        if (custom.isNotEmpty) ...<Widget>[
          const QmDrawerSectionTitle('Folders'),
          for (final MailFolder f in custom)
            QmDrawerTile(
              label: f.name,
              icon: Icons.folder_outlined,
              selected: current.folderId == f.id,
              onTap: () => open(MailView(MailFolderKind.custom, folderId: f.id)),
            ),
        ],
        const QmDrawerSectionTitle('Labels'),
        if (labels.hasError)
          QmDrawerTile(
            label: "Couldn't load labels. Retry",
            icon: Icons.refresh_rounded,
            onTap: () => ref.invalidate(labelsProvider),
          )
        else if (labels.hasValue && labels.requireValue.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: QmSpace.xl, vertical: QmSpace.sm),
            child: Text('No labels yet.', style: t.snippet),
          )
        else
          for (final MailLabel l in labels.value ?? const <MailLabel>[])
            QmDrawerTile(
              label: l.name,
              dotColor: parseLabelColor(l.color) ?? t.textMuted,
              selected: labelId == l.id,
              onTap: () {
                ref.read(selectedViewProvider.notifier).select(MailView.inbox);
                ref.read(selectedLabelProvider.notifier).set(l.id);
                Navigator.of(context).pop();
              },
            ),
        const SizedBox(height: QmSpace.sm),
        Divider(height: 1, color: t.hairline),
        QmDrawerTile(
          label: 'Sign out',
          icon: Icons.logout_rounded,
          onTap: () => _confirmSignOut(context, ref),
        ),
        if (debug) ...<Widget>[
          const QmDrawerSectionTitle('Developer'),
          _SampleSwitch(
            value: sample,
            onChanged: (bool v) => ref.read(sampleDataSwitchProvider.notifier).set(v),
          ),
        ],
      ],
    );
  }

  Future<void> _confirmSignOut(BuildContext context, WidgetRef ref) async {
    final bool ok = await showQmConfirmDialog(
      context,
      title: 'Sign out of Quant Mail?',
      message: 'You will need to sign in again to see your mail on this device.',
      confirmLabel: 'Sign out',
      destructive: true,
    );
    if (!ok || !context.mounted) return;
    Navigator.of(context).pop();
    await ref.read(sessionRepositoryProvider).signOut();
  }
}

class _SampleSwitch extends StatelessWidget {
  const _SampleSwitch({required this.value, required this.onChanged});

  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    return Semantics(
      container: true,
      toggled: value,
      label: 'Sample data, debug only',
      child: ExcludeSemantics(
        child: InkWell(
          onTap: () => onChanged(!value),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: QmSpace.minTarget + 8),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(QmSpace.xl, QmSpace.xs, QmSpace.md, QmSpace.xs),
              child: Row(
                children: <Widget>[
                  Icon(Icons.bug_report_outlined, size: 22, color: t.warning),
                  const SizedBox(width: QmSpace.lg),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: <Widget>[
                        Text('Sample data', style: t.body),
                        Text('Fictional mail. Debug builds only.', style: t.caption),
                      ],
                    ),
                  ),
                  Switch(
                    value: value,
                    onChanged: onChanged,
                    activeThumbColor: t.onAccent,
                    activeTrackColor: t.accent,
                    inactiveThumbColor: t.textSecondary,
                    inactiveTrackColor: t.panelRaised,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

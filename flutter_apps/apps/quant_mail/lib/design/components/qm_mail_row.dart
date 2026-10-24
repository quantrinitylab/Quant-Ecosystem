import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';

import '../quant_mail_tokens.dart';
import 'qm_avatar.dart';
import 'qm_chip.dart';

enum QmDensity {
  roomy(88),
  cozy(76),
  compact(56);

  const QmDensity(this.minHeight);

  /// Minimum row height in dp; rows grow with the text scale.
  final double minHeight;
}

/// A label shown as a chip inside a row.
class QmRowLabel {
  const QmRowLabel(this.name, [this.color]);

  final String name;
  final Color? color;
}

/// Three-line mail row: sender and time, subject, then attachment mark, label
/// chips (max 2 plus "+n") and the snippet. Unread = weight + dot + semantics.
class QmMailRow extends StatelessWidget {
  const QmMailRow({
    super.key,
    required this.sender,
    required this.senderEmail,
    required this.subject,
    required this.snippet,
    required this.timeLabel,
    this.unread = false,
    this.starred = false,
    this.hasAttachments = false,
    this.labels = const <QmRowLabel>[],
    this.selected = false,
    this.density = QmDensity.cozy,
    this.onTap,
    this.onLongPress,
    this.onAvatarTap,
    this.semanticActions = const <CustomSemanticsAction, VoidCallback>{},
  });

  final String sender;
  final String senderEmail;
  final String subject;
  final String snippet;
  final String timeLabel;
  final bool unread;
  final bool starred;
  final bool hasAttachments;
  final List<QmRowLabel> labels;
  final bool selected;
  final QmDensity density;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final VoidCallback? onAvatarTap;

  /// Accessibility actions that mirror every swipe (Archive, Delete, ...), so
  /// TalkBack and switch users never need the gesture.
  final Map<CustomSemanticsAction, VoidCallback> semanticActions;

  /// Spoken text: "Unread, from {sender}, {subject}, {time}, has attachments, starred".
  static String semanticsLabel({
    required bool unread,
    required String sender,
    required String subject,
    required String timeLabel,
    required bool hasAttachments,
    required bool starred,
  }) {
    return <String>[
      unread ? 'Unread' : 'Read',
      'from $sender',
      subject.isEmpty ? 'no subject' : subject,
      timeLabel,
      if (hasAttachments) 'has attachments',
      if (starred) 'starred',
    ].join(', ');
  }

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    final bool compact = density == QmDensity.compact;
    final double avatarSize = compact ? 32 : 40;
    final List<QmRowLabel> shown = labels.take(2).toList();
    final int extra = labels.length - shown.length;
    final String subjectText = subject.isEmpty ? '(no subject)' : subject;

    final Widget line1 = Row(
      children: <Widget>[
        Expanded(
          child: Text(
            sender,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: t.rowSender(unread: unread),
          ),
        ),
        const SizedBox(width: QmSpace.sm),
        Text(
          timeLabel,
          maxLines: 1,
          style: t.caption.copyWith(
            color: unread ? t.textPrimary : t.textSecondary,
            fontWeight: unread ? FontWeight.w600 : FontWeight.w500,
          ),
        ),
        if (starred) ...<Widget>[
          const SizedBox(width: QmSpace.xs),
          Icon(Icons.star_rounded, size: 18, color: t.warning),
        ],
      ],
    );

    final TextStyle subjectStyle = t.body.copyWith(
      fontWeight: unread ? FontWeight.w500 : FontWeight.w400,
      color: unread ? t.textPrimary : t.textSecondary,
    );

    final Widget line3 = Row(
      children: <Widget>[
        if (hasAttachments) ...<Widget>[
          Icon(Icons.attach_file_rounded, size: 16, color: t.textMuted),
          const SizedBox(width: QmSpace.xs),
        ],
        for (final QmRowLabel l in shown) ...<Widget>[
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 96),
            child: QmChip(label: l.name, dotColor: l.color, dense: true),
          ),
          const SizedBox(width: 6),
        ],
        if (extra > 0) ...<Widget>[
          Text('+$extra', style: t.caption),
          const SizedBox(width: 6),
        ],
        Expanded(child: Text(snippet, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.snippet)),
      ],
    );

    final Widget content = Padding(
      padding: const EdgeInsets.fromLTRB(QmSpace.gutter + 4, 10, QmSpace.gutter, 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          QmAvatar(name: sender, email: senderEmail, size: avatarSize, selected: selected, onTap: onAvatarTap),
          const SizedBox(width: QmSpace.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                line1,
                if (compact)
                  Text.rich(
                    TextSpan(children: <InlineSpan>[
                      TextSpan(text: subjectText, style: subjectStyle),
                      TextSpan(text: '  $snippet', style: t.snippet),
                    ]),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  )
                else ...<Widget>[
                  Text(subjectText, maxLines: 1, overflow: TextOverflow.ellipsis, style: subjectStyle),
                  const SizedBox(height: 2),
                  line3,
                ],
              ],
            ),
          ),
        ],
      ),
    );

    return Semantics(
      container: true,
      label: semanticsLabel(
        unread: unread,
        sender: sender,
        subject: subjectText,
        timeLabel: timeLabel,
        hasAttachments: hasAttachments,
        starred: starred,
      ),
      selected: selected,
      onTap: onTap,
      onLongPress: onLongPress,
      customSemanticsActions: semanticActions,
      child: ExcludeSemantics(
        child: Material(
          color: selected ? t.panelRaised : Colors.transparent,
          child: InkWell(
            onTap: onTap,
            onLongPress: onLongPress,
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: density.minHeight),
              child: Stack(
                children: <Widget>[
                  if (unread)
                    Positioned(
                      left: 6,
                      top: 10 + avatarSize / 2 - 4,
                      child: Container(
                        key: const ValueKey<String>('unread-dot'),
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(color: t.accent, shape: BoxShape.circle),
                      ),
                    ),
                  content,
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

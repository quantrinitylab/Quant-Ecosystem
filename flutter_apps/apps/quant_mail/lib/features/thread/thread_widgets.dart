import 'package:flutter/material.dart';
import 'package:flutter_widget_from_html_core/flutter_widget_from_html_core.dart';

import '../../data/models/mail_models.dart';
import '../../design/components/components.dart';
import '../../design/qm_format.dart';
import '../../design/quant_mail_tokens.dart';
import 'html_sanitizer.dart';

/// "3 earlier messages" row that expands the collapsed history.
class EarlierMessagesTile extends StatelessWidget {
  const EarlierMessagesTile({super.key, required this.count, required this.onTap});

  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    final String text = count == 1 ? '1 earlier message' : '$count earlier messages';
    return Semantics(
      button: true,
      label: text,
      child: ExcludeSemantics(
        child: InkWell(
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: QmSpace.minTarget),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: QmSpace.gutter, vertical: QmSpace.sm),
              child: Row(
                children: <Widget>[
                  Icon(Icons.unfold_more_rounded, size: 20, color: t.accentText),
                  const SizedBox(width: QmSpace.sm),
                  Text(text, style: t.label.copyWith(color: t.accentText)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// One-line stand-in for an older message: sender, snippet, date.
class CollapsedMessageRow extends StatelessWidget {
  const CollapsedMessageRow({super.key, required this.message, required this.onTap});

  final MailMessage message;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    final String when = qmFullDate(message.sortDate);
    return Semantics(
      button: true,
      label: 'Earlier message from ${message.from.displayName}, $when. Tap to expand.',
      child: ExcludeSemantics(
        child: InkWell(
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 56),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: QmSpace.gutter, vertical: QmSpace.sm),
              child: Row(
                children: <Widget>[
                  QmAvatar(name: message.from.displayName, email: message.from.email, size: 32),
                  const SizedBox(width: QmSpace.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: <Widget>[
                        Text(message.from.displayName, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.label.copyWith(color: t.textPrimary)),
                        Text(message.previewText, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.snippet),
                      ],
                    ),
                  ),
                  const SizedBox(width: QmSpace.sm),
                  Text(qmRowTime(message.sortDate, DateTime.now()), style: t.caption),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Expanded message: header with "to me" disclosure, body, attachments.
class ThreadMessageCard extends StatefulWidget {
  const ThreadMessageCard({
    super.key,
    required this.message,
    required this.accountEmail,
    required this.imagesAllowed,
    required this.onShowImages,
    required this.onTapLink,
  });

  final MailMessage message;
  final String accountEmail;
  final bool imagesAllowed;
  final VoidCallback onShowImages;
  final void Function(String url) onTapLink;

  @override
  State<ThreadMessageCard> createState() => _ThreadMessageCardState();
}

class _ThreadMessageCardState extends State<ThreadMessageCard> {
  bool _detailsOpen = false;
  SanitizedHtml? _sanitized;
  bool? _sanitizedFor;

  SanitizedHtml _sanitize() {
    if (_sanitized == null || _sanitizedFor != widget.imagesAllowed) {
      _sanitized = sanitizeEmailHtml(widget.message.bodyHtml, allowRemoteImages: widget.imagesAllowed);
      _sanitizedFor = widget.imagesAllowed;
    }
    return _sanitized!;
  }

  String _recipientSummary() {
    final List<MailAddress> to = widget.message.to;
    if (to.isEmpty) return 'to nobody listed';
    final String me = widget.accountEmail.toLowerCase();
    if (me.isNotEmpty && to.any((MailAddress a) => a.email.toLowerCase() == me)) {
      final int others = to.length - 1;
      return others > 0 ? 'to me and $others other${others == 1 ? '' : 's'}' : 'to me';
    }
    final int others = to.length - 1;
    return others > 0 ? 'to ${to.first.displayName} and $others other${others == 1 ? '' : 's'}' : 'to ${to.first.displayName}';
  }

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    final MailMessage m = widget.message;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: QmSpace.gutter, vertical: QmSpace.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _header(t, m),
          if (_detailsOpen) _details(t, m),
          const SizedBox(height: QmSpace.md),
          _body(t, m),
          if (m.attachments.where((MailAttachmentInfo a) => !a.isInline).isNotEmpty) ...<Widget>[
            const SizedBox(height: QmSpace.lg),
            Wrap(
              spacing: QmSpace.sm,
              runSpacing: QmSpace.sm,
              children: <Widget>[
                for (final MailAttachmentInfo a in m.attachments.where((MailAttachmentInfo a) => !a.isInline))
                  // No download path exists in this version, so no chip claims
                  // it can open the file.
                  QmAttachmentChip(name: a.filename, sizeBytes: a.size, state: QmAttachmentState.unavailable),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _header(QuantMailTokens t, MailMessage m) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        QmAvatar(name: m.from.displayName, email: m.from.email, size: 40),
        const SizedBox(width: QmSpace.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(m.from.displayName, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.rowSender(unread: true)),
              Semantics(
                button: true,
                label: _detailsOpen ? 'Hide details' : 'Show details, ${_recipientSummary()}',
                child: InkWell(
                  onTap: () => setState(() => _detailsOpen = !_detailsOpen),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: 32),
                    child: ExcludeSemantics(
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: <Widget>[
                          Flexible(
                            child: Text(_recipientSummary(), maxLines: 1, overflow: TextOverflow.ellipsis, style: t.snippet),
                          ),
                          Icon(
                            _detailsOpen ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                            size: 18,
                            color: t.textSecondary,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: QmSpace.sm),
        Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Text(qmRowTime(m.sortDate, DateTime.now()), style: t.caption),
        ),
      ],
    );
  }

  Widget _details(QuantMailTokens t, MailMessage m) {
    String join(List<MailAddress> list) => list.map((MailAddress a) => a.email).join(', ');
    Widget line(String name, String value) => Padding(
          padding: const EdgeInsets.only(bottom: 2),
          child: Text.rich(
            TextSpan(children: <InlineSpan>[
              TextSpan(text: '$name  ', style: t.caption.copyWith(color: t.textMuted)),
              TextSpan(text: value, style: t.caption.copyWith(color: t.textPrimary)),
            ]),
          ),
        );
    return Container(
      margin: const EdgeInsets.only(top: QmSpace.xs),
      padding: const EdgeInsets.all(QmSpace.md),
      decoration: BoxDecoration(
        color: t.panel,
        borderRadius: BorderRadius.circular(QmRadius.field),
        border: Border.all(color: t.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          line('From', m.from.email),
          if (m.to.isNotEmpty) line('To', join(m.to)),
          if (m.cc.isNotEmpty) line('Cc', join(m.cc)),
          line('Date', qmFullDate(m.sortDate)),
        ],
      ),
    );
  }

  Widget _body(QuantMailTokens t, MailMessage m) {
    if (m.bodyHtml.trim().isEmpty) {
      final String plain = m.bodyPlain.trim();
      return SelectableText(plain.isEmpty ? 'This message has no text.' : plain, style: t.body.copyWith(height: 1.5));
    }
    final SanitizedHtml clean = _sanitize();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        if (clean.blockedRemoteImages > 0) ...<Widget>[
          _ImagesBlockedNotice(count: clean.blockedRemoteImages, onShow: widget.onShowImages),
          const SizedBox(height: QmSpace.md),
        ],
        HtmlWidget(
          clean.html,
          textStyle: t.body.copyWith(height: 1.5),
          onTapUrl: (String url) {
            widget.onTapLink(url);
            return true;
          },
          customStylesBuilder: (element) {
            switch (element.localName) {
              case 'a':
                return <String, String>{'color': '#FF9E40', 'text-decoration': 'underline'};
              case 'blockquote':
                return <String, String>{'margin-left': '8px', 'color': '#A1A1AA'};
            }
            return null;
          },
          customWidgetBuilder: (element) {
            if (element.localName == 'img') {
              final String src = element.attributes['src'] ?? '';
              if (src.startsWith('https://')) {
                // Reached only after "Show images": the sanitiser dropped it before.
                return Image.network(
                  src,
                  fit: BoxFit.contain,
                  errorBuilder: (BuildContext _, Object __, StackTrace? ___) => const SizedBox.shrink(),
                );
              }
            }
            return null;
          },
        ),
      ],
    );
  }
}

class _ImagesBlockedNotice extends StatelessWidget {
  const _ImagesBlockedNotice({required this.count, required this.onShow});

  final int count;
  final VoidCallback onShow;

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(QmSpace.md, QmSpace.xs, QmSpace.xs, QmSpace.xs),
      decoration: BoxDecoration(
        color: t.panel,
        borderRadius: BorderRadius.circular(QmRadius.field),
        border: Border.all(color: t.hairline),
      ),
      child: Row(
        children: <Widget>[
          Icon(Icons.hide_image_outlined, size: 20, color: t.textSecondary),
          const SizedBox(width: QmSpace.sm),
          Expanded(
            child: Text(
              'Images are hidden to protect your privacy.',
              style: t.caption.copyWith(color: t.textPrimary),
            ),
          ),
          TextButton(
            onPressed: onShow,
            style: TextButton.styleFrom(
              minimumSize: const Size(QmSpace.minTarget, QmSpace.minTarget),
              foregroundColor: t.accentText,
            ),
            child: Text('Load images', style: t.label.copyWith(color: t.accentText)),
          ),
        ],
      ),
    );
  }
}

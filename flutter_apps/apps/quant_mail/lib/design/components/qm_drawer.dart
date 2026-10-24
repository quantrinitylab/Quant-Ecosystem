import 'package:flutter/material.dart';

import '../quant_mail_tokens.dart';
import 'qm_avatar.dart';

/// Left drawer container: panel fill, 304 dp wide (or 85 percent of the
/// screen on narrow phones). Compose the content from the tiles below.
class QmDrawer extends StatelessWidget {
  const QmDrawer({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    final double width = (MediaQuery.sizeOf(context).width * 0.85).clamp(0, 304).toDouble();
    return Drawer(
      width: width,
      backgroundColor: t.panel,
      shape: const RoundedRectangleBorder(),
      child: SafeArea(
        child: ListView(
          padding: const EdgeInsets.only(bottom: QmSpace.xl),
          children: children,
        ),
      ),
    );
  }
}

/// Account card at the top of the drawer. Only real session data goes in.
class QmDrawerHeader extends StatelessWidget {
  const QmDrawerHeader({super.key, required this.name, required this.email, this.onTap});

  final String name;
  final String email;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    return Semantics(
      container: true,
      label: 'Account, $name, $email',
      child: ExcludeSemantics(
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(QmSpace.lg, QmSpace.xl, QmSpace.lg, QmSpace.lg),
            child: Row(
              children: <Widget>[
                QmAvatar(name: name, email: email, size: 56),
                const SizedBox(width: QmSpace.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.subject),
                      const SizedBox(height: 2),
                      Text(email, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.snippet),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class QmDrawerSectionTitle extends StatelessWidget {
  const QmDrawerSectionTitle(this.title, {super.key});

  final String title;

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    return Semantics(
      header: true,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(QmSpace.xl, QmSpace.lg, QmSpace.lg, QmSpace.xs),
        child: Text(title.toUpperCase(), style: t.overline),
      ),
    );
  }
}

/// Folder or label row. [count] is shown only when it came from a real fetch;
/// pass null to show no number (never a made-up zero).
class QmDrawerTile extends StatelessWidget {
  const QmDrawerTile({
    super.key,
    required this.label,
    required this.onTap,
    this.icon,
    this.dotColor,
    this.count,
    this.selected = false,
  });

  final String label;
  final VoidCallback? onTap;
  final IconData? icon;
  final Color? dotColor;
  final int? count;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    final Color fg = selected ? t.textPrimary : t.textSecondary;
    return Semantics(
      button: true,
      selected: selected,
      label: count == null ? label : '$label, $count',
      child: ExcludeSemantics(
        child: Stack(
          children: <Widget>[
            Material(
              color: selected ? t.panelRaised : Colors.transparent,
              child: InkWell(
                onTap: onTap,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(minHeight: QmSpace.minTarget),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: QmSpace.xl, vertical: QmSpace.sm),
                    child: Row(
                      children: <Widget>[
                        if (icon != null) Icon(icon, size: 22, color: selected ? t.accentText : fg),
                        if (dotColor != null)
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 6),
                            child: Container(
                              width: 10,
                              height: 10,
                              decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle),
                            ),
                          ),
                        const SizedBox(width: QmSpace.lg),
                        Expanded(
                          child: Text(
                            label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: t.body.copyWith(
                              color: fg,
                              fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                            ),
                          ),
                        ),
                        if (count != null) Text('$count', style: t.caption.copyWith(color: fg)),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            if (selected)
              Positioned.fill(
                right: null,
                child: Container(width: 3, color: t.accent),
              ),
          ],
        ),
      ),
    );
  }
}

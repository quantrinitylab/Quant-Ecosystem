import 'package:flutter/material.dart';

import '../quant_mail_tokens.dart';
import 'qm_avatar.dart';

/// App-bar search entry: menu button, "Search mail" label, account avatar.
/// Tapping the label calls [onTap]; the controls at each end open the drawer.
class QmSearchPill extends StatelessWidget {
  const QmSearchPill({
    super.key,
    required this.onMenu,
    required this.accountName,
    this.accountEmail = '',
    this.onTap,
    this.onAccount,
    this.hint = 'Search mail',
  });

  final VoidCallback onMenu;
  final VoidCallback? onTap;
  final VoidCallback? onAccount;
  final String accountName;
  final String accountEmail;
  final String hint;

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    return Container(
      height: QmSpace.minTarget + 4,
      decoration: BoxDecoration(
        color: t.panel,
        borderRadius: BorderRadius.circular(QmRadius.chip),
        border: Border.all(color: t.hairline),
      ),
      child: Row(
        children: <Widget>[
          IconButton(
            tooltip: 'Open menu',
            onPressed: onMenu,
            icon: Icon(Icons.menu_rounded, color: t.textSecondary),
            constraints: const BoxConstraints(minWidth: QmSpace.minTarget, minHeight: QmSpace.minTarget),
          ),
          Expanded(
            child: Semantics(
              button: onTap != null,
              label: hint,
              child: InkWell(
                borderRadius: BorderRadius.circular(QmRadius.chip),
                onTap: onTap,
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: ExcludeSemantics(
                    child: Text(hint, style: t.body.copyWith(color: t.textMuted), maxLines: 1, overflow: TextOverflow.ellipsis),
                  ),
                ),
              ),
            ),
          ),
          QmAvatar(name: accountName, email: accountEmail, size: 32, onTap: onAccount),
          const SizedBox(width: QmSpace.xs),
        ],
      ),
    );
  }
}

class QmBarItem {
  const QmBarItem({required this.label, required this.icon, IconData? selectedIcon})
      : selectedIcon = selectedIcon ?? icon;

  final String label;
  final IconData icon;
  final IconData selectedIcon;
}

/// Pillar switcher: labelled items, selected item gets an accent pill behind
/// the icon and accent text. No count badges.
class QmBottomBar extends StatelessWidget {
  const QmBottomBar({super.key, required this.items, required this.currentIndex, required this.onSelected});

  final List<QmBarItem> items;
  final int currentIndex;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: t.panel,
        border: Border(top: BorderSide(color: t.hairline)),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 68,
          child: Row(
            children: <Widget>[
              for (int i = 0; i < items.length; i++)
                Expanded(
                  child: _BarButton(
                    item: items[i],
                    selected: i == currentIndex,
                    onTap: () => onSelected(i),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BarButton extends StatelessWidget {
  const _BarButton({required this.item, required this.selected, required this.onTap});

  final QmBarItem item;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    final Color color = selected ? t.accentText : t.textSecondary;
    return Semantics(
      button: true,
      selected: selected,
      label: item.label,
      child: InkWell(
        onTap: onTap,
        child: ExcludeSemantics(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: <Widget>[
              AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                curve: Curves.easeOutCubic,
                width: 56,
                height: 28,
                decoration: BoxDecoration(
                  color: selected ? t.accent.withValues(alpha: 0.18) : Colors.transparent,
                  borderRadius: BorderRadius.circular(QmRadius.chip),
                ),
                child: Icon(selected ? item.selectedIcon : item.icon, size: 24, color: color),
              ),
              const SizedBox(height: 2),
              Text(
                item.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: t.caption.copyWith(color: color, fontWeight: selected ? FontWeight.w600 : FontWeight.w500),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

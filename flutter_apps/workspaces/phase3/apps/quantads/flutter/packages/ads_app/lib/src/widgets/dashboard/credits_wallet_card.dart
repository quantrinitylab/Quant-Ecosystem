// ============================================================================
// ads_app - Credits wallet card (dashboard shell, UI-only)
// ============================================================================
//
// First-class Quant Credits surface: balance, stubbed earn/spend trend and a
// stubbed "Buy credits" CTA. All data comes from [StubAdsData] —
// TODO(UNVERIFIED): replace with the real wallet endpoints once the
// app-foundations/quantads spec lands. No network calls are made here.

import 'package:flutter/material.dart';

import 'stub_ads_data.dart';

/// Prominent wallet card for the Quant Credits economy.
///
/// [wallet] is positional and required. [compact] renders a shorter variant
/// for embedded contexts; the dashboard uses the full variant.
class CreditsWalletCard extends StatelessWidget {
  /// Creates the wallet card; the wallet is positional, compact optional.
  const CreditsWalletCard(
    this.wallet, {
    this.compact = false,
    super.key,
  });

  /// The stub wallet rendered by this card.
  final StubCreditsWallet wallet;

  /// Shorter variant for embedded contexts; the dashboard uses the full one.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: scheme.primary.withValues(alpha: 0.14),
                    borderRadius:
                        const BorderRadius.all(Radius.circular(10)),
                  ),
                  child: Icon(
                    Icons.account_balance_wallet,
                    color: scheme.primary,
                    size: 22,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        'Quant Credits',
                        style: textTheme.titleMedium,
                      ),
                      Text(
                        'Ecosystem wallet',
                        style: textTheme.bodySmall?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              'Available balance',
              style: textTheme.labelSmall,
            ),
            const SizedBox(height: 4),
            RichText(
              text: TextSpan(
                style: textTheme.displaySmall,
                children: <TextSpan>[
                  TextSpan(text: _formatAmount(wallet.balance)),
                  TextSpan(
                    text: ' ${wallet.currencyLabel}',
                    style: textTheme.bodySmall?.copyWith(
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            if (!compact) ...<Widget>[
              const SizedBox(height: 16),
              Row(
                children: <Widget>[
                  Expanded(
                    child: _TrendStat(
                      label: 'Earned (30d)',
                      value: '+${_formatAmount(wallet.periodEarn)}',
                      icon: Icons.trending_up_outlined,
                      color: Colors.green,
                    ),
                  ),
                  Expanded(
                    child: _TrendStat(
                      label: 'Spent (30d)',
                      value: '−${_formatAmount(wallet.periodSpend)}',
                      icon: Icons.trending_down_outlined,
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              // TODO(UNVERIFIED): wire to the real credits-purchase endpoint
              // once the app-foundations/quantads spec lands. For now the CTA
              // only explains that checkout is stubbed — no network call.
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text(
                          'Credits checkout is stubbed — '
                          'API spec pending.',
                        ),
                      ),
                    );
                  },
                  icon: const Icon(Icons.add_card_outlined),
                  label: const Text('Buy credits'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  static String _formatAmount(double value) {
    if (value >= 1000) {
      final double k = value / 1000;
      final String rendered =
          k == k.roundToDouble() ? k.toStringAsFixed(0) : k.toStringAsFixed(1);
      return '$rendered K';
    }
    return value == value.roundToDouble()
        ? value.toStringAsFixed(0)
        : value.toStringAsFixed(2);
  }
}

class _TrendStat extends StatelessWidget {
  const _TrendStat({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final TextTheme textTheme = Theme.of(context).textTheme;
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Row(
      children: <Widget>[
        Icon(icon, size: 18, color: color),
        const SizedBox(width: 8),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              label,
              style: textTheme.labelSmall?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
            ),
            Text(
              value,
              style: textTheme.bodyMedium,
            ),
          ],
        ),
      ],
    );
  }
}

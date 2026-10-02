// ============================================================================
// ads_app - Campaign list card (dashboard shell, UI-only)
// ============================================================================
//
// One campaign row: name, status chip, spend/impressions/clicks stats and a
// budget progress bar. All data is the UI-only [StubCampaign] —
// TODO(UNVERIFIED): replace with the real campaign endpoints once the
// app-foundations/quantads spec lands. No network calls are made here.

import 'package:flutter/material.dart';

import 'stub_ads_data.dart';

/// Card for a single stub campaign.
///
/// [campaign] is positional. [itemExtent] keeps the `ListView.builder`
/// uniform-height rows cheap to layout.
class CampaignCard extends StatelessWidget {
  /// Creates the card; the campaign is positional, extent optional.
  const CampaignCard(
    this.campaign, {
    this.itemExtent = 152,
    super.key,
  });

  /// The stub campaign rendered by this card.
  final StubCampaign campaign;

  /// Fixed row height, so `ListView.builder(itemExtent: …)` layouts stay cheap.
  final double itemExtent;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;

    return SizedBox(
      height: itemExtent,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Expanded(
                    child: Text(
                      campaign.name,
                      style: textTheme.titleMedium,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  _StatusChip(campaign.status),
                ],
              ),
              Row(
                children: <Widget>[
                  Expanded(
                    child: _Stat(
                      label: 'Spent',
                      value: _formatMoney(campaign.spend),
                    ),
                  ),
                  Expanded(
                    child: _Stat(
                      label: 'Impressions',
                      value: _compact(campaign.impressions),
                    ),
                  ),
                  Expanded(
                    child: _Stat(
                      label: 'Clicks',
                      value: _compact(campaign.clicks),
                    ),
                  ),
                ],
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: <Widget>[
                      Text(
                        'Budget used',
                        style: textTheme.labelSmall?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                      Text(
                        '${_formatMoney(campaign.spend)} / '
                        '${_formatMoney(campaign.budget)}',
                        style: textTheme.labelSmall?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  ClipRRect(
                    borderRadius:
                        const BorderRadius.all(Radius.circular(4)),
                    child: LinearProgressIndicator(
                      value: campaign.budgetUsedFraction,
                      minHeight: 6,
                      backgroundColor:
                          scheme.onSurfaceVariant.withValues(alpha: 0.18),
                      valueColor: AlwaysStoppedAnimation<Color>(
                        scheme.primary,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  static String _compact(int value) {
    if (value >= 1000000) {
      final double m = value / 1000000;
      return '${m.toStringAsFixed(1)}M';
    }
    if (value >= 1000) {
      final double k = value / 1000;
      return '${k.toStringAsFixed(1)}K';
    }
    return value.toString();
  }

  static String _formatMoney(double value) =>
      value == value.roundToDouble()
          ? value.toStringAsFixed(0)
          : value.toStringAsFixed(2);
}

class _StatusChip extends StatelessWidget {
  const _StatusChip(this.status);

  final StubCampaignStatus status;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;
    final Color color = switch (status) {
      StubCampaignStatus.active => scheme.primary,
      StubCampaignStatus.paused => Colors.orange,
      StubCampaignStatus.draft => scheme.onSurfaceVariant,
      StubCampaignStatus.ended => scheme.outline,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: const BorderRadius.all(Radius.circular(999)),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Text(
        status.label,
        style: textTheme.labelSmall?.copyWith(
          color: color,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final TextTheme textTheme = Theme.of(context).textTheme;
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          label,
          style: textTheme.labelSmall?.copyWith(
            color: scheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: textTheme.bodyMedium,
        ),
      ],
    );
  }
}

// ============================================================================
// ads_app - UI-only stub data for the QuantAds dashboard shell
// ============================================================================
//
// TODO(UNVERIFIED): replace every value below with real API wiring once the
// QuantAds spec lands (`app-foundations/quantads/openapi.yaml` is still
// pending). Until then these are hardcoded, presentation-only stubs used
// solely to build the dashboard UI shell — no endpoints are invented and no
// network calls are made.

/// Lifecycle state of a stub campaign (UI-only; not from any API).
enum StubCampaignStatus {
  /// Running and spending.
  active,

  /// Temporarily halted by the advertiser.
  paused,

  /// Not launched yet.
  draft,

  /// Finished; no further spend.
  ended;

  /// Short human-readable label for the status chip.
  String get label => switch (this) {
        StubCampaignStatus.active => 'Active',
        StubCampaignStatus.paused => 'Paused',
        StubCampaignStatus.draft => 'Draft',
        StubCampaignStatus.ended => 'Ended',
      };
}

/// One stub campaign row for the dashboard list (UI-only).
///
/// Positional constructor, immutable; fields are plain presentation values.
class StubCampaign {
  /// Creates a stub campaign with positional presentation fields.
  const StubCampaign(
    this.name,
    this.status,
    this.spend,
    this.budget,
    this.impressions,
    this.clicks,
  );

  /// Stub campaign display name.
  final String name;

  /// Stub lifecycle state.
  final StubCampaignStatus status;

  /// Credits spent so far (same unit as [StubCreditsWallet.balance]).
  final double spend;

  /// Total budget allocated to the campaign.
  final double budget;

  /// Stub impression count.
  final int impressions;

  /// Stub click count.
  final int clicks;

  /// Fraction of budget spent, clamped to 0..1 for the progress bar.
  double get budgetUsedFraction =>
      budget <= 0 ? 0 : (spend / budget).clamp(0.0, 1.0);
}

/// Stub Quant Credits wallet (UI-only).
class StubCreditsWallet {
  /// Creates a stub wallet with positional presentation fields.
  const StubCreditsWallet(
    this.balance,
    this.periodEarn,
    this.periodSpend,
    this.currencyLabel,
  );

  /// Current balance in Quant Credits.
  final double balance;

  /// Credits earned in the stubbed reporting period.
  final double periodEarn;

  /// Credits spent in the stubbed reporting period.
  final double periodSpend;

  /// Label shown after amounts (e.g. "credits").
  final String currencyLabel;
}

// TODO(UNVERIFIED): delete this class once the real ads endpoints are wired.
// Everything here is invented placeholder content for UI construction only.

/// Hardcoded stub data powering the dashboard UI shell only.
///
/// Not from any API: delete when the app-foundations/quantads spec lands.
abstract final class StubAdsData {
  /// Stub-only container; never instantiated.
  StubAdsData._();

  /// Stub wallet card content.
  static const StubCreditsWallet wallet = StubCreditsWallet(
    12480,
    3200,
    1985,
    'credits',
  );

  /// Stub campaign list content.
  static const List<StubCampaign> campaigns = <StubCampaign>[
    StubCampaign(
      'Diwali Sale — App Install',
      StubCampaignStatus.active,
      3420,
      8000,
      128400,
      9640,
    ),
    StubCampaign(
      'QuantChat Launch — Awareness',
      StubCampaignStatus.active,
      1250,
      5000,
      64200,
      3210,
    ),
    StubCampaign(
      'Monsoon Retargeting — Web',
      StubCampaignStatus.paused,
      4890,
      5000,
      210300,
      15420,
    ),
    StubCampaign(
      'Festive Brand Lift (Draft)',
      StubCampaignStatus.draft,
      0,
      12000,
      0,
      0,
    ),
    StubCampaign(
      'Q2 Creator Boost',
      StubCampaignStatus.ended,
      9950,
      10000,
      402800,
      28130,
    ),
  ];
}

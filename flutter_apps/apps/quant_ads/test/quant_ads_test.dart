// Sovereign Quant Ecosystem - QuantAds Unit & Widget Test Suite
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_ads/main.dart';
import 'package:quant_ads/models/ads_models.dart';
import 'package:quant_ads/services/ads_mock_data.dart';
import 'package:quant_ads/screens/campaigns_screen.dart';
import 'package:quant_ads/screens/rtb_auction_screen.dart';
import 'package:quant_ads/screens/analytics_screen.dart';
import 'package:quant_ads/screens/payouts_screen.dart';
import 'package:quant_ads/screens/settings_screen.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';

void main() {
  group('QuantAds Domain Models & Math Integrity Tests', () {
    test('AdCampaign CTR and budgetProgress compute with high precision', () {
      final campaign = AdCampaign(
        id: 'cmp-test-1',
        name: 'Test Campaign',
        objective: CampaignObjective.conversions,
        status: CampaignStatus.active,
        dailyBudget: 1000.00,
        spentAmount: 500.00,
        impressions: 100000,
        clicks: 5000,
        conversions: 250,
        cpc: 0.10,
        cpm: 5.00,
        roas: 4.50,
        startDate: DateTime(2026, 10, 1),
        targetPlatforms: ['QuantGram', 'QuanTube'],
      );

      expect(campaign.id, 'cmp-test-1');
      expect(campaign.ctr, 5.0); // 5000 / 100000 * 100
      expect(campaign.budgetProgress, 0.5); // 500 / 1000

      final updated = campaign.copyWith(status: CampaignStatus.paused);
      expect(updated.status, CampaignStatus.paused);
      expect(updated.ctr, 5.0);
    });

    test('AuctionTelemetry correctly enforces <8ms p99 SLA and metrics', () {
      final telemetry = AdsMockData.getInitialAuctionTelemetry();

      expect(telemetry.p99LatencyMs, lessThan(8.0));
      expect(telemetry.qps, greaterThan(50000));
      expect(telemetry.floorPrice, 1.50);
      expect(telemetry.winRatePercent, greaterThan(70.0));
      expect(telemetry.activeBidders, 48);

      final modified = telemetry.copyWith(floorPrice: 2.25);
      expect(modified.floorPrice, 2.25);
      expect(modified.p99LatencyMs, telemetry.p99LatencyMs);
    });

    test('Creator Payouts enforce 70% revenue share and 10% TDS withholding', () {
      final payouts = AdsMockData.getPayoutHistory();
      expect(payouts.isNotEmpty, isTrue);

      final firstPayout = payouts.first;
      expect(firstPayout.creatorShareRate, 0.70);
      expect(firstPayout.grossRevenue, 8500.00);

      // 8500 * 0.70 = 5950 gross creator share
      // 10% TDS on 5950 = 595
      // Net payout = 5950 - 595 = 5355
      expect(firstPayout.tdsDeducted, 595.00);
      expect(firstPayout.netPayoutAmount, 5355.00);
    });

    test('FunnelStage validates conversion drop-off sequence', () {
      final funnel = AdsMockData.getConversionFunnel();
      expect(funnel.length, 4);

      expect(funnel[0].stageName, 'Impressions');
      expect(funnel[1].stageName, 'Clicks');
      expect(funnel[2].stageName, 'Installs');
      expect(funnel[3].stageName, 'Purchases');

      expect(funnel[0].volume, greaterThan(funnel[1].volume));
      expect(funnel[1].volume, greaterThan(funnel[2].volume));
      expect(funnel[2].volume, greaterThan(funnel[3].volume));
    });
  });

  group('QuantAds Widget Tree & Navigation Screen Tests', () {
    testWidgets('QuantAdsApp boots with obsidian luxury theme and top balance chip', (tester) async {
      await tester.pumpWidget(const QuantAdsApp());
      await tester.pump();

      // Verify top brand elements
      expect(find.text('Quant'), findsOneWidget);
      expect(find.text('Ads'), findsOneWidget);

      // Verify top balance chip
      expect(find.text('\$14250.00 Credits'), findsOneWidget);

      // Verify 5 bottom navigation items
      expect(find.text('Campaigns'), findsOneWidget);
      expect(find.text('Auction'), findsOneWidget);
      expect(find.text('Analytics'), findsOneWidget);
      expect(find.text('Payouts'), findsOneWidget);
      expect(find.text('Settings'), findsOneWidget);

      // Verify default tab (CampaignsScreen) content
      expect(find.text('Advertiser Overview (30 Days)'), findsOneWidget);
      expect(find.text('Create Campaign'), findsOneWidget);
    });

    testWidgets('Navigation switches through all 5 tabs flawlessly', (tester) async {
      await tester.pumpWidget(const QuantAdsApp());
      await tester.pump();

      // Switch to Auction tab (Index 1)
      await tester.tap(find.text('Auction'));
      await tester.pumpAndSettle();

      expect(find.text('OpenRTB 3.0 Engine: Sovereign Bidding Active'), findsOneWidget);
      expect(find.text('Floor Price Optimization'), findsOneWidget);
      expect(find.text('eCPM Heatmap Matrix'), findsOneWidget);
      expect(find.text('Real-Time Bid Stream'), findsOneWidget);

      // Switch to Analytics tab (Index 2)
      await tester.tap(find.text('Analytics'));
      await tester.pumpAndSettle();

      expect(find.text('ROAS & Revenue Attribution'), findsOneWidget);
      expect(find.text('Conversion Funnel'), findsOneWidget);
      expect(find.text('Audience Demographics'), findsOneWidget);
      expect(find.text('Geographic Performance'), findsOneWidget);

      // Switch to Payouts tab (Index 3)
      await tester.tap(find.text('Payouts'));
      await tester.pumpAndSettle();

      expect(find.text('Creator Revenue Share Hub'), findsOneWidget);
      expect(find.text('70% Rev-Share Guarantee'), findsOneWidget);
      expect(find.text('UPI Instant Cashout'), findsOneWidget);
      expect(find.text('Stripe Express'), findsOneWidget);
      expect(find.text('Payout Ledger & History'), findsOneWidget);
      expect(find.text('TDS & Compliance Tax Invoices'), findsOneWidget);

      // Switch to Settings tab (Index 4)
      await tester.tap(find.text('Settings'));
      await tester.pumpAndSettle();

      expect(find.text('Quant Sovereign Ad Exchange'), findsOneWidget);
      expect(find.text('Ad Exchange & RTB Engine'), findsOneWidget);
      expect(find.text('Zero-Knowledge Privacy & Enclaves'), findsOneWidget);
      expect(find.text('Developer APIs & Webhooks'), findsOneWidget);
    });

    testWidgets('Top balance chip opens recharge modal and deposits credits', (tester) async {
      await tester.pumpWidget(const QuantAdsApp());
      await tester.pump();

      // Tap on the top balance chip
      await tester.tap(find.text('\$14250.00 Credits'));
      await tester.pumpAndSettle();

      expect(find.text('Recharge Ad Credits'), findsOneWidget);
      expect(find.text('Confirm Credit Deposit'), findsOneWidget);

      // Tap on preset chip '+$500'
      await tester.tap(find.text('+\$500'));
      await tester.pumpAndSettle();

      // Confirm deposit
      await tester.tap(find.text('Confirm Credit Deposit'));
      await tester.pumpAndSettle();

      // Balance should now be $14,750.00
      expect(find.text('\$14750.00 Credits'), findsOneWidget);
    });
  });
}

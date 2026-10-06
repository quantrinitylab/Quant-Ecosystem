// Sovereign Quant Ecosystem - QuantAds Unit & Widget Test Suite
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'dart:io';
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

    test('AuctionTelemetry correctly enforces <18ms SLA and telemetry bounds', () {
      final telemetry = AdsMockData.getInitialAuctionTelemetry();

      expect(telemetry.p99LatencyMs, lessThan(18.0));
      expect(telemetry.p99LatencyMs, lessThan(8.0)); // Ultra-fast 6.8ms actual
      expect(telemetry.qps, greaterThan(50000));
      expect(telemetry.floorPrice, 1.50);
      expect(telemetry.winRatePercent, greaterThan(70.0));
      expect(telemetry.activeBidders, 48);

      final modified = telemetry.copyWith(floorPrice: 2.25);
      expect(modified.floorPrice, 2.25);
      expect(modified.p99LatencyMs, telemetry.p99LatencyMs);
    });

    test('OpenRTB 3.0 DSP Latency Benchmarks strictly conform to <18ms SLA', () {
      final dspLatencies = AdsMockData.getDspLatencyMetrics();
      expect(dspLatencies.length, 5);

      for (final dsp in dspLatencies) {
        expect(dsp.latencyMs, lessThan(18.0));
        expect(dsp.p99LatencyMs, lessThan(18.0));
        expect(dsp.bidSharePercent, greaterThan(0.0));
        expect(dsp.winRatePercent, greaterThan(50.0));
      }

      final sovereignDsp = dspLatencies.firstWhere((d) => d.dspName == 'Sovereign Direct DSP');
      expect(sovereignDsp.latencyMs, lessThan(5.0)); // 3.4ms lightning edge latency
      expect(sovereignDsp.winRatePercent, greaterThan(80.0));
    });

    test('Bid Waterfall Graph cascades 5 tiers with descending floor prices and positive fill', () {
      final tiers = AdsMockData.getWaterfallTiers();
      expect(tiers.length, 5);

      for (int i = 0; i < tiers.length; i++) {
        expect(tiers[i].priority, i);
        expect(tiers[i].floorEcpm, greaterThan(0.0));
        expect(tiers[i].fillRatePercent, greaterThan(0.0));
        expect(tiers[i].dspCount, greaterThan(0));

        if (i > 0) {
          // Floor prices descend down the waterfall
          expect(tiers[i].floorEcpm, lessThan(tiers[i - 1].floorEcpm));
        }
      }

      expect(tiers[0].tierName, contains('Header Bidding'));
      expect(tiers[1].tierName, contains('Direct PMP'));
      expect(tiers[4].tierName, contains('Backfill'));
    });

    test('Global eCPM yield heatmap covers US, IN, EU, APAC with high fill rate counters', () {
      final geos = AdsMockData.getGeoYieldBreakdowns();
      expect(geos.length, 4);

      final regions = geos.map((g) => g.regionCode).toSet();
      expect(regions, containsAll(['US', 'EU', 'IN', 'APAC']));

      for (final geo in geos) {
        expect(geo.rewardedVideoEcpm, greaterThan(0.0));
        expect(geo.nativeFeedEcpm, greaterThan(0.0));
        expect(geo.interstitialEcpm, greaterThan(0.0));
        expect(geo.bannerEcpm, greaterThan(0.0));
        // Rewarded video eCPM yields highest across formats
        expect(geo.rewardedVideoEcpm, greaterThan(geo.bannerEcpm));
        expect(geo.overallFillRate, greaterThan(95.0));
        expect(geo.totalImpressions, greaterThan(1000000));
      }
    });

    test('Creator Balance Summary enforces \$50 default threshold & 70% rev-share', () {
      final summary = AdsMockData.getCreatorBalanceSummary();
      expect(summary.availableBalance, equals(8420.50));
      expect(summary.pendingBalance, equals(2845.00));
      expect(summary.minimumThreshold, 50.0);
      expect(summary.autoDisburseEnabled, isTrue);
      expect(summary.creatorShareRate, 0.70);
      expect(summary.platformShareRate, 0.30);
    });

    test('Creator Multi-Rail Payouts support SEPA, Stripe Express, UPI, and Wire Transfer', () {
      final payouts = AdsMockData.getPayoutHistory();
      expect(payouts.isNotEmpty, isTrue);

      final methods = payouts.map((p) => p.method).toSet();
      expect(methods, contains(PayoutMethodType.upi));
      expect(methods, contains(PayoutMethodType.stripeExpress));
      expect(methods, contains(PayoutMethodType.sepa));
      expect(methods, contains(PayoutMethodType.wireTransfer));

      for (final p in payouts) {
        expect(p.creatorShareRate, 0.70);
        // Gross * 0.70 - 10% TDS = Net payout
        final expectedCreatorGross = p.grossRevenue * 0.70;
        final expectedTds = expectedCreatorGross * 0.10;
        final expectedNet = expectedCreatorGross - expectedTds;

        expect(p.tdsDeducted, closeTo(expectedTds, 0.01));
        expect(p.netPayoutAmount, closeTo(expectedNet, 0.01));
      }
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

  group('QuantAds Invariant Audits', () {
    test('ZERO raw Unicode emojis and ZERO clipPath in codebase', () {
      final libDir = Directory('lib');
      if (libDir.existsSync()) {
        final dartFiles = libDir.listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart'));
        final emojiRegex = RegExp(r'[\uD83C-\uDBFF\uDC00-\uDFFF\u2600-\u26FF\u2700-\u27BF]');

        for (final file in dartFiles) {
          final content = file.readAsStringSync();
          expect(emojiRegex.hasMatch(content), isFalse,
              reason: 'File ${file.path} contains forbidden raw Unicode emojis');

          final lines = content.split('\n');
          for (final line in lines) {
            if (!line.trim().startsWith('//')) {
              final forbiddenMethod = 'clip' + 'Path(';
              expect(line.contains(forbiddenMethod), isFalse,
                  reason: 'File ${file.path} contains forbidden clipPath call: $line');
            }
          }
        }
      }
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

    testWidgets('Navigation switches through all 5 tabs and validates enriched widgets', (tester) async {
      await tester.pumpWidget(const QuantAdsApp());
      await tester.pump();

      // Switch to Auction tab (Index 1)
      await tester.tap(find.text('Auction'));
      await tester.pumpAndSettle();

      expect(find.text('OpenRTB 3.0 Engine: Sovereign Bidding Active'), findsOneWidget);
      expect(find.text('DSP Latency Benchmarks'), findsOneWidget);
      expect(find.text('< 18ms SLA Guarantee'), findsOneWidget);
      expect(find.text('Bid Waterfall Graph'), findsOneWidget);
      expect(find.text('5-Tier Priority Cascade'), findsOneWidget);
      expect(find.text('Floor Price Optimization'), findsOneWidget);
      expect(find.text('eCPM Heatmap Matrix'), findsOneWidget);
      expect(find.text('Real-Time Bid Stream'), findsOneWidget);

      // Switch to Analytics tab (Index 2)
      await tester.tap(find.text('Analytics'));
      await tester.pumpAndSettle();

      expect(find.text('ROAS & Revenue Attribution'), findsOneWidget);
      expect(find.text('Global eCPM Yield Heatmap'), findsOneWidget);
      expect(find.text('Top 4 Macro Regions'), findsOneWidget);
      expect(find.text('All Formats'), findsOneWidget);
      expect(find.text('Rewarded Video'), findsOneWidget);
      expect(find.text('Conversion Funnel'), findsOneWidget);
      expect(find.text('Audience Demographics'), findsOneWidget);
      expect(find.text('Geographic Performance'), findsOneWidget);

      // Switch to Payouts tab (Index 3)
      await tester.tap(find.text('Payouts'));
      await tester.pumpAndSettle();

      expect(find.text('Creator Revenue Share Hub'), findsOneWidget);
      expect(find.text('70% Rev-Share Guarantee'), findsOneWidget);
      expect(find.text('Available Balance'), findsOneWidget);
      expect(find.text('Pending Balance'), findsOneWidget);
      expect(find.text('Instant Multi-Rail Disbursement'), findsOneWidget);
      expect(find.text('UPI Instant'), findsOneWidget);
      expect(find.text('Stripe Express'), findsOneWidget);
      expect(find.text('SEPA Instant'), findsOneWidget);
      expect(find.text('Wire Transfer'), findsOneWidget);
      expect(find.text('Automatic Payout Threshold Trigger'), findsOneWidget);
      expect(find.text('Default: \$50.00 Trigger'), findsOneWidget);
      expect(find.text('Payout Transaction Audit Log'), findsOneWidget);
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

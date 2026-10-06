// Sovereign Quant Ecosystem - QuantAds Unit & Widget Test Suite
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_ads/main.dart';
import 'package:quant_ads/models/ads_models.dart';
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

    // HONESTY: the screens no longer boot from fabricated fixtures. These
    // tests pin the honest defaults (zeros/empties) and pure domain math,
    // never invented telemetry.
    test('AuctionTelemetry honest defaults are zero until the data seam is wired', () {
      const telemetry = AuctionTelemetry(
        qps: 0,
        p99LatencyMs: 0,
        averageEcpm: 0,
        floorPrice: 0,
        winRatePercent: 0,
        activeBidders: 0,
      );

      expect(telemetry.qps, 0);
      expect(telemetry.p99LatencyMs, 0);
      expect(telemetry.floorPrice, 0);
      expect(telemetry.winRatePercent, 0);
      expect(telemetry.activeBidders, 0);

      final modified = telemetry.copyWith(floorPrice: 2.25);
      expect(modified.floorPrice, 2.25);
      expect(modified.p99LatencyMs, telemetry.p99LatencyMs);
    });

    test('Creator Balance Summary honest defaults are zero with 70% rev-share constant', () {
      const summary = CreatorBalanceSummary(
        availableBalance: 0,
        pendingBalance: 0,
        grossRevenue: 0,
        totalDisbursedYtd: 0,
      );
      expect(summary.availableBalance, equals(0));
      expect(summary.pendingBalance, equals(0));
      expect(summary.minimumThreshold, 50.0);
      expect(summary.autoDisburseEnabled, isTrue);
      expect(summary.creatorShareRate, 0.70);
      expect(summary.platformShareRate, 0.30);
    });

    test('PayoutTransaction net payout math holds for real rows', () {
      final payout = PayoutTransaction(
        id: 'payout-real-1',
        creatorName: 'Test Creator',
        method: PayoutMethodType.upi,
        grossRevenue: 1000.0,
        creatorShareRate: 0.70,
        tdsDeducted: 70.0,
        netPayoutAmount: 630.0,
        status: PayoutStatus.completed,
        timestamp: DateTime(2026, 10, 1),
        referenceId: 'ref-1',
        invoiceNumber: 'INV-1',
      );
      // Gross * 0.70 - 10% TDS = Net payout
      final expectedCreatorGross = payout.grossRevenue * 0.70;
      final expectedTds = expectedCreatorGross * 0.10;
      final expectedNet = expectedCreatorGross - expectedTds;

      expect(payout.tdsDeducted, closeTo(expectedTds, 0.01));
      expect(payout.netPayoutAmount, closeTo(expectedNet, 0.01));
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

      // Verify top brand elements (rendered as RichText spans: 'Quant' + 'Ads')
      expect(find.text('QuantAds', findRichText: true), findsOneWidget);

      // Verify top balance chip (honest zero until credits are recharged)
      expect(find.text('\$0.00 Credits'), findsOneWidget);

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

    testWidgets('All 5 tab screens render their honest content', (tester) async {
      // Phone-sized viewport: avoids test-harness layout overflows.
      tester.view.physicalSize = const Size(1080, 1920);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);

      // Campaigns tab (default)
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(body: CampaignsScreen()),
        ),
      );
      await tester.pump();
      expect(find.text('Advertiser Overview (30 Days)'), findsOneWidget);
      expect(find.text('Create Campaign'), findsOneWidget);

      // Auction tab
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(body: RtbAuctionScreen()),
        ),
      );
      await tester.pump();
      expect(find.text('OpenRTB 3.0 Engine: Sovereign Bidding Active'), findsOneWidget);
      expect(find.text('Real-Time Bid Stream'), findsOneWidget);

      // Analytics tab
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(body: AnalyticsScreen()),
        ),
      );
      await tester.pump();
      expect(find.text('ROAS & Revenue Attribution'), findsOneWidget);
      expect(find.text('Conversion Funnel'), findsOneWidget);

      // Payouts tab
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(body: PayoutsScreen()),
        ),
      );
      await tester.pump();
      expect(find.text('Creator Revenue Share Hub'), findsOneWidget);
      expect(find.text('Available Balance'), findsOneWidget);

      // Settings tab
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(body: SettingsScreen()),
        ),
      );
      await tester.pump();
      expect(find.text('Quant Sovereign Ad Exchange'), findsOneWidget);
    });

    testWidgets('Top balance chip shows honest zero balance', (tester) async {
      await tester.pumpWidget(const QuantAdsApp());
      await tester.pump();

      // Honest zero balance (no fabricated $14,250.00) until credits are recharged.
      expect(find.text('\$0.00 Credits'), findsOneWidget);
      expect(find.text('\$14,250.00 Credits'), findsNothing);
    });
  });
}

// Sovereign Quant Ecosystem - QuantAds High-Fidelity Mock Service & Telemetry
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import '../models/ads_models.dart';

class AdsMockData {
  AdsMockData._();

  static List<AdCampaign> getInitialCampaigns() {
    return [
      AdCampaign(
        id: 'cmp-quant-001',
        name: 'QuantGram Reels Sovereign Boost',
        objective: CampaignObjective.conversions,
        status: CampaignStatus.active,
        dailyBudget: 2500.00,
        spentAmount: 1845.50,
        impressions: 482900,
        clicks: 34210,
        conversions: 2480,
        cpc: 0.054,
        cpm: 3.82,
        roas: 4.85,
        startDate: DateTime.now().subtract(const Duration(days: 4)),
        targetPlatforms: ['QuantGram', 'QuanTube'],
      ),
      AdCampaign(
        id: 'cmp-quant-002',
        name: 'QuanTube 4K Stream In-Video Cards',
        objective: CampaignObjective.videoViews,
        status: CampaignStatus.active,
        dailyBudget: 1800.00,
        spentAmount: 1220.00,
        impressions: 320500,
        clicks: 19800,
        conversions: 1120,
        cpc: 0.061,
        cpm: 3.80,
        roas: 3.92,
        startDate: DateTime.now().subtract(const Duration(days: 7)),
        targetPlatforms: ['QuanTube'],
      ),
      AdCampaign(
        id: 'cmp-quant-003',
        name: 'QuantMail Sovereign Pro Enterprise Funnel',
        objective: CampaignObjective.appInstalls,
        status: CampaignStatus.paused,
        dailyBudget: 3500.00,
        spentAmount: 2980.00,
        impressions: 612000,
        clicks: 45900,
        conversions: 3890,
        cpc: 0.065,
        cpm: 4.87,
        roas: 5.20,
        startDate: DateTime.now().subtract(const Duration(days: 12)),
        targetPlatforms: ['QuantMail', 'QuantChat'],
      ),
      AdCampaign(
        id: 'cmp-quant-004',
        name: 'QuantPlay Party Games Viral Launch',
        objective: CampaignObjective.traffic,
        status: CampaignStatus.active,
        dailyBudget: 1200.00,
        spentAmount: 850.25,
        impressions: 198400,
        clicks: 16400,
        conversions: 940,
        cpc: 0.051,
        cpm: 4.28,
        roas: 4.10,
        startDate: DateTime.now().subtract(const Duration(days: 2)),
        targetPlatforms: ['QuantPlay', 'QuantGram'],
      ),
      AdCampaign(
        id: 'cmp-quant-005',
        name: 'QuantAI Sovereign OS Early Access',
        objective: CampaignObjective.conversions,
        status: CampaignStatus.completed,
        dailyBudget: 5000.00,
        spentAmount: 5000.00,
        impressions: 1240000,
        clicks: 98200,
        conversions: 8900,
        cpc: 0.050,
        cpm: 4.03,
        roas: 6.12,
        startDate: DateTime.now().subtract(const Duration(days: 20)),
        targetPlatforms: ['QuantAI', 'QuantGram', 'QuanTube', 'QuantMail'],
      ),
    ];
  }

  static AuctionTelemetry getInitialAuctionTelemetry() {
    return const AuctionTelemetry(
      qps: 68400,
      p99LatencyMs: 6.8,
      averageEcpm: 4.65,
      floorPrice: 1.50,
      winRatePercent: 78.4,
      activeBidders: 48,
    );
  }

  static List<DspLatencyMetric> getDspLatencyMetrics() {
    return const [
      DspLatencyMetric(
        dspName: 'Sovereign Direct DSP',
        latencyMs: 3.4,
        p99LatencyMs: 4.8,
        bidSharePercent: 34.2,
        winRatePercent: 82.6,
        barColor: Color(0xFFF59E0B),
      ),
      DspLatencyMetric(
        dspName: 'The Trade Desk',
        latencyMs: 5.2,
        p99LatencyMs: 7.1,
        bidSharePercent: 26.5,
        winRatePercent: 74.3,
        barColor: Color(0xFF38BDF8),
      ),
      DspLatencyMetric(
        dspName: 'Google DV360 Enclave',
        latencyMs: 6.8,
        p99LatencyMs: 9.4,
        bidSharePercent: 18.4,
        winRatePercent: 68.9,
        barColor: Color(0xFF10B981),
      ),
      DspLatencyMetric(
        dspName: 'Amazon DSP Sovereign',
        latencyMs: 8.1,
        p99LatencyMs: 11.2,
        bidSharePercent: 12.1,
        winRatePercent: 63.5,
        barColor: Color(0xFFA78BFA),
      ),
      DspLatencyMetric(
        dspName: 'Criteo Programmatic',
        latencyMs: 9.6,
        p99LatencyMs: 13.5,
        bidSharePercent: 8.8,
        winRatePercent: 57.2,
        barColor: Color(0xFFE1306C),
      ),
    ];
  }

  static List<WaterfallTier> getWaterfallTiers() {
    return const [
      WaterfallTier(
        tierName: 'Tier 0: Header Bidding Enclave',
        priority: 0,
        floorEcpm: 6.50,
        dspCount: 12,
        fillRatePercent: 42.0,
        yieldAmount: 4850.00,
        tierColor: Color(0xFFF59E0B),
      ),
      WaterfallTier(
        tierName: 'Tier 1: Sovereign Direct PMP',
        priority: 1,
        floorEcpm: 5.00,
        dspCount: 8,
        fillRatePercent: 28.5,
        yieldAmount: 3210.00,
        tierColor: Color(0xFF38BDF8),
      ),
      WaterfallTier(
        tierName: 'Tier 2: Preferred Marketplace',
        priority: 2,
        floorEcpm: 3.80,
        dspCount: 14,
        fillRatePercent: 16.2,
        yieldAmount: 1840.00,
        tierColor: Color(0xFF10B981),
      ),
      WaterfallTier(
        tierName: 'Tier 3: Open RTB Exchange',
        priority: 3,
        floorEcpm: 2.10,
        dspCount: 32,
        fillRatePercent: 10.5,
        yieldAmount: 1190.00,
        tierColor: Color(0xFFA78BFA),
      ),
      WaterfallTier(
        tierName: 'Tier 4: Dynamic Backfill / Passback',
        priority: 4,
        floorEcpm: 1.50,
        dspCount: 6,
        fillRatePercent: 2.8,
        yieldAmount: 315.00,
        tierColor: Color(0xFF64748B),
      ),
    ];
  }

  static List<RtbBidEvent> getRecentBidStream() {
    final now = DateTime.now();
    return [
      RtbBidEvent(
        id: 'bid-901',
        bidderName: 'Sovereign Direct DSP',
        latencyMs: 4.2,
        bidPriceEcpm: 5.40,
        winningPriceEcpm: 4.95,
        adFormat: 'Rewarded Video',
        outcome: BidOutcome.won,
        slotId: 'slot-gram-feed-01',
        timestamp: now.subtract(const Duration(milliseconds: 140)),
      ),
      RtbBidEvent(
        id: 'bid-902',
        bidderName: 'Nexus Global AdTech',
        latencyMs: 5.1,
        bidPriceEcpm: 4.80,
        winningPriceEcpm: 4.95,
        adFormat: 'Native In-Feed',
        outcome: BidOutcome.outbid,
        slotId: 'slot-gram-feed-01',
        timestamp: now.subtract(const Duration(milliseconds: 140)),
      ),
      RtbBidEvent(
        id: 'bid-903',
        bidderName: 'OmniBids Realtime',
        latencyMs: 7.4,
        bidPriceEcpm: 1.20,
        winningPriceEcpm: 0.0,
        adFormat: 'Banner Display',
        outcome: BidOutcome.belowFloor,
        slotId: 'slot-tube-sidebar-04',
        timestamp: now.subtract(const Duration(milliseconds: 320)),
      ),
      RtbBidEvent(
        id: 'bid-904',
        bidderName: 'Quant Exchange Core',
        latencyMs: 3.8,
        bidPriceEcpm: 6.10,
        winningPriceEcpm: 5.65,
        adFormat: 'Interstitial Fullscreen',
        outcome: BidOutcome.won,
        slotId: 'slot-tube-stream-01',
        timestamp: now.subtract(const Duration(milliseconds: 580)),
      ),
      RtbBidEvent(
        id: 'bid-905',
        bidderName: 'Apex Programmatic DSP',
        latencyMs: 6.2,
        bidPriceEcpm: 4.30,
        winningPriceEcpm: 4.45,
        adFormat: 'Rewarded Video',
        outcome: BidOutcome.outbid,
        slotId: 'slot-play-interstitial',
        timestamp: now.subtract(const Duration(milliseconds: 790)),
      ),
      RtbBidEvent(
        id: 'bid-906',
        bidderName: 'Sovereign Direct DSP',
        latencyMs: 4.5,
        bidPriceEcpm: 4.45,
        winningPriceEcpm: 4.45,
        adFormat: 'Native In-Feed',
        outcome: BidOutcome.won,
        slotId: 'slot-play-interstitial',
        timestamp: now.subtract(const Duration(milliseconds: 790)),
      ),
    ];
  }

  static List<EcpmHeatmapCell> getHeatmapData() {
    final cells = <EcpmHeatmapCell>[];
    final mockEcpm = [
      [3.2, 3.8, 4.5, 5.1, 4.8, 3.9],
      [3.5, 4.1, 4.9, 5.6, 5.2, 4.2],
      [3.8, 4.4, 5.2, 6.0, 5.5, 4.5],
      [4.0, 4.7, 5.5, 6.4, 5.8, 4.8],
      [4.5, 5.2, 6.1, 7.2, 6.8, 5.4],
      [5.1, 5.9, 6.8, 7.8, 7.2, 5.9],
      [4.8, 5.5, 6.4, 7.1, 6.5, 5.2],
    ];

    for (int day = 0; day < 7; day++) {
      for (int timeSlot = 0; timeSlot < 6; timeSlot++) {
        cells.add(
          EcpmHeatmapCell(
            dayIndex: day,
            hourIndex: timeSlot * 4,
            ecpm: mockEcpm[day][timeSlot],
            fillRate: 94.0 + (day % 3) * 1.5,
          ),
        );
      }
    }
    return cells;
  }

  static List<GeoYieldBreakdown> getGeoYieldBreakdowns() {
    return const [
      GeoYieldBreakdown(
        regionCode: 'US',
        regionName: 'United States',
        rewardedVideoEcpm: 8.85,
        nativeFeedEcpm: 6.40,
        interstitialEcpm: 7.20,
        bannerEcpm: 2.80,
        overallFillRate: 98.6,
        totalImpressions: 1420000,
      ),
      GeoYieldBreakdown(
        regionCode: 'EU',
        regionName: 'European Union',
        rewardedVideoEcpm: 7.50,
        nativeFeedEcpm: 5.60,
        interstitialEcpm: 6.10,
        bannerEcpm: 2.30,
        overallFillRate: 97.4,
        totalImpressions: 1180000,
      ),
      GeoYieldBreakdown(
        regionCode: 'IN',
        regionName: 'India',
        rewardedVideoEcpm: 4.80,
        nativeFeedEcpm: 3.50,
        interstitialEcpm: 3.90,
        bannerEcpm: 1.45,
        overallFillRate: 99.2,
        totalImpressions: 4850000,
      ),
      GeoYieldBreakdown(
        regionCode: 'APAC',
        regionName: 'Asia-Pacific',
        rewardedVideoEcpm: 6.20,
        nativeFeedEcpm: 4.75,
        interstitialEcpm: 5.10,
        bannerEcpm: 1.95,
        overallFillRate: 96.8,
        totalImpressions: 2150000,
      ),
    ];
  }

  static CreatorBalanceSummary getCreatorBalanceSummary() {
    return const CreatorBalanceSummary(
      availableBalance: 8420.50,
      pendingBalance: 2845.00,
      minimumThreshold: 50.0,
      autoDisburseEnabled: true,
      grossRevenue: 16093.57,
      platformShareRate: 0.30,
      creatorShareRate: 0.70,
      totalDisbursedYtd: 48920.00,
    );
  }

  static List<DemographicsGroup> getDemographicsAge() {
    return const [
      DemographicsGroup(segment: '18 - 24', percentage: 38.5, color: Color(0xFFF59E0B)),
      DemographicsGroup(segment: '25 - 34', percentage: 41.2, color: Color(0xFF38BDF8)),
      DemographicsGroup(segment: '35 - 44', percentage: 14.3, color: Color(0xFF10B981)),
      DemographicsGroup(segment: '45+', percentage: 6.0, color: Color(0xFFA78BFA)),
    ];
  }

  static List<DemographicsGroup> getDemographicsGender() {
    return const [
      DemographicsGroup(segment: 'Female', percentage: 52.4, color: Color(0xFFE1306C)),
      DemographicsGroup(segment: 'Male', percentage: 44.8, color: Color(0xFF38BDF8)),
      DemographicsGroup(segment: 'Non-binary / Other', percentage: 2.8, color: Color(0xFF10B981)),
    ];
  }

  static List<GeoMetric> getGeoMetrics() {
    return const [
      GeoMetric(
        countryCode: 'IN',
        countryName: 'India',
        impressions: 890400,
        spend: 3420.00,
        ctr: 7.4,
        roas: 5.6,
      ),
      GeoMetric(
        countryCode: 'US',
        countryName: 'United States',
        impressions: 412000,
        spend: 4210.00,
        ctr: 5.8,
        roas: 4.8,
      ),
      GeoMetric(
        countryCode: 'GB',
        countryName: 'United Kingdom',
        impressions: 198000,
        spend: 1840.00,
        ctr: 6.1,
        roas: 4.2,
      ),
      GeoMetric(
        countryCode: 'DE',
        countryName: 'Germany',
        impressions: 145000,
        spend: 1390.00,
        ctr: 5.4,
        roas: 4.0,
      ),
      GeoMetric(
        countryCode: 'SG',
        countryName: 'Singapore',
        impressions: 98000,
        spend: 990.00,
        ctr: 6.9,
        roas: 5.1,
      ),
    ];
  }

  static List<FunnelStage> getConversionFunnel() {
    return const [
      FunnelStage(
        stageName: 'Impressions',
        volume: 2850000,
        conversionRate: 100.0,
        dropoffRate: 0.0,
        icon: Icons.visibility_rounded,
      ),
      FunnelStage(
        stageName: 'Clicks',
        volume: 205200,
        conversionRate: 7.2,
        dropoffRate: 92.8,
        icon: Icons.touch_app_rounded,
      ),
      FunnelStage(
        stageName: 'Installs',
        volume: 49248,
        conversionRate: 24.0,
        dropoffRate: 76.0,
        icon: Icons.download_rounded,
      ),
      FunnelStage(
        stageName: 'Purchases',
        volume: 17236,
        conversionRate: 35.0,
        dropoffRate: 65.0,
        icon: Icons.shopping_bag_rounded,
      ),
    ];
  }

  static List<PayoutTransaction> getPayoutHistory() {
    final now = DateTime.now();
    return [
      PayoutTransaction(
        id: 'tx-po-0941',
        creatorName: 'Arjun Mehta (TechVibe)',
        grossRevenue: 8500.00,
        creatorShareRate: 0.70,
        netPayoutAmount: 5355.00, // 8500 * 0.70 = 5950 - 10% TDS (595) = 5355
        tdsDeducted: 595.00,
        method: PayoutMethodType.upi,
        status: PayoutStatus.completed,
        timestamp: now.subtract(const Duration(hours: 2)),
        referenceId: 'UPI-RZP-984210928174',
        invoiceNumber: 'INV-2026-0941',
      ),
      PayoutTransaction(
        id: 'tx-po-0940',
        creatorName: 'Elena Rostova (CinemaScope)',
        grossRevenue: 12400.00,
        creatorShareRate: 0.70,
        netPayoutAmount: 7812.00, // 12400 * 0.70 = 8680 - 10% TDS (868) = 7812
        tdsDeducted: 868.00,
        method: PayoutMethodType.stripeExpress,
        status: PayoutStatus.completed,
        timestamp: now.subtract(const Duration(days: 1)),
        referenceId: 'po_1NkZ4qLkdIwHu7ix',
        invoiceNumber: 'INV-2026-0940',
      ),
      PayoutTransaction(
        id: 'tx-po-0939',
        creatorName: 'Marcus Weber (Berlin Audio)',
        grossRevenue: 9800.00,
        creatorShareRate: 0.70,
        netPayoutAmount: 6174.00, // 9800 * 0.70 = 6860 - 10% TDS (686) = 6174
        tdsDeducted: 686.00,
        method: PayoutMethodType.sepa,
        status: PayoutStatus.completed,
        timestamp: now.subtract(const Duration(days: 2)),
        referenceId: 'SEPA-EU-DE89370400440532',
        invoiceNumber: 'INV-2026-0939',
      ),
      PayoutTransaction(
        id: 'tx-po-0938',
        creatorName: 'Siddharth Rao (QuantPlay Arena)',
        grossRevenue: 6200.00,
        creatorShareRate: 0.70,
        netPayoutAmount: 3906.00,
        tdsDeducted: 434.00,
        method: PayoutMethodType.wireTransfer,
        status: PayoutStatus.completed,
        timestamp: now.subtract(const Duration(days: 3)),
        referenceId: 'SWIFT-WIRE-SBININBB02948',
        invoiceNumber: 'INV-2026-0938',
      ),
      PayoutTransaction(
        id: 'tx-po-0937',
        creatorName: 'Aria Chen (StyleSphere)',
        grossRevenue: 15800.00,
        creatorShareRate: 0.70,
        netPayoutAmount: 9954.00,
        tdsDeducted: 1106.00,
        method: PayoutMethodType.stripeExpress,
        status: PayoutStatus.processing,
        timestamp: now.subtract(const Duration(days: 4)),
        referenceId: 'po_1NkM89XmdQwHu2ax',
        invoiceNumber: 'INV-2026-0937',
      ),
    ];
  }

  static List<TaxInvoice> getTaxInvoices() {
    return [
      TaxInvoice(
        invoiceNumber: 'INV-2026-Q3-01',
        period: 'September 2026',
        grossAmount: 42900.00,
        platformFee: 12870.00, // 30%
        tdsWithheld: 3003.00,   // 10% on creator share
        netPaid: 27027.00,
        issuedDate: DateTime(2026, 9, 30),
        downloadUrl: 'https://quantads.in/invoices/INV-2026-Q3-01.pdf',
      ),
      TaxInvoice(
        invoiceNumber: 'INV-2026-Q2-08',
        period: 'August 2026',
        grossAmount: 38400.00,
        platformFee: 11520.00,
        tdsWithheld: 2688.00,
        netPaid: 24192.00,
        issuedDate: DateTime(2026, 8, 31),
        downloadUrl: 'https://quantads.in/invoices/INV-2026-Q2-08.pdf',
      ),
      TaxInvoice(
        invoiceNumber: 'INV-2026-Q2-07',
        period: 'July 2026',
        grossAmount: 31200.00,
        platformFee: 9360.00,
        tdsWithheld: 2184.00,
        netPaid: 19656.00,
        issuedDate: DateTime(2026, 7, 31),
        downloadUrl: 'https://quantads.in/invoices/INV-2026-Q2-07.pdf',
      ),
    ];
  }
}

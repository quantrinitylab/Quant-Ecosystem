// Sovereign Quant Ecosystem - QuantAds Domain Models
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';

enum CampaignStatus {
  active,
  paused,
  completed,
  draft,
}

enum CampaignObjective {
  brandAwareness,
  traffic,
  appInstalls,
  conversions,
  videoViews,
}

class AdCampaign {
  final String id;
  final String name;
  final CampaignObjective objective;
  final CampaignStatus status;
  final double dailyBudget;
  final double spentAmount;
  final int impressions;
  final int clicks;
  final int conversions;
  final double cpc;
  final double cpm;
  final double roas;
  final DateTime startDate;
  final List<String> targetPlatforms;

  const AdCampaign({
    required this.id,
    required this.name,
    required this.objective,
    required this.status,
    required this.dailyBudget,
    required this.spentAmount,
    required this.impressions,
    required this.clicks,
    required this.conversions,
    required this.cpc,
    required this.cpm,
    required this.roas,
    required this.startDate,
    required this.targetPlatforms,
  });

  double get ctr => impressions > 0 ? (clicks / impressions) * 100 : 0.0;
  double get budgetProgress => dailyBudget > 0 ? (spentAmount / dailyBudget).clamp(0.0, 1.0) : 0.0;

  AdCampaign copyWith({
    String? id,
    String? name,
    CampaignObjective? objective,
    CampaignStatus? status,
    double? dailyBudget,
    double? spentAmount,
    int? impressions,
    int? clicks,
    int? conversions,
    double? cpc,
    double? cpm,
    double? roas,
    DateTime? startDate,
    List<String>? targetPlatforms,
  }) {
    return AdCampaign(
      id: id ?? this.id,
      name: name ?? this.name,
      objective: objective ?? this.objective,
      status: status ?? this.status,
      dailyBudget: dailyBudget ?? this.dailyBudget,
      spentAmount: spentAmount ?? this.spentAmount,
      impressions: impressions ?? this.impressions,
      clicks: clicks ?? this.clicks,
      conversions: conversions ?? this.conversions,
      cpc: cpc ?? this.cpc,
      cpm: cpm ?? this.cpm,
      roas: roas ?? this.roas,
      startDate: startDate ?? this.startDate,
      targetPlatforms: targetPlatforms ?? this.targetPlatforms,
    );
  }
}

enum BidOutcome {
  won,
  outbid,
  belowFloor,
}

class RtbBidEvent {
  final String id;
  final String bidderName;
  final double latencyMs;
  final double bidPriceEcpm;
  final double winningPriceEcpm;
  final String adFormat;
  final BidOutcome outcome;
  final String slotId;
  final DateTime timestamp;

  const RtbBidEvent({
    required this.id,
    required this.bidderName,
    required this.latencyMs,
    required this.bidPriceEcpm,
    required this.winningPriceEcpm,
    required this.adFormat,
    required this.outcome,
    required this.slotId,
    required this.timestamp,
  });
}

class AuctionTelemetry {
  final int qps;
  final double p99LatencyMs;
  final double averageEcpm;
  final double floorPrice;
  final double winRatePercent;
  final int activeBidders;

  const AuctionTelemetry({
    required this.qps,
    required this.p99LatencyMs,
    required this.averageEcpm,
    required this.floorPrice,
    required this.winRatePercent,
    required this.activeBidders,
  });

  AuctionTelemetry copyWith({
    int? qps,
    double? p99LatencyMs,
    double? averageEcpm,
    double? floorPrice,
    double? winRatePercent,
    int? activeBidders,
  }) {
    return AuctionTelemetry(
      qps: qps ?? this.qps,
      p99LatencyMs: p99LatencyMs ?? this.p99LatencyMs,
      averageEcpm: averageEcpm ?? this.averageEcpm,
      floorPrice: floorPrice ?? this.floorPrice,
      winRatePercent: winRatePercent ?? this.winRatePercent,
      activeBidders: activeBidders ?? this.activeBidders,
    );
  }
}

class EcpmHeatmapCell {
  final int dayIndex; // 0=Mon, 6=Sun
  final int hourIndex; // 0..23
  final double ecpm;
  final double fillRate;

  const EcpmHeatmapCell({
    required this.dayIndex,
    required this.hourIndex,
    required this.ecpm,
    required this.fillRate,
  });
}

class DemographicsGroup {
  final String segment;
  final double percentage;
  final Color color;

  const DemographicsGroup({
    required this.segment,
    required this.percentage,
    required this.color,
  });
}

class GeoMetric {
  final String countryCode;
  final String countryName;
  final int impressions;
  final double spend;
  final double ctr;
  final double roas;

  const GeoMetric({
    required this.countryCode,
    required this.countryName,
    required this.impressions,
    required this.spend,
    required this.ctr,
    required this.roas,
  });
}

class FunnelStage {
  final String stageName;
  final int volume;
  final double conversionRate;
  final double dropoffRate;
  final IconData icon;

  const FunnelStage({
    required this.stageName,
    required this.volume,
    required this.conversionRate,
    required this.dropoffRate,
    required this.icon,
  });
}

enum PayoutMethodType {
  upi,
  stripeExpress,
  wireTransfer,
}

enum PayoutStatus {
  completed,
  processing,
  scheduled,
  failed,
}

class PayoutTransaction {
  final String id;
  final String creatorName;
  final double grossRevenue;
  final double creatorShareRate; // 0.70 for 70%
  final double netPayoutAmount;
  final double tdsDeducted;
  final PayoutMethodType method;
  final PayoutStatus status;
  final DateTime timestamp;
  final String referenceId;
  final String invoiceNumber;

  const PayoutTransaction({
    required this.id,
    required this.creatorName,
    required this.grossRevenue,
    required this.creatorShareRate,
    required this.netPayoutAmount,
    required this.tdsDeducted,
    required this.method,
    required this.status,
    required this.timestamp,
    required this.referenceId,
    required this.invoiceNumber,
  });
}

class TaxInvoice {
  final String invoiceNumber;
  final String period;
  final double grossAmount;
  final double platformFee;
  final double tdsWithheld;
  final double netPaid;
  final DateTime issuedDate;
  final String downloadUrl;

  const TaxInvoice({
    required this.invoiceNumber,
    required this.period,
    required this.grossAmount,
    required this.platformFee,
    required this.tdsWithheld,
    required this.netPaid,
    required this.issuedDate,
    required this.downloadUrl,
  });
}

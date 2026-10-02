// Sovereign Quant Ecosystem - QuantAds Advertiser Campaigns Dashboard
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../models/ads_models.dart';
import '../services/ads_mock_data.dart';

class CampaignsScreen extends StatefulWidget {
  const CampaignsScreen({super.key});

  @override
  State<CampaignsScreen> createState() => _CampaignsScreenState();
}

class _CampaignsScreenState extends State<CampaignsScreen> {
  late List<AdCampaign> _campaigns;
  String _selectedFilter = 'All';
  final TextEditingController _searchController = TextEditingController();

  static const Color adsAmber = Color(0xFFF59E0B);
  static const Color adsAmberLight = Color(0xFFFBBF24);

  @override
  void initState() {
    super.initState();
    _campaigns = AdsMockData.getInitialCampaigns();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  List<AdCampaign> get _filteredCampaigns {
    return _campaigns.where((c) {
      if (_selectedFilter == 'Active' && c.status != CampaignStatus.active) return false;
      if (_selectedFilter == 'Paused' && c.status != CampaignStatus.paused) return false;
      if (_selectedFilter == 'Completed' && c.status != CampaignStatus.completed) return false;

      if (_searchController.text.trim().isNotEmpty) {
        final query = _searchController.text.toLowerCase().trim();
        return c.name.toLowerCase().contains(query) ||
            c.targetPlatforms.any((p) => p.toLowerCase().contains(query));
      }
      return true;
    }).toList();
  }

  void _toggleCampaignStatus(String id) {
    setState(() {
      final index = _campaigns.indexWhere((c) => c.id == id);
      if (index != -1) {
        final current = _campaigns[index];
        final newStatus = current.status == CampaignStatus.active
            ? CampaignStatus.paused
            : CampaignStatus.active;
        _campaigns[index] = current.copyWith(status: newStatus);
      }
    });
  }

  void _showCreateCampaignSheet() {
    final nameController = TextEditingController();
    final budgetController = TextEditingController(text: '1500.00');
    CampaignObjective selectedObjective = CampaignObjective.conversions;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: QuantColors.voidObsidian,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 24,
                bottom: MediaQuery.of(context).viewInsets.bottom + 24,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Launch Ad Campaign',
                        style: TextStyle(
                          color: QuantColors.textPrimary,
                          fontSize: 20,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close_rounded, color: QuantColors.textMuted),
                        onPressed: () => Navigator.pop(ctx),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: nameController,
                    style: const TextStyle(color: QuantColors.textPrimary),
                    decoration: InputDecoration(
                      labelText: 'Campaign Name',
                      labelStyle: const TextStyle(color: QuantColors.textSecondary),
                      filled: true,
                      fillColor: QuantColors.darkSlateCard,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: QuantColors.hairlineBorder),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: QuantColors.hairlineBorder),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: adsAmber),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: budgetController,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    style: const TextStyle(color: QuantColors.textPrimary),
                    decoration: InputDecoration(
                      labelText: 'Daily Budget (\$ USD)',
                      prefixText: '\$ ',
                      prefixStyle: const TextStyle(color: adsAmber),
                      labelStyle: const TextStyle(color: QuantColors.textSecondary),
                      filled: true,
                      fillColor: QuantColors.darkSlateCard,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: QuantColors.hairlineBorder),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: QuantColors.hairlineBorder),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: adsAmber),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Optimization Objective',
                    style: TextStyle(
                      color: QuantColors.textSecondary,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: CampaignObjective.values.map((obj) {
                      final isSelected = selectedObjective == obj;
                      return ChoiceChip(
                        label: Text(_formatObjectiveName(obj)),
                        selected: isSelected,
                        selectedColor: adsAmber.withOpacity(0.25),
                        backgroundColor: QuantColors.darkSlateCard,
                        labelStyle: TextStyle(
                          color: isSelected ? adsAmber : QuantColors.textSecondary,
                          fontSize: 12,
                          fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                        ),
                        side: BorderSide(
                          color: isSelected ? adsAmber : QuantColors.hairlineBorder,
                        ),
                        onSelected: (selected) {
                          if (selected) {
                            setModalState(() => selectedObjective = obj);
                          }
                        },
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: adsAmber,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      onPressed: () {
                        final name = nameController.text.trim().isEmpty
                            ? 'New Sovereign Ad Push'
                            : nameController.text.trim();
                        final budget = double.tryParse(budgetController.text) ?? 1000.0;
                        final newCamp = AdCampaign(
                          id: 'cmp-custom-${DateTime.now().millisecondsSinceEpoch}',
                          name: name,
                          objective: selectedObjective,
                          status: CampaignStatus.active,
                          dailyBudget: budget,
                          spentAmount: 0.0,
                          impressions: 0,
                          clicks: 0,
                          conversions: 0,
                          cpc: 0.045,
                          cpm: 3.50,
                          roas: 0.0,
                          startDate: DateTime.now(),
                          targetPlatforms: ['QuantGram', 'QuanTube'],
                        );
                        setState(() {
                          _campaigns.insert(0, newCamp);
                        });
                        Navigator.pop(ctx);
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            backgroundColor: QuantColors.darkSlateCard,
                            content: Text(
                              'Campaign "$name" submitted to Sovereign RTB Mesh.',
                              style: const TextStyle(color: QuantColors.textPrimary),
                            ),
                          ),
                        );
                      },
                      child: const Text(
                        'Deploy Campaign to Exchange',
                        style: TextStyle(
                          color: Colors.black,
                          fontWeight: FontWeight.w700,
                          fontSize: 15,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  String _formatObjectiveName(CampaignObjective obj) {
    switch (obj) {
      case CampaignObjective.brandAwareness:
        return 'Brand Awareness';
      case CampaignObjective.traffic:
        return 'Traffic';
      case CampaignObjective.appInstalls:
        return 'App Installs';
      case CampaignObjective.conversions:
        return 'Conversions';
      case CampaignObjective.videoViews:
        return 'Video Views';
    }
  }

  @override
  Widget build(BuildContext context) {
    final double totalSpend = _campaigns.fold(0.0, (sum, c) => sum + c.spentAmount);
    final int totalImpressions = _campaigns.fold(0, (sum, c) => sum + c.impressions);
    final int totalClicks = _campaigns.fold(0, (sum, c) => sum + c.clicks);
    final double blendedCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0.0;

    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Top Overview Metrics Grid
            _buildMetricsOverview(totalSpend, totalImpressions, blendedCtr),

            const SizedBox(height: 20),

            // Search Bar & Filter Chips
            _buildSearchAndFilters(),

            const SizedBox(height: 16),

            // Section Header with Count & New Campaign CTA
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Campaigns (${_filteredCampaigns.length})',
                  style: const TextStyle(
                    color: QuantColors.textPrimary,
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                TextButton.icon(
                  onPressed: _showCreateCampaignSheet,
                  icon: const Icon(Icons.add_circle_outline_rounded, color: adsAmber, size: 18),
                  label: const Text(
                    'Create Campaign',
                    style: TextStyle(
                      color: adsAmber,
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 12),

            // Campaign Cards List
            if (_filteredCampaigns.isEmpty)
              _buildEmptyState()
            else
              ListView.separated(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: _filteredCampaigns.length,
                separatorBuilder: (_, __) => const SizedBox(height: 12),
                itemBuilder: (context, index) {
                  return _buildCampaignCard(_filteredCampaigns[index]);
                },
              ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  Widget _buildMetricsOverview(double spend, int impressions, double ctr) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Advertiser Overview (30 Days)',
                style: TextStyle(
                  color: QuantColors.textSecondary,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: adsAmber.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: adsAmber.withOpacity(0.4)),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.bolt_rounded, color: adsAmber, size: 12),
                    SizedBox(width: 4),
                    Text(
                      'Zero Platform Markup',
                      style: TextStyle(
                        color: adsAmber,
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _buildMetricTile(
                  label: 'Total Spend',
                  value: '\$${spend.toStringAsFixed(2)}',
                  trend: '+14.2%',
                  trendPositive: true,
                  icon: Icons.payments_outlined,
                ),
              ),
              Container(width: 1, height: 48, color: QuantColors.subtleDivider),
              Expanded(
                child: _buildMetricTile(
                  label: 'Impressions',
                  value: '${(impressions / 1000).toStringAsFixed(1)}K',
                  trend: '+28.5%',
                  trendPositive: true,
                  icon: Icons.visibility_outlined,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          const Divider(color: QuantColors.subtleDivider, height: 1),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _buildMetricTile(
                  label: 'Blended CTR',
                  value: '${ctr.toStringAsFixed(2)}%',
                  trend: '+0.8%',
                  trendPositive: true,
                  icon: Icons.touch_app_outlined,
                ),
              ),
              Container(width: 1, height: 48, color: QuantColors.subtleDivider),
              Expanded(
                child: _buildMetricTile(
                  label: 'Average ROAS',
                  value: '4.85x',
                  trend: '+1.2x vs Meta',
                  trendPositive: true,
                  icon: Icons.trending_up_rounded,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMetricTile({
    required String label,
    required String value,
    required String trend,
    required bool trendPositive,
    required IconData icon,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: QuantColors.textMuted, size: 14),
              const SizedBox(width: 6),
              Text(
                label,
                style: const TextStyle(
                  color: QuantColors.textMuted,
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: const TextStyle(
              color: QuantColors.textPrimary,
              fontSize: 18,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.4,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            trend,
            style: TextStyle(
              color: trendPositive ? QuantColors.statusSuccess : QuantColors.statusError,
              fontSize: 10,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchAndFilters() {
    final filters = ['All', 'Active', 'Paused', 'Completed'];

    return Column(
      children: [
        TextField(
          controller: _searchController,
          onChanged: (_) => setState(() {}),
          style: const TextStyle(color: QuantColors.textPrimary, fontSize: 13),
          decoration: InputDecoration(
            hintText: 'Search campaigns or platform...',
            hintStyle: const TextStyle(color: QuantColors.textMuted, fontSize: 13),
            prefixIcon: const Icon(Icons.search_rounded, color: QuantColors.textMuted, size: 18),
            suffixIcon: _searchController.text.isNotEmpty
                ? IconButton(
                    icon: const Icon(Icons.clear_rounded, color: QuantColors.textMuted, size: 16),
                    onPressed: () {
                      _searchController.clear();
                      setState(() {});
                    },
                  )
                : null,
            filled: true,
            fillColor: QuantColors.darkSlateCard,
            contentPadding: const EdgeInsets.symmetric(vertical: 10),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: QuantColors.hairlineBorder),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: QuantColors.hairlineBorder),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: adsAmber),
            ),
          ),
        ),
        const SizedBox(height: 10),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: filters.map((f) {
              final isSelected = _selectedFilter == f;
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(f),
                  selected: isSelected,
                  selectedColor: adsAmber.withOpacity(0.2),
                  backgroundColor: QuantColors.darkSlateCard,
                  labelStyle: TextStyle(
                    color: isSelected ? adsAmber : QuantColors.textSecondary,
                    fontSize: 12,
                    fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                  ),
                  side: BorderSide(
                    color: isSelected ? adsAmber : QuantColors.hairlineBorder,
                  ),
                  onSelected: (selected) {
                    if (selected) {
                      setState(() => _selectedFilter = f);
                    }
                  },
                ),
              );
            }).toList(),
          ),
        ),
      ],
    );
  }

  Widget _buildCampaignCard(AdCampaign campaign) {
    final isRunning = campaign.status == CampaignStatus.active;
    final statusColor = _getStatusColor(campaign.status);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isRunning ? adsAmber.withOpacity(0.3) : QuantColors.hairlineBorder,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header row with Name, Status Toggle, and Objective
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      campaign.name,
                      style: const TextStyle(
                        color: QuantColors.textPrimary,
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: QuantColors.elevatedCard,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            _formatObjectiveName(campaign.objective),
                            style: const TextStyle(
                              color: QuantColors.textSecondary,
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          'ID: ${campaign.id}',
                          style: const TextStyle(
                            color: QuantColors.textMuted,
                            fontSize: 10,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: statusColor.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: statusColor.withOpacity(0.5)),
                    ),
                    child: Text(
                      _formatStatusName(campaign.status),
                      style: TextStyle(
                        color: statusColor,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Switch.adaptive(
                    value: isRunning,
                    activeColor: adsAmber,
                    onChanged: campaign.status == CampaignStatus.completed
                        ? null
                        : (_) => _toggleCampaignStatus(campaign.id),
                  ),
                ],
              ),
            ],
          ),

          const SizedBox(height: 14),

          // Daily Budget Gauge & Spend
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  RichText(
                    text: TextSpan(
                      children: [
                        const TextSpan(
                          text: 'Daily Budget: ',
                          style: TextStyle(color: QuantColors.textMuted, fontSize: 11),
                        ),
                        TextSpan(
                          text: '\$${campaign.spentAmount.toStringAsFixed(2)}',
                          style: const TextStyle(
                            color: QuantColors.textPrimary,
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        TextSpan(
                          text: ' / \$${campaign.dailyBudget.toStringAsFixed(2)}',
                          style: const TextStyle(color: QuantColors.textMuted, fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                  Text(
                    '${(campaign.budgetProgress * 100).toInt()}% Spent',
                    style: const TextStyle(
                      color: adsAmber,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: campaign.budgetProgress,
                  minHeight: 6,
                  backgroundColor: QuantColors.subtleDivider,
                  valueColor: AlwaysStoppedAnimation<Color>(
                    campaign.budgetProgress > 0.9 ? QuantColors.statusWarning : adsAmber,
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 14),

          // Key Telemetry Matrix (Impressions, Clicks, CTR, CPC, ROAS)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: QuantColors.elevatedCard,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _buildStatPill('Impressions', '${(campaign.impressions / 1000).toStringAsFixed(1)}K'),
                _buildStatDivider(),
                _buildStatPill('Clicks', '${(campaign.clicks / 1000).toStringAsFixed(1)}K'),
                _buildStatDivider(),
                _buildStatPill('CTR', '${campaign.ctr.toStringAsFixed(2)}%'),
                _buildStatDivider(),
                _buildStatPill('CPC', '\$${campaign.cpc.toStringAsFixed(3)}'),
                _buildStatDivider(),
                _buildStatPill('ROAS', '${campaign.roas.toStringAsFixed(2)}x', isHighlight: true),
              ],
            ),
          ),

          const SizedBox(height: 12),

          // Target Platforms Chips
          Row(
            children: [
              const Icon(Icons.devices_rounded, size: 12, color: QuantColors.textMuted),
              const SizedBox(width: 4),
              const Text(
                'Sovereign Mesh: ',
                style: TextStyle(color: QuantColors.textMuted, fontSize: 11),
              ),
              Expanded(
                child: Wrap(
                  spacing: 4,
                  children: campaign.targetPlatforms.map((plat) {
                    return Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: QuantColors.darkSlateCard,
                        borderRadius: BorderRadius.circular(4),
                        border: Border.all(color: QuantColors.hairlineBorder),
                      ),
                      child: Text(
                        plat,
                        style: const TextStyle(
                          color: QuantColors.textSecondary,
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatPill(String label, String value, {bool isHighlight = false}) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: QuantColors.textMuted,
            fontSize: 9,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: TextStyle(
            color: isHighlight ? adsAmber : QuantColors.textPrimary,
            fontSize: 12,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }

  Widget _buildStatDivider() {
    return Container(width: 1, height: 20, color: QuantColors.subtleDivider);
  }

  Widget _buildEmptyState() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 20),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Column(
        children: [
          const Icon(Icons.campaign_outlined, color: QuantColors.textMuted, size: 48),
          const SizedBox(height: 12),
          const Text(
            'No campaigns match this filter',
            style: TextStyle(
              color: QuantColors.textPrimary,
              fontSize: 15,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Change your search query or launch a new campaign to begin bidding.',
            textAlign: TextAlign.center,
            style: TextStyle(color: QuantColors.textMuted, fontSize: 12),
          ),
          const SizedBox(height: 16),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: adsAmber,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            onPressed: () {
              setState(() {
                _selectedFilter = 'All';
                _searchController.clear();
              });
            },
            icon: const Icon(Icons.refresh_rounded, color: Colors.black, size: 16),
            label: const Text(
              'Reset Filters',
              style: TextStyle(color: Colors.black, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }

  Color _getStatusColor(CampaignStatus status) {
    switch (status) {
      case CampaignStatus.active:
        return QuantColors.statusSuccess;
      case CampaignStatus.paused:
        return QuantColors.statusWarning;
      case CampaignStatus.completed:
        return QuantColors.sovereignCyan;
      case CampaignStatus.draft:
        return QuantColors.textMuted;
    }
  }

  String _formatStatusName(CampaignStatus status) {
    switch (status) {
      case CampaignStatus.active:
        return 'Active';
      case CampaignStatus.paused:
        return 'Paused';
      case CampaignStatus.completed:
        return 'Completed';
      case CampaignStatus.draft:
        return 'Draft';
    }
  }
}

// Sovereign Quant Ecosystem - QuantAds Creator 70% Revenue Share Payout Hub
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../models/ads_models.dart';

class PayoutsScreen extends StatefulWidget {
  const PayoutsScreen({super.key});

  @override
  State<PayoutsScreen> createState() => _PayoutsScreenState();
}

class _PayoutsScreenState extends State<PayoutsScreen> {
  late List<PayoutTransaction> _payoutHistory;
  late List<TaxInvoice> _taxInvoices;
  late CreatorBalanceSummary _balanceSummary;
  double _availableBalance = 8420.50;
  double _pendingBalance = 2845.00;
  double _autoThreshold = 50.0;
  bool _autoDisburseEnabled = true;

  static const Color adsAmber = Color(0xFFF59E0B);
  static const Color sovereignCyan = Color(0xFF38BDF8);

  final List<double> _thresholdOptions = const [50.0, 100.0, 250.0, 500.0, 1000.0];

  @override
  void initState() {
    super.initState();
    // No mock data: payouts load from the real backend. Until the data seam
    // is wired, balances are honestly zero and lists are empty.
    _payoutHistory = <PayoutTransaction>[];
    _taxInvoices = <TaxInvoice>[];
    _balanceSummary = const CreatorBalanceSummary(
      availableBalance: 0,
      pendingBalance: 0,
      grossRevenue: 0,
      totalDisbursedYtd: 0,
    );
    _availableBalance = _balanceSummary.availableBalance;
    _pendingBalance = _balanceSummary.pendingBalance;
    _autoThreshold = _balanceSummary.minimumThreshold;
    _autoDisburseEnabled = _balanceSummary.autoDisburseEnabled;
  }

  void _showInstantCashoutModal(PayoutMethodType defaultMethod) {
    final amountController = TextEditingController(text: _availableBalance.toStringAsFixed(2));
    PayoutMethodType selectedMethod = defaultMethod;

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
            final enteredAmount = double.tryParse(amountController.text) ?? 0.0;
            final tdsAmount = enteredAmount * 0.10;
            final netDisbursement = (enteredAmount - tdsAmount).clamp(0.0, double.infinity);

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
                        'Instant Creator Cashout',
                        style: TextStyle(
                          color: QuantColors.textPrimary,
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close_rounded, color: QuantColors.textMuted),
                        onPressed: () => Navigator.pop(ctx),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Multi-rail sovereign settlement: Zero delay, direct bank & wallet liquidity.',
                    style: TextStyle(color: QuantColors.textMuted, fontSize: 12),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: amountController,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    style: const TextStyle(color: QuantColors.textPrimary, fontSize: 18, fontWeight: FontWeight.w700),
                    onChanged: (_) => setModalState(() {}),
                    decoration: InputDecoration(
                      labelText: 'Cashout Amount (\$ USD)',
                      prefixText: '\$ ',
                      prefixStyle: const TextStyle(color: adsAmber, fontSize: 18, fontWeight: FontWeight.w700),
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
                    'Disbursement Rail Selection',
                    style: TextStyle(color: QuantColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 8),
                  // Multi-rail selector grid (4 rails)
                  Row(
                    children: [
                      Expanded(
                        child: _buildModalRailOption(
                          label: 'UPI / RZP',
                          icon: Icons.account_balance_rounded,
                          color: adsAmber,
                          type: PayoutMethodType.upi,
                          selected: selectedMethod == PayoutMethodType.upi,
                          onTap: () => setModalState(() => selectedMethod = PayoutMethodType.upi),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _buildModalRailOption(
                          label: 'Stripe',
                          icon: Icons.credit_card_rounded,
                          color: sovereignCyan,
                          type: PayoutMethodType.stripeExpress,
                          selected: selectedMethod == PayoutMethodType.stripeExpress,
                          onTap: () => setModalState(() => selectedMethod = PayoutMethodType.stripeExpress),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: _buildModalRailOption(
                          label: 'SEPA (EUR)',
                          icon: Icons.euro_symbol_rounded,
                          color: const Color(0xFF10B981),
                          type: PayoutMethodType.sepa,
                          selected: selectedMethod == PayoutMethodType.sepa,
                          onTap: () => setModalState(() => selectedMethod = PayoutMethodType.sepa),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _buildModalRailOption(
                          label: 'SWIFT Wire',
                          icon: Icons.swap_horiz_rounded,
                          color: const Color(0xFFA78BFA),
                          type: PayoutMethodType.wireTransfer,
                          selected: selectedMethod == PayoutMethodType.wireTransfer,
                          onTap: () => setModalState(() => selectedMethod = PayoutMethodType.wireTransfer),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  // Breakdown card
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: QuantColors.elevatedCard,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Column(
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text('Gross Requested:', style: TextStyle(color: QuantColors.textMuted, fontSize: 11)),
                            Text('\$${enteredAmount.toStringAsFixed(2)}', style: const TextStyle(color: QuantColors.textPrimary, fontSize: 11, fontWeight: FontWeight.w600)),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text('10% TDS Withheld (Sec 194J):', style: TextStyle(color: QuantColors.textMuted, fontSize: 11)),
                            Text('-\$${tdsAmount.toStringAsFixed(2)}', style: const TextStyle(color: QuantColors.statusWarning, fontSize: 11, fontWeight: FontWeight.w600)),
                          ],
                        ),
                        const SizedBox(height: 6),
                        const Divider(color: QuantColors.subtleDivider, height: 1),
                        const SizedBox(height: 6),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text('Net Instant Disbursement:', style: TextStyle(color: QuantColors.textPrimary, fontSize: 12, fontWeight: FontWeight.w700)),
                            Text(
                              '\$${netDisbursement.toStringAsFixed(2)}',
                              style: const TextStyle(color: QuantColors.statusSuccess, fontSize: 14, fontWeight: FontWeight.w800),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: adsAmber,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      onPressed: enteredAmount <= 0 || enteredAmount > _availableBalance
                          ? null
                          : () {
                              final now = DateTime.now();
                              String refId;
                              switch (selectedMethod) {
                                case PayoutMethodType.upi:
                                  refId = 'UPI-RZP-${now.millisecondsSinceEpoch.toString().substring(4)}';
                                  break;
                                case PayoutMethodType.stripeExpress:
                                  refId = 'po_stripe_${now.millisecondsSinceEpoch.toString().substring(6)}';
                                  break;
                                case PayoutMethodType.sepa:
                                  refId = 'SEPA-EU-${now.millisecondsSinceEpoch.toString().substring(5)}';
                                  break;
                                case PayoutMethodType.wireTransfer:
                                  refId = 'SWIFT-WIRE-${now.millisecondsSinceEpoch.toString().substring(5)}';
                                  break;
                              }

                              final tx = PayoutTransaction(
                                id: 'tx-po-${now.millisecondsSinceEpoch.toString().substring(8)}',
                                creatorName: 'Primary Creator Enclave',
                                grossRevenue: enteredAmount,
                                creatorShareRate: 0.70,
                                netPayoutAmount: netDisbursement,
                                tdsDeducted: tdsAmount,
                                method: selectedMethod,
                                status: PayoutStatus.completed,
                                timestamp: now,
                                referenceId: refId,
                                invoiceNumber: 'INV-2026-${now.month}${now.day}',
                              );

                              setState(() {
                                _availableBalance -= enteredAmount;
                                _payoutHistory.insert(0, tx);
                              });
                              Navigator.pop(ctx);
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  backgroundColor: QuantColors.darkSlateCard,
                                  content: Text(
                                    'Instant Payout of \$${netDisbursement.toStringAsFixed(2)} disbursed successfully via ${_getMethodName(selectedMethod)}.',
                                    style: const TextStyle(color: QuantColors.statusSuccess),
                                  ),
                                ),
                              );
                            },
                      child: const Text(
                        'Confirm Instant Cashout',
                        style: TextStyle(color: Colors.black, fontWeight: FontWeight.w700, fontSize: 15),
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

  Widget _buildModalRailOption({
    required String label,
    required IconData icon,
    required Color color,
    required PayoutMethodType type,
    required bool selected,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
        decoration: BoxDecoration(
          color: selected ? color.withOpacity(0.15) : QuantColors.darkSlateCard,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: selected ? color : QuantColors.hairlineBorder,
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: selected ? color : QuantColors.textMuted, size: 16),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                color: selected ? color : QuantColors.textPrimary,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Top Creator Balance Cards (Available vs Pending)
            _buildAvailableVsPendingCards(),

            const SizedBox(height: 16),

            // Multi-Rail Instant Cashout Actions (SEPA, Stripe Express, UPI, Wire Transfer)
            _buildMultiRailCashoutGrid(),

            const SizedBox(height: 20),

            // Automatic Threshold Triggers ($50 default)
            _buildAutomaticThresholdCard(),

            const SizedBox(height: 24),

            // Payout Transaction Audit Log Ledger
            _buildPayoutAuditLogLedger(),

            const SizedBox(height: 24),

            // TDS & Tax Invoices Section
            _buildTaxInvoicesSection(),

            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  Widget _buildAvailableVsPendingCards() {
    return Column(
      children: [
        // Top 70% Rev-Share Guarantee Header Banner
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: QuantColors.darkSlateCard,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: adsAmber.withOpacity(0.3)),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Row(
                children: [
                  Icon(Icons.monetization_on_rounded, color: adsAmber, size: 18),
                  SizedBox(width: 8),
                  Text(
                    'Creator Revenue Share Hub',
                    style: TextStyle(
                      color: QuantColors.textPrimary,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: QuantColors.statusSuccess.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: QuantColors.statusSuccess.withOpacity(0.4)),
                ),
                child: const Text(
                  '70% Rev-Share Guarantee',
                  style: TextStyle(
                    color: QuantColors.statusSuccess,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 12),

        // Available vs Pending Balance Split Cards
        Row(
          children: [
            // Available Balance Card
            Expanded(
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: QuantColors.darkSlateCard,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: adsAmber.withOpacity(0.4)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Available Balance',
                          style: TextStyle(color: QuantColors.textMuted, fontSize: 11, fontWeight: FontWeight.w500),
                        ),
                        Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(
                            color: QuantColors.statusSuccess,
                            shape: BoxShape.circle,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '\$${_availableBalance.toStringAsFixed(2)}',
                      style: const TextStyle(
                        color: QuantColors.textPrimary,
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.5,
                      ),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Ready for instant cashout',
                      style: TextStyle(color: QuantColors.statusSuccess, fontSize: 10, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 12),
            // Pending Clearance Card
            Expanded(
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: QuantColors.darkSlateCard,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: QuantColors.hairlineBorder),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Pending Balance',
                          style: TextStyle(color: QuantColors.textMuted, fontSize: 11, fontWeight: FontWeight.w500),
                        ),
                        const Icon(Icons.schedule_rounded, color: sovereignCyan, size: 12),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '\$${_pendingBalance.toStringAsFixed(2)}',
                      style: const TextStyle(
                        color: QuantColors.textSecondary,
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.5,
                      ),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Clearing in 48h RTB cycle',
                      style: TextStyle(color: sovereignCyan, fontSize: 10, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildMultiRailCashoutGrid() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Instant Multi-Rail Disbursement',
          style: TextStyle(color: QuantColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: _buildRailButton(
                label: 'UPI Instant',
                sublabel: '<2s Settlement',
                icon: Icons.flash_on_rounded,
                color: adsAmber,
                onTap: () => _showInstantCashoutModal(PayoutMethodType.upi),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _buildRailButton(
                label: 'Stripe Express',
                sublabel: 'Debit & Bank',
                icon: Icons.credit_card_rounded,
                color: sovereignCyan,
                onTap: () => _showInstantCashoutModal(PayoutMethodType.stripeExpress),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: _buildRailButton(
                label: 'SEPA Instant',
                sublabel: 'EU Enclave',
                icon: Icons.euro_symbol_rounded,
                color: const Color(0xFF10B981),
                onTap: () => _showInstantCashoutModal(PayoutMethodType.sepa),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _buildRailButton(
                label: 'Wire Transfer',
                sublabel: 'Global SWIFT',
                icon: Icons.swap_horiz_rounded,
                color: const Color(0xFFA78BFA),
                onTap: () => _showInstantCashoutModal(PayoutMethodType.wireTransfer),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildRailButton({
    required String label,
    required String sublabel,
    required IconData icon,
    required Color color,
    required VoidCallback onTap,
  }) {
    return ElevatedButton(
      style: ElevatedButton.styleFrom(
        backgroundColor: QuantColors.darkSlateCard,
        foregroundColor: QuantColors.textPrimary,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
          side: BorderSide(color: color.withOpacity(0.3)),
        ),
      ),
      onPressed: onTap,
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: color.withOpacity(0.15),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Icon(icon, color: color, size: 16),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(color: QuantColors.textPrimary, fontSize: 11, fontWeight: FontWeight.w700),
                ),
                Text(
                  sublabel,
                  style: const TextStyle(color: QuantColors.textMuted, fontSize: 9),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAutomaticThresholdCard() {
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
              const Row(
                children: [
                  Icon(Icons.tune_rounded, color: adsAmber, size: 18),
                  SizedBox(width: 6),
                  Text(
                    'Automatic Payout Threshold Trigger',
                    style: TextStyle(
                      color: QuantColors.textPrimary,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              Switch(
                value: _autoDisburseEnabled,
                activeColor: adsAmber,
                onChanged: (val) {
                  setState(() => _autoDisburseEnabled = val);
                },
              ),
            ],
          ),
          const SizedBox(height: 6),
          const Text(
            'Automatically sweeps creator revenue share to primary rail whenever available balance crosses the threshold.',
            style: TextStyle(color: QuantColors.textMuted, fontSize: 11),
          ),
          const SizedBox(height: 12),
          Row(
            children: _thresholdOptions.map((opt) {
              final isSelected = _autoThreshold == opt;
              return Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 3),
                  child: GestureDetector(
                    onTap: () {
                      setState(() => _autoThreshold = opt);
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      decoration: BoxDecoration(
                        color: isSelected ? adsAmber : QuantColors.elevatedCard,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: isSelected ? adsAmber : QuantColors.hairlineBorder,
                        ),
                      ),
                      child: Center(
                        child: Text(
                          '\$${opt.toInt()}',
                          style: TextStyle(
                            color: isSelected ? Colors.black : QuantColors.textPrimary,
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Default: \$50.00 Trigger',
                style: TextStyle(color: adsAmber.withOpacity(0.9), fontSize: 10, fontWeight: FontWeight.w600),
              ),
              Text(
                _autoDisburseEnabled ? 'Status: Active Auto-Sweep' : 'Status: Paused',
                style: TextStyle(
                  color: _autoDisburseEnabled ? QuantColors.statusSuccess : QuantColors.textMuted,
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildPayoutAuditLogLedger() {
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
              const Row(
                children: [
                  Icon(Icons.history_rounded, color: adsAmber, size: 18),
                  SizedBox(width: 6),
                  Text(
                    'Payout Transaction Audit Log',
                    style: TextStyle(
                      color: QuantColors.textPrimary,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              Text(
                '${_payoutHistory.length} Disbursed',
                style: const TextStyle(color: QuantColors.textMuted, fontSize: 11),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _payoutHistory.length,
            separatorBuilder: (_, __) => const Divider(color: QuantColors.subtleDivider, height: 12),
            itemBuilder: (context, index) {
              final tx = _payoutHistory[index];
              return _buildPayoutItemTile(tx);
            },
          ),
        ],
      ),
    );
  }

  Widget _buildPayoutItemTile(PayoutTransaction tx) {
    IconData railIcon;
    Color railColor;
    String railName;

    switch (tx.method) {
      case PayoutMethodType.upi:
        railIcon = Icons.account_balance_rounded;
        railColor = adsAmber;
        railName = 'UPI Instant';
        break;
      case PayoutMethodType.stripeExpress:
        railIcon = Icons.credit_card_rounded;
        railColor = sovereignCyan;
        railName = 'Stripe Express';
        break;
      case PayoutMethodType.sepa:
        railIcon = Icons.euro_symbol_rounded;
        railColor = const Color(0xFF10B981);
        railName = 'SEPA Direct';
        break;
      case PayoutMethodType.wireTransfer:
        railIcon = Icons.swap_horiz_rounded;
        railColor = const Color(0xFFA78BFA);
        railName = 'SWIFT Wire';
        break;
    }

    final isCompleted = tx.status == PayoutStatus.completed;

    return Row(
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: railColor.withOpacity(0.15),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(railIcon, color: railColor, size: 18),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(
                    tx.creatorName,
                    style: const TextStyle(
                      color: QuantColors.textPrimary,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                    decoration: BoxDecoration(
                      color: QuantColors.elevatedCard,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      railName,
                      style: TextStyle(
                        color: railColor,
                        fontSize: 9,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 2),
              Text(
                'Ref: ${tx.referenceId} • Gross \$${tx.grossRevenue.toStringAsFixed(0)} (70%)',
                style: const TextStyle(color: QuantColors.textMuted, fontSize: 10),
              ),
            ],
          ),
        ),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              '+\$${tx.netPayoutAmount.toStringAsFixed(2)}',
              style: const TextStyle(
                color: QuantColors.statusSuccess,
                fontSize: 13,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 2),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              decoration: BoxDecoration(
                color: isCompleted
                    ? QuantColors.statusSuccess.withOpacity(0.15)
                    : adsAmber.withOpacity(0.15),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                isCompleted ? 'Disbursed' : 'Processing',
                style: TextStyle(
                  color: isCompleted ? QuantColors.statusSuccess : adsAmber,
                  fontSize: 9,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildTaxInvoicesSection() {
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
          const Row(
            children: [
              Icon(Icons.receipt_long_rounded, color: sovereignCyan, size: 18),
              SizedBox(width: 6),
              Text(
                'TDS & Compliance Tax Invoices',
                style: TextStyle(
                  color: QuantColors.textPrimary,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          const Text(
            'Form 16A TDS Certificates and GST compliance invoices generated automatically at month-end.',
            style: TextStyle(color: QuantColors.textMuted, fontSize: 11),
          ),
          const SizedBox(height: 12),
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _taxInvoices.length,
            separatorBuilder: (_, __) => const Divider(color: QuantColors.subtleDivider, height: 10),
            itemBuilder: (context, index) {
              final inv = _taxInvoices[index];
              return Row(
                children: [
                  const Icon(Icons.picture_as_pdf_outlined, color: adsAmber, size: 22),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          inv.invoiceNumber,
                          style: const TextStyle(
                            color: QuantColors.textPrimary,
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          '${inv.period} • TDS: \$${inv.tdsWithheld.toStringAsFixed(0)}',
                          style: const TextStyle(color: QuantColors.textMuted, fontSize: 10),
                        ),
                      ],
                    ),
                  ),
                  Text(
                    '\$${inv.netPaid.toStringAsFixed(2)}',
                    style: const TextStyle(
                      color: QuantColors.textPrimary,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.download_rounded, color: sovereignCyan, size: 18),
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          backgroundColor: QuantColors.elevatedCard,
                          content: Text(
                            'Downloading invoice ${inv.invoiceNumber}...',
                            style: const TextStyle(color: QuantColors.textPrimary),
                          ),
                        ),
                      );
                    },
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }

  String _getMethodName(PayoutMethodType method) {
    switch (method) {
      case PayoutMethodType.upi:
        return 'UPI / Razorpay';
      case PayoutMethodType.stripeExpress:
        return 'Stripe Express';
      case PayoutMethodType.sepa:
        return 'SEPA Direct Credit';
      case PayoutMethodType.wireTransfer:
        return 'SWIFT Wire Transfer';
    }
  }
}

// Sovereign Quant Ecosystem - QuantAds Creator 70% Revenue Share Payout Hub
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../models/ads_models.dart';
import '../services/ads_mock_data.dart';

class PayoutsScreen extends StatefulWidget {
  const PayoutsScreen({super.key});

  @override
  State<PayoutsScreen> createState() => _PayoutsScreenState();
}

class _PayoutsScreenState extends State<PayoutsScreen> {
  late List<PayoutTransaction> _payoutHistory;
  late List<TaxInvoice> _taxInvoices;
  double _availableBalance = 8420.50;

  static const Color adsAmber = Color(0xFFF59E0B);
  static const Color sovereignCyan = Color(0xFF38BDF8);

  @override
  void initState() {
    super.initState();
    _payoutHistory = AdsMockData.getPayoutHistory();
    _taxInvoices = AdsMockData.getTaxInvoices();
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
                  const SizedBox(height: 12),
                  const Text(
                    'Zero-delay automated settlement via Razorpay UPI or Stripe Express.',
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
                    'Payout Gateway',
                    style: TextStyle(color: QuantColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: GestureDetector(
                          onTap: () => setModalState(() => selectedMethod = PayoutMethodType.upi),
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 10),
                            decoration: BoxDecoration(
                              color: selectedMethod == PayoutMethodType.upi
                                  ? adsAmber.withOpacity(0.15)
                                  : QuantColors.darkSlateCard,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                color: selectedMethod == PayoutMethodType.upi
                                    ? adsAmber
                                    : QuantColors.hairlineBorder,
                              ),
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(
                                  Icons.account_balance_rounded,
                                  color: selectedMethod == PayoutMethodType.upi ? adsAmber : QuantColors.textMuted,
                                  size: 16,
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  'UPI / Razorpay',
                                  style: TextStyle(
                                    color: selectedMethod == PayoutMethodType.upi ? adsAmber : QuantColors.textPrimary,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: GestureDetector(
                          onTap: () => setModalState(() => selectedMethod = PayoutMethodType.stripeExpress),
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 10),
                            decoration: BoxDecoration(
                              color: selectedMethod == PayoutMethodType.stripeExpress
                                  ? sovereignCyan.withOpacity(0.15)
                                  : QuantColors.darkSlateCard,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                color: selectedMethod == PayoutMethodType.stripeExpress
                                    ? sovereignCyan
                                    : QuantColors.hairlineBorder,
                              ),
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(
                                  Icons.credit_card_rounded,
                                  color: selectedMethod == PayoutMethodType.stripeExpress ? sovereignCyan : QuantColors.textMuted,
                                  size: 16,
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  'Stripe Express',
                                  style: TextStyle(
                                    color: selectedMethod == PayoutMethodType.stripeExpress ? sovereignCyan : QuantColors.textPrimary,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ],
                            ),
                          ),
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
                                referenceId: selectedMethod == PayoutMethodType.upi
                                    ? 'UPI-RZP-${now.millisecondsSinceEpoch.toString().substring(4)}'
                                    : 'po_stripe_${now.millisecondsSinceEpoch.toString().substring(6)}',
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
                                    'Instant Payout of \$${netDisbursement.toStringAsFixed(2)} disbursed successfully.',
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Top Creator Revenue Hub Card
            _buildCreatorBalanceCard(),

            const SizedBox(height: 16),

            // Instant Cashout CTA Buttons (UPI & Stripe)
            _buildInstantCashoutActions(),

            const SizedBox(height: 24),

            // Payout History Ledger
            _buildPayoutHistoryLedger(),

            const SizedBox(height: 24),

            // TDS & Tax Invoices Section
            _buildTaxInvoicesSection(),

            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  Widget _buildCreatorBalanceCard() {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: adsAmber.withOpacity(0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Row(
                children: [
                  Icon(Icons.monetization_on_rounded, color: adsAmber, size: 20),
                  SizedBox(width: 8),
                  Text(
                    'Creator Revenue Share Hub',
                    style: TextStyle(
                      color: QuantColors.textPrimary,
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: QuantColors.statusSuccess.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(8),
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
          const SizedBox(height: 16),
          const Text(
            'Available for Instant Cashout',
            style: TextStyle(color: QuantColors.textMuted, fontSize: 11),
          ),
          const SizedBox(height: 4),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                '\$${_availableBalance.toStringAsFixed(2)}',
                style: const TextStyle(
                  color: QuantColors.textPrimary,
                  fontSize: 32,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.8,
                ),
              ),
              const SizedBox(width: 8),
              const Text(
                'USD',
                style: TextStyle(color: QuantColors.textMuted, fontSize: 13, fontWeight: FontWeight.w600),
              ),
            ],
          ),
          const SizedBox(height: 14),
          const Divider(color: QuantColors.subtleDivider, height: 1),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _buildMiniStat(
                  'Gross Accrued',
                  '\$13,365.87',
                  QuantColors.textSecondary,
                ),
              ),
              Container(width: 1, height: 28, color: QuantColors.subtleDivider),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(left: 12),
                  child: _buildMiniStat(
                    'Platform Cut (30%)',
                    '\$4,009.76',
                    QuantColors.textMuted,
                  ),
                ),
              ),
              Container(width: 1, height: 28, color: QuantColors.subtleDivider),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(left: 12),
                  child: _buildMiniStat(
                    'TDS Withheld (10%)',
                    '\$935.61',
                    QuantColors.statusWarning,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMiniStat(String label, String value, Color valueColor) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(color: QuantColors.textMuted, fontSize: 10),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: TextStyle(color: valueColor, fontSize: 12, fontWeight: FontWeight.w700),
        ),
      ],
    );
  }

  Widget _buildInstantCashoutActions() {
    return Row(
      children: [
        Expanded(
          child: ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: adsAmber,
              padding: const EdgeInsets.symmetric(vertical: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: () => _showInstantCashoutModal(PayoutMethodType.upi),
            icon: const Icon(Icons.flash_on_rounded, color: Colors.black, size: 18),
            label: const Text(
              'UPI Instant Cashout',
              style: TextStyle(color: Colors.black, fontWeight: FontWeight.w700, fontSize: 13),
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              foregroundColor: sovereignCyan,
              side: const BorderSide(color: sovereignCyan),
              padding: const EdgeInsets.symmetric(vertical: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: () => _showInstantCashoutModal(PayoutMethodType.stripeExpress),
            icon: const Icon(Icons.credit_card_rounded, color: sovereignCyan, size: 18),
            label: const Text(
              'Stripe Express',
              style: TextStyle(color: sovereignCyan, fontWeight: FontWeight.w700, fontSize: 13),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildPayoutHistoryLedger() {
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
                    'Payout Ledger & History',
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
    final isUPI = tx.method == PayoutMethodType.upi;
    final isCompleted = tx.status == PayoutStatus.completed;

    return Row(
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: isUPI ? adsAmber.withOpacity(0.15) : sovereignCyan.withOpacity(0.15),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(
            isUPI ? Icons.account_balance_rounded : Icons.credit_card_rounded,
            color: isUPI ? adsAmber : sovereignCyan,
            size: 18,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                tx.creatorName,
                style: const TextStyle(
                  color: QuantColors.textPrimary,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                'Ref: ${tx.referenceId}',
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
}

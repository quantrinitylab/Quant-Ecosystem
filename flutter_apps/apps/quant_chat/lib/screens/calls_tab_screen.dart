// Sovereign Quant Ecosystem - QuantChat Calls History & Telemetry Screen
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_theme/quant_theme.dart';
import '../models/chat_models.dart';
import '../services/chat_mock_data.dart';
import '../widgets/call_sheet.dart';
import 'call_screen.dart';

class CallsTabScreen extends StatefulWidget {
  const CallsTabScreen({super.key});

  @override
  State<CallsTabScreen> createState() => _CallsTabScreenState();
}

class _CallsTabScreenState extends State<CallsTabScreen> {
  late List<CallHistoryItem> _calls;

  @override
  void initState() {
    super.initState();
    _calls = ChatMockData.getInitialCallHistory();
  }

  void _initiateCall(CallHistoryItem item) {
    final conv = ChatConversation(
      id: 'conv-${item.id}',
      contactId: 'contact-${item.id}',
      name: item.contactName,
      avatarInitials: item.contactInitials,
      avatarColor: item.contactAvatarColor,
      lastMessage: 'Call log',
      lastMessageTime: item.timestamp,
      isOnline: true,
    );

    WebRTCCallSheet.show(
      context,
      conversation: conv,
      callType: item.callType,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
          children: [
            // E2EE Call Quality Summary Card
            _buildQualitySummaryCard(),
            const SizedBox(height: 16),

            // Recent Calls Header
            const Row(
              children: [
                Icon(Icons.history_rounded, size: 14, color: QuantColors.textMuted),
                SizedBox(width: 6),
                Text(
                  'RECENT E2EE CALLS',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.8,
                    color: QuantColors.textMuted,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),

            // Call History Items
            ..._calls.map((c) => _buildCallTile(c)),
          ],
        ),
      ),
      floatingActionButton: Padding(
        padding: const EdgeInsets.only(bottom: 72),
        child: FloatingActionButton(
          backgroundColor: QuantColors.statusSuccess,
          foregroundColor: Colors.white,
          elevation: 4,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          onPressed: () {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                backgroundColor: QuantColors.darkSlateCard,
                content: Text(
                  'Opening sovereign peer dialer (<18ms mesh)...',
                  style: TextStyle(color: QuantColors.textPrimary),
                ),
              ),
            );
          },
          child: const Icon(Icons.add_call, size: 24),
        ),
      ),
    );
  }

  Widget _buildQualitySummaryCard() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: QuantColors.statusSuccess.withOpacity(0.16),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.verified_user_rounded,
                  color: QuantColors.statusSuccess,
                  size: 22,
                ),
              ),
              const SizedBox(width: 12),
              const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'WebRTC Sovereign Mesh',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                  SizedBox(height: 2),
                  Text(
                    'Average latency: 16.8ms | 0% packet loss',
                    style: TextStyle(
                      fontSize: 11,
                      color: QuantColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ],
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: QuantColors.elevatedCard,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: QuantColors.hairlineBorder),
            ),
            child: const Text(
              'HEALTHY',
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w800,
                color: QuantColors.statusSuccess,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCallTile(CallHistoryItem item) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: QuantColors.darkSlateCard,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: QuantColors.hairlineBorder),
        ),
        child: Row(
          children: [
            // Contact Avatar
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: item.contactAvatarColor.withOpacity(0.2),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: item.contactAvatarColor.withOpacity(0.5), width: 1.2),
              ),
              child: Center(
                child: Text(
                  item.contactInitials,
                  style: TextStyle(
                    color: item.contactAvatarColor,
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 12),

            // Call Details
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.contactName,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Row(
                    children: [
                      Icon(
                        item.isMissed
                            ? Icons.call_missed_rounded
                            : (item.isIncoming
                                ? Icons.call_received_rounded
                                : Icons.call_made_rounded),
                        size: 13,
                        color: item.isMissed
                            ? QuantColors.statusError
                            : QuantColors.statusSuccess,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        '${item.timestamp} | ${item.duration}',
                        style: TextStyle(
                          fontSize: 11,
                          color: item.isMissed
                              ? QuantColors.statusError
                              : QuantColors.textMuted,
                          fontWeight: item.isMissed ? FontWeight.w600 : FontWeight.w400,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            // Quick Call Action
            IconButton(
              icon: Icon(
                item.callType == QuantCallType.video
                    ? Icons.videocam_rounded
                    : Icons.call_rounded,
                color: QuantColors.moltenOrange,
                size: 22,
              ),
              onPressed: () => _initiateCall(item),
            ),
          ],
        ),
      ),
    );
  }
}

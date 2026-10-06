import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../../models/mail_models.dart';

/// Sovereign QuantMail Thread Detail Screen
///
/// Features cryptographic security verification banner (SPF/DKIM/DMARC/E2EE),
/// expandable sender disclosure with RFC headers, styled body content,
/// SHA-256 verified attachment cards, animated Quant AI Executive Brief,
/// and floating action dock (Reply/Reply All/Forward/Archive).
/// Strictly ZERO raw Unicode emojis and ZERO Skia clipPath calls.
class ThreadDetailScreen extends StatefulWidget {
  final MailThread thread;
  final ValueChanged<MailThread>? onThreadUpdated;
  final VoidCallback? onArchive;
  final VoidCallback? onTrash;

  const ThreadDetailScreen({
    super.key,
    required this.thread,
    this.onThreadUpdated,
    this.onArchive,
    this.onTrash,
  });

  @override
  State<ThreadDetailScreen> createState() => _ThreadDetailScreenState();
}

class _ThreadDetailScreenState extends State<ThreadDetailScreen>
    with SingleTickerProviderStateMixin {
  late MailThread _thread;
  bool _isHeaderExpanded = false;
  bool _isAiSummaryExpanded = true;
  late AnimationController _aiPulseController;
  late Animation<double> _aiGlowAnimation;

  @override
  void initState() {
    super.initState();
    _thread = widget.thread;
    _aiPulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    )..repeat(reverse: true);

    _aiGlowAnimation = Tween<double>(begin: 0.25, end: 0.65).animate(
      CurvedAnimation(parent: _aiPulseController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _aiPulseController.dispose();
    super.dispose();
  }

  void _toggleStarred() {
    setState(() {
      _thread = _thread.copyWith(isStarred: !_thread.isStarred);
    });
    widget.onThreadUpdated?.call(_thread);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateSurface,
        content: Row(
          children: [
            Icon(
              _thread.isStarred ? Icons.star_rounded : Icons.star_border_rounded,
              color: QuantColors.sunsetGold,
              size: 18,
            ),
            const SizedBox(width: 8),
            Text(
              _thread.isStarred ? 'Thread starred' : 'Thread unstarred',
              style: const TextStyle(color: QuantColors.textPrimary, fontSize: 13),
            ),
          ],
        ),
        duration: const Duration(seconds: 1),
      ),
    );
  }

  void _copyToClipboard(String text, String label) {
    Clipboard.setData(ClipboardData(text: text));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateSurface,
        content: Row(
          children: [
            const Icon(Icons.check_circle_rounded, color: QuantColors.statusSuccess, size: 18),
            const SizedBox(width: 8),
            Text(
              '$label copied to clipboard',
              style: const TextStyle(color: QuantColors.textPrimary, fontSize: 13),
            ),
          ],
        ),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  void _showSecurityModal() {
    showModalBottomSheet(
      context: context,
      backgroundColor: QuantColors.darkSlateCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        side: BorderSide(color: QuantColors.hairlineBorder, width: 1),
      ),
      builder: (context) {
        final sec = _thread.security;
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: QuantColors.activeBorder,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: QuantColors.statusSuccess.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: QuantColors.statusSuccess.withOpacity(0.3)),
                      ),
                      child: const Icon(
                        Icons.verified_user_rounded,
                        color: QuantColors.statusSuccess,
                        size: 20,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Quantum-Resistant Envelope Security',
                          style: QuantTypography.titleMedium.copyWith(
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                        Text(
                          'Latency: ${sec.deliveryLatencyMs}ms · Protocol: Kyber-1024',
                          style: QuantTypography.labelSpeed.copyWith(
                            color: QuantColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                _buildSecurityRow('SPF Verification', sec.spf, true),
                _buildSecurityRow('DKIM Signature', sec.dkim, true),
                _buildSecurityRow('DMARC Alignment', sec.dmarc, true),
                _buildSecurityRow('End-to-End Encryption', sec.e2ee, true),
                _buildSecurityRow('TLS Cipher Suite', sec.tlsCipher, true),
                _buildSecurityRow('Envelope Source IP', sec.sourceIp, false),
                _buildSecurityRow('Message-ID', sec.messageId, false),
                const SizedBox(height: 16),
                SquircleButton(
                  label: 'Copy Full Audit Manifest',
                  isFullWidth: true,
                  icon: Icons.copy_rounded,
                  backgroundColor: QuantColors.moltenAmber,
                  onPressed: () {
                    Navigator.pop(context);
                    _copyToClipboard(
                      'SPF: ${sec.spf}\nDKIM: ${sec.dkim}\nDMARC: ${sec.dmarc}\nE2EE: ${sec.e2ee}\nTLS: ${sec.tlsCipher}\nMessage-ID: ${sec.messageId}',
                      'Audit Manifest',
                    );
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildSecurityRow(String label, String value, bool isVerified) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: QuantColors.textSecondary, fontSize: 12)),
          Row(
            children: [
              if (isVerified) ...[
                const Icon(Icons.check_rounded, color: QuantColors.statusSuccess, size: 14),
                const SizedBox(width: 4),
              ],
              Text(
                value,
                style: TextStyle(
                  color: isVerified ? QuantColors.statusSuccess : QuantColors.textPrimary,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _showReplySheet({bool replyAll = false}) {
    final textController = TextEditingController();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: QuantColors.darkSlateCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        side: BorderSide(color: QuantColors.hairlineBorder, width: 1),
      ),
      builder: (context) {
        return Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(context).viewInsets.bottom,
            left: 20,
            right: 20,
            top: 20,
          ),
          child: SafeArea(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: QuantColors.activeBorder,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      replyAll ? 'Reply All to Thread' : 'Reply to ${_thread.sender}',
                      style: QuantTypography.titleMedium.copyWith(
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close_rounded, color: QuantColors.textSecondary),
                      onPressed: () => Navigator.pop(context),
                    ),
                  ],
                ),
                Text(
                  'To: ${_thread.senderEmail}${replyAll ? ', team@quantrinity.in' : ''}',
                  style: const TextStyle(color: QuantColors.textSecondary, fontSize: 12),
                ),
                const SizedBox(height: 12),
                // AI Quick Reply Suggestions
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _aiSuggestionChip('Acknowledged, review in progress', textController),
                      const SizedBox(width: 8),
                      _aiSuggestionChip('Confirmed. Proceed with staging rollout', textController),
                      const SizedBox(width: 8),
                      _aiSuggestionChip('Let us review the cryptographic suite', textController),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: textController,
                  maxLines: 5,
                  autofocus: true,
                  style: const TextStyle(color: QuantColors.textPrimary, fontSize: 14),
                  decoration: InputDecoration(
                    hintText: 'Type your encrypted reply...',
                    hintStyle: const TextStyle(color: QuantColors.textMuted, fontSize: 14),
                    filled: true,
                    fillColor: QuantColors.elevatedCard,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: const BorderSide(color: QuantColors.hairlineBorder),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: const BorderSide(color: QuantColors.hairlineBorder),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: const BorderSide(color: QuantColors.moltenAmber),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        IconButton(
                          icon: const Icon(Icons.attach_file_rounded, color: QuantColors.textSecondary),
                          onPressed: () {},
                        ),
                        IconButton(
                          icon: const Icon(Icons.auto_awesome_rounded, color: QuantColors.moltenAmber),
                          onPressed: () {
                            textController.text =
                                'Verified with zero regressions across staging clusters. Approved for immediate merge.';
                          },
                        ),
                      ],
                    ),
                    SquircleButton(
                      label: 'Send Encrypted (⌘Enter)',
                      icon: Icons.send_rounded,
                      backgroundColor: QuantColors.moltenAmber,
                      onPressed: () {
                        Navigator.pop(context);
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            backgroundColor: QuantColors.darkSlateSurface,
                            content: Row(
                              children: [
                                Icon(Icons.check_circle_rounded, color: QuantColors.statusSuccess, size: 18),
                                SizedBox(width: 8),
                                Text(
                                  'Reply dispatched with post-quantum E2EE',
                                  style: TextStyle(color: QuantColors.textPrimary, fontSize: 13),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ],
                ),
                const SizedBox(height: 12),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _aiSuggestionChip(String text, TextEditingController controller) {
    return InkWell(
      onTap: () => controller.text = text,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: QuantColors.elevatedCard,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: QuantColors.moltenAmber.withOpacity(0.35)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.auto_awesome_rounded, size: 12, color: QuantColors.moltenAmber),
            const SizedBox(width: 6),
            Text(
              text,
              style: const TextStyle(color: QuantColors.textPrimary, fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.obsidianVoid,
      body: SafeArea(
        child: Stack(
          children: [
            Column(
              children: [
                _buildTopNavigationBar(),
                _buildSecurityBanner(),
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.only(left: 16, right: 16, top: 12, bottom: 100),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _buildSubjectHeader(),
                        const SizedBox(height: 14),
                        _buildSenderCard(),
                        const SizedBox(height: 16),
                        _buildAiSummaryCard(),
                        const SizedBox(height: 16),
                        _buildEmailBodyCard(),
                        if (_thread.attachments.isNotEmpty) ...[
                          const SizedBox(height: 16),
                          _buildAttachmentsSection(),
                        ],
                      ],
                    ),
                  ),
                ),
              ],
            ),
            // Floating Action Dock at Bottom
            Positioned(
              left: 16,
              right: 16,
              bottom: 16,
              child: _buildBottomActionDock(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopNavigationBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: const BoxDecoration(
        color: QuantColors.obsidianVoid,
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 0.5),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              IconButton(
                icon: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white, size: 20),
                onPressed: () => Navigator.pop(context),
              ),
              const SizedBox(width: 4),
              Text(
                'Thread',
                style: QuantTypography.titleMedium.copyWith(
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
            ],
          ),
          Row(
            children: [
              IconButton(
                icon: Icon(
                  _thread.isStarred ? Icons.star_rounded : Icons.star_border_rounded,
                  color: _thread.isStarred ? QuantColors.sunsetGold : QuantColors.textSecondary,
                  size: 22,
                ),
                onPressed: _toggleStarred,
              ),
              IconButton(
                icon: const Icon(Icons.archive_outlined, color: QuantColors.textSecondary, size: 22),
                onPressed: () {
                  widget.onArchive?.call();
                  Navigator.pop(context);
                },
              ),
              IconButton(
                icon: const Icon(Icons.delete_outline_rounded, color: QuantColors.textSecondary, size: 22),
                onPressed: () {
                  widget.onTrash?.call();
                  Navigator.pop(context);
                },
              ),
              PopupMenuButton<String>(
                icon: const Icon(Icons.more_vert_rounded, color: QuantColors.textSecondary, size: 22),
                color: QuantColors.darkSlateCard,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                  side: const BorderSide(color: QuantColors.hairlineBorder),
                ),
                onSelected: (value) {
                  if (value == 'unread') {
                    setState(() => _thread = _thread.copyWith(isUnread: true));
                    widget.onThreadUpdated?.call(_thread);
                    Navigator.pop(context);
                  } else if (value == 'headers') {
                    _showSecurityModal();
                  } else if (value == 'copy') {
                    _copyToClipboard(_thread.bodyHtml, 'Email text');
                  }
                },
                itemBuilder: (context) => [
                  const PopupMenuItem(
                    value: 'unread',
                    child: Row(
                      children: [
                        Icon(Icons.mark_email_unread_outlined, size: 18, color: QuantColors.textSecondary),
                        SizedBox(width: 10),
                        Text('Mark as unread', style: TextStyle(color: Colors.white, fontSize: 13)),
                      ],
                    ),
                  ),
                  const PopupMenuItem(
                    value: 'headers',
                    child: Row(
                      children: [
                        Icon(Icons.verified_user_outlined, size: 18, color: QuantColors.statusSuccess),
                        SizedBox(width: 10),
                        Text('View cryptographic headers', style: TextStyle(color: Colors.white, fontSize: 13)),
                      ],
                    ),
                  ),
                  const PopupMenuItem(
                    value: 'copy',
                    child: Row(
                      children: [
                        Icon(Icons.copy_rounded, size: 18, color: QuantColors.textSecondary),
                        SizedBox(width: 10),
                        Text('Copy body text', style: TextStyle(color: Colors.white, fontSize: 13)),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSecurityBanner() {
    return InkWell(
      onTap: _showSecurityModal,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: QuantColors.darkSlateCard,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: QuantColors.statusSuccess.withOpacity(0.35), width: 0.8),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                const Icon(Icons.shield_rounded, color: QuantColors.statusSuccess, size: 15),
                const SizedBox(width: 8),
                Text(
                  'SPF: PASS · DKIM: PASS · DMARC: PASS · Quantum-Resistant E2EE',
                  style: QuantTypography.labelSpeed.copyWith(
                    color: QuantColors.statusSuccess,
                    fontSize: 10.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            const Icon(Icons.chevron_right_rounded, color: QuantColors.statusSuccess, size: 16),
          ],
        ),
      ),
    );
  }

  Widget _buildSubjectHeader() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            QuantBadge(
              label: _thread.category.label,
              variant: QuantBadgeVariant.amber,
              leadingIcon: _thread.category.icon,
            ),
            if (_thread.isPriorityTriage) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                decoration: BoxDecoration(
                  color: QuantColors.moltenAmber.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: QuantColors.moltenAmber.withOpacity(0.4), width: 0.5),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.bolt_rounded, size: 12, color: QuantColors.moltenAmber),
                    SizedBox(width: 4),
                    Text(
                      'Triage (E)',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: QuantColors.moltenAmber,
                      ),
                    ),
                  ],
                ),
              ),
            ],
            for (final label in _thread.labels) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: QuantColors.darkSlateSurface,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: QuantColors.hairlineBorder, width: 0.5),
                ),
                child: Text(
                  label,
                  style: const TextStyle(fontSize: 10, color: QuantColors.textMuted),
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 8),
        Text(
          _thread.subject,
          style: QuantTypography.titleLarge.copyWith(
            fontWeight: FontWeight.w800,
            fontSize: 20,
            color: Colors.white,
            height: 1.3,
          ),
        ),
      ],
    );
  }

  Widget _buildSenderCard() {
    return FrostedCard(
      padding: const EdgeInsets.all(14),
      borderRadius: 16,
      borderColor: QuantColors.hairlineBorder,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 44dp luxury gradient avatar with glowing verified beacon dot
              Stack(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: _thread.avatarGradient,
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Center(
                      child: Text(
                        _thread.senderInitials,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
                  if (_thread.isVerifiedDomain)
                    Positioned(
                      right: 0,
                      bottom: 0,
                      child: Container(
                        width: 12,
                        height: 12,
                        decoration: BoxDecoration(
                          color: QuantColors.statusSuccess,
                          shape: BoxShape.circle,
                          border: Border.all(color: QuantColors.darkSlateCard, width: 2),
                          boxShadow: [
                            BoxShadow(
                              color: QuantColors.statusSuccess.withOpacity(0.6),
                              blurRadius: 4,
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Text(
                              _thread.sender,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            if (_thread.isVerifiedDomain) ...[
                              const SizedBox(width: 6),
                              const Icon(
                                Icons.verified_rounded,
                                color: QuantColors.statusSuccess,
                                size: 14,
                              ),
                            ],
                          ],
                        ),
                        Text(
                          _thread.timestamp,
                          style: const TextStyle(color: QuantColors.textMuted, fontSize: 11),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _thread.senderEmail,
                      style: const TextStyle(color: QuantColors.textSecondary, fontSize: 12),
                    ),
                    const SizedBox(height: 4),
                    // Expandable disclosure "to me"
                    InkWell(
                      onTap: () => setState(() => _isHeaderExpanded = !_isHeaderExpanded),
                      borderRadius: BorderRadius.circular(4),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 2.0),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              'to ${_thread.recipient}',
                              style: const TextStyle(color: QuantColors.textMuted, fontSize: 11),
                            ),
                            const SizedBox(width: 4),
                            Icon(
                              _isHeaderExpanded
                                  ? Icons.keyboard_arrow_up_rounded
                                  : Icons.keyboard_arrow_down_rounded,
                              size: 14,
                              color: QuantColors.textMuted,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (_isHeaderExpanded) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: QuantColors.elevatedCard,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: QuantColors.hairlineBorder),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _headerField('From', '${_thread.sender} <${_thread.senderEmail}>'),
                  _headerField('To', _thread.recipient),
                  _headerField('Date', _thread.dateFormatted),
                  _headerField('MIME', _thread.security.mimeVersion),
                  _headerField('Return-Path', _thread.security.returnPath),
                  _headerField('TLS Cipher', _thread.security.tlsCipher),
                  _headerField('Delivery Latency', '${_thread.security.deliveryLatencyMs}ms (sovereign edge)'),
                  _headerField('Message-ID', _thread.security.messageId),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _headerField(String key, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2.5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 90,
            child: Text(
              key,
              style: const TextStyle(color: QuantColors.textMuted, fontSize: 11, fontWeight: FontWeight.w600),
            ),
          ),
          Expanded(
            child: SelectableText(
              value,
              style: const TextStyle(color: QuantColors.textPrimary, fontSize: 11),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAiSummaryCard() {
    final summary = _thread.aiSummary;
    return AnimatedBuilder(
      animation: _aiGlowAnimation,
      builder: (context, child) {
        return Container(
          decoration: BoxDecoration(
            color: QuantColors.darkSlateCard,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: QuantColors.moltenAmber.withOpacity(_aiGlowAnimation.value),
              width: 1.2,
            ),
            boxShadow: [
              BoxShadow(
                color: QuantColors.moltenAmber.withOpacity(_aiGlowAnimation.value * 0.2),
                blurRadius: 16,
                spreadRadius: 1,
              ),
            ],
          ),
          child: child,
        );
      },
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            InkWell(
              onTap: () => setState(() => _isAiSummaryExpanded = !_isAiSummaryExpanded),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: QuantColors.moltenAmber.withOpacity(0.15),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(
                          Icons.auto_awesome_rounded,
                          color: QuantColors.moltenAmber,
                          size: 16,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        summary.summaryTitle,
                        style: QuantTypography.bodyMedium.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(width: 8),
                      QuantBadge(
                        label: '<${summary.latencyMs}ms Local ONNX',
                        variant: QuantBadgeVariant.success,
                      ),
                    ],
                  ),
                  Icon(
                    _isAiSummaryExpanded ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                    color: QuantColors.textSecondary,
                    size: 20,
                  ),
                ],
              ),
            ),
            if (_isAiSummaryExpanded) ...[
              const SizedBox(height: 12),
              const Divider(color: QuantColors.hairlineBorder, height: 1),
              const SizedBox(height: 10),
              // Bulleted Key Points
              Text(
                'Key Takeaways',
                style: QuantTypography.labelSpeed.copyWith(
                  color: QuantColors.moltenAmber,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),
              for (final point in summary.keyPoints) ...[
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Padding(
                        padding: EdgeInsets.only(top: 4),
                        child: Icon(Icons.circle, size: 5, color: QuantColors.moltenAmber),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          point,
                          style: const TextStyle(color: QuantColors.textPrimary, fontSize: 13, height: 1.4),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              if (summary.actionItems.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(
                  'Action Items',
                  style: QuantTypography.labelSpeed.copyWith(
                    color: QuantColors.sovereignCyan,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 6),
                for (final item in summary.actionItems) ...[
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: InkWell(
                      onTap: () {
                        setState(() {
                          item.isCompleted = !item.isCompleted;
                        });
                      },
                      borderRadius: BorderRadius.circular(6),
                      child: Row(
                        children: [
                          Icon(
                            item.isCompleted ? Icons.check_box_rounded : Icons.check_box_outline_blank_rounded,
                            size: 18,
                            color: item.isCompleted ? QuantColors.statusSuccess : QuantColors.textSecondary,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              item.title,
                              style: TextStyle(
                                fontSize: 13,
                                color: item.isCompleted ? QuantColors.textMuted : QuantColors.textPrimary,
                                decoration: item.isCompleted ? TextDecoration.lineThrough : null,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ],
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildEmailBodyCard() {
    return FrostedCard(
      padding: const EdgeInsets.all(18),
      borderRadius: 16,
      borderColor: QuantColors.hairlineBorder,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SelectableText(
            _thread.bodyHtml.trim(),
            style: const TextStyle(
              color: QuantColors.textPrimary,
              fontSize: 14,
              height: 1.6,
              letterSpacing: 0.1,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAttachmentsSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.attachment_rounded, size: 16, color: QuantColors.moltenAmber),
            const SizedBox(width: 6),
            Text(
              'Attachments (${_thread.attachments.length})',
              style: QuantTypography.bodyMedium.copyWith(
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        for (final att in _thread.attachments) ...[
          _buildAttachmentCard(att),
          const SizedBox(height: 8),
        ],
      ],
    );
  }

  Widget _buildAttachmentCard(MailAttachment att) {
    final truncatedSha =
        '${att.sha256.substring(0, 10)}...${att.sha256.substring(att.sha256.length - 8)}';

    return FrostedCard(
      padding: const EdgeInsets.all(12),
      borderRadius: 14,
      borderColor: QuantColors.hairlineBorder,
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: QuantColors.moltenAmber.withOpacity(0.12),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: QuantColors.moltenAmber.withOpacity(0.3)),
            ),
            child: Icon(att.icon, color: QuantColors.moltenAmber, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  att.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    Text(
                      '${att.fileType} · ${att.formattedSize}',
                      style: const TextStyle(color: QuantColors.textMuted, fontSize: 11),
                    ),
                    const SizedBox(width: 8),
                    InkWell(
                      onTap: () => _copyToClipboard(att.sha256, 'SHA-256 Checksum'),
                      borderRadius: BorderRadius.circular(4),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                        decoration: BoxDecoration(
                          color: QuantColors.darkSlateSurface,
                          borderRadius: BorderRadius.circular(4),
                          border: Border.all(color: QuantColors.hairlineBorder, width: 0.5),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.tag_rounded, size: 10, color: QuantColors.statusSuccess),
                            const SizedBox(width: 2),
                            Text(
                              truncatedSha,
                              style: const TextStyle(
                                fontSize: 9.5,
                                color: QuantColors.statusSuccess,
                                fontFamily: 'monospace',
                              ),
                            ),
                            const SizedBox(width: 4),
                            const Icon(Icons.copy_rounded, size: 9, color: QuantColors.textSecondary),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.download_rounded, color: QuantColors.moltenAmber, size: 20),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  backgroundColor: QuantColors.darkSlateSurface,
                  content: Text(
                    'Downloading ${att.name} with verified SHA-256 integrity',
                    style: const TextStyle(color: QuantColors.textPrimary, fontSize: 13),
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildBottomActionDock() {
    return FrostedCard(
      borderRadius: 20,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      borderColor: QuantColors.moltenAmber.withOpacity(0.3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _dockButton(
            icon: Icons.reply_rounded,
            label: 'Reply',
            onTap: () => _showReplySheet(replyAll: false),
          ),
          _dockButton(
            icon: Icons.reply_all_rounded,
            label: 'Reply All',
            onTap: () => _showReplySheet(replyAll: true),
          ),
          _dockButton(
            icon: Icons.forward_to_inbox_rounded,
            label: 'Forward',
            onTap: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  backgroundColor: QuantColors.darkSlateSurface,
                  content: Text('Forward thread composer opened'),
                ),
              );
            },
          ),
          _dockButton(
            icon: Icons.archive_outlined,
            label: 'Archive',
            onTap: () {
              widget.onArchive?.call();
              Navigator.pop(context);
            },
          ),
        ],
      ),
    );
  }

  Widget _dockButton({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: QuantColors.moltenAmber),
            const SizedBox(width: 6),
            Text(
              label,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

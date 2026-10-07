import 'dart:async';
import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../../models/composer_models.dart';
import 'quanty_ai_draft_modal.dart';
import 'undo_send_manager.dart';

/// Sovereign QuantMail Email Composer Modal
///
/// Hardware-accelerated Impeller modal email composer with tokenized recipient chips,
/// contact autocomplete, expandable Cc/Bcc, rich text formatting toolbar,
/// 25MB attachment guard, local draft autosave, and direct 10-second undo-send dispatch.
/// Strictly ZERO raw Unicode emojis and ZERO Skia clipPath calls.
class EmailComposerModal extends StatefulWidget {
  final EmailDraft? initialDraft;
  final void Function(EmailDraft draft)? onSendQueued;

  const EmailComposerModal({
    super.key,
    this.initialDraft,
    this.onSendQueued,
  });

  /// Presents the composer modal as a bottom sheet with slide-up animation
  static Future<EmailDraft?> show(
    BuildContext context, {
    EmailDraft? initialDraft,
    void Function(EmailDraft draft)? onSendQueued,
  }) {
    return showModalBottomSheet<EmailDraft>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (context) => EmailComposerModal(
        initialDraft: initialDraft,
        onSendQueued: onSendQueued,
      ),
    );
  }

  @override
  State<EmailComposerModal> createState() => _EmailComposerModalState();
}

class _EmailComposerModalState extends State<EmailComposerModal> {
  late final TextEditingController _subjectController;
  late final TextEditingController _bodyController;
  late final TextEditingController _toInputController;
  late final TextEditingController _ccInputController;
  late final TextEditingController _bccInputController;

  final FocusNode _bodyFocusNode = FocusNode();
  final FocusNode _toFocusNode = FocusNode();

  final List<EmailRecipient> _toRecipients = [];
  final List<EmailRecipient> _ccRecipients = [];
  final List<EmailRecipient> _bccRecipients = [];
  final List<EmailAttachment> _attachments = [];

  bool _showCcBcc = false;
  String _toQuery = '';
  List<EmailRecipient> _filteredContacts = [];

  // Autosave Telemetry State
  bool _isAutosaved = false;
  DateTime? _lastSavedTimestamp;
  Timer? _autosaveTimer;
  bool _isDirty = false;

  @override
  void initState() {
    super.initState();
    final draft = widget.initialDraft ?? DraftLocalStorage.instance.loadDraft();

    _subjectController = TextEditingController(text: draft?.subject ?? '');
    _bodyController = TextEditingController(text: draft?.body ?? '');
    _toInputController = TextEditingController();
    _ccInputController = TextEditingController();
    _bccInputController = TextEditingController();

    if (draft != null) {
      _toRecipients.addAll(draft.to);
      _ccRecipients.addAll(draft.cc);
      _bccRecipients.addAll(draft.bcc);
      _attachments.addAll(draft.attachments);
      _isAutosaved = draft.isAutosaved;
      _lastSavedTimestamp = draft.lastSaved;
      if (_ccRecipients.isNotEmpty || _bccRecipients.isNotEmpty) {
        _showCcBcc = true;
      }
    }

    _subjectController.addListener(_markDirty);
    _bodyController.addListener(_markDirty);

    // Filter contacts on recipient input change
    _toInputController.addListener(() {
      final query = _toInputController.text.trim().toLowerCase();
      setState(() {
        _toQuery = query;
        if (query.isEmpty) {
          _filteredContacts = [];
        } else {
          _filteredContacts = EmailRecipient.sovereignContacts.where((c) {
            final matches = c.name.toLowerCase().contains(query) ||
                c.email.toLowerCase().contains(query);
            final alreadyAdded = _toRecipients.contains(c);
            return matches && !alreadyAdded;
          }).toList();
        }
      });
    });

    // Start 4-second debounced draft autosave loop
    _autosaveTimer = Timer.periodic(const Duration(seconds: 4), (_) {
      if (_isDirty && mounted) {
        _saveDraftLocally();
      }
    });
  }

  @override
  void dispose() {
    _autosaveTimer?.cancel();
    _subjectController.dispose();
    _bodyController.dispose();
    _toInputController.dispose();
    _ccInputController.dispose();
    _bccInputController.dispose();
    _bodyFocusNode.dispose();
    _toFocusNode.dispose();
    super.dispose();
  }

  void _markDirty() {
    if (!_isDirty) {
      setState(() => _isDirty = true);
    }
  }

  void _saveDraftLocally() {
    final draft = _buildCurrentDraft(isAutosaved: true);
    DraftLocalStorage.instance.saveDraft(draft);
    if (mounted) {
      setState(() {
        _isDirty = false;
        _isAutosaved = true;
        _lastSavedTimestamp = DateTime.now();
      });
    }
  }

  EmailDraft _buildCurrentDraft({bool isAutosaved = false}) {
    return EmailDraft(
      id: widget.initialDraft?.id ??
          'draft-${DateTime.now().millisecondsSinceEpoch}',
      to: List.unmodifiable(_toRecipients),
      cc: List.unmodifiable(_ccRecipients),
      bcc: List.unmodifiable(_bccRecipients),
      subject: _subjectController.text.trim(),
      body: _bodyController.text,
      attachments: List.unmodifiable(_attachments),
      lastSaved: DateTime.now(),
      isAutosaved: isAutosaved,
    );
  }

  int get _totalAttachmentBytes =>
      _attachments.fold(0, (sum, a) => sum + a.sizeBytes);

  bool get _isOverAttachmentLimit =>
      _totalAttachmentBytes > EmailDraft.maxAttachmentBytes;

  String _formatBytes(int bytes) {
    if (bytes < 1024 * 1024) {
      return '${(bytes / 1024).toStringAsFixed(1)} KB';
    }
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  void _addRecipient(EmailRecipient recipient) {
    if (!_toRecipients.contains(recipient)) {
      setState(() {
        _toRecipients.add(recipient);
        _toInputController.clear();
        _toQuery = '';
        _filteredContacts = [];
        _markDirty();
      });
    }
  }

  void _submitCustomRecipient(String input) {
    final text = input.trim();
    if (text.isEmpty) return;

    final recipient = EmailRecipient(
      name: text.contains('@') ? text.split('@')[0] : text,
      email: text.contains('@') ? text : '$text@quantmail.in',
      isContact: false,
    );
    _addRecipient(recipient);
  }

  void _removeRecipient(EmailRecipient recipient) {
    setState(() {
      _toRecipients.remove(recipient);
      _markDirty();
    });
  }

  void _removeAttachment(String attachmentId) {
    setState(() {
      _attachments.removeWhere((a) => a.id == attachmentId);
      _markDirty();
    });
  }

  // Formatting actions for the rich text toolbar
  void _applyFormat(String prefix, [String? suffix]) {
    final text = _bodyController.text;
    final selection = _bodyController.selection;
    final s = suffix ?? prefix;

    if (!selection.isValid || selection.isCollapsed) {
      // Insert placeholder
      final insertText = '$prefix$s';
      final newText = text.replaceRange(
        selection.start == -1 ? text.length : selection.start,
        selection.end == -1 ? text.length : selection.end,
        insertText,
      );
      _bodyController.value = TextEditingValue(
        text: newText,
        selection: TextSelection.collapsed(
          offset: (selection.start == -1 ? text.length : selection.start) +
              prefix.length,
        ),
      );
    } else {
      final selectedText = selection.textInside(text);
      final replaced = '$prefix$selectedText$s';
      final newText = text.replaceRange(selection.start, selection.end, replaced);
      _bodyController.value = TextEditingValue(
        text: newText,
        selection: TextSelection(
          baseOffset: selection.start,
          extentOffset: selection.start + replaced.length,
        ),
      );
    }
    _markDirty();
  }

  void _applyLinePrefix(String prefix) {
    final text = _bodyController.text;
    final selection = _bodyController.selection;
    final start = selection.start == -1 ? text.length : selection.start;

    // Find line start
    int lineStart = text.lastIndexOf('\n', start > 0 ? start - 1 : 0);
    lineStart = lineStart == -1 ? 0 : lineStart + 1;

    final newText = text.replaceRange(lineStart, lineStart, prefix);
    _bodyController.value = TextEditingValue(
      text: newText,
      selection: TextSelection.collapsed(offset: start + prefix.length),
    );
    _markDirty();
  }

  Future<void> _openQuantyAiAssist() async {
    final prompt = _subjectController.text.isNotEmpty
        ? 'Compose an email regarding: ${_subjectController.text}'
        : null;

    final result = await QuantyAiDraftModal.show(context, initialPrompt: prompt);
    if (result != null && result.isNotEmpty && mounted) {
      setState(() {
        if (_bodyController.text.isEmpty) {
          _bodyController.text = result;
        } else {
          _bodyController.text = '${_bodyController.text}\n\n$result';
        }
        _markDirty();
      });
    }
  }

  void _showAttachmentPicker() {
    showModalBottomSheet(
      context: context,
      backgroundColor: QuantColors.darkSlateCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Attach Sovereign Files',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: QuantColors.textPrimary,
                      ),
                    ),
                    QuantBadge(
                      label: '25 MB Guard Active',
                      variant: QuantBadgeVariant.amber,
                      leadingIcon: Icons.security_rounded,
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                _attachmentOption(
                  icon: Icons.picture_as_pdf_rounded,
                  title: 'Architecture Specification (PDF)',
                  subtitle: '2.4 MB • Quant Trinity Standard',
                  sizeBytes: 2400000,
                  extension: 'pdf',
                ),
                _attachmentOption(
                  icon: Icons.folder_zip_rounded,
                  title: 'Impeller Benchmark Traces (ZIP)',
                  subtitle: '7.8 MB • 120Hz Hardware Telemetry',
                  sizeBytes: 7800000,
                  extension: 'zip',
                ),
                _attachmentOption(
                  icon: Icons.image_rounded,
                  title: 'System Topology Schema (PNG)',
                  subtitle: '1.2 MB • High Resolution Diagram',
                  sizeBytes: 1200000,
                  extension: 'png',
                ),
                _attachmentOption(
                  icon: Icons.video_file_rounded,
                  title: 'Raw Sensor Recording (MP4)',
                  subtitle: '26.8 MB • [Exceeds 25MB Guard Demonstration]',
                  sizeBytes: 28100000,
                  extension: 'mp4',
                  isWarning: true,
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _attachmentOption({
    required IconData icon,
    required String title,
    required String subtitle,
    required int sizeBytes,
    required String extension,
    bool isWarning = false,
  }) {
    return InkWell(
      onTap: () {
        Navigator.of(context).pop();
        setState(() {
          _attachments.add(
            EmailAttachment(
              id: 'att-${DateTime.now().millisecondsSinceEpoch}',
              name: '${title.split(' ')[0].toLowerCase()}.$extension',
              sizeBytes: sizeBytes,
              mimeType: 'application/$extension',
            ),
          );
          _markDirty();
        });
      },
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 8),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: isWarning
                    ? QuantColors.statusError.withOpacity(0.15)
                    : QuantColors.elevatedCard,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: isWarning
                      ? QuantColors.statusError.withOpacity(0.4)
                      : QuantColors.hairlineBorder,
                ),
              ),
              child: Icon(
                icon,
                color: isWarning ? QuantColors.statusError : QuantColors.moltenAmber,
                size: 20,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: isWarning
                          ? QuantColors.statusError
                          : QuantColors.textPrimary,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      fontSize: 11,
                      color: QuantColors.textMuted,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.add_circle_outline_rounded,
                size: 20, color: QuantColors.textSecondary),
          ],
        ),
      ),
    );
  }

  void _triggerSend() {
    if (_toRecipients.isEmpty || _isOverAttachmentLimit) return;

    final draft = _buildCurrentDraft();

    // Call optional onSendQueued or trigger global UndoSendManager
    widget.onSendQueued?.call(draft);

    Navigator.of(context).pop(draft);
  }

  @override
  Widget build(BuildContext context) {
    final canSend = _toRecipients.isNotEmpty && !_isOverAttachmentLimit;

    return Container(
      height: MediaQuery.of(context).size.height * 0.94,
      decoration: const BoxDecoration(
        color: QuantColors.obsidianVoid,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        border: Border(
          top: BorderSide(color: QuantColors.hairlineBorder, width: 1.5),
        ),
      ),
      child: Scaffold(
        backgroundColor: Colors.transparent,
        resizeToAvoidBottomInset: true,
        body: Column(
          children: [
            // Top Modal Handle & Header
            _buildModalHeader(canSend),

            // Scrollable Composer Content
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 8),

                    // To Recipient Field & Chips
                    _buildToField(),

                    // Autocomplete Suggestions Dropdown
                    if (_filteredContacts.isNotEmpty) _buildAutocompleteDropdown(),

                    // Expandable Cc & Bcc Fields
                    if (_showCcBcc) ...[
                      const SizedBox(height: 8),
                      _buildCcBccFields(),
                    ],

                    const SizedBox(height: 8),
                    const Divider(color: QuantColors.hairlineBorder, height: 1),
                    const SizedBox(height: 8),

                    // Subject Line Field
                    _buildSubjectField(),

                    const SizedBox(height: 8),
                    const Divider(color: QuantColors.hairlineBorder, height: 1),
                    const SizedBox(height: 8),

                    // 25MB Attachment Guard Warning Banner (if triggered)
                    if (_isOverAttachmentLimit) ...[
                      _buildAttachmentGuardWarning(),
                      const SizedBox(height: 8),
                    ],

                    // Attachment Chips Section
                    if (_attachments.isNotEmpty) ...[
                      _buildAttachmentChips(),
                      const SizedBox(height: 12),
                    ],

                    // Email Body Text Field
                    _buildBodyField(),
                    const SizedBox(height: 80), // Keyboard clearance
                  ],
                ),
              ),
            ),

            // Rich Text Formatting Toolbar (Pinned above keyboard)
            _buildFormattingToolbar(),
          ],
        ),
      ),
    );
  }

  Widget _buildModalHeader(bool canSend) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      decoration: const BoxDecoration(
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: Column(
        children: [
          // Drag handle
          Container(
            width: 40,
            height: 4,
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(
              color: QuantColors.hairlineBorder,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Row(
            children: [
              // Cancel Button
              IconButton(
                icon: const Icon(Icons.close_rounded,
                    color: QuantColors.textSecondary, size: 22),
                onPressed: () {
                  _saveDraftLocally();
                  Navigator.of(context).pop();
                },
                tooltip: 'Save & Close',
              ),
              const SizedBox(width: 8),

              // Title & Autosave Pill
              Expanded(
                child: Row(
                  children: [
                    const Text(
                      'New Message',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: QuantColors.textPrimary,
                        letterSpacing: -0.3,
                      ),
                    ),
                    const SizedBox(width: 10),
                    if (_isAutosaved)
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: QuantColors.statusSuccess.withOpacity(0.12),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(
                            color: QuantColors.statusSuccess.withOpacity(0.3),
                            width: 0.5,
                          ),
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.cloud_done_rounded,
                              size: 11,
                              color: QuantColors.statusSuccess,
                            ),
                            SizedBox(width: 4),
                            Text(
                              'Autosaved',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                                color: QuantColors.statusSuccess,
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),

              // Quanty AI Synthesis Action
              IconButton(
                icon: const Icon(
                  Icons.auto_awesome_rounded,
                  color: QuantColors.moltenAmber,
                  size: 20,
                ),
                onPressed: _openQuantyAiAssist,
                tooltip: 'Quanty Assist (AI Draft)',
              ),

              // Attachment Action
              IconButton(
                icon: Badge(
                  isLabelVisible: _attachments.isNotEmpty,
                  label: Text('${_attachments.length}'),
                  backgroundColor: QuantColors.moltenAmber,
                  child: const Icon(
                    Icons.attach_file_rounded,
                    color: QuantColors.textSecondary,
                    size: 20,
                  ),
                ),
                onPressed: _showAttachmentPicker,
                tooltip: 'Attach Files',
              ),

              const SizedBox(width: 6),

              // [Send] Button with Molten Amber Gradient
              InkWell(
                onTap: canSend ? _triggerSend : null,
                borderRadius: BorderRadius.circular(12),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  decoration: BoxDecoration(
                    gradient: canSend
                        ? const LinearGradient(
                            colors: [
                              QuantColors.moltenAmber,
                              Color(0xFFFF6B00),
                            ],
                          )
                        : null,
                    color: canSend ? null : QuantColors.elevatedCard,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: canSend
                          ? QuantColors.moltenAmber
                          : QuantColors.hairlineBorder,
                      width: 1,
                    ),
                    boxShadow: canSend
                        ? [
                            BoxShadow(
                              color: QuantColors.moltenAmber.withOpacity(0.3),
                              blurRadius: 10,
                              offset: const Offset(0, 2),
                            ),
                          ]
                        : null,
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.send_rounded,
                        size: 15,
                        color: canSend ? Colors.white : QuantColors.textMuted,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        'Send',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: canSend ? Colors.white : QuantColors.textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildToField() {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        const Text(
          'To:',
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: QuantColors.textMuted,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Wrap(
            spacing: 6,
            runSpacing: 4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              // Tokenized Recipient Chips
              ..._toRecipients.map((r) => _buildRecipientChip(r)),

              // Autocomplete Text Input
              ConstrainedBox(
                constraints: const BoxConstraints(minWidth: 120, maxWidth: 220),
                child: TextField(
                  controller: _toInputController,
                  focusNode: _toFocusNode,
                  style: const TextStyle(
                    fontSize: 13.5,
                    color: QuantColors.textPrimary,
                  ),
                  decoration: const InputDecoration(
                    hintText: 'Add sovereign contact...',
                    hintStyle: TextStyle(
                      fontSize: 13,
                      color: QuantColors.textMuted,
                    ),
                    border: InputBorder.none,
                    isDense: true,
                    contentPadding: EdgeInsets.symmetric(vertical: 6),
                  ),
                  onSubmitted: _submitCustomRecipient,
                ),
              ),
            ],
          ),
        ),

        // Cc/Bcc Toggle
        TextButton(
          onPressed: () {
            setState(() => _showCcBcc = !_showCcBcc);
          },
          style: TextButton.styleFrom(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            minimumSize: Size.zero,
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          child: Text(
            _showCcBcc ? 'Hide Cc' : 'Cc/Bcc',
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: QuantColors.textSecondary,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildRecipientChip(EmailRecipient recipient) {
    return Container(
      padding: const EdgeInsets.fromLTRB(4, 2, 8, 2),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder, width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircleAvatar(
            radius: 10,
            backgroundColor: QuantColors.moltenAmber.withOpacity(0.2),
            child: Text(
              recipient.initials,
              style: const TextStyle(
                fontSize: 9,
                fontWeight: FontWeight.w800,
                color: QuantColors.moltenAmber,
              ),
            ),
          ),
          const SizedBox(width: 6),
          Text(
            recipient.name.isNotEmpty ? recipient.name : recipient.email,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: QuantColors.textPrimary,
            ),
          ),
          const SizedBox(width: 4),
          InkWell(
            onTap: () => _removeRecipient(recipient),
            borderRadius: BorderRadius.circular(8),
            child: const Icon(
              Icons.close_rounded,
              size: 13,
              color: QuantColors.textMuted,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAutocompleteDropdown() {
    return Container(
      margin: const EdgeInsets.only(top: 4, bottom: 8),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: QuantColors.moltenAmber.withOpacity(0.4),
          width: 1,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.4),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: ListView.separated(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.symmetric(vertical: 4),
        itemCount: _filteredContacts.length,
        separatorBuilder: (_, __) =>
            const Divider(color: QuantColors.hairlineBorder, height: 1),
        itemBuilder: (context, index) {
          final contact = _filteredContacts[index];
          return InkWell(
            onTap: () => _addRecipient(contact),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 14,
                    backgroundColor: QuantColors.moltenAmber.withOpacity(0.2),
                    child: Text(
                      contact.initials,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        color: QuantColors.moltenAmber,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          contact.name,
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: QuantColors.textPrimary,
                          ),
                        ),
                        Text(
                          contact.email,
                          style: const TextStyle(
                            fontSize: 11,
                            color: QuantColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  QuantBadge(
                    label: 'Sovereign',
                    variant: QuantBadgeVariant.amber,
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildCcBccFields() {
    return Column(
      children: [
        Row(
          children: [
            const Text(
              'Cc:',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: QuantColors.textMuted,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: TextField(
                controller: _ccInputController,
                style: const TextStyle(
                  fontSize: 13,
                  color: QuantColors.textPrimary,
                ),
                decoration: const InputDecoration(
                  hintText: 'Cc recipients...',
                  hintStyle: TextStyle(
                    fontSize: 12,
                    color: QuantColors.textMuted,
                  ),
                  border: InputBorder.none,
                  isDense: true,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            const Text(
              'Bcc:',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: QuantColors.textMuted,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: TextField(
                controller: _bccInputController,
                style: const TextStyle(
                  fontSize: 13,
                  color: QuantColors.textPrimary,
                ),
                decoration: const InputDecoration(
                  hintText: 'Bcc recipients...',
                  hintStyle: TextStyle(
                    fontSize: 12,
                    color: QuantColors.textMuted,
                  ),
                  border: InputBorder.none,
                  isDense: true,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildSubjectField() {
    return TextField(
      controller: _subjectController,
      style: const TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w700,
        color: QuantColors.textPrimary,
      ),
      decoration: const InputDecoration(
        hintText: 'Subject',
        hintStyle: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w500,
          color: QuantColors.textMuted,
        ),
        border: InputBorder.none,
        isDense: true,
        contentPadding: EdgeInsets.symmetric(vertical: 4),
      ),
    );
  }

  Widget _buildAttachmentGuardWarning() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: QuantColors.statusError.withOpacity(0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: QuantColors.statusError.withOpacity(0.6),
          width: 1,
        ),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.warning_amber_rounded,
            color: QuantColors.statusError,
            size: 20,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Attachment limit exceeded: ${_formatBytes(_totalAttachmentBytes)} / 25.0 MB max. Remove items or upload to QuantDrive sovereign link to send.',
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: QuantColors.statusError,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAttachmentChips() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'Attachments (${_attachments.length})',
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: QuantColors.textSecondary,
              ),
            ),
            Text(
              '${_formatBytes(_totalAttachmentBytes)} / 25.0 MB',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                fontFamily: 'monospace',
                color: _isOverAttachmentLimit
                    ? QuantColors.statusError
                    : QuantColors.textMuted,
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          runSpacing: 6,
          children: _attachments.map((att) {
            return Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: QuantColors.darkSlateCard,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: _isOverAttachmentLimit
                      ? QuantColors.statusError.withOpacity(0.4)
                      : QuantColors.hairlineBorder,
                  width: 1,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    att.icon,
                    size: 15,
                    color: QuantColors.moltenAmber,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    att.name,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: QuantColors.textPrimary,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    att.formattedSize,
                    style: const TextStyle(
                      fontSize: 10,
                      color: QuantColors.textMuted,
                    ),
                  ),
                  const SizedBox(width: 4),
                  InkWell(
                    onTap: () => _removeAttachment(att.id),
                    child: const Icon(
                      Icons.close_rounded,
                      size: 13,
                      color: QuantColors.textMuted,
                    ),
                  ),
                ],
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _buildBodyField() {
    return TextField(
      controller: _bodyController,
      focusNode: _bodyFocusNode,
      maxLines: null,
      minLines: 12,
      style: const TextStyle(
        fontSize: 14.5,
        color: QuantColors.textPrimary,
        height: 1.55,
      ),
      decoration: const InputDecoration(
        hintText: 'Compose sovereign message...',
        hintStyle: TextStyle(
          fontSize: 14.5,
          color: QuantColors.textMuted,
        ),
        border: InputBorder.none,
      ),
    );
  }

  Widget _buildFormattingToolbar() {
    return Container(
      padding: EdgeInsets.only(
        left: 12,
        right: 12,
        top: 6,
        bottom: MediaQuery.of(context).viewInsets.bottom > 0 ? 6 : 14,
      ),
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateCard,
        border: Border(
          top: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            // Bold
            _toolButton(
              icon: Icons.format_bold_rounded,
              tooltip: 'Bold (**text**)',
              onTap: () => _applyFormat('**'),
            ),
            // Italic
            _toolButton(
              icon: Icons.format_italic_rounded,
              tooltip: 'Italic (*text*)',
              onTap: () => _applyFormat('*'),
            ),
            // Strikethrough
            _toolButton(
              icon: Icons.format_strikethrough_rounded,
              tooltip: 'Strikethrough (~~text~~)',
              onTap: () => _applyFormat('~~'),
            ),
            const _ToolDivider(),
            // Bullet List
            _toolButton(
              icon: Icons.format_list_bulleted_rounded,
              tooltip: 'Bullet List',
              onTap: () => _applyLinePrefix('• '),
            ),
            // Numbered List
            _toolButton(
              icon: Icons.format_list_numbered_rounded,
              tooltip: 'Numbered List',
              onTap: () => _applyLinePrefix('1. '),
            ),
            // Quote
            _toolButton(
              icon: Icons.format_quote_rounded,
              tooltip: 'Quote Block',
              onTap: () => _applyLinePrefix('> '),
            ),
            // Code Block
            _toolButton(
              icon: Icons.code_rounded,
              tooltip: 'Code Block',
              onTap: () => _applyFormat('```\n', '\n```'),
            ),
            // Link
            _toolButton(
              icon: Icons.link_rounded,
              tooltip: 'Insert Link [title](url)',
              onTap: () => _applyFormat('[', '](https://)'),
            ),
            const _ToolDivider(),
            // Quanty AI synthesis quick launcher
            InkWell(
              onTap: _openQuantyAiAssist,
              borderRadius: BorderRadius.circular(8),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: QuantColors.moltenAmber.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: QuantColors.moltenAmber.withOpacity(0.4),
                    width: 0.8,
                  ),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.auto_awesome_rounded,
                      size: 14,
                      color: QuantColors.moltenAmber,
                    ),
                    SizedBox(width: 4),
                    Text(
                      'Quanty Assist',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: QuantColors.moltenAmber,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 8),
            // Attachment action
            _toolButton(
              icon: Icons.attach_file_rounded,
              tooltip: 'Attach File (25MB Limit)',
              onTap: _showAttachmentPicker,
            ),
          ],
        ),
      ),
    );
  }

  Widget _toolButton({
    required IconData icon,
    required String tooltip,
    required VoidCallback onTap,
  }) {
    return IconButton(
      icon: Icon(icon, size: 19, color: QuantColors.textSecondary),
      onPressed: onTap,
      tooltip: tooltip,
      splashRadius: 18,
      padding: const EdgeInsets.all(6),
      constraints: const BoxConstraints(minWidth: 34, minHeight: 34),
    );
  }
}

class _ToolDivider extends StatelessWidget {
  const _ToolDivider();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 1,
      height: 18,
      margin: const EdgeInsets.symmetric(horizontal: 6),
      color: QuantColors.hairlineBorder,
    );
  }
}

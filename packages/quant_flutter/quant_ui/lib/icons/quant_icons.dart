import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// Vector SVG Icons and Pure ImageVectors for Quant Ecosystem.
/// Strictly ZERO raw Unicode emojis.
class QuantIcons {
  QuantIcons._();

  // Asset paths
  static const String mailSvgPath = 'packages/quant_ui/assets/icons/quant_mail.svg';
  static const String calendarSvgPath = 'packages/quant_ui/assets/icons/quant_calendar.svg';
  static const String driveSvgPath = 'packages/quant_ui/assets/icons/quant_drive.svg';
  static const String contactsSvgPath = 'packages/quant_ui/assets/icons/quant_contacts.svg';
  static const String gitSvgPath = 'packages/quant_ui/assets/icons/quant_git.svg';
  static const String aiSvgPath = 'packages/quant_ui/assets/icons/quant_ai.svg';

  // Raw inline SVG strings for fallback or zero-disk rendering
  static const String mailSvg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>''';
  static const String calendarSvg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>''';
  static const String driveSvg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>''';
  static const String contactsSvg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>''';
  static const String gitSvg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>''';
  static const String aiSvg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4m0 12v4M2 12h4m12 0h4m-3.17-6.83-2.83 2.83m-8 8-2.83 2.83m0-13.66 2.83 2.83m8 8 2.83 2.83"/><circle cx="12" cy="12" r="3"/></svg>''';

  /// Pure SVG Widget renderer
  static Widget svg(
    String rawSvg, {
    double size = 20.0,
    Color? color,
  }) {
    return SvgPicture.string(
      rawSvg,
      width: size,
      height: size,
      colorFilter: color != null
          ? ColorFilter.mode(color, BlendMode.srcIn)
          : null,
    );
  }

  /// Mail Vector Icon
  static Widget mail({double size = 20.0, Color? color}) =>
      svg(mailSvg, size: size, color: color);

  /// Calendar Vector Icon
  static Widget calendar({double size = 20.0, Color? color}) =>
      svg(calendarSvg, size: size, color: color);

  /// Drive Vector Icon
  static Widget drive({double size = 20.0, Color? color}) =>
      svg(driveSvg, size: size, color: color);

  /// Contacts Vector Icon
  static Widget contacts({double size = 20.0, Color? color}) =>
      svg(contactsSvg, size: size, color: color);

  /// Git Vector Icon
  static Widget git({double size = 20.0, Color? color}) =>
      svg(gitSvg, size: size, color: color);

  /// AI / Copilot Vector Icon
  static Widget ai({double size = 20.0, Color? color}) =>
      svg(aiSvg, size: size, color: color);
}

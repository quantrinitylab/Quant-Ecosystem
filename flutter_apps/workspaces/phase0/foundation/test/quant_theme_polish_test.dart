// VQA-P2-22 regression tests: QuantMail theme polish.
// quantMailDark / quantMailLight pass through _quantMailPolish, which must
// kill the blue appAccent (#3B82F6) resurfacing found by live-stage VQA:
// (1) focused search-field border, (2) selected FilterChip "Unread",
// (3) error-state FilledButton.tonal "Retry". All checks are
// scheme-relative: the primary carries the truth for each theme.
//
// P2-24 note (2026-10-04, design-atelier call implemented): quantMailLight's
// primary is lava-deep #C2410C — single lava accent, indigo #4F46E5 removed.
// Dark group below is untouched by P2-24 (accent #FF8C42 stays).

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_foundation/quant_foundation.dart';

void main() {
  group('quantMailDark — VQA-P2-22 blue-resurfacing kill', () {
    final theme = QuantTheme.quantMailDark;
    final scheme = theme.colorScheme;

    test('primary is orange #FF8C42, not blue', () {
      expect(scheme.primary, const Color(0xFFFF8C42));
      expect(scheme.primary, isNot(const Color(0xFF3B82F6)));
    });

    test('focusColor follows primary (no blue focus glow)', () {
      expect(theme.focusColor, scheme.primary);
      expect(theme.focusColor, isNot(const Color(0xFF3B82F6)));
    });

    test('focusedBorder is primary-tinted OutlineInputBorder', () {
      final border = theme.inputDecorationTheme.focusedBorder;
      expect(border, isA<OutlineInputBorder>());
      final outline = border! as OutlineInputBorder;
      expect(outline.borderSide.color, scheme.primary);
      expect(outline.borderSide.width, 2);
      expect(outline.borderRadius,
          const BorderRadius.all(Radius.circular(10)));
    });

    test('chipTheme speaks primary (selected "Unread" chip)', () {
      expect(theme.chipTheme.selectedColor, scheme.primary);
      expect(theme.chipTheme.checkmarkColor, scheme.onPrimary);
      expect(theme.chipTheme.secondaryLabelStyle!.color, scheme.onPrimary);
    });

    test('secondaryContainer/onSecondaryContainer derive from primary', () {
      expect(
        scheme.secondaryContainer,
        Color.alphaBlend(
          scheme.primary.withValues(alpha: 0.18),
          scheme.surface,
        ),
      );
      expect(scheme.onSecondaryContainer, scheme.primary);
    });
  });

  group('quantMailLight — same guarantees relative to ITS primary', () {
    final theme = QuantTheme.quantMailLight;
    final scheme = theme.colorScheme;

    test('primary is lava-deep #C2410C (P2-24 single lava accent)', () {
      expect(scheme.primary, const Color(0xFFC2410C));
    });

    test('focusColor follows primary', () {
      expect(theme.focusColor, scheme.primary);
    });

    test('focusedBorder is primary-tinted OutlineInputBorder', () {
      final border = theme.inputDecorationTheme.focusedBorder;
      expect(border, isA<OutlineInputBorder>());
      final outline = border! as OutlineInputBorder;
      expect(outline.borderSide.color, scheme.primary);
      expect(outline.borderSide.width, 2);
    });

    test('chipTheme speaks primary', () {
      expect(theme.chipTheme.selectedColor, scheme.primary);
      expect(theme.chipTheme.checkmarkColor, scheme.onPrimary);
    });

    test('secondaryContainer/onSecondaryContainer derive from primary', () {
      expect(
        scheme.secondaryContainer,
        Color.alphaBlend(
          scheme.primary.withValues(alpha: 0.18),
          scheme.surface,
        ),
      );
      expect(scheme.onSecondaryContainer, scheme.primary);
    });
  });
}

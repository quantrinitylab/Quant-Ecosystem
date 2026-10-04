import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_app/src/widgets/sender_avatar.dart';

void main() {
  Widget wrap(Widget child) => MaterialApp(
        theme: ThemeData.dark(useMaterial3: true),
        home: Scaffold(body: Center(child: child)),
      );

  group('SenderAvatar', () {
    testWidgets('renders the initial glyph', (WidgetTester tester) async {
      await tester.pumpWidget(
        wrap(const SenderAvatar(seed: 'alice@example.com', initial: 'A')),
      );
      expect(find.text('A'), findsOneWidget);
    });

    testWidgets('passes the semantics label through', (WidgetTester tester) async {
      await tester.pumpWidget(
        wrap(const SenderAvatar(
          seed: 'alice@example.com',
          initial: 'A',
          semanticsLabel: 'Avatar for Alice',
        )),
      );
      expect(find.bySemanticsLabel('Avatar for Alice'), findsOneWidget);
    });

    testWidgets('respects a custom radius', (WidgetTester tester) async {
      await tester.pumpWidget(
        wrap(const SenderAvatar(
          seed: 'alice@example.com',
          initial: 'A',
          radius: 28,
        )),
      );
      final CircleAvatar avatar =
          tester.widget<CircleAvatar>(find.byType(CircleAvatar));
      expect(avatar.radius, 28);
    });
  });

  group('avatar palette', () {
    ColorScheme scheme() =>
        ColorScheme.fromSeed(seedColor: Colors.orange, brightness: Brightness.dark);

    test('is deterministic for the same seed', () {
      final Color a = avatarBackground('alice@example.com', scheme());
      final Color b = avatarBackground('alice@example.com', scheme());
      expect(a, b);
    });

    test('varies hue across different seeds (VQA-P2-02)', () {
      final Set<Color> colors = <Color>{
        for (final String seed in <String>[
          'a@x.io',
          'b@x.io',
          'c@x.io',
          'd@x.io',
          'e@x.io',
          'f@x.io',
          'g@x.io',
          'h@x.io',
        ])
          avatarBackground(seed, scheme()),
      };
      // 6 hue stops exist; 8 distinct seeds must not collapse to one.
      expect(colors.length, greaterThan(1));
    });

    test('foreground is the same hue family as the background', () {
      const String seed = 'alice@example.com';
      final double bgHue = HSLColor.fromColor(avatarBackground(seed, scheme())).hue;
      final double fgHue = HSLColor.fromColor(avatarForeground(seed, scheme())).hue;
      expect((bgHue - fgHue).abs(), lessThan(1.0));
    });

    test('light scheme produces light backgrounds', () {
      final ColorScheme light =
          ColorScheme.fromSeed(seedColor: Colors.orange, brightness: Brightness.light);
      final double lightness =
          HSLColor.fromColor(avatarBackground('alice@example.com', light)).lightness;
      expect(lightness, greaterThan(0.7));
    });

    test('fnv1a32 is stable for known input', () {
      expect(fnv1a32(''), 0x811C9DC5);
      expect(fnv1a32('a'), fnv1a32('a'));
      expect(fnv1a32('a') != fnv1a32('b'), isTrue);
    });
  });
}

# ads_theme

QuantAds design-system package: the visual foundation for the QuantAds
Flutter app. Real, compilable-style Dart; `flutter_lints` conventions.

## Token source

Adapted from `quant_foundation`'s theme files, which are Dart ports of the
`@quant/brand` SSOT (`packages/brand/src/colors.ts`, `typography.ts`,
`motion.ts`). All brand ramps are preserved 1:1, so QuantAds shades exactly
like the rest of the ecosystem. Nothing here invents new brand values — the
only additions are ads-specific *roles* derived from those same ramps.

## Ads-specific additions

- **`AdsColors`** — brand ramps (primary orange, neutral slate, semantic
  red/green/blue) plus the amber/gold accent ramp (`adsAmber*`, promoted from
  the brand `accent` ramp) and the per-app accent (`quantAds` `#059669`).
- **`AdsCtaColors`** — campaign/CTA roles: `#F59E0B`-derived light/dark
  primary accent (`ctaLight`/`ctaDark`), on-CTA labels, focus ring, tinted
  containers.
- **`AdsSemanticColors`** — direction-of-money roles for ads flows:
  - `earning*` — payouts / ROI gains (success green)
  - `spend*` — ad spend / outflows (error red)
  - `creditsGold*` — Quant Credits economy balance (gold, distinct from fiat)
- **`AdsTypography` / `AdsTextStyles`** — full 12–60px type ramp, plus
  `metric` (30px bold) for dashboard stat figures (spend, ROAS, impressions).
- **`AdsDurations` / `AdsEasings` / `AdsSpring`** — motion tokens, same
  Framer-Motion-convention springs as the brand.

## Usage

```dart
import 'package:ads_theme/ads_theme.dart';

MaterialApp(
  theme: AdsTheme.adsLight,
  darkTheme: AdsTheme.adsDark,
  themeMode: ThemeMode.dark, // dark-first product default
  home: const DashboardPage(),
);
```

Widgets that re-resolve the theme from the tree:

```dart
final ThemeData theme = AdsTheme.ofContext(context);
// or without a context:
final ThemeData theme = AdsTheme.of(Brightness.dark);
```

Tokens directly:

```dart
Container(
  color: AdsCtaColors.ctaDark,
  child: Text('Launch campaign', style: AdsTextStyles.button),
);
```

## Structure

```
lib/
  ads_theme.dart                 # barrel (library ads_theme)
  src/theme/
    ads_colors.dart              # AdsColors, AdsCtaColors, AdsSemanticColors
    ads_typography.dart          # AdsTypography, AdsTextStyles
    ads_motion.dart              # AdsDurations, AdsEasings, AdsSpring
    ads_theme.dart               # AdsTheme.adsLight/adsDark
```

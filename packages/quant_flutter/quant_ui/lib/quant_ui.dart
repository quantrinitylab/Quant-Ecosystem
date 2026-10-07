/// Sovereign Obsidian Luxury Design System for Flutter in Quant Ecosystem.
///
/// Hardware-accelerated Skia & Impeller UI components, brand color tokens,
/// 5-pillar mode switcher, AI live dynamic capsule, sub-5ms voice search,
/// pure vector SVG icons, and context-specific bottom navigation bars.
library quant_ui;

export 'theme/quant_colors.dart';
export 'theme/quant_typography.dart';
export 'theme/quant_theme.dart';
export 'models/quant_pillar.dart';
export 'components/quant_pillar_top_bar.dart';
export 'components/quant_ai_capsule.dart';
export 'components/quant_voice_search_bar.dart';
export 'components/context_bottom_nav_bar.dart';
export 'components/frosted_card.dart';
export 'components/squircle_button.dart';
export 'components/quant_badge.dart';

// New widget architecture
export 'widgets/squircle_switcher.dart';
export 'widgets/dynamic_island_capsule.dart';
export 'widgets/context_bottom_nav.dart';
export 'widgets/quant_squircle_container.dart';

// Vector icons and pure SVGs (zero Unicode emojis)
export 'icons/quant_icons.dart';

// Backward compatibility aliases
typedef DynamicIslandCapsule = QuantAiCapsule;
typedef VoiceSearchBar = QuantVoiceSearchBar;
typedef PillarTopBar = QuantPillarTopBar;

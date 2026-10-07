/// Sovereign Obsidian Luxury Design System for Flutter in Quant Ecosystem.
///
/// Hardware-accelerated Skia & Impeller UI components, brand color tokens,
/// 5-pillar mode switcher, AI live dynamic capsule, sub-5ms voice search,
/// and context-specific bottom navigation bars.
library quant_ui;

// Canonical theme tokens live in package:quant_theme (single source of truth).
// quant_ui re-exports them so apps importing only quant_ui keep working.
export 'package:quant_theme/quant_theme.dart';

export 'models/quant_pillar.dart';
export 'components/quant_pillar_top_bar.dart';
export 'components/quant_ai_capsule.dart';
export 'components/quant_voice_search_bar.dart';
export 'components/context_bottom_nav_bar.dart';
export 'components/frosted_card.dart';
export 'components/squircle_button.dart';
export 'components/quant_badge.dart';

// Backward compatibility aliases
import 'components/quant_ai_capsule.dart';
import 'components/quant_voice_search_bar.dart';

typedef DynamicIslandCapsule = QuantAiCapsule;
typedef VoiceSearchBar = QuantVoiceSearchBar;

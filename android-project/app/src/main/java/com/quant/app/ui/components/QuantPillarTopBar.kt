package com.quant.app.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.CallSplit
import androidx.compose.material.icons.filled.AccountBox
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Badge
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Cloud
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Event
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Today
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.Work
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quant.app.ui.navigation.ProductivityTab

/**
 * Data model for horizontal sub-category lens chips.
 * Pure Material 3 ImageVectors and clean alphanumeric labels (zero raw Unicode emojis).
 */
data class PillarLensItem(
    val id: String,
    val label: String,
    val countBadge: String? = null,
    val icon: ImageVector? = null,
    val isAccentBadge: Boolean = false
)

/**
 * Metadata definition for a super-app pillar mode tile.
 */
data class PillarTileSpec(
    val tab: ProductivityTab,
    val title: String,
    val accentColor: Color,
    val icon: ImageVector
)

/**
 * The 5 luxury squircle mode selector tiles grounded in Amazon & Flipkart super-app switcher design:
 * 1. Mail (Molten Amber #FF8C42, Icons.Default.Email)
 * 2. Calendar (Sunset Gold #F59E0B, Icons.Default.DateRange)
 * 3. Drive (Sovereign Cyan #38BDF8, Icons.Default.Cloud)
 * 4. Contacts (Emerald Matrix #10B981, Icons.Default.AccountBox)
 * 5. QuantGit (Obsidian Purple #A78BFA, Icons.Default.Code)
 */
val PILLAR_TILES: List<PillarTileSpec> = listOf(
    PillarTileSpec(
        tab = ProductivityTab.Mail,
        title = "Mail",
        accentColor = Color(0xFFFF, 0x8C, 0x42), // Molten Amber #FF8C42
        icon = Icons.Default.Email
    ),
    PillarTileSpec(
        tab = ProductivityTab.Calendar,
        title = "Calendar",
        accentColor = Color(0xFFF5, 0x9E, 0x0B), // Sunset Gold #F59E0B
        icon = Icons.Default.DateRange
    ),
    PillarTileSpec(
        tab = ProductivityTab.Drive,
        title = "Drive",
        accentColor = Color(0xFF38, 0xBD, 0xF8), // Sovereign Cyan #38BDF8
        icon = Icons.Default.Cloud
    ),
    PillarTileSpec(
        tab = ProductivityTab.Contacts,
        title = "Contacts",
        accentColor = Color(0xFF10, 0xB9, 0x81), // Emerald Matrix #10B981
        icon = Icons.Default.AccountBox
    ),
    PillarTileSpec(
        tab = ProductivityTab.QuantGit,
        title = "QuantGit",
        accentColor = Color(0xFFA7, 0x8B, 0xFA), // Obsidian Purple #A78BFA
        icon = Icons.Default.Code
    )
)

/**
 * Returns the default sub-category lenses for each pillar.
 * Clean alphanumeric labels and pure Material 3 vector icons (zero raw Unicode emojis).
 */
fun getDefaultLensesForTab(tab: ProductivityTab): List<PillarLensItem> {
    return when (tab) {
        ProductivityTab.Mail -> listOf(
            PillarLensItem(id = "all", label = "All", countBadge = "12", icon = Icons.Default.Email),
            PillarLensItem(id = "important", label = "Important", countBadge = "3", icon = Icons.Default.Bolt, isAccentBadge = true),
            PillarLensItem(id = "teams", label = "Teams", icon = Icons.Default.Group),
            PillarLensItem(id = "updates", label = "Updates", countBadge = "5", icon = Icons.Default.Notifications),
            PillarLensItem(id = "promo", label = "Promo", icon = Icons.Default.LocalOffer),
            PillarLensItem(id = "spam", label = "Spam", icon = Icons.Default.Security)
        )
        ProductivityTab.Calendar -> listOf(
            PillarLensItem(id = "today", label = "Today", countBadge = "4", icon = Icons.Default.Today, isAccentBadge = true),
            PillarLensItem(id = "upcoming", label = "Upcoming", countBadge = "8", icon = Icons.Default.Event),
            PillarLensItem(id = "meetings", label = "Meetings", countBadge = "3", icon = Icons.Default.Videocam),
            PillarLensItem(id = "work", label = "Work", icon = Icons.Default.Work),
            PillarLensItem(id = "personal", label = "Personal", icon = Icons.Default.Person)
        )
        ProductivityTab.Drive -> listOf(
            PillarLensItem(id = "all_files", label = "All Files", countBadge = "128", icon = Icons.Default.FolderOpen),
            PillarLensItem(id = "recent", label = "Recent", icon = Icons.Default.Schedule),
            PillarLensItem(id = "shared", label = "Shared", countBadge = "14", icon = Icons.Default.Share),
            PillarLensItem(id = "starred", label = "Starred", countBadge = "9", icon = Icons.Default.Star, isAccentBadge = true),
            PillarLensItem(id = "trash", label = "Trash", icon = Icons.Default.Delete)
        )
        ProductivityTab.Contacts -> listOf(
            PillarLensItem(id = "all_contacts", label = "All", countBadge = "64", icon = Icons.Default.Person),
            PillarLensItem(id = "favorites", label = "Favorites", countBadge = "12", icon = Icons.Default.Star, isAccentBadge = true),
            PillarLensItem(id = "coworkers", label = "Coworkers", countBadge = "28", icon = Icons.Default.Badge),
            PillarLensItem(id = "teams_org", label = "Teams", countBadge = "5", icon = Icons.Default.Group)
        )
        ProductivityTab.QuantGit -> listOf(
            PillarLensItem(id = "repos", label = "Repositories", countBadge = "18", icon = Icons.Default.FolderOpen),
            PillarLensItem(id = "prs", label = "Pull Requests", countBadge = "3", icon = Icons.AutoMirrored.Filled.CallSplit, isAccentBadge = true),
            PillarLensItem(id = "issues", label = "Issues", countBadge = "7", icon = Icons.Default.ErrorOutline),
            PillarLensItem(id = "starred_repos", label = "Starred", countBadge = "42", icon = Icons.Default.Star)
        )
    }
}

/**
 * Returns contextual search placeholder string for active productivity pillar.
 */
fun getContextualSearchPlaceholder(tab: ProductivityTab): String {
    return when (tab) {
        ProductivityTab.Mail -> "Search emails... <5ms"
        ProductivityTab.Calendar -> "Search events, schedules... <5ms"
        ProductivityTab.Drive -> "Search files, docs, media... <5ms"
        ProductivityTab.Contacts -> "Search contacts, teams... <5ms"
        ProductivityTab.QuantGit -> "Search repos, commits, PRs... <5ms"
    }
}

/**
 * Returns contextual default subtitle text for the Dynamic Island AI Capsule.
 */
fun getDefaultAiCapsuleText(tab: ProductivityTab): String {
    return when (tab) {
        ProductivityTab.Mail -> "Quant AI: 3 urgent emails summarized"
        ProductivityTab.Calendar -> "Quant AI: Next meeting in 24m · No conflicts"
        ProductivityTab.Drive -> "Quant AI: 2 shared files indexed · Synced"
        ProductivityTab.Contacts -> "Quant AI: 3 suggested connections"
        ProductivityTab.QuantGit -> "Quant AI: All CI checks green on main"
    }
}

/**
 * Dynamic Island "Quant AI Live Capsule":
 * - Sleek frosted black pill (#090A0E) with 20dp squircle corner radius.
 * - Molten AI Orb pulsing beacon with live alpha/scale transition.
 * - Contextual subtitle ("Quant AI: 3 urgent emails summarized") and "<5ms E2EE" badge.
 * - Clickable to trigger voice / assist.
 * - Zero clipPath calls (pure RoundedCornerShape & CircleShape for 100% Skia stability).
 */
@Composable
fun DynamicIslandAiCapsule(
    activeTab: ProductivityTab,
    text: String? = null,
    onClick: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val haptic = LocalHapticFeedback.current
    val accentColor = activeTab.tabAccentColor

    val infiniteTransition = rememberInfiniteTransition(label = "dynamic_island_orb")
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 0.35f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1400, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "aiOrbPulseAlpha"
    )
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 0.9f,
        targetValue = 1.12f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1400, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "aiOrbPulseScale"
    )

    val displayText = text ?: getDefaultAiCapsuleText(activeTab)

    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(Color(0xFF09, 0x0A, 0x0E))
            .border(
                width = 0.8.dp,
                color = accentColor.copy(alpha = 0.35f),
                shape = RoundedCornerShape(20.dp)
            )
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null
            ) {
                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                onClick()
            }
            .padding(horizontal = 14.dp, vertical = 7.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            // Left: Molten AI Orb pulsing beacon + Subtitle text
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.weight(1f, fill = false)
            ) {
                // Molten AI Orb pulsing dot with layered glow
                Box(
                    modifier = Modifier.size(16.dp),
                    contentAlignment = Alignment.Center
                ) {
                    // Outer halo
                    Box(
                        modifier = Modifier
                            .size(16.dp * pulseScale)
                            .clip(CircleShape)
                            .background(accentColor.copy(alpha = pulseAlpha * 0.3f))
                    )
                    // Inner core orb
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(accentColor)
                    )
                }

                Spacer(modifier = Modifier.width(8.dp))

                // Sparkle icon
                Icon(
                    imageVector = Icons.Default.AutoAwesome,
                    contentDescription = null,
                    tint = accentColor,
                    modifier = Modifier.size(13.dp)
                )

                Spacer(modifier = Modifier.width(6.dp))

                // Subtitle text
                Text(
                    text = displayText,
                    color = Color(0xFFF8, 0xFA, 0xFC),
                    fontSize = 11.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            Spacer(modifier = Modifier.width(8.dp))

            // Right: Sovereign status pill
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .background(Color(0xFF16, 0x1A, 0x24))
                    .border(0.8.dp, Color(0xFF25, 0x2D, 0x3E), RoundedCornerShape(10.dp))
                    .padding(horizontal = 7.dp, vertical = 2.5.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(5.dp)
                        .clip(CircleShape)
                        .background(Color(0xFF10, 0xB9, 0x81)) // Live emerald beacon
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = "<5ms E2EE",
                    color = Color(0xFF38, 0xBD, 0xF8),
                    fontSize = 9.5.sp,
                    fontWeight = FontWeight.Bold,
                    lineHeight = 10.sp
                )
            }
        }
    }
}

/**
 * Super-App Mode Selector Tile:
 * - Active tile: soft-glow squircle container (tabColor 18% alpha), hairline border (50% alpha), bold label, spring animation.
 * - Inactive tile: obsidian slate (#12151E) with subtle border (#1E2433).
 * - Zero clipPath calls (pure RoundedCornerShape for 100% Skia stability).
 */
@Composable
fun PillarModeTile(
    spec: PillarTileSpec,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val haptic = LocalHapticFeedback.current

    val animBg by animateColorAsState(
        targetValue = if (isSelected) spec.accentColor.copy(alpha = 0.18f) else Color(0xFF12, 0x15, 0x1E),
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
        label = "tile_bg_${spec.tab.name}"
    )

    val animBorder by animateColorAsState(
        targetValue = if (isSelected) spec.accentColor.copy(alpha = 0.5f) else Color(0xFF1E, 0x24, 0x33),
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
        label = "tile_border_${spec.tab.name}"
    )

    val animContentColor by animateColorAsState(
        targetValue = if (isSelected) spec.accentColor else Color(0xFF94, 0xA3, 0xB8),
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
        label = "tile_content_${spec.tab.name}"
    )

    Box(
        modifier = modifier
            .height(54.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(animBg)
            .border(
                width = if (isSelected) 1.dp else 0.8.dp,
                color = animBorder,
                shape = RoundedCornerShape(12.dp)
            )
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null
            ) {
                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                onClick()
            },
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = spec.icon,
                contentDescription = spec.title,
                tint = animContentColor,
                modifier = Modifier.size(20.dp)
            )

            Spacer(modifier = Modifier.height(3.dp))

            Text(
                text = spec.title,
                color = if (isSelected) Color(0xFFF8, 0xFA, 0xFC) else Color(0xFF94, 0xA3, 0xB8),
                fontSize = 10.5.sp,
                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

/**
 * Sticky Voice Search Bar:
 * - Rounded 12dp search bar with Search icon.
 * - Contextual placeholder (e.g., "Search emails... <5ms").
 * - Speed chip ("<5ms") and dedicated Mic button (Icons.Default.Mic) on right.
 */
@Composable
fun PillarVoiceSearchBar(
    activeTab: ProductivityTab,
    placeholder: String? = null,
    searchQuery: String = "",
    onSearchClick: () -> Unit = {},
    onVoiceClick: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val haptic = LocalHapticFeedback.current
    val accentColor = activeTab.tabAccentColor
    val placeholderText = placeholder ?: getContextualSearchPlaceholder(activeTab)

    Surface(
        onClick = {
            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            onSearchClick()
        },
        modifier = modifier
            .fillMaxWidth()
            .height(46.dp),
        shape = RoundedCornerShape(12.dp),
        color = Color(0xFF14, 0x17, 0x22),
        border = BorderStroke(0.8.dp, Color(0xFF20, 0x25, 0x34))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.Search,
                contentDescription = "Search",
                tint = Color(0xFF94, 0xA3, 0xB8),
                modifier = Modifier.size(19.dp)
            )

            Spacer(modifier = Modifier.width(10.dp))

            Text(
                text = if (searchQuery.isNotBlank()) searchQuery else placeholderText,
                color = if (searchQuery.isNotBlank()) Color(0xFFF8, 0xFA, 0xFC) else Color(0xFF64, 0x74, 0x8B),
                fontSize = 13.5.sp,
                fontWeight = FontWeight.Normal,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )

            // Speed Chip: "<5ms"
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(Color(0xFF1E, 0x24, 0x33))
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                Text(
                    text = "<5ms",
                    color = Color(0xFF38, 0xBD, 0xF8),
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            Spacer(modifier = Modifier.width(8.dp))

            // Dedicated Voice Mic Button on right
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .background(accentColor.copy(alpha = 0.16f))
                    .border(0.8.dp, accentColor.copy(alpha = 0.45f), CircleShape)
                    .clickable {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        onVoiceClick()
                    },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Mic,
                    contentDescription = "Voice Search",
                    tint = accentColor,
                    modifier = Modifier.size(17.dp)
                )
            }
        }
    }
}

/**
 * Sub-Category Lens Chip:
 * - Pure Material 3 ImageVector + clean alphanumeric label (zero raw Unicode emojis).
 * - Active: Soft tinted background with colored hairline border.
 * - Inactive: Obsidian slate with subtle hairline border.
 */
@Composable
fun PillarLensChip(
    lens: PillarLensItem,
    isSelected: Boolean,
    accentColor: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val haptic = LocalHapticFeedback.current

    val animBg by animateColorAsState(
        targetValue = if (isSelected) accentColor.copy(alpha = 0.16f) else Color(0xFF14, 0x17, 0x22),
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
        label = "lens_bg_${lens.id}"
    )

    val animBorder by animateColorAsState(
        targetValue = if (isSelected) accentColor.copy(alpha = 0.6f) else Color(0xFF20, 0x25, 0x34),
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
        label = "lens_border_${lens.id}"
    )

    Row(
        modifier = modifier
            .clip(RoundedCornerShape(20.dp))
            .background(animBg)
            .border(
                width = 0.8.dp,
                color = animBorder,
                shape = RoundedCornerShape(20.dp)
            )
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null
            ) {
                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                onClick()
            }
            .padding(horizontal = 13.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (lens.icon != null) {
            Icon(
                imageVector = lens.icon,
                contentDescription = null,
                tint = if (isSelected) accentColor else Color(0xFF64, 0x74, 0x8B),
                modifier = Modifier.size(14.dp)
            )
            Spacer(modifier = Modifier.width(6.dp))
        }

        Text(
            text = lens.label,
            color = if (isSelected) Color(0xFFFFFFFF) else Color(0xFF94, 0xA3, 0xB8),
            fontSize = 12.5.sp,
            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Medium,
            maxLines = 1,
            softWrap = false
        )

        if (lens.countBadge != null) {
            Spacer(modifier = Modifier.width(6.dp))
            val badgeBg = if (lens.isAccentBadge) accentColor else Color(0xFF20, 0x25, 0x34)
            val badgeTextColor = if (lens.isAccentBadge) Color(0xFF09, 0x0A, 0x0E) else Color(0xFF94, 0xA3, 0xB8)

            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .background(badgeBg)
                    .padding(horizontal = 6.5.dp, vertical = 2.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = lens.countBadge,
                    color = badgeTextColor,
                    fontSize = 10.5.sp,
                    fontWeight = FontWeight.Bold,
                    lineHeight = 11.sp
                )
            }
        }
    }
}

/**
 * Sovereign Jetpack Compose Pillar Top Bar for the Quant Sovereign Android App.
 *
 * Grounded in Amazon & Flipkart Super-App Top Switcher design:
 * 1. Dynamic Island "Quant AI Live Capsule":
 *    - Sleek frosted black pill (#090A0E) with 20dp rounded squircle.
 *    - Molten AI Orb pulsing beacon with live alpha/scale transition.
 *    - Contextual subtitle ("Quant AI: 3 urgent emails summarized") and "<5ms E2EE" badge.
 *    - Clickable to trigger voice / assist.
 * 2. 5 Luxury Squircle Mode Selector Tiles:
 *    - 1. Mail (Molten Amber #FF8C42, Icons.Default.Email)
 *    - 2. Calendar (Sunset Gold #F59E0B, Icons.Default.DateRange)
 *    - 3. Drive (Sovereign Cyan #38BDF8, Icons.Default.Cloud)
 *    - 4. Contacts (Emerald Matrix #10B981, Icons.Default.AccountBox)
 *    - 5. QuantGit (Obsidian Purple #A78BFA, Icons.Default.Code)
 *    - Active tile: soft-glow squircle container (tabColor 18% alpha), hairline border (50% alpha), bold label, spring animation.
 *    - Inactive tiles: obsidian slate (#12151E) with subtle border (#1E2433).
 * 3. Sticky Voice Search Bar:
 *    - Rounded 12dp search bar with Search icon, contextual placeholder ("Search emails... <5ms"),
 *      speed chip ("<5ms"), and dedicated Mic button (Icons.Default.Mic) on right.
 * 4. Horizontal Sub-Category Lenses Strip:
 *    - Smooth horizontal scrollable chips for active pillar.
 * 5. Zero Unicode raw emojis (pure Material 3 vector icons only).
 * 6. Zero clipPath calls (use RoundedCornerShape for 100% Skia stability).
 */
@Composable
fun QuantPillarTopBar(
    activeTab: ProductivityTab = ProductivityTab.Mail,
    onTabSelected: (ProductivityTab) -> Unit = {},
    selectedLensId: String = "all",
    onLensSelected: (String) -> Unit = {},
    customLenses: List<PillarLensItem>? = null,
    searchQuery: String = "",
    searchPlaceholder: String? = null,
    onSearchClick: () -> Unit = {},
    onVoiceClick: () -> Unit = {},
    aiCapsuleText: String? = null,
    onAiCapsuleClick: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(Color(0xFF0D, 0x10, 0x17))
            .statusBarsPadding()
    ) {
        // 1. Dynamic Island "Quant AI Live Capsule"
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 6.dp),
            contentAlignment = Alignment.Center
        ) {
            DynamicIslandAiCapsule(
                activeTab = activeTab,
                text = aiCapsuleText,
                onClick = onAiCapsuleClick
            )
        }

        // 2. 5 Luxury Squircle Mode Selector Tiles (Amazon & Flipkart Super-App Top Switcher)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            PILLAR_TILES.forEach { tile ->
                PillarModeTile(
                    spec = tile,
                    isSelected = tile.tab == activeTab,
                    onClick = { onTabSelected(tile.tab) },
                    modifier = Modifier.weight(1f)
                )
            }
        }

        // 3. Sticky Voice Search Bar (Rounded 12dp, Search icon, contextual placeholder, Mic button)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 5.dp)
        ) {
            PillarVoiceSearchBar(
                activeTab = activeTab,
                placeholder = searchPlaceholder,
                searchQuery = searchQuery,
                onSearchClick = onSearchClick,
                onVoiceClick = onVoiceClick
            )
        }

        // 4. Horizontal Sub-Category Lenses Strip (Smooth horizontal scrollable chips)
        val activeLenses = customLenses ?: remember(activeTab) { getDefaultLensesForTab(activeTab) }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 12.dp, vertical = 5.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            activeLenses.forEach { lens ->
                PillarLensChip(
                    lens = lens,
                    isSelected = lens.id == selectedLensId,
                    accentColor = activeTab.tabAccentColor,
                    onClick = { onLensSelected(lens.id) }
                )
            }
        }

        // Bottom hairline divider
        HorizontalDivider(
            thickness = 1.dp,
            color = Color(0xFF1E, 0x24, 0x33)
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0D1017)
@Composable
fun QuantPillarTopBarPreview() {
    QuantPillarTopBar(
        activeTab = ProductivityTab.Mail,
        selectedLensId = "important"
    )
}

@Preview(showBackground = true, backgroundColor = 0xFF0D1017)
@Composable
fun QuantPillarTopBarCalendarPreview() {
    QuantPillarTopBar(
        activeTab = ProductivityTab.Calendar,
        selectedLensId = "today"
    )
}

package com.quant.app.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quant.app.ui.navigation.ProductivityTab

/**
 * Sovereign Jetpack Compose Top App Bar for the Quant Ecosystem.
 * Matches the visual luxury and fidelity of QuantMail Web:
 * - Clean, uncluttered header with no clunky view mode button.
 * - Left: Glowing 40dp QuantBrandLogo + split BrandWordmark ('Quant' in white + app name in accent color).
 * - Center: Sleek frosted search trigger chip (surface Color(0xFF16, 0x18, 0x1D), border Color(0xFF28, 0x2C, 0x35), search icon, text 'Search emails (/)', '<5ms' speed badge).
 * - Right:
 *   - Live sync indicator dot (static glowing emerald green Color(0xFF10, 0xB9, 0x81) with soft halo).
 *   - Quanty AI Assistant button (sparkle '✨' in frosted circular button).
 *   - Ecosystem Account Switcher Avatar ('[Q]' in circular gradient with amber border) triggering onOpenAppSwitcher.
 */
@Composable
fun QuantTopAppBar(
    title: String = "QuantMail",
    appId: String = "quantmail",
    appInitials: String = "QM",
    accentColor: Color = Color(0xFFFF, 0x8C, 0x42),
    isNativeMode: Boolean = true,
    activeTab: ProductivityTab? = null,
    onToggleViewMode: () -> Unit = {},
    onSearchClick: () -> Unit = {},
    onOpenAppSwitcher: () -> Unit = {},
    onAssistantClick: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val haptic = LocalHapticFeedback.current

    // Resolve canonical appId for logo rendering
    val resolvedAppId = remember(appId, title, activeTab) {
        if (activeTab != null) {
            when (activeTab) {
                ProductivityTab.Mail -> "quantmail"
                ProductivityTab.Calendar -> "quantcalendar"
                ProductivityTab.Drive -> "quantdrive"
                ProductivityTab.Contacts -> "quantcontacts"
                ProductivityTab.QuantGit -> "quantgit"
            }
        } else if (appId.isNotBlank() && appId != "quantmail") {
            appId
        } else {
            when {
                title.contains("Calendar", ignoreCase = true) -> "quantcalendar"
                title.contains("Drive", ignoreCase = true) -> "quantdrive"
                title.contains("Contact", ignoreCase = true) -> "quantcontacts"
                title.contains("Git", ignoreCase = true) || title.contains("CodeHub", ignoreCase = true) -> "quantgit"
                title.contains("Chat", ignoreCase = true) -> "quantchat"
                title.contains("Gram", ignoreCase = true) -> "quantgram"
                title.contains("Tube", ignoreCase = true) -> "quantube"
                title.contains("AI", ignoreCase = true) -> "quantai"
                else -> appId
            }
        }
    }

    val wordmarkAppKey = remember(activeTab, resolvedAppId) {
        if (activeTab != null) {
            when (activeTab) {
                ProductivityTab.Mail -> "mail"
                ProductivityTab.Calendar -> "calendar"
                ProductivityTab.Drive -> "drive"
                ProductivityTab.Contacts -> "contacts"
                ProductivityTab.QuantGit -> "git"
            }
        } else {
            when {
                resolvedAppId.contains("cal") -> "calendar"
                resolvedAppId.contains("drive") -> "drive"
                resolvedAppId.contains("contact") || resolvedAppId.contains("dex") -> "contacts"
                resolvedAppId.contains("git") || resolvedAppId.contains("code") -> "git"
                resolvedAppId.contains("chat") -> "chat"
                resolvedAppId.contains("tube") -> "tube"
                resolvedAppId.contains("ai") -> "ai"
                else -> "mail"
            }
        }
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(Color(0xFF0B, 0x0C, 0x0E))
            .statusBarsPadding()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(60.dp)
                .padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            // 1. Left Section: Glowing 40dp QuantBrandLogo + Split BrandWordmark
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = {
                            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                            onOpenAppSwitcher()
                        }
                    )
            ) {
                if (activeTab != null) {
                    when (activeTab) {
                        ProductivityTab.Mail -> QuantMailLavaMark(size = 40.dp)
                        ProductivityTab.Calendar -> QuantCalendarMark(size = 40.dp)
                        ProductivityTab.Drive -> QuantDriveMark(size = 40.dp)
                        ProductivityTab.Contacts -> QuantContactsMark(size = 40.dp)
                        ProductivityTab.QuantGit -> QuantGitMark(size = 40.dp)
                    }
                } else {
                    QuantAppLogo(
                        appId = resolvedAppId,
                        size = 40.dp,
                        accentColor = accentColor
                    )
                }

                BrandWordmark(
                    app = wordmarkAppKey,
                    fontSize = 20.sp
                )
            }

            // 2. Center Section: Sleek frosted search trigger chip
            Surface(
                onClick = {
                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    onSearchClick()
                },
                shape = RoundedCornerShape(18.dp),
                color = Color(0xFF16, 0x18, 0x1D),
                border = BorderStroke(1.dp, Color(0xFF28, 0x2C, 0x35)),
                modifier = Modifier
                    .weight(1f)
                    .height(38.dp)
                    .padding(horizontal = 10.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(7.dp),
                        modifier = Modifier.weight(1f, fill = false)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Search,
                            contentDescription = "Search",
                            tint = Color(0xFF94, 0xA3, 0xB8),
                            modifier = Modifier.size(16.dp)
                        )
                        Text(
                            text = "Search emails (/)",
                            color = Color(0xFF94, 0xA3, 0xB8),
                            fontSize = 12.5.sp,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }

                    // '<5ms' Speed Badge
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(Color(0xFF10, 0xB9, 0x81).copy(alpha = 0.15f))
                            .border(
                                BorderStroke(0.5.dp, Color(0xFF10, 0xB9, 0x81).copy(alpha = 0.45f)),
                                RoundedCornerShape(6.dp)
                            )
                            .padding(horizontal = 5.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = "<5ms",
                            color = Color(0xFF10, 0xB9, 0x81),
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 0.2.sp
                        )
                    }
                }
            }

            // 3. Right Section: Live sync indicator + Quanty AI Assistant button + Account Switcher Avatar
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Live sync indicator dot: static high-fidelity glowing beacon (zero-jank, zero-ANR)
                val emeraldColor = Color(0xFF10, 0xB9, 0x81)
                Box(
                    modifier = Modifier.size(18.dp),
                    contentAlignment = Alignment.Center
                ) {
                    // Outer halo
                    Box(
                        modifier = Modifier
                            .size(14.dp)
                            .clip(CircleShape)
                            .background(emeraldColor.copy(alpha = 0.25f))
                    )
                    // Inner core beacon dot with subtle ambient shadow
                    Box(
                        modifier = Modifier
                            .size(7.dp)
                            .clip(CircleShape)
                            .background(emeraldColor)
                            .shadow(3.dp, CircleShape, ambientColor = emeraldColor, spotColor = emeraldColor)
                    )
                }

                // Quanty AI Assistant button (sparkle '✨' in frosted circular button)
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(Color(0xFF16, 0x18, 0x1D))
                        .border(BorderStroke(1.dp, Color(0xFF28, 0x2C, 0x35)), CircleShape)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onClick = {
                                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                onAssistantClick()
                            }
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "✨",
                        fontSize = 14.sp
                    )
                }

                // Ecosystem Account Switcher Avatar ('[Q]' in circular gradient with amber border)
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(
                            Brush.radialGradient(
                                0.0f to Color(0xFF38, 0x22, 0x14),
                                0.6f to Color(0xFF1C, 0x13, 0x0C),
                                1.0f to Color(0xFF0F, 0x0A, 0x06)
                            )
                        )
                        .border(BorderStroke(1.5.dp, Color(0xFFFF, 0x8C, 0x42)), CircleShape)
                        .shadow(4.dp, CircleShape, ambientColor = Color(0xFFFF, 0x8C, 0x42).copy(alpha = 0.35f))
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onClick = {
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                onOpenAppSwitcher()
                            }
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "Q",
                        color = Color(0xFFFF, 0xC1, 0x89),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.ExtraBold,
                        letterSpacing = 0.5.sp
                    )
                }
            }
        }

        // Frosted bottom border Color(0xFF26, 0x2A, 0x33)
        HorizontalDivider(
            thickness = 1.dp,
            color = Color(0xFF26, 0x2A, 0x33)
        )
    }
}

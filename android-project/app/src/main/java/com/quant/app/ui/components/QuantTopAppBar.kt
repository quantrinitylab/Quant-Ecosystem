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
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quant.app.auth.QuantAuthManager
import com.quant.app.ui.navigation.ProductivityTab

/**
 * Sovereign Jetpack Compose Top App Bar for the Quant Ecosystem.
 * Elevates the header to a world-class Superhuman / Linear luxury aesthetic:
 * - Surface: Deep obsidian frosted bar (#0D1017) with hairline divider (#1E2433).
 * - Height: 58dp with generous 16dp horizontal padding.
 * - Left: Refined 34dp molten squircle brand mark + split BrandWordmark
 *   ("Quant" in crisp white #F8FAFC + App Title in tab accent color)
 *   + static high-fidelity live sync beacon dot (#10B981).
 * - Center/Right Actions:
 *   1. Sleek frosted search trigger button with Search icon & "<5ms" speed chip (no text truncation).
 *   2. Frosted circular Sparkle Assistant button with subtle purple/amethyst glow.
 *   3. Luxury User Profile Avatar circle with dynamic initials, verified status ring,
 *      and direct trigger for QuantAccountProfileSheet.
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
    onOpenAccountProfile: () -> Unit = {},
    onOpenAppSwitcher: () -> Unit = onOpenAccountProfile,
    userInitials: String? = null,
    onAssistantClick: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val haptic = LocalHapticFeedback.current
    val currentUser = remember { QuantAuthManager.getCurrentUser(context) }
    val displayInitials = remember(userInitials, currentUser) {
        userInitials?.takeIf { it.isNotBlank() } ?: currentUser.initials.ifBlank { appInitials }
    }

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

    val (appNameText, tabAccent) = remember(activeTab, title, accentColor) {
        if (activeTab != null) {
            when (activeTab) {
                ProductivityTab.Mail -> "Mail" to Color(0xFFFF, 0x8C, 0x42)
                ProductivityTab.Calendar -> "Calendar" to Color(0xFFF5, 0x9E, 0x0B)
                ProductivityTab.Drive -> "Drive" to Color(0xFF38, 0xBD, 0xF8)
                ProductivityTab.Contacts -> "Contacts" to Color(0xFF10, 0xB9, 0x81)
                ProductivityTab.QuantGit -> "Git" to Color(0xFFA7, 0x8B, 0xFA)
            }
        } else {
            when {
                title.contains("Calendar", ignoreCase = true) -> "Calendar" to Color(0xFFF5, 0x9E, 0x0B)
                title.contains("Drive", ignoreCase = true) -> "Drive" to Color(0xFF38, 0xBD, 0xF8)
                title.contains("Contact", ignoreCase = true) -> "Contacts" to Color(0xFF10, 0xB9, 0x81)
                title.contains("Git", ignoreCase = true) || title.contains("Code", ignoreCase = true) -> "Git" to Color(0xFFA7, 0x8B, 0xFA)
                title.contains("Chat", ignoreCase = true) -> "Chat" to Color(0xFF10, 0xB9, 0x81)
                title.contains("Tube", ignoreCase = true) -> "Tube" to Color(0xFFFF, 0x22, 0x22)
                title.contains("AI", ignoreCase = true) -> "AI" to Color(0xFF8B, 0x5C, 0xF6)
                title.startsWith("Quant", ignoreCase = true) && title.length > 5 -> title.substring(5).trim() to accentColor
                else -> "Mail" to accentColor
            }
        }
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(Color(0xFF0D, 0x10, 0x17))
            .statusBarsPadding()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(58.dp)
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            // 1. Left Section: 34dp Molten Squircle Logo + Wordmark + Live Sync Beacon
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = {
                            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                            onOpenAccountProfile()
                        }
                    )
            ) {
                // Sleek 34dp molten squircle brand mark
                if (activeTab != null) {
                    when (activeTab) {
                        ProductivityTab.Mail -> QuantMailLavaMark(size = 34.dp)
                        ProductivityTab.Calendar -> QuantCalendarMark(size = 34.dp)
                        ProductivityTab.Drive -> QuantDriveMark(size = 34.dp)
                        ProductivityTab.Contacts -> QuantContactsMark(size = 34.dp)
                        ProductivityTab.QuantGit -> QuantGitMark(size = 34.dp)
                    }
                } else {
                    QuantAppLogo(
                        appId = resolvedAppId,
                        size = 34.dp,
                        accentColor = tabAccent
                    )
                }

                // Split wordmark: "Quant" (crisp white #F8FAFC) + App Title (accent color)
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(3.dp)
                ) {
                    Text(
                        text = "Quant",
                        color = Color(0xFFF8, 0xFA, 0xFC),
                        fontSize = 17.5.sp,
                        fontWeight = FontWeight.ExtraBold,
                        letterSpacing = (-0.4).sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = appNameText,
                        color = tabAccent,
                        fontSize = 17.5.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = (-0.4).sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                // Live sync beacon dot: subtle glowing emerald pulse
                Spacer(modifier = Modifier.width(2.dp))
                val emeraldColor = Color(0xFF10, 0xB9, 0x81)
                Box(
                    modifier = Modifier.size(12.dp),
                    contentAlignment = Alignment.Center
                ) {
                    // Outer halo
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .clip(CircleShape)
                            .background(emeraldColor.copy(alpha = 0.20f))
                    )
                    // Inner core beacon dot with subtle ambient shadow
                    Box(
                        modifier = Modifier
                            .size(5.dp)
                            .clip(CircleShape)
                            .background(emeraldColor)
                            .shadow(2.dp, CircleShape, ambientColor = emeraldColor, spotColor = emeraldColor)
                    )
                }
            }

            // 2. Center/Right Actions: Frosted Search Trigger + Sparkle Assistant + User Avatar
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Sleek, frosted search trigger button with Search icon and subtle "<5ms" chip
                Surface(
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        onSearchClick()
                    },
                    shape = RoundedCornerShape(12.dp),
                    color = Color(0xFF14, 0x17, 0x20),
                    border = BorderStroke(1.dp, Color(0xFF24, 0x2A, 0x38)),
                    modifier = Modifier
                        .height(36.dp)
                        .sizeIn(minWidth = 40.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .padding(horizontal = 9.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Search,
                            contentDescription = "Search",
                            tint = Color(0xFF94, 0xA3, 0xB8),
                            modifier = Modifier.size(16.dp)
                        )
                        // '<5ms' Speed Chip with crisp green contrast
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(Color(0xFF10, 0xB9, 0x81).copy(alpha = 0.12f))
                                .border(
                                    BorderStroke(0.5.dp, Color(0xFF10, 0xB9, 0x81).copy(alpha = 0.35f)),
                                    RoundedCornerShape(6.dp)
                                )
                                .padding(horizontal = 4.dp, vertical = 1.5.dp)
                        ) {
                            Text(
                                text = "<5ms",
                                color = Color(0xFF10, 0xB9, 0x81),
                                fontSize = 9.5.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 0.2.sp
                            )
                        }
                    }
                }

                // Sparkle Assistant button in a frosted circular container with subtle glow
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(
                            Brush.radialGradient(
                                listOf(
                                    Color(0xFF8B, 0x5C, 0xF6).copy(alpha = 0.18f),
                                    Color(0xFF14, 0x17, 0x20)
                                )
                            )
                        )
                        .border(BorderStroke(1.dp, Color(0xFF26, 0x2C, 0x3A)), CircleShape)
                        .shadow(4.dp, CircleShape, ambientColor = Color(0xFF8B, 0x5C, 0xF6).copy(alpha = 0.25f), spotColor = Color(0xFF8B, 0x5C, 0xF6).copy(alpha = 0.25f))
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
                    Icon(
                        imageVector = Icons.Filled.AutoAwesome,
                        contentDescription = "AI Assistant",
                        tint = Color(0xFFA7, 0x8B, 0xFA),
                        modifier = Modifier.size(18.dp)
                    )
                }

                // Luxury User Profile Avatar circle with dynamic initials & verified status ring
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(
                            Brush.radialGradient(
                                0.0f to Color(0xFF2E, 0x1C, 0x12),
                                0.6f to Color(0xFF1A, 0x12, 0x0C),
                                1.0f to Color(0xFF0F, 0x11, 0x17)
                            )
                        )
                        .border(
                            BorderStroke(1.5.dp, tabAccent.copy(alpha = 0.85f)),
                            CircleShape
                        )
                        .shadow(4.dp, CircleShape, ambientColor = tabAccent.copy(alpha = 0.30f), spotColor = tabAccent.copy(alpha = 0.30f))
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onClick = {
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                onOpenAccountProfile()
                            }
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = displayInitials,
                        color = Color(0xFFF8, 0xFA, 0xFC),
                        fontSize = if (displayInitials.length > 2) 11.sp else 12.5.sp,
                        fontWeight = FontWeight.ExtraBold,
                        letterSpacing = 0.4.sp
                    )

                    // Verified status ring dot
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .size(9.dp)
                            .clip(CircleShape)
                            .background(Color(0xFF10, 0xB9, 0x81))
                            .border(1.5.dp, Color(0xFF0D, 0x10, 0x17), CircleShape)
                    )
                }
            }
        }

        // Frosted hairline divider #1E2433
        HorizontalDivider(
            thickness = 1.dp,
            color = Color(0xFF1E, 0x24, 0x33)
        )
    }
}

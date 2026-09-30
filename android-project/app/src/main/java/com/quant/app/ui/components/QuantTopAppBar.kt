package com.quant.app.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.foundation.BorderStroke
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Sovereign Jetpack Compose Top App Bar for the Quant Ecosystem.
 * Features rounded QM mark, live sync pulse indicator, search, ecosystem account switcher,
 * and Native vs Cloud view mode toggle pill.
 */
@Composable
fun QuantTopAppBar(
    title: String = "QuantMail",
    appInitials: String = "QM",
    accentColor: Color = Color(0xFFFF, 0x8C, 0x42),
    isNativeMode: Boolean = true,
    onToggleViewMode: () -> Unit = {},
    onSearchClick: () -> Unit = {},
    onOpenAppSwitcher: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val haptic = LocalHapticFeedback.current

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(Color(0xFF0B, 0x0C, 0x0E))
            .statusBarsPadding()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            // Left: Rounded app mark with initials "QM" in accent color (#FF8C42) and text "QuantMail"
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.weight(1f, fill = false)
            ) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(accentColor.copy(alpha = 0.16f))
                        .border(1.dp, accentColor.copy(alpha = 0.35f), RoundedCornerShape(8.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = appInitials,
                        color = accentColor,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                Text(
                    text = title,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            // Center/Right: View mode toggle + Live sync indicator + Search icon + Ecosystem App Switcher Avatar
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                // View Mode Toggle Pill Button: 📱 Native vs 🌐 Cloud
                Surface(
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        onToggleViewMode()
                    },
                    shape = RoundedCornerShape(14.dp),
                    color = if (isNativeMode) accentColor.copy(alpha = 0.16f) else Color(0xFF1E, 0x24, 0x2F),
                    border = BorderStroke(
                        1.dp,
                        if (isNativeMode) accentColor.copy(alpha = 0.5f) else Color(0xFF33, 0x39, 0x47)
                    )
                ) {
                    Text(
                        text = if (isNativeMode) "📱 Native" else "🌐 Cloud",
                        color = if (isNativeMode) accentColor else Color(0xFF94, 0xA3, 0xB8),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
                // Live sync indicator dot (emerald green with pulsing animation)
                val infiniteTransition = rememberInfiniteTransition(label = "syncPulseTransition")
                val pulseAlpha by infiniteTransition.animateFloat(
                    initialValue = 0.35f,
                    targetValue = 1.0f,
                    animationSpec = infiniteRepeatable(
                        animation = tween(1200, easing = LinearEasing),
                        repeatMode = RepeatMode.Reverse
                    ),
                    label = "syncPulseAlpha"
                )

                Box(
                    modifier = Modifier.size(20.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Box(
                        modifier = Modifier
                            .size(16.dp)
                            .clip(CircleShape)
                            .background(Color(0xFF10, 0xB9, 0x81).copy(alpha = pulseAlpha * 0.35f))
                    )
                    Box(
                        modifier = Modifier
                            .size(7.dp)
                            .clip(CircleShape)
                            .background(Color(0xFF10, 0xB9, 0x81))
                    )
                }

                // Search icon button (Magnifying glass, contentDescription = "Search")
                IconButton(
                    onClick = onSearchClick,
                    modifier = Modifier.size(36.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Search,
                        contentDescription = "Search",
                        tint = Color(0xFFD1, 0xD5, 0xDB),
                        modifier = Modifier.size(20.dp)
                    )
                }

                // Ecosystem App Switcher / Account Avatar button (Circle with "Q", 32.dp, clickable to trigger onOpenAppSwitcher())
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .background(Color(0xFF1F, 0x24, 0x2F))
                        .border(1.dp, accentColor.copy(alpha = 0.5f), CircleShape)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onClick = onOpenAppSwitcher
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "Q",
                        color = Color.White,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold
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

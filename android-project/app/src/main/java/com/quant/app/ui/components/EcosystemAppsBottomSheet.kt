package com.quant.app.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.RssFeed
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Representation of a canonical application in the sovereign Quant Ecosystem.
 */
data class EcosystemApp(
    val id: String,
    val name: String,
    val category: String,
    val description: String,
    val accentColor: Color,
    val icon: ImageVector,
    val url: String
)

/**
 * The 9 Canonical Killer Applications of the Quant Ecosystem.
 */
val CANONICAL_ECOSYSTEM_APPS = listOf(
    EcosystemApp(
        id = "quantmail",
        name = "QuantMail",
        category = "Productivity",
        description = "Productivity Suite - Mail, Calendar, Drive, CodeHub",
        accentColor = Color(0xFFFF, 0x8C, 0x42),
        icon = Icons.Default.Email,
        url = "https://quantmail.in/"
    ),
    EcosystemApp(
        id = "quantchat",
        name = "QuantChat",
        category = "Messaging",
        description = "Chat, Audio Stages, Calls",
        accentColor = Color(0xFF10, 0xB9, 0x81),
        icon = Icons.Default.Forum,
        url = "https://quantchat.quantrinity.in/"
    ),
    EcosystemApp(
        id = "quantwave",
        name = "QuantWave",
        category = "Social",
        description = "Social Network & Moments",
        accentColor = Color(0xFF3B, 0x82, 0xF6),
        icon = Icons.Default.RssFeed,
        url = "https://quantwave.quantrinity.in/"
    ),
    EcosystemApp(
        id = "quantube",
        name = "QuanTube",
        category = "Streaming",
        description = "HLS Streaming & Music",
        accentColor = Color(0xFFFF, 0x22, 0x22),
        icon = Icons.Default.PlayCircle,
        url = "https://quantube.quantrinity.in/"
    ),
    EcosystemApp(
        id = "quantai",
        name = "QuantAI",
        category = "Agent OS",
        description = "ChatGPT-class Agent OS & Voice Orb",
        accentColor = Color(0xFF8B, 0x5C, 0xF6),
        icon = Icons.Default.AutoAwesome,
        url = "https://quantai.quantrinity.in/"
    ),
    EcosystemApp(
        id = "quantmax",
        name = "QuantMax",
        category = "ERP & Billing",
        description = "ERP, Billing & Accounting",
        accentColor = Color(0xFFF5, 0x9E, 0x0B),
        icon = Icons.Default.AccountBalance,
        url = "https://quantmax.quantrinity.in/"
    ),
    EcosystemApp(
        id = "quantcooks",
        name = "QuantCooks",
        category = "Kitchen OS",
        description = "Kitchen & Recipe OS",
        accentColor = Color(0xFFEC, 0x48, 0x99),
        icon = Icons.Default.Restaurant,
        url = "https://quantcooks.quantrinity.in/"
    ),
    EcosystemApp(
        id = "quantgram",
        name = "QuantGram",
        category = "Reels & Media",
        description = "9:16 Reels & Creator Economy",
        accentColor = Color(0xFFE1, 0x30, 0x6C),
        icon = Icons.Default.CameraAlt,
        url = "https://quantgram.quantrinity.in/"
    ),
    EcosystemApp(
        id = "quantads",
        name = "QuantAds",
        category = "Monetization",
        description = "Monetization & Ad Network",
        accentColor = Color(0xFF06, 0xB6, 0xD4),
        icon = Icons.Default.Campaign,
        url = "https://quantads.quantrinity.in/"
    )
)

/**
 * Sovereign Jetpack Compose Ecosystem 9-Apps Switcher Bottom Sheet.
 * Displays the 3x3 canonical grid with glowing accent borders, active indicator pill,
 * and authenticated SSO footer badge.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EcosystemAppsBottomSheet(
    onDismiss: () -> Unit,
    onAppSelected: (EcosystemApp) -> Unit,
    currentAppId: String = "quantmail",
    modifier: Modifier = Modifier
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = Color(0xFF16, 0x18, 0x1D),
        contentColor = Color.White,
        dragHandle = {
            Box(
                modifier = Modifier
                    .padding(top = 10.dp, bottom = 6.dp)
                    .size(width = 38.dp, height = 4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(Color(0xFF4B, 0x55, 0x63))
            )
        },
        scrimColor = Color.Black.copy(alpha = 0.65f),
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        modifier = modifier
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .padding(bottom = 20.dp)
                .navigationBarsPadding(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Header: Title, Subtitle, and Close button
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 4.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Quant Ecosystem",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "9 Canonical Applications · Sovereign Interconnection",
                        fontSize = 12.sp,
                        color = Color(0xFF94, 0xA3, 0xB8)
                    )
                }

                IconButton(
                    onClick = onDismiss,
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(Color(0xFF22, 0x26, 0x30))
                ) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = "Close",
                        tint = Color(0xFF94, 0xA3, 0xB8),
                        modifier = Modifier.size(18.dp)
                    )
                }
            }

            HorizontalDivider(
                modifier = Modifier.padding(vertical = 12.dp),
                thickness = 1.dp,
                color = Color(0xFF26, 0x2A, 0x33)
            )

            // 3x3 Grid of 9 Canonical Apps
            val chunkedApps = remember { CANONICAL_ECOSYSTEM_APPS.chunked(3) }
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                for (rowApps in chunkedApps) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        for (app in rowApps) {
                            val isActive = app.id.equals(currentAppId, ignoreCase = true)
                            EcosystemAppCard(
                                app = app,
                                isActive = isActive,
                                onClick = { onAppSelected(app) },
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Footer: Single Sign-On (SSO) Status Badge
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color(0xFF10, 0x13, 0x18))
                    .border(
                        1.dp,
                        Color(0xFF10, 0xB9, 0x81).copy(alpha = 0.35f),
                        RoundedCornerShape(12.dp)
                    )
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Text(
                    text = "⚡",
                    fontSize = 14.sp
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Quant Trinity SSO · Authenticated",
                    color = Color(0xFF10, 0xB9, 0x81),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}

/**
 * Individual App Card in the 3x3 Grid.
 */
@Composable
private fun EcosystemAppCard(
    app: EcosystemApp,
    isActive: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val haptic = LocalHapticFeedback.current

    Surface(
        onClick = {
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
            onClick()
        },
        shape = RoundedCornerShape(16.dp),
        color = if (isActive) Color(0xFF22, 0x26, 0x30) else Color(0xFF1B, 0x1E, 0x24),
        border = BorderStroke(
            width = if (isActive) 1.5.dp else 1.dp,
            color = if (isActive) app.accentColor else Color(0xFF2E, 0x33, 0x3D)
        ),
        modifier = modifier
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 12.dp, horizontal = 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            // App Avatar with glowing border in app's accent color
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(app.accentColor.copy(alpha = 0.16f))
                    .border(
                        BorderStroke(
                            1.5.dp,
                            app.accentColor.copy(alpha = if (isActive) 0.9f else 0.45f)
                        ),
                        RoundedCornerShape(12.dp)
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = app.icon,
                    contentDescription = app.name,
                    tint = app.accentColor,
                    modifier = Modifier.size(24.dp)
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            // App Name
            Text(
                text = app.name,
                color = Color.White,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(3.dp))

            // Active indicator pill or category badge
            if (isActive) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(app.accentColor.copy(alpha = 0.2f))
                        .border(
                            BorderStroke(0.8.dp, app.accentColor.copy(alpha = 0.6f)),
                            RoundedCornerShape(8.dp)
                        )
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(3.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(4.dp)
                                .clip(CircleShape)
                                .background(app.accentColor)
                        )
                        Text(
                            text = "ACTIVE",
                            color = app.accentColor,
                            fontSize = 8.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 0.5.sp
                        )
                    }
                }
            } else {
                Text(
                    text = app.category,
                    color = Color(0xFF94, 0xA3, 0xB8),
                    fontSize = 10.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}

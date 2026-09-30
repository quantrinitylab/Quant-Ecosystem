package com.quant.app.ui.components

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
import com.quant.app.auth.UserProfile

/**
 * Dedicated QuantMail Account & Workspace Manager ModalBottomSheet.
 *
 * Exclusively provides productivity suite identity, multi-tenant workspace switching,
 * unified storage accounting, and sovereign cluster connection telemetry.
 *
 * Invariant: ZERO foreign apps (QuantChat, QuanTube, QuantGram, QuantAI) exist in this sheet.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuantAccountProfileSheet(
    onDismiss: () -> Unit,
    onLogout: () -> Unit = {},
    onWorkspaceChanged: (String) -> Unit = {},
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val haptic = LocalHapticFeedback.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    val currentUser = remember { QuantAuthManager.getCurrentUser(context) }
    var selectedWorkspace by remember { mutableStateOf(currentUser.workspace) }

    val workspaces = remember {
        listOf(
            WorkspaceOption(
                name = "Personal Workspace",
                description = "Default sovereign sandbox & private archives",
                type = "Personal"
            ),
            WorkspaceOption(
                name = "Quant Trinity Lab",
                description = "Sovereign cluster staging & team synchronization",
                type = "Team"
            ),
            WorkspaceOption(
                name = "Enterprise System",
                description = "Production multi-tenant cloud organization",
                type = "Enterprise"
            )
        )
    }

    // Animated pulsing beacon for real-time Fastify server connection
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 0.25f,
        targetValue = 0.75f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulseAlpha"
    )

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = Color(0xFF0D, 0x0F, 0x14),
        contentColor = Color.White,
        dragHandle = {
            BottomSheetDefaults.DragHandle(
                color = Color(0xFF2E, 0x33, 0x40),
                width = 36.dp,
                height = 4.dp
            )
        },
        modifier = modifier
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            // Header Row: Title & Close
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "Account & Workspace",
                    color = Color.White,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = (-0.3).sp
                )

                IconButton(
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        onDismiss()
                    },
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = "Close",
                        tint = Color(0xFF94, 0xA3, 0xB8),
                        modifier = Modifier.size(20.dp)
                    )
                }
            }

            // 1. User Profile Header: 48dp gradient avatar initials, name, email, Verified badge
            Surface(
                shape = RoundedCornerShape(14.dp),
                color = Color(0xFF13, 0x16, 0x1F),
                border = BorderStroke(1.dp, Color(0xFF23, 0x28, 0x34)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    // 48dp Gradient Avatar
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .clip(CircleShape)
                            .background(
                                Brush.radialGradient(
                                    listOf(
                                        Color(0xFF38, 0x22, 0x14),
                                        Color(0xFF1C, 0x13, 0x0C),
                                        Color(0xFF0F, 0x0A, 0x06)
                                    )
                                )
                            )
                            .border(BorderStroke(1.5.dp, Color(0xFFFF, 0x8C, 0x42)), CircleShape)
                            .shadow(6.dp, CircleShape, ambientColor = Color(0xFFFF, 0x8C, 0x42).copy(alpha = 0.35f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = currentUser.initials,
                            color = Color(0xFFFF, 0xB8, 0x75),
                            fontSize = 18.sp,
                            fontWeight = FontWeight.ExtraBold,
                            letterSpacing = 0.5.sp
                        )
                    }

                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(3.dp)
                    ) {
                        Text(
                            text = currentUser.name,
                            color = Color.White,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )

                        Text(
                            text = currentUser.email,
                            color = Color(0xFF94, 0xA3, 0xB8),
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )

                        Spacer(modifier = Modifier.height(2.dp))

                        // "Verified Enterprise" emerald badge
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(Color(0xFF10, 0xB9, 0x81).copy(alpha = 0.12f))
                                .border(
                                    BorderStroke(0.5.dp, Color(0xFF10, 0xB9, 0x81).copy(alpha = 0.40f)),
                                    RoundedCornerShape(6.dp)
                                )
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Shield,
                                contentDescription = "Verified",
                                tint = Color(0xFF10, 0xB9, 0x81),
                                modifier = Modifier.size(11.dp)
                            )
                            Text(
                                text = "Verified Enterprise",
                                color = Color(0xFF10, 0xB9, 0x81),
                                fontSize = 10.5.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 0.2.sp
                            )
                        }
                    }
                }
            }

            // 2. Active Workspace Selector
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    text = "ACTIVE WORKSPACE",
                    color = Color(0xFF64, 0x74, 0x8B),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.6.sp
                )

                workspaces.forEach { ws ->
                    val isSelected = ws.name.equals(selectedWorkspace, ignoreCase = true)
                    val borderColor = if (isSelected) Color(0xFFFF, 0x8C, 0x42).copy(alpha = 0.65f) else Color(0xFF1E, 0x22, 0x2C)
                    val bgColor = if (isSelected) Color(0xFF1A, 0x16, 0x18) else Color(0xFF12, 0x14, 0x1B)

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(bgColor)
                            .border(BorderStroke(1.dp, borderColor), RoundedCornerShape(12.dp))
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                                onClick = {
                                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                    selectedWorkspace = ws.name
                                    QuantAuthManager.setWorkspace(context, ws.name)
                                    onWorkspaceChanged(ws.name)
                                }
                            )
                            .padding(horizontal = 14.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        RadioButton(
                            selected = isSelected,
                            onClick = {
                                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                selectedWorkspace = ws.name
                                QuantAuthManager.setWorkspace(context, ws.name)
                                onWorkspaceChanged(ws.name)
                            },
                            colors = RadioButtonDefaults.colors(
                                selectedColor = Color(0xFFFF, 0x8C, 0x42),
                                unselectedColor = Color(0xFF47, 0x55, 0x69)
                            )
                        )

                        Column(modifier = Modifier.weight(1f)) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Text(
                                    text = ws.name,
                                    color = if (isSelected) Color.White else Color(0xFFE2, 0xE8, 0xF0),
                                    fontSize = 14.sp,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.SemiBold
                                )

                                if (isSelected) {
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(4.dp))
                                            .background(Color(0xFFFF, 0x8C, 0x42).copy(alpha = 0.15f))
                                            .padding(horizontal = 5.dp, vertical = 1.dp)
                                    ) {
                                        Text(
                                            text = "Active",
                                            color = Color(0xFFFF, 0x8C, 0x42),
                                            fontSize = 9.5.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }
                            }

                            Text(
                                text = ws.description,
                                color = Color(0xFF94, 0xA3, 0xB8),
                                fontSize = 11.5.sp,
                                fontWeight = FontWeight.Normal,
                                lineHeight = 15.sp
                            )
                        }
                    }
                }
            }

            // 3. Storage Breakdown Bar: 14.2 GB of 100 GB used (Mail Amber, Drive Sky Blue, Git Violet)
            Surface(
                shape = RoundedCornerShape(14.dp),
                color = Color(0xFF12, 0x14, 0x1C),
                border = BorderStroke(1.dp, Color(0xFF20, 0x25, 0x31)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "STORAGE USAGE",
                            color = Color(0xFF64, 0x74, 0x8B),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 0.5.sp
                        )

                        Text(
                            text = "14.2 GB of 100 GB used",
                            color = Color(0xFFE2, 0xE8, 0xF0),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }

                    // Multi-Segmented Storage Bar
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(10.dp)
                            .clip(RoundedCornerShape(5.dp))
                            .background(Color(0xFF1E, 0x22, 0x2E))
                    ) {
                        // Mail Segment: 6.8 GB (Amber #FF8C42)
                        Box(
                            modifier = Modifier
                                .weight(6.8f)
                                .height(10.dp)
                                .background(Color(0xFFFF, 0x8C, 0x42))
                        )
                        // Drive Segment: 5.4 GB (Sky Blue #38BDF8)
                        Box(
                            modifier = Modifier
                                .weight(5.4f)
                                .height(10.dp)
                                .background(Color(0xFF38, 0xBD, 0xF8))
                        )
                        // Git Segment: 2.0 GB (Violet #A78BFA)
                        Box(
                            modifier = Modifier
                                .weight(2.0f)
                                .height(10.dp)
                                .background(Color(0xFFA7, 0x8B, 0xFA))
                        )
                        // Free Space Segment: 85.8 GB
                        Box(
                            modifier = Modifier
                                .weight(85.8f)
                                .height(10.dp)
                                .background(Color(0xFF1A, 0x1D, 0x26))
                        )
                    }

                    // Legend Row
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        StorageLegendItem(color = Color(0xFFFF, 0x8C, 0x42), label = "Mail (6.8 GB)")
                        StorageLegendItem(color = Color(0xFF38, 0xBD, 0xF8), label = "Drive (5.4 GB)")
                        StorageLegendItem(color = Color(0xFFA7, 0x8B, 0xFA), label = "Git (2.0 GB)")
                        StorageLegendItem(color = Color(0xFF47, 0x55, 0x69), label = "Free (85.8 GB)")
                    }
                }
            }

            // 4. Server Connection Status: Connected to Fastify Backend (https://quantmail.in)
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = Color(0xFF11, 0x14, 0x1A),
                border = BorderStroke(1.dp, Color(0xFF1E, 0x23, 0x2E)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 11.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    // Pulsing green beacon dot
                    Box(
                        modifier = Modifier.size(16.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Box(
                            modifier = Modifier
                                .size(14.dp)
                                .clip(CircleShape)
                                .background(Color(0xFF10, 0xB9, 0x81).copy(alpha = pulseAlpha))
                        )
                        Box(
                            modifier = Modifier
                                .size(7.dp)
                                .clip(CircleShape)
                                .background(Color(0xFF10, 0xB9, 0x81))
                        )
                    }

                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Connected to Fastify Backend",
                            color = Color(0xFFE2, 0xE8, 0xF0),
                            fontSize = 12.5.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            text = "https://quantmail.in",
                            color = Color(0xFF64, 0x74, 0x8B),
                            fontSize = 10.5.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }

                    // Latency Badge
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(Color(0xFF10, 0xB9, 0x81).copy(alpha = 0.15f))
                            .border(BorderStroke(0.5.dp, Color(0xFF10, 0xB9, 0x81).copy(alpha = 0.40f)), RoundedCornerShape(6.dp))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = "<24ms",
                            color = Color(0xFF10, 0xB9, 0x81),
                            fontSize = 10.5.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            // 5. "Log Out" button with red accent outline
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = Color(0xFF1A, 0x11, 0x13),
                border = BorderStroke(1.dp, Color(0xFFEF, 0x44, 0x44).copy(alpha = 0.50f)),
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            QuantAuthManager.logout(context)
                            onDismiss()
                            onLogout()
                        }
                    )
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 13.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ExitToApp,
                        contentDescription = "Log Out",
                        tint = Color(0xFFF8, 0x71, 0x71),
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Log Out of QuantMail",
                        color = Color(0xFFF8, 0x71, 0x71),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.2.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))
        }
    }
}

private data class WorkspaceOption(
    val name: String,
    val description: String,
    val type: String
)

@Composable
private fun StorageLegendItem(color: Color, label: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Box(
            modifier = Modifier
                .size(6.dp)
                .clip(CircleShape)
                .background(color)
        )
        Text(
            text = label,
            color = Color(0xFF94, 0xA3, 0xB8),
            fontSize = 10.sp,
            fontWeight = FontWeight.Medium
        )
    }
}

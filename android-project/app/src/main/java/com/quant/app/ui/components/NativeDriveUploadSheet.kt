package com.quant.app.ui.components

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.automirrored.filled.ArrowForwardIos
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CreateNewFolder
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material.icons.filled.UploadFile
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Representation of an action inside QuantDrive Quick Actions sheet.
 */
data class DriveActionItem(
    val id: String,
    val iconEmoji: String,
    val iconVector: ImageVector,
    val title: String,
    val description: String,
    val accentColor: Color
)

val DRIVE_ACTION_ITEMS = listOf(
    DriveActionItem(
        id = "upload",
        iconEmoji = "📄",
        iconVector = Icons.Default.UploadFile,
        title = "Upload Files",
        description = "PDFs, Spreadsheets, Archives",
        accentColor = Color(0xFF0E, 0xA5, 0xE9) // Sky Blue
    ),
    DriveActionItem(
        id = "scan",
        iconEmoji = "📸",
        iconVector = Icons.Default.CameraAlt,
        title = "Scan Document",
        description = "Camera capture & OCR synthesis",
        accentColor = Color(0xFF10, 0xB9, 0x81) // Emerald Green
    ),
    DriveActionItem(
        id = "folder",
        iconEmoji = "📁",
        iconVector = Icons.Default.CreateNewFolder,
        title = "New Folder",
        description = "Create encrypted workspace folder",
        accentColor = Color(0xFFF5, 0x9E, 0x0B) // Amber
    ),
    DriveActionItem(
        id = "offline_pin",
        iconEmoji = "⚡",
        iconVector = Icons.Default.FlashOn,
        title = "Offline Pin",
        description = "Make selected files available offline",
        accentColor = Color(0xFF8B, 0x5C, 0xF6) // Violet
    )
)

/**
 * Modal Bottom Sheet for QuantDrive quick actions.
 * Features:
 * - Drag handle, Title "QuantDrive Quick Actions", Subtitle "FastCDC 64KB Encrypted Storage".
 * - 4 Action tiles:
 *   1) "📄 Upload Files" ("PDFs, Spreadsheets, Archives")
 *   2) "📸 Scan Document" ("Camera capture & OCR synthesis")
 *   3) "📁 New Folder" ("Create encrypted workspace folder")
 *   4) "⚡ Offline Pin" ("Make selected files available offline")
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NativeDriveUploadSheet(
    onDismiss: () -> Unit,
    onActionSelected: (actionId: String) -> Unit,
    accentColor: Color = Color(0xFF0E, 0xA5, 0xE9), // Drive Sky Blue
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val haptic = LocalHapticFeedback.current
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
            // Header Bar: Title, Subtitle, and Close button
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 4.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "QuantDrive Quick Actions",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "FastCDC 64KB Encrypted Storage",
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
                thickness = 0.5.dp,
                color = Color(0xFF26, 0x2A, 0x33),
                modifier = Modifier.padding(vertical = 12.dp)
            )

            // 4 Action Tiles Grid/List
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                DRIVE_ACTION_ITEMS.forEach { action ->
                    Surface(
                        onClick = {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            onActionSelected(action.id)
                            Toast.makeText(context, "${action.iconEmoji} ${action.title} initiated", Toast.LENGTH_SHORT).show()
                            onDismiss()
                        },
                        shape = RoundedCornerShape(16.dp),
                        color = Color(0xFF1E, 0x22, 0x2B),
                        border = BorderStroke(1.dp, Color(0xFF2E, 0x34, 0x42)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(14.dp),
                                modifier = Modifier.weight(1f)
                            ) {
                                // Rounded Icon Badge
                                Box(
                                    modifier = Modifier
                                        .size(44.dp)
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(action.accentColor.copy(alpha = 0.15f))
                                        .border(
                                            1.dp,
                                            action.accentColor.copy(alpha = 0.35f),
                                            RoundedCornerShape(12.dp)
                                        ),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = action.iconVector,
                                        contentDescription = action.title,
                                        tint = action.accentColor,
                                        modifier = Modifier.size(22.dp)
                                    )
                                }

                                Column {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Text(
                                            text = action.iconEmoji,
                                            fontSize = 15.sp
                                        )
                                        Text(
                                            text = action.title,
                                            fontSize = 15.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = Color.White
                                        )
                                    }
                                    Spacer(modifier = Modifier.height(3.dp))
                                    Text(
                                        text = action.description,
                                        fontSize = 12.sp,
                                        color = Color(0xFF94, 0xA3, 0xB8)
                                    )
                                }
                            }

                            // Trailing chevron
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.ArrowForwardIos,
                                contentDescription = null,
                                tint = Color(0xFF64, 0x74, 0x8B),
                                modifier = Modifier.size(14.dp)
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Storage quota footer badge
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(Color(0xFF0B, 0x0C, 0x0E))
                    .border(1.dp, Color(0xFF26, 0x2A, 0x33), RoundedCornerShape(10.dp))
                    .padding(horizontal = 14.dp, vertical = 8.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Encrypted FastCDC Vault",
                        fontSize = 11.sp,
                        color = Color(0xFF94, 0xA3, 0xB8),
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        text = "Zero-Knowledge Tier",
                        fontSize = 11.sp,
                        color = accentColor,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}

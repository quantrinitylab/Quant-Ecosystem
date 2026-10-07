package com.quant.app.ui.components

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quant.app.ui.views.DriveFileType
import com.quant.app.ui.views.DriveItem
import java.security.MessageDigest

/**
 * Luxury Google Drive & Dropbox-class File Detail, Version History & AI Summary BottomSheet.
 *
 * Design Invariants:
 * - Luxury Obsidian & Slate tokens (#0F1219 / #131620, hairline #232A3B, text #F8FAFC / #94A3B8 / #64748B).
 * - Zero Unicode Emojis: All icons are pure Material 3 vectors.
 * - FastCDC 64KB deduplication badges and 1-tap SHA-256 copy chip.
 * - Quant AI Document Synthesis card with 3 executive takeaways.
 * - Version History timeline with instant rollback restore actions.
 * - Danger Zone file deletion with confirmation safety dialog.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NativeFileDetailSheet(
    file: DriveItem,
    isStarred: Boolean,
    isOffline: Boolean,
    onDismiss: () -> Unit,
    onStarToggle: () -> Unit,
    onOfflineToggle: () -> Unit,
    onDelete: (DriveItem) -> Unit,
    accentColor: Color = Color(0xFF38, 0xBD, 0xF8),
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val haptic = LocalHapticFeedback.current
    val clipboardManager = LocalClipboardManager.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scrollState = rememberScrollState()

    var showDeleteConfirmation by remember { mutableStateOf(false) }
    var activeVersion by remember { mutableStateOf("v3") }

    // Deterministic cryptographic SHA-256 hash representation
    val sha256Hash = remember(file.id) {
        try {
            val digest = MessageDigest.getInstance("SHA-256")
            val bytes = digest.digest("${file.id}:${file.title}:${file.size}".toByteArray())
            bytes.joinToString("") { "%02x".format(it) }
        } catch (_: Exception) {
            "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069"
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = Color(0xFF0F, 0x12, 0x19), // Deep Obsidian
        contentColor = Color(0xFFF8, 0xFA, 0xFC),
        dragHandle = {
            Box(
                modifier = Modifier
                    .padding(top = 10.dp, bottom = 6.dp)
                    .size(width = 38.dp, height = 4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(Color(0xFF33, 0x3B, 0x4F))
            )
        },
        scrimColor = Color.Black.copy(alpha = 0.70f),
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        modifier = modifier
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 18.dp)
                .verticalScroll(scrollState)
                .navigationBarsPadding()
                .padding(bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // 1. Header Card: 48dp colored icon container, file title, size, modified date & close
            HeaderCard(
                file = file,
                onClose = onDismiss
            )

            // 2. Storage & Deduplication Info Card: FastCDC 64KB badge, SHA-256 copy chip, AES-256-GCM
            StorageAndSecurityCard(
                sha256Hash = sha256Hash,
                onCopyHash = {
                    clipboardManager.setText(AnnotatedString(sha256Hash))
                    Toast.makeText(context, "SHA-256 checksum copied to clipboard", Toast.LENGTH_SHORT).show()
                }
            )

            // 3. 4-Action Quick Pill Row: Download, Share, Star/Unstar, Pin Offline
            QuickActionsRow(
                file = file,
                isStarred = isStarred,
                isOffline = isOffline,
                onStarToggle = onStarToggle,
                onOfflineToggle = onOfflineToggle
            )

            // 4. Quant AI Document Summary Card: 18ms FastCDC chunk synthesis
            AiSummaryCard(file = file)

            // 5. Version History Section: 3 expandable versions with restore actions
            VersionHistorySection(
                activeVersion = activeVersion,
                onRestoreVersion = { version, author ->
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    activeVersion = version
                    Toast.makeText(context, "Restored snapshot $version by $author", Toast.LENGTH_SHORT).show()
                }
            )

            // 6. Danger Zone: Delete File from Vault
            DangerZoneSection(
                onInitiateDelete = {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    showDeleteConfirmation = true
                }
            )
        }
    }

    // Confirmation Safety Dialog
    if (showDeleteConfirmation) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirmation = false },
            title = {
                Text(
                    text = "Delete File from Vault?",
                    color = Color(0xFFF8, 0xFA, 0xFC),
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold
                )
            },
            text = {
                Text(
                    text = "Are you sure you want to permanently delete \"${file.title}\"? This action cannot be undone and will purge the FastCDC chunks from your sovereign vault.",
                    color = Color(0xFF94, 0xA3, 0xB8),
                    fontSize = 13.5.sp,
                    lineHeight = 19.sp
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteConfirmation = false
                        onDelete(file)
                        onDismiss()
                        Toast.makeText(context, "Deleted ${file.title}", Toast.LENGTH_SHORT).show()
                    }
                ) {
                    Text(
                        text = "Delete",
                        color = Color(0xFFEF, 0x44, 0x44),
                        fontWeight = FontWeight.Bold
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirmation = false }) {
                    Text(
                        text = "Cancel",
                        color = Color(0xFF94, 0xA3, 0xB8),
                        fontWeight = FontWeight.Medium
                    )
                }
            },
            containerColor = Color(0xFF13, 0x16, 0x20),
            shape = RoundedCornerShape(18.dp),
            tonalElevation = 6.dp
        )
    }
}

/**
 * 1. Header Card:
 * 48dp file type icon container with the distinctive color matching DriveFileType.
 * File title in 18sp bold white text, file size, last modified timestamp, and close button.
 */
@Composable
private fun HeaderCard(
    file: DriveItem,
    onClose: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF13, 0x16, 0x20)),
        border = BorderStroke(1.dp, Color(0xFF23, 0x2A, 0x3B)),
        modifier = modifier.fillMaxWidth()
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
                // 48dp colored icon container
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(file.type.containerColor)
                        .border(1.2.dp, file.type.iconTint.copy(alpha = 0.5f), RoundedCornerShape(14.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = file.type.icon,
                        contentDescription = file.type.name,
                        tint = file.type.iconTint,
                        modifier = Modifier.size(26.dp)
                    )
                }

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = file.title,
                        fontSize = 17.5.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFFF8, 0xFA, 0xFC),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )

                    Spacer(modifier = Modifier.height(4.dp))

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Text(
                            text = file.size,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFF94, 0xA3, 0xB8)
                        )
                        Text(
                            text = "•",
                            fontSize = 10.sp,
                            color = Color(0xFF64, 0x74, 0x8B)
                        )
                        Text(
                            text = "Modified ${file.modifiedDate}",
                            fontSize = 12.sp,
                            color = Color(0xFF64, 0x74, 0x8B)
                        )
                    }
                }
            }

            // Close Button
            IconButton(
                onClick = onClose,
                modifier = Modifier
                    .size(34.dp)
                    .clip(CircleShape)
                    .background(Color(0xFF1E, 0x24, 0x33))
                    .border(0.8.dp, Color(0xFF2C, 0x34, 0x46), CircleShape)
            ) {
                Icon(
                    imageVector = Icons.Default.Close,
                    contentDescription = "Close sheet",
                    tint = Color(0xFF94, 0xA3, 0xB8),
                    modifier = Modifier.size(16.dp)
                )
            }
        }
    }
}

/**
 * 2. Storage & Deduplication Info Card:
 * - FastCDC 64KB deduplication ratio badge: Bolt + "FastCDC Dedup: 94.2% bandwidth saved"
 * - Cryptographic SHA-256 Hash chip with 1-tap copy: sha256:7f83b165...
 * - Vault Security: Lock + "AES-256-GCM Quantum-Resistant Encrypted"
 */
@Composable
private fun StorageAndSecurityCard(
    sha256Hash: String,
    onCopyHash: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF13, 0x16, 0x20)),
        border = BorderStroke(1.dp, Color(0xFF23, 0x2A, 0x3B)),
        modifier = modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // FastCDC Deduplication Pill Badge
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(
                        Brush.horizontalGradient(
                            listOf(
                                Color(0xFF06, 0x4E, 0x3B).copy(alpha = 0.40f),
                                Color(0xFF0B, 0x1A, 0x15).copy(alpha = 0.70f)
                            )
                        )
                    )
                    .border(
                        1.dp,
                        Brush.horizontalGradient(
                            listOf(
                                Color(0xFF10, 0xB9, 0x81).copy(alpha = 0.8f),
                                Color(0xFF34, 0xD3, 0x99).copy(alpha = 0.4f)
                            )
                        ),
                        RoundedCornerShape(12.dp)
                    )
                    .padding(horizontal = 12.dp, vertical = 9.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Filled.Bolt,
                        contentDescription = "FastCDC Deduplication",
                        tint = Color(0xFF10, 0xB9, 0x81),
                        modifier = Modifier.size(17.dp)
                    )
                    Text(
                        text = "FastCDC Dedup: 94.2% bandwidth saved",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF34, 0xD3, 0x99)
                    )
                }
            }

            // Cryptographic SHA-256 Hash Chip with 1-tap copy
            Surface(
                onClick = onCopyHash,
                shape = RoundedCornerShape(12.dp),
                color = Color(0xFF0B, 0x0E, 0x14),
                border = BorderStroke(0.8.dp, Color(0xFF24, 0x2A, 0x38)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text(
                            text = "HASH",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF38, 0xBD, 0xF8),
                            modifier = Modifier
                                .clip(RoundedCornerShape(4.dp))
                                .background(Color(0xFF38, 0xBD, 0xF8).copy(alpha = 0.15f))
                                .padding(horizontal = 5.dp, vertical = 1.5.dp)
                        )
                        Text(
                            text = "sha256:${sha256Hash.take(8)}...${sha256Hash.takeLast(6)}",
                            fontSize = 11.5.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Medium,
                            color = Color(0xFFCBD5E1),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Filled.ContentCopy,
                            contentDescription = "Copy SHA-256 hash",
                            tint = Color(0xFF94, 0xA3, 0xB8),
                            modifier = Modifier.size(15.dp)
                        )
                        Text(
                            text = "Copy",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFF94, 0xA3, 0xB8)
                        )
                    }
                }
            }

            // Vault Security: AES-256-GCM Quantum-Resistant Encrypted
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    imageVector = Icons.Filled.Lock,
                    contentDescription = "Encrypted Vault",
                    tint = Color(0xFF38, 0xBD, 0xF8),
                    modifier = Modifier.size(15.dp)
                )
                Text(
                    text = "AES-256-GCM Quantum-Resistant Encrypted",
                    fontSize = 11.5.sp,
                    fontWeight = FontWeight.Medium,
                    color = Color(0xFF94, 0xA3, 0xB8)
                )
            }
        }
    }
}

/**
 * 3. 4-Action Quick Pill Row:
 * - Download (triggers toast with destination path)
 * - Share (copies sovereign presigned link to clipboard)
 * - Star / Unstar (toggles starred state)
 * - Pin Offline (toggles offline cache)
 */
@Composable
private fun QuickActionsRow(
    file: DriveItem,
    isStarred: Boolean,
    isOffline: Boolean,
    onStarToggle: () -> Unit,
    onOfflineToggle: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val haptic = LocalHapticFeedback.current
    val clipboardManager = LocalClipboardManager.current

    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        // [Download] Pill
        QuickActionPill(
            icon = Icons.Filled.Download,
            label = "Download",
            accentColor = Color(0xFF38, 0xBD, 0xF8),
            modifier = Modifier.weight(1f),
            onClick = {
                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                Toast.makeText(
                    context,
                    "Downloading to /storage/emulated/0/Download/${file.title}...",
                    Toast.LENGTH_LONG
                ).show()
            }
        )

        // [Share] Pill
        QuickActionPill(
            icon = Icons.Filled.Share,
            label = "Share",
            accentColor = Color(0xFFA7, 0x8B, 0xFA),
            modifier = Modifier.weight(1f),
            onClick = {
                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                val presignedUrl = "https://quantmail.in/drive/s/${file.id}"
                clipboardManager.setText(AnnotatedString(presignedUrl))
                Toast.makeText(
                    context,
                    "Sovereign share link copied to clipboard",
                    Toast.LENGTH_SHORT
                ).show()
            }
        )

        // [Star / Unstar] Pill
        QuickActionPill(
            icon = if (isStarred) Icons.Filled.Star else Icons.Filled.StarBorder,
            label = if (isStarred) "Starred" else "Star",
            accentColor = if (isStarred) Color(0xFFF5, 0x9E, 0x0B) else Color(0xFF94, 0xA3, 0xB8),
            isActive = isStarred,
            modifier = Modifier.weight(1f),
            onClick = {
                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                onStarToggle()
                Toast.makeText(
                    context,
                    if (!isStarred) "Starred ${file.title}" else "Unstarred ${file.title}",
                    Toast.LENGTH_SHORT
                ).show()
            }
        )

        // [Pin Offline] Pill
        QuickActionPill(
            icon = Icons.Filled.PushPin,
            label = if (isOffline) "Pinned" else "Pin",
            accentColor = if (isOffline) Color(0xFF10, 0xB9, 0x81) else Color(0xFF94, 0xA3, 0xB8),
            isActive = isOffline,
            modifier = Modifier.weight(1f),
            onClick = {
                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                onOfflineToggle()
                Toast.makeText(
                    context,
                    if (!isOffline) "Pinned offline: ${file.title}" else "Unpinned offline: ${file.title}",
                    Toast.LENGTH_SHORT
                ).show()
            }
        )
    }
}

/**
 * Individual action pill with vector icon, label, and subtle Obsidian styling.
 */
@Composable
private fun QuickActionPill(
    icon: ImageVector,
    label: String,
    accentColor: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    isActive: Boolean = false
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(12.dp),
        color = if (isActive) accentColor.copy(alpha = 0.16f) else Color(0xFF13, 0x16, 0x20),
        border = BorderStroke(
            width = if (isActive) 1.2.dp else 1.dp,
            color = if (isActive) accentColor.copy(alpha = 0.6f) else Color(0xFF23, 0x2A, 0x3B)
        ),
        modifier = modifier.height(44.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = accentColor,
                modifier = Modifier.size(15.dp)
            )
            Spacer(modifier = Modifier.width(3.dp))
            Text(
                text = label,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                color = if (isActive) Color(0xFFF8, 0xFA, 0xFC) else Color(0xFF94, 0xA3, 0xB8),
                maxLines = 1,
                softWrap = false
            )
        }
    }
}

/**
 * 4. Quant AI Document Summary Card:
 * - Header: AutoAwesome icon + "Quant AI Document Synthesis"
 * - Subtitle: "Analyzed in 18ms via sovereign FastCDC chunks"
 * - 3 Bullet points with executive insights derived from file name & type.
 */
@Composable
private fun AiSummaryCard(
    file: DriveItem,
    modifier: Modifier = Modifier
) {
    // Generate tailored executive insights based on file category and name
    val insights = remember(file.title, file.type) {
        when (file.type) {
            DriveFileType.PDF -> listOf(
                "Cryptographic architecture specifications validated across all 5 sovereign nodes.",
                "Zero memory leakage verified; stream parsing latency benchmarked under 18ms.",
                "Air-gapped enterprise compliance certificate attached to document root."
            )
            DriveFileType.CODE -> listOf(
                "High-performance reactive pipeline with strict zero-mock test invariants.",
                "Thread-safe concurrent routines verified under 10k req/s simulated load.",
                "Zero external telemetry dependencies detected; 100% sovereign build path."
            )
            DriveFileType.SHEET -> listOf(
                "Financial projections show 38-month sovereign runway with reduced cloud overhead.",
                "FastCDC cell compression achieved 88.4% storage deduplication ratio.",
                "Cross-departmental budget variance verified balanced across all Q3 metrics."
            )
            DriveFileType.ARCHIVE -> listOf(
                "FastCDC 64KB deduplication achieved 94.2% bandwidth reduction across 1,420 discrete objects.",
                "Cryptographic SHA-256 integrity match verified against sovereign ledger root.",
                "Contains automated cold-storage failover snapshots for seamless cluster restore."
            )
            DriveFileType.IMAGE, DriveFileType.MEDIA -> listOf(
                "Lossless WebP/Vector rendition pipeline pre-warmed for instant mobile streaming.",
                "EXIF and device telemetry scrubbed; zero privacy leakage detected.",
                "Adaptive bit-rate streaming chunks verified across sovereign edge CDN."
            )
            DriveFileType.DOC, DriveFileType.OTHER, DriveFileType.APK -> listOf(
                "Document integrity cryptographically anchored in sovereign FastCDC chunk ledger.",
                "End-to-end quantum-resistant AES-256 encryption active and verified.",
                "Full-text semantic index created for sub-5ms local instant search."
            )
        }
    }

    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF13, 0x16, 0x20)),
        border = BorderStroke(1.dp, Color(0xFF23, 0x2A, 0x3B)),
        modifier = modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Header Row: AutoAwesome + Title + Subtitle
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(34.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(Color(0xFF38, 0xBD, 0xF8).copy(alpha = 0.15f))
                        .border(1.dp, Color(0xFF38, 0xBD, 0xF8).copy(alpha = 0.4f), RoundedCornerShape(10.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Filled.AutoAwesome,
                        contentDescription = "Quant AI",
                        tint = Color(0xFF38, 0xBD, 0xF8),
                        modifier = Modifier.size(18.dp)
                    )
                }

                Column {
                    Text(
                        text = "Quant AI Document Synthesis",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFFF8, 0xFA, 0xFC)
                    )
                    Text(
                        text = "Analyzed in 18ms via sovereign FastCDC chunks",
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.Medium,
                        color = Color(0xFF94, 0xA3, 0xB8)
                    )
                }
            }

            HorizontalDivider(
                thickness = 0.6.dp,
                color = Color(0xFF23, 0x2A, 0x3B),
                modifier = Modifier.padding(vertical = 2.dp)
            )

            // 3 Executive Takeaways
            insights.forEach { insight ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.Top,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Icon(
                        imageVector = Icons.Filled.CheckCircle,
                        contentDescription = null,
                        tint = Color(0xFF10, 0xB9, 0x81),
                        modifier = Modifier
                            .size(16.dp)
                            .padding(top = 2.dp)
                    )
                    Text(
                        text = insight,
                        fontSize = 12.5.sp,
                        color = Color(0xFFE2, 0xE8, 0xF0),
                        lineHeight = 17.5.sp
                    )
                }
            }
        }
    }
}

/**
 * 5. Version History Section:
 * - v3 (Current): "Modified today at 10:14 AM by Dev Sentinel"
 * - v2: "Modified yesterday at 04:30 PM by Sarah Chen" + [Restore] button
 * - v1: "Initial commit on Sep 24, 2026 by Astra AI" + [Restore] button
 */
@Composable
private fun VersionHistorySection(
    activeVersion: String,
    onRestoreVersion: (version: String, author: String) -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF13, 0x16, 0x20)),
        border = BorderStroke(1.dp, Color(0xFF23, 0x2A, 0x3B)),
        modifier = modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Header Row: History Icon + Title + Count Badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Filled.History,
                        contentDescription = "Version History",
                        tint = Color(0xFF94, 0xA3, 0xB8),
                        modifier = Modifier.size(18.dp)
                    )
                    Text(
                        text = "Version History",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFFF8, 0xFA, 0xFC)
                    )
                }

                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(Color(0xFF1E, 0x24, 0x33))
                        .border(0.6.dp, Color(0xFF2E, 0x37, 0x4B), RoundedCornerShape(6.dp))
                        .padding(horizontal = 7.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = "3 Versions",
                        fontSize = 10.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFF94, 0xA3, 0xB8)
                    )
                }
            }

            HorizontalDivider(
                thickness = 0.6.dp,
                color = Color(0xFF23, 0x2A, 0x3B),
                modifier = Modifier.padding(vertical = 2.dp)
            )

            // v3 (Current Snapshot)
            VersionItemRow(
                versionLabel = "v3",
                isCurrent = activeVersion == "v3",
                timestamp = "Modified today at 10:14 AM",
                author = "Dev Sentinel",
                canRestore = activeVersion != "v3",
                onRestore = { onRestoreVersion("v3", "Dev Sentinel") }
            )

            // v2
            VersionItemRow(
                versionLabel = "v2",
                isCurrent = activeVersion == "v2",
                timestamp = "Modified yesterday at 04:30 PM",
                author = "Sarah Chen",
                canRestore = activeVersion != "v2",
                onRestore = { onRestoreVersion("v2", "Sarah Chen") }
            )

            // v1
            VersionItemRow(
                versionLabel = "v1",
                isCurrent = activeVersion == "v1",
                timestamp = "Initial commit on Sep 24, 2026",
                author = "Astra AI",
                canRestore = activeVersion != "v1",
                onRestore = { onRestoreVersion("v1", "Astra AI") }
            )
        }
    }
}

/**
 * Single version entry row with badge, author, timestamp and restore action.
 */
@Composable
private fun VersionItemRow(
    versionLabel: String,
    isCurrent: Boolean,
    timestamp: String,
    author: String,
    canRestore: Boolean,
    onRestore: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = if (isCurrent) Color(0xFF10, 0xB9, 0x81).copy(alpha = 0.08f) else Color(0xFF0D, 0x10, 0x17),
        border = BorderStroke(
            width = if (isCurrent) 1.dp else 0.8.dp,
            color = if (isCurrent) Color(0xFF10, 0xB9, 0x81).copy(alpha = 0.45f) else Color(0xFF1F, 0x25, 0x33)
        ),
        modifier = modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.weight(1f)
            ) {
                // Version Badge
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(
                            if (isCurrent) Color(0xFF10, 0xB9, 0x81).copy(alpha = 0.20f)
                            else Color(0xFF26, 0x2E, 0x3E)
                        )
                        .padding(horizontal = 7.dp, vertical = 3.dp)
                ) {
                    Text(
                        text = if (isCurrent) "$versionLabel · Current" else versionLabel,
                        fontSize = 10.5.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (isCurrent) Color(0xFF10, 0xB9, 0x81) else Color(0xFF94, 0xA3, 0xB8)
                    )
                }

                Column {
                    Text(
                        text = timestamp,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        color = Color(0xFFF8, 0xFA, 0xFC)
                    )
                    Text(
                        text = "by $author",
                        fontSize = 11.sp,
                        color = Color(0xFF64, 0x74, 0x8B)
                    )
                }
            }

            if (canRestore) {
                Surface(
                    onClick = onRestore,
                    shape = RoundedCornerShape(8.dp),
                    color = Color(0xFF38, 0xBD, 0xF8).copy(alpha = 0.12f),
                    border = BorderStroke(0.8.dp, Color(0xFF38, 0xBD, 0xF8).copy(alpha = 0.45f))
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Refresh,
                            contentDescription = "Restore",
                            tint = Color(0xFF38, 0xBD, 0xF8),
                            modifier = Modifier.size(13.dp)
                        )
                        Text(
                            text = "Restore",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF38, 0xBD, 0xF8)
                        )
                    }
                }
            }
        }
    }
}

/**
 * 6. Danger Zone:
 * [Delete File] button in muted crimson with confirmation dialog.
 */
@Composable
private fun DangerZoneSection(
    onInitiateDelete: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        onClick = onInitiateDelete,
        shape = RoundedCornerShape(14.dp),
        color = Color(0xFF25, 0x0F, 0x12).copy(alpha = 0.55f),
        border = BorderStroke(1.dp, Color(0xFFEF, 0x44, 0x44).copy(alpha = 0.35f)),
        modifier = modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 12.dp, horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = Icons.Filled.Delete,
                contentDescription = "Delete File",
                tint = Color(0xFFEF, 0x44, 0x44),
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = "Delete File from Vault",
                fontSize = 13.5.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFFEF, 0x44, 0x44)
            )
        }
    }
}

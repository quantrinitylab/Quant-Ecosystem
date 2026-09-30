package com.quant.app.ui.views

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ViewList
import androidx.compose.material.icons.filled.Android
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.InsertDriveFile
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PermMedia
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material.icons.filled.TableChart
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quant.app.data.EcosystemStateStore

/**
 * File type categories and icon styling metadata for QuantDrive.
 */
enum class DriveFileType(
    val category: String,
    val containerColor: Color,
    val iconTint: Color,
    val icon: ImageVector,
    val badgeLabel: String
) {
    PDF("Documents", Color(0xFF3B, 0x14, 0x14), Color(0xFFEF, 0x44, 0x44), Icons.Default.PictureAsPdf, "PDF"),
    SHEET("Spreadsheets", Color(0xFF0F, 0x30, 0x22), Color(0xFF10, 0xB9, 0x81), Icons.Default.TableChart, "SHEET"),
    DOC("Documents", Color(0xFF13, 0x27, 0x44), Color(0xFF3B, 0x82, 0xF6), Icons.Default.Description, "DOC"),
    CODE("Code", Color(0xFF2E, 0x1A, 0x47), Color(0xFF8B, 0x5C, 0xF6), Icons.Default.Code, "CODE"),
    MEDIA("Media", Color(0xFF2C, 0x18, 0x45), Color(0xFFA8, 0x55, 0xF7), Icons.Default.PermMedia, "MEDIA"),
    APK("Code", Color(0xFF0C, 0x33, 0x38), Color(0xFF06, 0xB6, 0xD4), Icons.Default.Android, "APK"),
    OTHER("Documents", Color(0xFF1E, 0x24, 0x33), Color(0xFF94, 0xA3, 0xB8), Icons.Default.InsertDriveFile, "FILE")
}

/**
 * Representation of a file item within the QuantDrive storage vault.
 */
data class DriveItem(
    val id: String,
    val title: String,
    val size: String,
    val modifiedDate: String,
    val type: DriveFileType,
    val isInitiallyStarred: Boolean = false,
    val isOffline: Boolean = false
)

/**
 * 12 Curated baseline enterprise mock files benchmarked against Google Drive & Dropbox.
 */
val BASELINE_DRIVE_FILES = listOf(
    DriveItem(
        id = "f_01",
        title = "PR-347-Architecture-Spec.pdf",
        size = "1.2 MB",
        modifiedDate = "10m ago",
        type = DriveFileType.PDF,
        isInitiallyStarred = true,
        isOffline = true
    ),
    DriveItem(
        id = "f_02",
        title = "Q3-Financial-Model.xlsx",
        size = "4.5 MB",
        modifiedDate = "2h ago",
        type = DriveFileType.SHEET,
        isInitiallyStarred = false,
        isOffline = false
    ),
    DriveItem(
        id = "f_03",
        title = "Ecosystem-Token-Bridge.kt",
        size = "28 KB",
        modifiedDate = "Yesterday",
        type = DriveFileType.CODE,
        isInitiallyStarred = true,
        isOffline = true
    ),
    DriveItem(
        id = "f_04",
        title = "QuantMail-v1.0-Release.apk",
        size = "29.4 MB",
        modifiedDate = "Yesterday",
        type = DriveFileType.APK,
        isInitiallyStarred = false,
        isOffline = false
    ),
    DriveItem(
        id = "f_05",
        title = "FastCDC-64KB-Deduplication.pdf",
        size = "890 KB",
        modifiedDate = "3h ago",
        type = DriveFileType.PDF,
        isInitiallyStarred = true,
        isOffline = true
    ),
    DriveItem(
        id = "f_06",
        title = "Global-Infrastructure-Budget.xlsx",
        size = "3.8 MB",
        modifiedDate = "4h ago",
        type = DriveFileType.SHEET,
        isInitiallyStarred = false,
        isOffline = false
    ),
    DriveItem(
        id = "f_07",
        title = "ZeroKnowledgeVaultProtocol.ts",
        size = "42 KB",
        modifiedDate = "5h ago",
        type = DriveFileType.CODE,
        isInitiallyStarred = false,
        isOffline = false
    ),
    DriveItem(
        id = "f_08",
        title = "Aura-Voice-Orb-Keynote.mp4",
        size = "54.1 MB",
        modifiedDate = "Yesterday",
        type = DriveFileType.MEDIA,
        isInitiallyStarred = false,
        isOffline = true
    ),
    DriveItem(
        id = "f_09",
        title = "Security-Audit-Report-v3.pdf",
        size = "2.4 MB",
        modifiedDate = "2 days ago",
        type = DriveFileType.PDF,
        isInitiallyStarred = false,
        isOffline = false
    ),
    DriveItem(
        id = "f_10",
        title = "Ecosystem-Conversion-Metrics.csv",
        size = "620 KB",
        modifiedDate = "3 days ago",
        type = DriveFileType.SHEET,
        isInitiallyStarred = false,
        isOffline = false
    ),
    DriveItem(
        id = "f_11",
        title = "MeshNetworkRouting.rs",
        size = "76 KB",
        modifiedDate = "4 days ago",
        type = DriveFileType.CODE,
        isInitiallyStarred = true,
        isOffline = false
    ),
    DriveItem(
        id = "f_12",
        title = "Brand-Identity-Kit-4K.png",
        size = "8.2 MB",
        modifiedDate = "5 days ago",
        type = DriveFileType.MEDIA,
        isInitiallyStarred = false,
        isOffline = true
    )
)

/**
 * Filter categories for horizontal chip navigation.
 */
val DRIVE_FILTER_OPTIONS = listOf(
    "All Files",
    "Documents",
    "Spreadsheets",
    "Code",
    "Offline"
)

/**
 * Native Jetpack Compose Google Drive & Dropbox-Class Drive Screen.
 *
 * Features:
 * 1. Top Storage Quota Card with FastCDC 64KB Dedup badge and live progress bar.
 * 2. Horizontal Filter Chips (All Files, Documents, Spreadsheets, Code, Media, Offline).
 * 3. Header with live file count and interactive Grid vs List View toggle.
 * 4. Rich File Cards with colored icon containers, metadata, star toggling, and 3-dots actions.
 * 5. Full dynamic integration with EcosystemStateStore.driveFilesList.
 * 6. Empty state view when active filter returns no matching items.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NativeDriveView(
    modifier: Modifier = Modifier,
    accentColor: Color = Color(0xFF0E, 0xA5, 0xE9), // Sky Blue accent
    onFileClick: (DriveItem) -> Unit = {}
) {
    val context = LocalContext.current
    var selectedFilter by remember { mutableStateOf("All Files") }
    var isGridView by remember { mutableStateOf(false) }

    // State map to track user-toggled stars persistently during session
    val starredStates = remember {
        mutableStateMapOf<String, Boolean>().apply {
            BASELINE_DRIVE_FILES.forEach { put(it.id, it.isInitiallyStarred) }
        }
    }

    // Map runtime dynamic files from EcosystemStateStore.driveFilesList into DriveItem
    val dynamicFiles = EcosystemStateStore.driveFilesList.map { storeFile ->
        val ext = storeFile.name.substringAfterLast('.', "").lowercase()
        val mappedType = when {
            ext == "pdf" -> DriveFileType.PDF
            ext in listOf("xlsx", "xls", "csv") -> DriveFileType.SHEET
            ext in listOf("doc", "docx", "txt", "md") -> DriveFileType.DOC
            ext in listOf("kt", "java", "ts", "js", "rs", "py", "go", "json", "html", "css") -> DriveFileType.CODE
            ext in listOf("png", "jpg", "jpeg", "mp4", "mp3", "mov", "webp", "gif") -> DriveFileType.MEDIA
            ext == "apk" -> DriveFileType.APK
            storeFile.type == "scan" -> DriveFileType.DOC
            else -> DriveFileType.OTHER
        }

        DriveItem(
            id = storeFile.id,
            title = storeFile.name,
            size = storeFile.size,
            modifiedDate = "Just now",
            type = mappedType,
            isInitiallyStarred = false,
            isOffline = storeFile.type == "offline"
        )
    }

    // Combine dynamic files first (newest on top) with baseline curated files
    val allFiles = dynamicFiles + BASELINE_DRIVE_FILES

    // Filter files based on selected category chip
    val filteredFiles = remember(selectedFilter, allFiles, starredStates.toMap()) {
        allFiles.filter { file ->
            when (selectedFilter) {
                "All Files" -> true
                "Documents" -> file.type.category == "Documents"
                "Spreadsheets" -> file.type.category == "Spreadsheets"
                "Code" -> file.type.category == "Code"
                "Media" -> file.type.category == "Media"
                "Offline" -> file.isOffline
                else -> true
            }
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF09, 0x0A, 0x0C))
    ) {
        if (isGridView) {
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 96.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                // Top Storage Quota Card (Spans both columns)
                item(span = { GridItemSpan(2) }) {
                    StorageQuotaCard(accentColor = accentColor)
                }

                // Horizontal Filter Chips (Spans both columns)
                item(span = { GridItemSpan(2) }) {
                    FilterChipsRow(
                        selectedFilter = selectedFilter,
                        onFilterSelected = { selectedFilter = it },
                        accentColor = accentColor
                    )
                }

                // Section Header with File Count and Grid/List Toggle (Spans both columns)
                item(span = { GridItemSpan(2) }) {
                    DriveSectionHeader(
                        fileCount = filteredFiles.size,
                        isGridView = isGridView,
                        onToggleView = { isGridView = !isGridView },
                        accentColor = accentColor
                    )
                }

                // File Items or Empty State
                if (filteredFiles.isEmpty()) {
                    item(span = { GridItemSpan(2) }) {
                        EmptyFilesState(filterName = selectedFilter)
                    }
                } else {
                    items(filteredFiles, key = { it.id }) { file ->
                        val isStarred = starredStates[file.id] ?: file.isInitiallyStarred
                        DriveGridCard(
                            file = file,
                            isStarred = isStarred,
                            onStarToggle = {
                                val newState = !isStarred
                                starredStates[file.id] = newState
                                Toast.makeText(
                                    context,
                                    if (newState) "Starred: ${file.title}" else "Unstarred: ${file.title}",
                                    Toast.LENGTH_SHORT
                                ).show()
                            },
                            onMoreOptions = {
                                Toast.makeText(
                                    context,
                                    "File options: Share, Download, Details",
                                    Toast.LENGTH_SHORT
                                ).show()
                            },
                            onClick = { onFileClick(file) }
                        )
                    }
                }
            }
        } else {
            LazyColumn(
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 96.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                // Top Storage Quota Card
                item {
                    StorageQuotaCard(accentColor = accentColor)
                    Spacer(modifier = Modifier.height(14.dp))
                }

                // Horizontal Filter Chips
                item {
                    FilterChipsRow(
                        selectedFilter = selectedFilter,
                        onFilterSelected = { selectedFilter = it },
                        accentColor = accentColor
                    )
                    Spacer(modifier = Modifier.height(14.dp))
                }

                // Section Header with File Count and Grid/List Toggle
                item {
                    DriveSectionHeader(
                        fileCount = filteredFiles.size,
                        isGridView = isGridView,
                        onToggleView = { isGridView = !isGridView },
                        accentColor = accentColor
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                }

                // File Items or Empty State
                if (filteredFiles.isEmpty()) {
                    item {
                        EmptyFilesState(filterName = selectedFilter)
                    }
                } else {
                    items(filteredFiles, key = { it.id }) { file ->
                        val isStarred = starredStates[file.id] ?: file.isInitiallyStarred
                        DriveListCard(
                            file = file,
                            isStarred = isStarred,
                            onStarToggle = {
                                val newState = !isStarred
                                starredStates[file.id] = newState
                                Toast.makeText(
                                    context,
                                    if (newState) "Starred: ${file.title}" else "Unstarred: ${file.title}",
                                    Toast.LENGTH_SHORT
                                ).show()
                            },
                            onMoreOptions = {
                                Toast.makeText(
                                    context,
                                    "File options: Share, Download, Details",
                                    Toast.LENGTH_SHORT
                                ).show()
                            },
                            onClick = { onFileClick(file) }
                        )
                    }
                }
            }
        }
    }
}

/**
 * Top Storage Quota Card showing:
 * - "QuantDrive Encrypted Vault"
 * - Progress bar: "14.2 GB of 100 GB used" (14.2%)
 * - FastCDC 64KB badge: "⚡ FastCDC Dedup saved 4.8 GB bandwidth"
 */
@Composable
private fun StorageQuotaCard(
    accentColor: Color,
    modifier: Modifier = Modifier
) {
    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF13, 0x16, 0x1F)),
        border = BorderStroke(1.dp, Color(0xFF26, 0x2C, 0x3A)),
        modifier = modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(18.dp)
        ) {
            // Header Row: Vault Title & Encrypted Status Chip
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(
                                Brush.linearGradient(
                                    listOf(
                                        accentColor.copy(alpha = 0.25f),
                                        accentColor.copy(alpha = 0.10f)
                                    )
                                )
                            )
                            .border(1.dp, accentColor.copy(alpha = 0.45f), RoundedCornerShape(10.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Lock,
                            contentDescription = "Encrypted Vault",
                            tint = accentColor,
                            modifier = Modifier.size(19.dp)
                        )
                    }

                    Column {
                        Text(
                            text = "QuantDrive Encrypted Vault",
                            fontSize = 16.5.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                        Text(
                            text = "Zero-Knowledge Sovereign Storage",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium,
                            color = Color(0xFF94, 0xA3, 0xB8)
                        )
                    }
                }

                // AES-GCM Badge
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color(0xFF10, 0xB9, 0x81).copy(alpha = 0.15f))
                        .border(1.dp, Color(0xFF10, 0xB9, 0x81).copy(alpha = 0.4f), RoundedCornerShape(8.dp))
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = "AES-GCM",
                        fontSize = 10.5.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF10, 0xB9, 0x81)
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Storage Quota Progress Labels
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "14.2 GB of 100 GB used",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    color = Color(0xFFE2, 0xE8, 0xF0)
                )
                Text(
                    text = "14.2%",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = accentColor
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Layered Gradient Progress Bar: 14.2 GB of 100 GB used (14.2%)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(9.dp)
                    .clip(RoundedCornerShape(5.dp))
                    .background(Color(0xFF1E, 0x23, 0x30))
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.142f)
                        .height(9.dp)
                        .clip(RoundedCornerShape(5.dp))
                        .background(
                            Brush.horizontalGradient(
                                colors = listOf(
                                    Color(0xFF0E, 0xA5, 0xE9), // Sky Blue
                                    Color(0xFF38, 0xBD, 0xF8), // Light Blue
                                    Color(0xFF81, 0x8C, 0xF8)  // Indigo
                                )
                            )
                        )
                )
            }

            Spacer(modifier = Modifier.height(14.dp))

            // FastCDC 64KB Dedup Badge: "⚡ FastCDC Dedup saved 4.8 GB bandwidth"
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color(0xFF0F, 0x13, 0x1B))
                    .border(1.dp, Color(0xFF10, 0xB9, 0x81).copy(alpha = 0.25f), RoundedCornerShape(12.dp))
                    .padding(horizontal = 12.dp, vertical = 9.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.FlashOn,
                        contentDescription = "FastCDC",
                        tint = Color(0xFF10, 0xB9, 0x81),
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        text = "⚡ FastCDC Dedup saved 4.8 GB bandwidth",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFF34, 0xD3, 0x99)
                    )
                }
            }
        }
    }
}

/**
 * Horizontal Filter Chips Row with glowing states:
 * "All Files", "Documents", "Spreadsheets", "Code", "Offline"
 */
@Composable
private fun FilterChipsRow(
    selectedFilter: String,
    onFilterSelected: (String) -> Unit,
    accentColor: Color,
    modifier: Modifier = Modifier
) {
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = modifier.fillMaxWidth()
    ) {
        items(DRIVE_FILTER_OPTIONS) { filter ->
            val isSelected = selectedFilter == filter
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .then(
                        if (isSelected) {
                            Modifier.background(
                                Brush.linearGradient(
                                    listOf(
                                        accentColor.copy(alpha = 0.28f),
                                        accentColor.copy(alpha = 0.12f)
                                    )
                                )
                            )
                        } else {
                            Modifier.background(Color(0xFF14, 0x17, 0x22))
                        }
                    )
                    .border(
                        width = if (isSelected) 1.5.dp else 1.dp,
                        color = if (isSelected) accentColor else Color(0xFF26, 0x2C, 0x3A),
                        shape = RoundedCornerShape(12.dp)
                    )
                    .clickable { onFilterSelected(filter) }
                    .padding(horizontal = 14.dp, vertical = 7.dp)
            ) {
                Text(
                    text = filter,
                    fontSize = 12.5.sp,
                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                    color = if (isSelected) Color.White else Color(0xFF94, 0xA3, 0xB8)
                )
            }
        }
    }
}

/**
 * Section Header displaying:
 * - File count (e.g. "12 items")
 * - View mode toggle button (Grid vs List icon)
 */
@Composable
private fun DriveSectionHeader(
    fileCount: Int,
    isGridView: Boolean,
    onToggleView: () -> Unit,
    accentColor: Color,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text(
                text = "$fileCount items",
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = Color(0xFF94, 0xA3, 0xB8)
            )
        }

        // View Mode Toggle Button
        IconButton(
            onClick = onToggleView,
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(Color(0xFF16, 0x19, 0x20))
                .border(1.dp, Color(0xFF2E, 0x34, 0x42), RoundedCornerShape(8.dp))
        ) {
            Icon(
                imageVector = if (isGridView) Icons.AutoMirrored.Filled.ViewList else Icons.Default.GridView,
                contentDescription = if (isGridView) "Switch to list view" else "Switch to grid view",
                tint = accentColor,
                modifier = Modifier.size(18.dp)
            )
        }
    }
}

/**
 * List View Card for individual files.
 * Features rich file-type colored badges (PDF in red, Sheets in green, Code in violet), size, date, star button, and 3-dot menu.
 */
@Composable
private fun DriveListCard(
    file: DriveItem,
    isStarred: Boolean,
    onStarToggle: () -> Unit,
    onMoreOptions: () -> Unit,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(14.dp),
        color = Color(0xFF14, 0x17, 0x22),
        border = BorderStroke(1.dp, Color(0xFF24, 0x2A, 0x38)),
        modifier = modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            // File Icon & Title/Metadata Column
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier.weight(1f)
            ) {
                // Colored container icon
                Box(
                    modifier = Modifier
                        .size(46.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(file.type.containerColor)
                        .border(1.dp, file.type.iconTint.copy(alpha = 0.4f), RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = file.type.icon,
                        contentDescription = file.type.name,
                        tint = file.type.iconTint,
                        modifier = Modifier.size(24.dp)
                    )
                }

                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = file.title,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color.White,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false)
                        )

                        // Rich file-type colored badge (PDF in red, Sheets in green, Code in violet)
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(5.dp))
                                .background(file.type.iconTint.copy(alpha = 0.15f))
                                .border(0.5.dp, file.type.iconTint.copy(alpha = 0.45f), RoundedCornerShape(5.dp))
                                .padding(horizontal = 5.dp, vertical = 1.5.dp)
                        ) {
                            Text(
                                text = file.type.badgeLabel,
                                color = file.type.iconTint,
                                fontSize = 9.5.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(4.dp))

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = file.size,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            color = Color(0xFF94, 0xA3, 0xB8)
                        )

                        Text(
                            text = "•",
                            fontSize = 10.sp,
                            color = Color(0xFF64, 0x74, 0x8B)
                        )

                        Text(
                            text = file.modifiedDate,
                            fontSize = 12.sp,
                            color = Color(0xFF64, 0x74, 0x8B)
                        )

                        if (file.isOffline) {
                            Text(
                                text = "•",
                                fontSize = 10.sp,
                                color = Color(0xFF64, 0x74, 0x8B)
                            )
                            Text(
                                text = "Offline",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Color(0xFF10, 0xB9, 0x81)
                            )
                        }
                    }
                }
            }

            // Trailing Action Icons: Star & 3-dots
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                // Star Button
                IconButton(
                    onClick = onStarToggle,
                    modifier = Modifier.size(36.dp)
                ) {
                    Icon(
                        imageVector = if (isStarred) Icons.Default.Star else Icons.Default.StarBorder,
                        contentDescription = if (isStarred) "Starred" else "Unstarred",
                        tint = if (isStarred) Color(0xFFF5, 0x9E, 0x0B) else Color(0xFF64, 0x74, 0x8B),
                        modifier = Modifier.size(20.dp)
                    )
                }

                // 3-dots action icon
                IconButton(
                    onClick = onMoreOptions,
                    modifier = Modifier.size(36.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.MoreVert,
                        contentDescription = "File Options",
                        tint = Color(0xFF94, 0xA3, 0xB8),
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
        }
    }
}

/**
 * Grid View Card for individual files.
 * Features rich file-type colored badges, size, date, star button, and 3-dot menu.
 */
@Composable
private fun DriveGridCard(
    file: DriveItem,
    isStarred: Boolean,
    onStarToggle: () -> Unit,
    onMoreOptions: () -> Unit,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF14, 0x17, 0x22)),
        border = BorderStroke(1.dp, Color(0xFF24, 0x2A, 0x38)),
        modifier = modifier
            .fillMaxWidth()
            .clickable { onClick() }
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp)
        ) {
            // Top Row: Colored Icon Container, Rich file badge, & Star Button
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(42.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(file.type.containerColor)
                            .border(1.dp, file.type.iconTint.copy(alpha = 0.4f), RoundedCornerShape(12.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = file.type.icon,
                            contentDescription = file.type.name,
                            tint = file.type.iconTint,
                            modifier = Modifier.size(22.dp)
                        )
                    }

                    // Rich file-type colored badge
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(5.dp))
                            .background(file.type.iconTint.copy(alpha = 0.15f))
                            .border(0.5.dp, file.type.iconTint.copy(alpha = 0.45f), RoundedCornerShape(5.dp))
                            .padding(horizontal = 5.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = file.type.badgeLabel,
                            color = file.type.iconTint,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                IconButton(
                    onClick = onStarToggle,
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(
                        imageVector = if (isStarred) Icons.Default.Star else Icons.Default.StarBorder,
                        contentDescription = if (isStarred) "Starred" else "Unstarred",
                        tint = if (isStarred) Color(0xFFF5, 0x9E, 0x0B) else Color(0xFF64, 0x74, 0x8B),
                        modifier = Modifier.size(18.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // File Title (2 lines max with ellipsis)
            Text(
                text = file.title,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = Color.White,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 18.sp,
                modifier = Modifier.height(36.dp)
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Bottom Row: Size + Relative Date & 3-dots
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = file.size,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                        color = Color(0xFF94, 0xA3, 0xB8)
                    )
                    Text(
                        text = file.modifiedDate,
                        fontSize = 10.sp,
                        color = Color(0xFF64, 0x74, 0x8B)
                    )
                }

                IconButton(
                    onClick = onMoreOptions,
                    modifier = Modifier.size(28.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.MoreVert,
                        contentDescription = "File Options",
                        tint = Color(0xFF94, 0xA3, 0xB8),
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }
    }
}

/**
 * Empty state displayed when active filter yields zero results.
 */
@Composable
private fun EmptyFilesState(
    filterName: String,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 48.dp, horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Box(
            modifier = Modifier
                .size(72.dp)
                .clip(CircleShape)
                .background(Color(0xFF16, 0x19, 0x20))
                .border(1.dp, Color(0xFF2E, 0x34, 0x42), CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Default.FolderOpen,
                contentDescription = null,
                tint = Color(0xFF64, 0x74, 0x8B),
                modifier = Modifier.size(36.dp)
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = "No $filterName found",
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White
        )

        Spacer(modifier = Modifier.height(6.dp))

        Text(
            text = "There are no files matching this filter in your encrypted vault.",
            fontSize = 13.sp,
            color = Color(0xFF94, 0xA3, 0xB8),
            maxLines = 2
        )
    }
}

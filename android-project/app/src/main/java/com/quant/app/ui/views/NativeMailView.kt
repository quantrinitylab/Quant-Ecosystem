package com.quant.app.ui.views

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quant.app.ui.components.NativeThreadDetailModal
import com.quant.app.ui.components.SearchResultItem
import kotlinx.coroutines.launch

/**
 * Data model for native high-fidelity email threads in the Quant Ecosystem.
 */
data class MailThread(
    val id: String,
    val sender: String,
    val subject: String,
    val snippet: String,
    val time: String,
    val tag: String,
    val isUnread: Boolean,
    val isStarred: Boolean = false,
    val hasAttachment: Boolean = false,
    val attachmentText: String? = null,
    val category: String = "Important"
) {
    fun toSearchResultItem(): SearchResultItem = SearchResultItem(
        id = id,
        sender = sender,
        subject = subject,
        snippet = snippet,
        time = time,
        chip = tag
    )
}

/**
 * High-fidelity, Superhuman & Gmail-class Native Jetpack Compose Mail Screen.
 *
 * Features:
 * - Category tabs ("Important", "All Mail", "Updates", "Promotions") with unread count badges
 * - VIP / Priority Banner with spark icon and 1-tap focus
 * - High-fidelity thread item cards with custom initials avatars, bold unread senders,
 *   subject unread blue indicator, 2-line snippet, category chips, star toggles, and attachment badges
 * - Pre-populated with 6 canonical ecosystem threads
 * - Empty state ("Inbox Zero · All caught up! ✨")
 * - Connected thread detail modal with full action bar and quick replies
 */
@Composable
fun NativeMailView(
    modifier: Modifier = Modifier,
    accentColor: Color = Color(0xFFFF8C42),
    onThreadClick: ((MailThread) -> Unit)? = null
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val listState = rememberLazyListState()

    // Category Tabs definition
    val tabs = remember {
        listOf(
            TabItem("Important", badgeCount = "3", isAccentBadge = true),
            TabItem("All Mail", badgeCount = null),
            TabItem("Updates", badgeCount = "5", isAccentBadge = false),
            TabItem("Promotions", badgeCount = null)
        )
    }
    var selectedTab by remember { mutableStateOf("Important") }

    // Pre-populated 6 rich ecosystem threads
    val threads = remember {
        mutableStateListOf(
            MailThread(
                id = "thread_1",
                sender = "CodeHub Git Engine",
                subject = "Sovereign Git Engine PR #347 Merged",
                snippet = "PR #347 Per-App Platform Presence Ready. All gates passed with 100% green tests.",
                time = "5m ago",
                tag = "CodeHub",
                isUnread = true,
                isStarred = false,
                hasAttachment = true,
                attachmentText = "1 attachment",
                category = "Important"
            ),
            MailThread(
                id = "thread_2",
                sender = "Quant Engineering",
                subject = "Q3 Ecosystem Financials & Cloud Infrastructure",
                snippet = "AWS EKS 20-pod deployment across quant-staging operating at zero error rate.",
                time = "25m ago",
                tag = "Finance",
                isUnread = true,
                isStarred = true,
                hasAttachment = true,
                attachmentText = "financials-q3.pdf",
                category = "Important"
            ),
            MailThread(
                id = "thread_3",
                sender = "Trinity Security",
                subject = "Trinity SSO tokens & session keys rotation",
                snippet = "Universal SSO token bridge verified with hardware biometric bridge across all 9 apps.",
                time = "1h ago",
                tag = "Security",
                isUnread = false,
                isStarred = false,
                hasAttachment = false,
                category = "Important"
            ),
            MailThread(
                id = "thread_4",
                sender = "Quant Mobile",
                subject = "Android APK Jetpack Compose release v1.0",
                snippet = "Native 5-tab productivity suite with hardware biometric bridge published.",
                time = "3h ago",
                tag = "Mobile",
                isUnread = false,
                isStarred = true,
                hasAttachment = true,
                attachmentText = "quant-release.apk",
                category = "Important"
            ),
            MailThread(
                id = "thread_5",
                sender = "Quanty Copilot",
                subject = "Automated Daily Ecosystem Briefing",
                snippet = "Good morning! 2 PRs merged, 1 live cluster deployment succeeded, 0 outages.",
                time = "Yesterday",
                tag = "Updates",
                isUnread = false,
                isStarred = false,
                hasAttachment = false,
                category = "Updates"
            ),
            MailThread(
                id = "thread_6",
                sender = "Stripe Billing",
                subject = "Invoice #INV-2026-09-30 Paid",
                snippet = "Thank you for your payment. Your enterprise subscription is renewed.",
                time = "Sep 28",
                tag = "Finance",
                isUnread = false,
                isStarred = false,
                hasAttachment = true,
                attachmentText = "invoice_INV-2026.pdf",
                category = "All Mail"
            )
        )
    }

    // Active detail modal thread state
    var activeDetailThread by remember { mutableStateOf<MailThread?>(null) }

    // Filter threads based on the selected tab
    val displayedThreads = remember(selectedTab, threads.toList()) {
        when (selectedTab) {
            "Important" -> threads.filter { it.category == "Important" }
            "All Mail" -> threads.toList()
            "Updates" -> threads.filter { it.category == "Updates" || it.tag.equals("Updates", ignoreCase = true) }
            "Promotions" -> threads.filter { it.category == "Promotions" }
            else -> threads.toList()
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF0B, 0x0C, 0x0E))
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            // ─── 1. TOP CATEGORY TABS ROW ───────────────────────────────────────
            CategoryTabsRow(
                tabs = tabs,
                selectedTab = selectedTab,
                accentColor = accentColor,
                onTabSelect = { tabName ->
                    selectedTab = tabName
                    coroutineScope.launch {
                        listState.animateScrollToItem(0)
                    }
                }
            )

            HorizontalDivider(
                thickness = 0.5.dp,
                color = Color(0xFF26, 0x2A, 0x33)
            )

            // ─── 2. VIP / PRIORITY BANNER ───────────────────────────────────────
            PriorityEmailsBanner(
                count = 3,
                accentColor = accentColor,
                onClick = {
                    selectedTab = "Important"
                    Toast.makeText(context, "Focused 3 Priority Emails ✨", Toast.LENGTH_SHORT).show()
                    coroutineScope.launch {
                        listState.animateScrollToItem(0)
                    }
                }
            )

            // ─── 3. MAIL THREAD LIST / EMPTY STATE ──────────────────────────────
            if (displayedThreads.isEmpty()) {
                MailInboxZeroState(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                )
            } else {
                LazyColumn(
                    state = listState,
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    contentPadding = PaddingValues(bottom = 80.dp)
                ) {
                    items(
                        items = displayedThreads,
                        key = { it.id }
                    ) { thread ->
                        MailThreadItem(
                            thread = thread,
                            accentColor = accentColor,
                            onClick = {
                                if (onThreadClick != null) {
                                    onThreadClick(thread)
                                } else {
                                    activeDetailThread = thread
                                }
                            },
                            onToggleStar = { target ->
                                val index = threads.indexOfFirst { it.id == target.id }
                                if (index != -1) {
                                    val updated = target.copy(isStarred = !target.isStarred)
                                    threads[index] = updated
                                    val msg = if (updated.isStarred) "★ Thread Starred" else "☆ Thread Unstarred"
                                    Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
                                }
                            }
                        )
                        HorizontalDivider(
                            thickness = 0.5.dp,
                            color = Color(0xFF1E, 0x22, 0x2B),
                            modifier = Modifier.padding(start = 72.dp)
                        )
                    }
                }
            }
        }

        // ─── 4. NATIVE THREAD DETAIL MODAL ──────────────────────────────────────
        if (activeDetailThread != null) {
            NativeThreadDetailModal(
                item = activeDetailThread!!.toSearchResultItem(),
                onDismiss = { activeDetailThread = null },
                onReply = {
                    Toast.makeText(context, "↩ Replying to ${activeDetailThread?.sender}...", Toast.LENGTH_SHORT).show()
                },
                accentColor = accentColor
            )
        }
    }
}

/**
 * Data representation for category navigation tabs.
 */
data class TabItem(
    val name: String,
    val badgeCount: String? = null,
    val isAccentBadge: Boolean = false
)

/**
 * Top category tabs row matching Gmail / Superhuman styling.
 */
@Composable
fun CategoryTabsRow(
    tabs: List<TabItem>,
    selectedTab: String,
    accentColor: Color,
    onTabSelect: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        tabs.forEach { tab ->
            val isSelected = tab.name == selectedTab
            val backgroundColor by animateColorAsState(
                targetValue = if (isSelected) Color(0xFF1E, 0x22, 0x2B) else Color.Transparent,
                label = "tabBg"
            )
            val textColor by animateColorAsState(
                targetValue = if (isSelected) Color.White else Color(0xFF94, 0xA3, 0xB8),
                label = "tabTextColor"
            )

            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .background(backgroundColor)
                    .then(
                        if (isSelected) Modifier.border(1.dp, Color(0xFF33, 0x39, 0x47), RoundedCornerShape(20.dp))
                        else Modifier
                    )
                    .clickable { onTabSelect(tab.name) }
                    .padding(horizontal = 14.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = tab.name,
                    color = textColor,
                    fontSize = 13.sp,
                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium
                )

                if (tab.badgeCount != null) {
                    Spacer(modifier = Modifier.width(6.dp))
                    val badgeBg = if (tab.isAccentBadge) accentColor else Color(0xFF33, 0x39, 0x47)
                    val badgeTextColor = if (tab.isAccentBadge) Color.Black else Color(0xFFE2, 0xE8, 0xF0)

                    Box(
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(badgeBg)
                            .padding(horizontal = 6.dp, vertical = 1.5.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = tab.badgeCount,
                            color = badgeTextColor,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }
    }
}

/**
 * VIP / Priority Banner Card with spark icon: "✨ 3 Priority emails require your attention"
 * Tap to focus Important category.
 */
@Composable
fun PriorityEmailsBanner(
    count: Int,
    accentColor: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        onClick = onClick,
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp),
        shape = RoundedCornerShape(12.dp),
        color = Color(0xFF16, 0x1A, 0x22),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF26, 0x2D, 0x3D))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(CircleShape)
                    .background(accentColor.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Filled.AutoAwesome,
                    contentDescription = "Priority",
                    tint = accentColor,
                    modifier = Modifier.size(16.dp)
                )
            }

            Spacer(modifier = Modifier.width(10.dp))

            Text(
                text = "✨ $count Priority emails require your attention",
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f)
            )

            Icon(
                imageVector = Icons.Filled.ChevronRight,
                contentDescription = "Focus",
                tint = Color(0xFF64, 0x74, 0x8B),
                modifier = Modifier.size(18.dp)
            )
        }
    }
}

/**
 * High-fidelity single Mail Thread Item card.
 */
@Composable
fun MailThreadItem(
    thread: MailThread,
    accentColor: Color,
    onClick: () -> Unit,
    onToggleStar: (MailThread) -> Unit,
    modifier: Modifier = Modifier
) {
    val initials = getInitialsForSender(thread.sender)
    val avatarBg = getAvatarColorForTag(thread.tag, accentColor)

    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.Top
    ) {
        // ─── Avatar with initials and background color ───────────────────────
        Box(
            modifier = Modifier
                .size(42.dp)
                .clip(CircleShape)
                .background(avatarBg),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = initials,
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold
            )
        }

        Spacer(modifier = Modifier.width(12.dp))

        // ─── Thread Content Column ───────────────────────────────────────────
        Column(
            modifier = Modifier.weight(1f)
        ) {
            // Row 1: Sender name (14.sp, Bold if unread) and Time
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = thread.sender,
                    fontSize = 14.sp,
                    fontWeight = if (thread.isUnread) FontWeight.Bold else FontWeight.Normal,
                    color = if (thread.isUnread) Color.White else Color(0xFFCBD5E1),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )

                Spacer(modifier = Modifier.width(6.dp))

                Text(
                    text = thread.time,
                    fontSize = 11.sp,
                    fontWeight = if (thread.isUnread) FontWeight.SemiBold else FontWeight.Normal,
                    color = if (thread.isUnread) accentColor else Color(0xFF64, 0x74, 0x8B)
                )
            }

            Spacer(modifier = Modifier.height(3.dp))

            // Row 2: Subject line with unread blue/accent dot indicator
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (thread.isUnread) {
                    Box(
                        modifier = Modifier
                            .size(6.5.dp)
                            .clip(CircleShape)
                            .background(Color(0xFF38, 0xBD, 0xF8))
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                }

                Text(
                    text = thread.subject,
                    fontSize = 14.sp,
                    fontWeight = if (thread.isUnread) FontWeight.SemiBold else FontWeight.Normal,
                    color = if (thread.isUnread) Color(0xFFF1, 0xF5, 0xF9) else Color(0xFF94, 0xA3, 0xB8),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
            }

            Spacer(modifier = Modifier.height(4.dp))

            // Row 3: 2-line snippet preview (13.sp, Color(0xFF94, 0xA3, 0xB8))
            Text(
                text = thread.snippet,
                fontSize = 13.sp,
                color = Color(0xFF94, 0xA3, 0xB8),
                lineHeight = 18.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )

            Spacer(modifier = Modifier.height(6.dp))

            // Row 4: Tag/Category chip & Attachment indicator
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Category Tag Chip
                val tagColor = getTagTextColor(thread.tag, accentColor)
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .background(tagColor.copy(alpha = 0.15f))
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = thread.tag,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = tagColor
                    )
                }

                // Attachment indicator (e.g. "📎 1 attachment")
                if (thread.hasAttachment) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(Color(0xFF1E, 0x22, 0x2B))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = "📎 ${thread.attachmentText ?: "1 attachment"}",
                            fontSize = 11.sp,
                            color = Color(0xFF94, 0xA3, 0xB8),
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.width(6.dp))

        // ─── Star Toggle Button (Gold #F59E0B) ─────────────────────────────────
        IconButton(
            onClick = { onToggleStar(thread) },
            modifier = Modifier.size(36.dp)
        ) {
            Icon(
                imageVector = if (thread.isStarred) Icons.Filled.Star else Icons.Filled.StarBorder,
                contentDescription = if (thread.isStarred) "Starred" else "Unstarred",
                tint = if (thread.isStarred) Color(0xFFF5, 0x9E, 0x0B) else Color(0xFF47, 0x55, 0x69),
                modifier = Modifier.size(20.dp)
            )
        }
    }
}

/**
 * Empty state: "Inbox Zero · All caught up! ✨"
 */
@Composable
fun MailInboxZeroState(
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 56.dp, horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Box(
            modifier = Modifier
                .size(68.dp)
                .clip(CircleShape)
                .background(Color(0xFF16, 0x1A, 0x22))
                .border(1.dp, Color(0xFF26, 0x2D, 0x3D), CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Text(text = "✨", fontSize = 28.sp)
        }

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = "Inbox Zero · All caught up! ✨",
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White
        )

        Spacer(modifier = Modifier.height(6.dp))

        Text(
            text = "No pending emails in this view. Everything has been processed.",
            fontSize = 13.sp,
            color = Color(0xFF64, 0x74, 0x8B),
            textAlign = TextAlign.Center
        )
    }
}

/**
 * Returns canonical avatar initials for ecosystem senders.
 * (e.g. "GH" for GitHub, "SL" for Stripe, "CG" for CodeHub, "TS" for Trinity Security)
 */
fun getInitialsForSender(sender: String): String {
    return when {
        sender.contains("CodeHub", ignoreCase = true) -> "CG"
        sender.contains("Stripe", ignoreCase = true) -> "SL"
        sender.contains("Trinity", ignoreCase = true) -> "TS"
        sender.contains("GitHub", ignoreCase = true) -> "GH"
        sender.contains("Engineering", ignoreCase = true) -> "QE"
        sender.contains("Mobile", ignoreCase = true) -> "QM"
        sender.contains("Copilot", ignoreCase = true) -> "QC"
        else -> {
            val parts = sender.split(" ").filter { it.isNotBlank() }
            if (parts.size >= 2) "${parts[0].first().uppercase()}${parts[1].first().uppercase()}"
            else sender.take(2).uppercase()
        }
    }
}

/**
 * Returns background color for avatar circles based on tag/sender.
 */
fun getAvatarColorForTag(tag: String, accentColor: Color): Color {
    return when (tag.lowercase()) {
        "codehub" -> Color(0xFF10, 0xB9, 0x81) // Emerald Green
        "finance" -> Color(0xFF3B, 0x82, 0xF6) // Royal Blue
        "security" -> Color(0xFFEF, 0x44, 0x44) // Red / Rose
        "mobile" -> Color(0xFF8B, 0x5C, 0xF6) // Purple / Violet
        "updates" -> Color(0xFFF5, 0x9E, 0x0B) // Amber
        else -> accentColor
    }
}

/**
 * Returns text color for category tag chips.
 */
fun getTagTextColor(tag: String, accentColor: Color): Color {
    return when (tag.lowercase()) {
        "codehub" -> Color(0xFF34, 0xD3, 0x99) // Mint
        "finance" -> Color(0xFF60, 0xA5, 0xFA) // Sky
        "security" -> Color(0xFFF8, 0x71, 0x71) // Coral
        "mobile" -> Color(0xFFA7, 0x8B, 0xFA) // Lavender
        "updates" -> Color(0xFFFB, 0xBF, 0x24) // Gold
        else -> accentColor
    }
}

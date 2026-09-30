package com.quant.app.ui.views

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.offset
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
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material.icons.outlined.Archive
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quant.app.ui.components.NativeThreadDetailModal
import com.quant.app.ui.components.SearchResultItem
import kotlinx.coroutines.launch
import kotlin.math.absoluteValue

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
    val category: String = "Important",
    val isPriority: Boolean = false
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
 * Data representation for Superhuman Split Lenses filters.
 */
data class LensItem(
    val key: String,
    val label: String,
    val countBadge: String? = null,
    val isAccentBadge: Boolean = false
)

/**
 * Pre-defined design tokens for QuantMail Native Views matching Superhuman and Linear luxury palette.
 */
object QuantBrandTokens {
    // Luxury Obsidian & Slate Palette
    val VoidCanvas = Color(0xFF09, 0x0A, 0x0E) // Canvas: #090A0E
    val CardObsidian = Color(0xFF12, 0x15, 0x1E) // Card surface: #12151E (rich deep dark slate)
    val CardBorder = Color(0xFF23, 0x29, 0x38) // Card border: #232938 (subtle 0.8dp hairline stroke)
    val CardBorderHairline = 0.8.dp

    // Molten Amber & Radiant Accents
    val AmberPrimary = Color(0xFFFF, 0x8C, 0x42) // Molten Amber #FF8C42
    val AmberHalo = Color(0x33, 0xFF, 0x8C, 0x42) // Soft outer halo
    val AmberTintBg = Color(0xFF2A, 0x1E, 0x17) // Active pill background #2A1E17
    val AmberGlowBorder = Color(0x99, 0xFF, 0x8C, 0x42) // #FF8C42.copy(alpha = 0.6f)

    // Superhuman Split Lens Filter Tokens
    val LensInactiveBg = Color(0xFF14, 0x17, 0x22) // Inactive background #141722
    val LensInactiveBorder = Color(0xFF20, 0x25, 0x34) // Inactive border #202534
    val LensInactiveText = Color(0xFF94, 0xA3, 0xB8) // Inactive text #94A3B8

    // Crisp Typography Tokens
    val TextWhite = Color(0xFFF8, 0xFA, 0xFC) // Text primary: #F8FAFC
    val TextSecondary = Color(0xFF94, 0xA3, 0xB8) // Text secondary: #94A3B8
    val TextMuted = Color(0xFF64, 0x74, 0x8B) // Text muted: #64748B
    val TextRead = Color(0xFF94, 0xA3, 0xB8)

    // Functional & Action Tokens
    val StarGold = Color(0xFFF5, 0x9E, 0x0B)
    val BadgeDarkText = Color(0xFF09, 0x0A, 0x0E)
    val BadgeMutedBg = Color(0xFF20, 0x25, 0x34)
    val AttachmentBg = Color(0xFF16, 0x19, 0x24)
    val AttachmentBorder = Color(0xFF25, 0x2B, 0x3C)
    val ActionIconTint = Color(0xFF64, 0x74, 0x8B)

    // Priority Radar Executive Glow
    val RadarBorderGradient = listOf(
        Color(0xFF23, 0x29, 0x38),
        Color(0x99, 0xFF, 0x8C, 0x42),
        Color(0xFF23, 0x29, 0x38)
    )
}

/**
 * High-performance singleton cache for avatar initials and gradients.
 * Eliminates ART JIT compilation spikes and GC pauses during fast scroll.
 */
object AvatarGradientCache {
    val Green = Brush.linearGradient(listOf(Color(0xFF10, 0xB9, 0x81), Color(0xFF04, 0x78, 0x57)))
    val Blue = Brush.linearGradient(listOf(Color(0xFF3B, 0x82, 0xF6), Color(0xFF1D, 0x4E, 0xD8)))
    val Amber = Brush.linearGradient(listOf(Color(0xFFF5, 0x9E, 0x0B), Color(0xFFEA, 0x58, 0x0C)))
    val Red = Brush.linearGradient(listOf(Color(0xFFEF, 0x44, 0x44), Color(0xFF99, 0x1B, 0x1B)))
    val Purple = Brush.linearGradient(listOf(Color(0xFF8B, 0x5C, 0xF6), Color(0xFF6D, 0x28, 0xD9)))
    val Orange = Brush.linearGradient(listOf(Color(0xFFFF, 0x8C, 0x42), Color(0xFFD9, 0x77, 0x06)))
    val Indigo = Brush.linearGradient(listOf(Color(0xFF63, 0x66, 0xF1), Color(0xFF43, 0x38, 0xCA)))
    val Teal = Brush.linearGradient(listOf(Color(0xFF14, 0xB8, 0xA6), Color(0xFF0D, 0x94, 0x88)))
    val Pink = Brush.linearGradient(listOf(Color(0xFFEC, 0x48, 0x99), Color(0xFFBE, 0x18, 0x5D)))
    val Cyan = Brush.linearGradient(listOf(Color(0xFF06, 0xB6, 0xD4), Color(0xFF0E, 0x74, 0x90)))

    private val fallbackPalette = listOf(Blue, Green, Amber, Purple, Pink, Cyan, Orange, Indigo, Teal)
    private val initialsCache = java.util.concurrent.ConcurrentHashMap<String, String>()
    private val gradientCache = java.util.concurrent.ConcurrentHashMap<String, Brush>()

    fun getInitials(sender: String): String {
        return initialsCache.getOrPut(sender) {
            when {
                sender.contains("CodeHub", ignoreCase = true) -> "CG"
                sender.contains("Engineering", ignoreCase = true) -> "QE"
                sender.contains("Sundar", ignoreCase = true) -> "SP"
                sender.contains("Trinity", ignoreCase = true) -> "TS"
                sender.contains("Mobile", ignoreCase = true) -> "QM"
                sender.contains("Copilot", ignoreCase = true) -> "QC"
                sender.contains("Stripe", ignoreCase = true) -> "SL"
                sender.contains("GitHub", ignoreCase = true) -> "GH"
                sender.contains("Alex Vance", ignoreCase = true) -> "AV"
                sender.contains("Sarah Connor", ignoreCase = true) -> "SC"
                else -> {
                    val parts = sender.split(" ").filter { it.isNotBlank() }
                    if (parts.size >= 2) "${parts[0].first().uppercase()}${parts[1].first().uppercase()}"
                    else sender.take(2).uppercase()
                }
            }
        }
    }

    fun getGradient(sender: String, initials: String): Brush {
        return gradientCache.getOrPut(sender) {
            when {
                initials == "CG" || sender.contains("CodeHub", ignoreCase = true) -> Green
                initials == "QE" || sender.contains("Engineering", ignoreCase = true) -> Blue
                initials == "SP" || sender.contains("Sundar", ignoreCase = true) -> Amber
                initials == "TS" || sender.contains("Trinity", ignoreCase = true) -> Red
                initials == "QM" || sender.contains("Mobile", ignoreCase = true) -> Purple
                initials == "QC" || sender.contains("Copilot", ignoreCase = true) -> Orange
                initials == "SL" || sender.contains("Stripe", ignoreCase = true) -> Indigo
                initials == "GH" || sender.contains("GitHub", ignoreCase = true) -> Indigo
                initials == "AV" || sender.contains("Alex", ignoreCase = true) -> Teal
                initials == "SC" || sender.contains("Sarah", ignoreCase = true) -> Pink
                else -> {
                    val index = (sender.hashCode().absoluteValue) % fallbackPalette.size
                    fallbackPalette[index]
                }
            }
        }
    }
}

/**
 * Pre-defined category tag colors with soft modern tints.
 */
object TagColors {
    val Mint = Color(0xFF34, 0xD3, 0x99) // Mint for CodeHub
    val Sky = Color(0xFF38, 0xBD, 0xF8) // Sky for Finance
    val Gold = Color(0xFFFB, 0xBF, 0x24) // Gold for Executive
    val Coral = Color(0xFFF8, 0x71, 0x71)
    val Lavender = Color(0xFFA7, 0x8B, 0xFA)
    val Indigo = Color(0xFF81, 0x8C, 0xF8)
    val Rose = Color(0xFFF4, 0x72, 0xB6)
    val Teal = Color(0xFF2D, 0xD4, 0xBF)

    fun getTagColor(tag: String, fallback: Color): Color {
        return when (tag.lowercase()) {
            "codehub" -> Mint
            "finance" -> Sky
            "executive" -> Gold
            "security" -> Coral
            "mobile" -> Lavender
            "updates" -> Gold
            "billing" -> Indigo
            "design" -> Rose
            "contacts" -> Teal
            else -> fallback
        }
    }
}

/**
 * High-fidelity, Superhuman & QuantMail Web-class Native Jetpack Compose Mail Screen.
 *
 * Canvas Background: True Obsidian Void (Color(0xFF09, 0x0A, 0x0C)).
 * Superhuman Split Lenses Bar: Interactive filter pills with glowing ember borders.
 * Quant AI Priority Radar: Hero card for priority synthesized threads.
 * High-Fidelity Email Thread Cards: Multi-color gradient initials, glowing beacon dots, attachment chips & quick actions.
 * Empty State: "Inbox Zero · All caught up! ✨" matching InboxZeroState.tsx.
 */
@Composable
fun NativeMailView(
    modifier: Modifier = Modifier,
    accentColor: Color = Color(0xFFFF, 0x8C, 0x42),
    onThreadClick: ((MailThread) -> Unit)? = null
) {
    val context = LocalContext.current
    val haptic = LocalHapticFeedback.current
    val coroutineScope = rememberCoroutineScope()
    val listState = rememberLazyListState()

    // ─── Superhuman Split Lenses Bar Definitions ─────────────────────────────
    val lenses = remember {
        listOf(
            LensItem(key = "all", label = "All", countBadge = "12", isAccentBadge = false),
            LensItem(key = "important", label = "Important", countBadge = "3", isAccentBadge = true),
            LensItem(key = "updates", label = "Updates", countBadge = "5", isAccentBadge = false),
            LensItem(key = "promotions", label = "Promotions", countBadge = null, isAccentBadge = false),
            LensItem(key = "contacts", label = "Contacts", countBadge = null, isAccentBadge = false),
            LensItem(key = "starred", label = "Starred", countBadge = null, isAccentBadge = false)
        )
    }
    var selectedLens by remember { mutableStateOf("all") }

    // ─── Pre-populated 12 Canonical Ecosystem Threads ────────────────────────
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
                attachmentText = "pr-347-spec.pdf (1.2 MB)",
                category = "Important",
                isPriority = true
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
                attachmentText = "financials-q3.pdf (3.4 MB)",
                category = "Important",
                isPriority = true
            ),
            MailThread(
                id = "thread_3",
                sender = "Sundar Pichai",
                subject = "Partnership & Sovereign AI Infrastructure Alignment",
                snippet = "DeepMind team is thrilled to see the autonomous tripartite swarm running at full velocity. Let's schedule the sovereign cluster review.",
                time = "42m ago",
                tag = "Executive",
                isUnread = true,
                isStarred = false,
                hasAttachment = true,
                attachmentText = "google-quant-collab.pdf (850 KB)",
                category = "Important",
                isPriority = true
            ),
            MailThread(
                id = "thread_4",
                sender = "Trinity Security",
                subject = "Trinity SSO tokens & session keys rotation",
                snippet = "Universal SSO token bridge verified with hardware biometric bridge across all 9 apps. Ed25519 root keys rotated.",
                time = "1h ago",
                tag = "Security",
                isUnread = false,
                isStarred = false,
                hasAttachment = false,
                category = "Important",
                isPriority = false
            ),
            MailThread(
                id = "thread_5",
                sender = "Quanty Copilot",
                subject = "Automated Daily Ecosystem Briefing",
                snippet = "Good morning! 2 PRs merged, 1 live cluster deployment succeeded, 0 outages detected across staging.",
                time = "Yesterday",
                tag = "Updates",
                isUnread = false,
                isStarred = false,
                hasAttachment = false,
                category = "Updates",
                isPriority = false
            ),
            MailThread(
                id = "thread_6",
                sender = "Stripe Billing",
                subject = "Invoice #INV-2026-09-30 Paid",
                snippet = "Thank you for your payment. Your enterprise subscription is active through October 2027.",
                time = "Sep 28",
                tag = "Billing",
                isUnread = false,
                isStarred = false,
                hasAttachment = true,
                attachmentText = "invoice-INV-2026.pdf (140 KB)",
                category = "Updates",
                isPriority = false
            ),
            MailThread(
                id = "thread_7",
                sender = "GitHub Notifications",
                subject = "New comment on PR #347: Verified on EKS staging",
                snippet = "All 20 microservices in quant-staging passed the health check probe with 0 restarts.",
                time = "Sep 27",
                tag = "Updates",
                isUnread = false,
                isStarred = false,
                hasAttachment = false,
                category = "Updates",
                isPriority = false
            ),
            MailThread(
                id = "thread_8",
                sender = "AWS CloudWatch",
                subject = "quant-staging cluster health alert: 0 errors",
                snippet = "Weekly metric summary: p99 latency under 4.2ms, CPU utilization steady at 18%.",
                time = "Sep 26",
                tag = "Updates",
                isUnread = false,
                isStarred = false,
                hasAttachment = false,
                category = "Updates",
                isPriority = false
            ),
            MailThread(
                id = "thread_9",
                sender = "Datadog APM",
                subject = "Synthetic monitors: 100% uptime reached",
                snippet = "All 9 endpoints across quantmail.in returned 200 OK across worldwide probe locations.",
                time = "Sep 25",
                tag = "Updates",
                isUnread = false,
                isStarred = false,
                hasAttachment = false,
                category = "Updates",
                isPriority = false
            ),
            MailThread(
                id = "thread_10",
                sender = "Figma Design",
                subject = "Ecosystem Design System 2026 updates available",
                snippet = "New Obsidian Void color tokens and high-fidelity component libraries have been published.",
                time = "Sep 24",
                tag = "Design",
                isUnread = false,
                isStarred = false,
                hasAttachment = false,
                category = "Promotions",
                isPriority = false
            ),
            MailThread(
                id = "thread_11",
                sender = "Alex Vance",
                subject = "QuantDrive chunked multipart uploads review",
                snippet = "The 5GB file chunking test passed with 100% SHA256 integrity over cellular connection.",
                time = "Sep 23",
                tag = "Contacts",
                isUnread = false,
                isStarred = true,
                hasAttachment = false,
                category = "Contacts",
                isPriority = false
            ),
            MailThread(
                id = "thread_12",
                sender = "Sarah Connor",
                subject = "Trinity Hardware Security Bridge testing",
                snippet = "Biometric prompt successfully bound to secure enclave key attestation.",
                time = "Sep 22",
                tag = "Contacts",
                isUnread = false,
                isStarred = false,
                hasAttachment = false,
                category = "Contacts",
                isPriority = false
            )
        )
    }

    // Active detail modal thread state
    var activeDetailThread by remember { mutableStateOf<MailThread?>(null) }

    // Filter threads based on the selected lens using derivedStateOf to prevent recomposition thrashing
    val displayedThreads by remember(selectedLens) {
        derivedStateOf {
            when (selectedLens) {
                "all" -> threads.distinctBy { it.id }
                "important" -> threads.filter { it.category == "Important" }.distinctBy { it.id }
                "updates" -> threads.filter { it.category == "Updates" }.distinctBy { it.id }
                "promotions" -> threads.filter { it.category == "Promotions" }.distinctBy { it.id }
                "contacts" -> threads.filter { it.category == "Contacts" }.distinctBy { it.id }
                "starred" -> threads.filter { it.isStarred }.distinctBy { it.id }
                else -> threads.distinctBy { it.id }
            }
        }
    }

    // Canvas Background: True Obsidian Void Color(0xFF09, 0x0A, 0x0C)
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(QuantBrandTokens.VoidCanvas)
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            // ─── 1. SUPERHUMAN SPLIT LENSES BAR ─────────────────────────────────
            SuperhumanSplitLensesBar(
                lenses = lenses,
                selectedLens = selectedLens,
                accentColor = accentColor,
                onLensSelect = { lensKey ->
                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    selectedLens = lensKey
                    coroutineScope.launch {
                        listState.animateScrollToItem(0)
                    }
                }
            )

            // ─── 2. QUANT AI PRIORITY RADAR HERO CARD ───────────────────────────
            QuantAiPriorityRadarHeroCard(
                priorityCount = 3,
                totalThreads = 14,
                accentColor = accentColor,
                onTriageClick = {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    selectedLens = "important"
                    Toast.makeText(context, "✨ Triaged 3 Priority threads with Quant AI", Toast.LENGTH_SHORT).show()
                    coroutineScope.launch {
                        listState.animateScrollToItem(0)
                    }
                }
            )

            Spacer(modifier = Modifier.height(6.dp))

            // ─── 3. HIGH-FIDELITY THREAD LIST / EMPTY STATE ─────────────────────
            if (displayedThreads.isEmpty()) {
                MailInboxZeroState(
                    lens = selectedLens,
                    onResetLens = {
                        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        selectedLens = "all"
                    },
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
                    contentPadding = PaddingValues(top = 4.dp, bottom = 88.dp)
                ) {
                    items(
                        items = displayedThreads,
                        key = { it.id }
                    ) { thread ->
                        HighFidelityMailThreadCard(
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
                                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                val index = threads.indexOfFirst { it.id == target.id }
                                if (index != -1) {
                                    val updated = target.copy(isStarred = !target.isStarred)
                                    threads[index] = updated
                                    val msg = if (updated.isStarred) "★ Thread Starred [S]" else "☆ Thread Unstarred"
                                    Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
                                }
                            },
                            onArchive = { target ->
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                threads.removeIf { it.id == target.id }
                                Toast.makeText(context, "📥 Thread archived to Archive [E]", Toast.LENGTH_SHORT).show()
                            },
                            onSnooze = { target ->
                                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                Toast.makeText(context, "⏰ Snoozed until tomorrow 9:00 AM [H]", Toast.LENGTH_SHORT).show()
                            }
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
 * Superhuman Split Lenses Bar matching QuantMail Web and Superhuman styling.
 */
@Composable
fun SuperhumanSplitLensesBar(
    lenses: List<LensItem>,
    selectedLens: String,
    accentColor: Color,
    onLensSelect: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        lenses.forEach { lens ->
            val isSelected = lens.key == selectedLens

            val backgroundColor = if (isSelected) QuantBrandTokens.AmberTintBg else QuantBrandTokens.LensInactiveBg
            val borderColor = if (isSelected) QuantBrandTokens.AmberGlowBorder else QuantBrandTokens.LensInactiveBorder
            val textColor = if (isSelected) Color(0xFFFFFFFF) else QuantBrandTokens.LensInactiveText

            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .background(backgroundColor)
                    .border(
                        width = 0.8.dp,
                        color = borderColor,
                        shape = RoundedCornerShape(20.dp)
                    )
                    .clickable { onLensSelect(lens.key) }
                    .padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = lens.label,
                    color = textColor,
                    fontSize = 13.sp,
                    fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Medium,
                    maxLines = 1,
                    softWrap = false
                )

                if (lens.countBadge != null) {
                    Spacer(modifier = Modifier.width(6.dp))
                    val badgeBg = if (lens.isAccentBadge) QuantBrandTokens.AmberPrimary else QuantBrandTokens.BadgeMutedBg
                    val badgeTextColor = if (lens.isAccentBadge) QuantBrandTokens.BadgeDarkText else QuantBrandTokens.TextSecondary

                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(10.dp))
                            .background(badgeBg)
                            .padding(horizontal = 7.dp, vertical = 2.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = lens.countBadge,
                            color = badgeTextColor,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            lineHeight = 12.sp
                        )
                    }
                }
            }
        }
    }
}

/**
 * "✨ Quant AI Priority Radar" Executive Intelligence Hero Card:
 * Luxury obsidian slate surface (Color(0xFF12, 0x15, 0x1E)) with subtle gold-amber gradient border.
 * Pulsing AI sparkle badge with soft outer halo.
 * Content: "✨ 3 Urgent Conversations Require Attention", subtitle "Synthesized by Quanty AI · 14 active threads".
 * Action: Sleek pill button with amber glow: "⚡ Triage (E)".
 */
@Composable
fun QuantAiPriorityRadarHeroCard(
    priorityCount: Int = 3,
    totalThreads: Int = 14,
    accentColor: Color = QuantBrandTokens.AmberPrimary,
    onTriageClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val infiniteTransition = rememberInfiniteTransition(label = "pulse_radar")
    val haloAlpha by infiniteTransition.animateFloat(
        initialValue = 0.15f,
        targetValue = 0.42f,
        animationSpec = infiniteRepeatable(
            animation = tween(1500, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "haloAlpha"
    )

    Surface(
        onClick = onTriageClick,
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 4.dp),
        shape = RoundedCornerShape(16.dp),
        color = QuantBrandTokens.CardObsidian,
        border = BorderStroke(
            0.8.dp,
            Brush.horizontalGradient(QuantBrandTokens.RadarBorderGradient)
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Pulsing AI sparkle badge with soft amber halo
            Box(
                modifier = Modifier
                    .size(38.dp)
                    .clip(CircleShape)
                    .background(QuantBrandTokens.AmberPrimary.copy(alpha = haloAlpha))
                    .padding(3.dp)
                    .clip(CircleShape)
                    .background(QuantBrandTokens.AmberTintBg)
                    .border(0.8.dp, QuantBrandTokens.AmberPrimary.copy(alpha = 0.5f), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Filled.AutoAwesome,
                    contentDescription = "Priority Radar",
                    tint = QuantBrandTokens.AmberPrimary,
                    modifier = Modifier.size(17.dp)
                )
            }

            Spacer(modifier = Modifier.width(12.dp))

            // Title & Subtitle
            Column(
                modifier = Modifier.weight(1f)
            ) {
                Text(
                    text = "✨ $priorityCount Urgent Conversations Require Attention",
                    color = QuantBrandTokens.TextWhite,
                    fontSize = 13.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                Spacer(modifier = Modifier.height(2.dp))

                Text(
                    text = "Synthesized by Quanty AI · $totalThreads active threads",
                    color = QuantBrandTokens.TextSecondary,
                    fontSize = 11.5.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            Spacer(modifier = Modifier.width(8.dp))

            // Sleek pill button with amber glow: ⚡ Triage (E)
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .background(QuantBrandTokens.AmberTintBg)
                    .border(1.dp, QuantBrandTokens.AmberPrimary.copy(alpha = 0.55f), RoundedCornerShape(20.dp))
                    .clickable { onTriageClick() }
                    .padding(horizontal = 12.dp, vertical = 7.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "⚡ Triage (E)",
                    color = QuantBrandTokens.AmberPrimary,
                    fontSize = 11.5.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1
                )
            }
        }
    }
}

/**
 * High-Fidelity Email Thread Card:
 * Luxury obsidian slate surface (#12151E) on Canvas Void (#090A0E) with subtle hairline border (#232938, 0.8dp), 16dp rounded corners.
 * Left: 44dp circular avatar with rich gradient cache, crisp white initials, and unread beacon dot with soft outer halo.
 * Sender & Timestamp: 14.5sp semi-bold sender name, verified domain badge where applicable, relative time in amber if unread or slate if read.
 * Subject & Snippet: Subject in #F8FAFC (14sp medium), snippet in #94A3B8 (12.5sp regular, 18sp line height).
 * Attachment & Tags: Sleek tag pills with soft background tints (Mint for CodeHub, Sky for Finance, Gold for Executive), clean attachment capsule with file size.
 * Quick Action Row: Refined Star toggle (gold #F59E0B), Archive button, Snooze button with 34dp touch targets and smooth haptics.
 */
@Composable
fun HighFidelityMailThreadCard(
    thread: MailThread,
    accentColor: Color,
    onClick: () -> Unit,
    onToggleStar: (MailThread) -> Unit,
    onArchive: (MailThread) -> Unit,
    onSnooze: (MailThread) -> Unit,
    modifier: Modifier = Modifier
) {
    val initials = AvatarGradientCache.getInitials(thread.sender)
    val avatarGradient = AvatarGradientCache.getGradient(thread.sender, initials)

    val isVerifiedSender = remember(thread.sender) {
        thread.sender.contains("CodeHub", ignoreCase = true) ||
        thread.sender.contains("Engineering", ignoreCase = true) ||
        thread.sender.contains("Sundar", ignoreCase = true) ||
        thread.sender.contains("GitHub", ignoreCase = true) ||
        thread.sender.contains("Stripe", ignoreCase = true) ||
        thread.sender.contains("AWS", ignoreCase = true) ||
        thread.sender.contains("Trinity", ignoreCase = true) ||
        thread.sender.contains("Copilot", ignoreCase = true)
    }

    Surface(
        onClick = onClick,
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 4.dp),
        shape = RoundedCornerShape(16.dp),
        color = QuantBrandTokens.CardObsidian,
        border = BorderStroke(QuantBrandTokens.CardBorderHairline, QuantBrandTokens.CardBorder)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top
            ) {
                // Identity Avatar (44dp) with rich gradient cache, crisp white initials, and unread beacon dot with soft outer halo
                Box(
                    modifier = Modifier.size(44.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .clip(CircleShape)
                            .background(avatarGradient),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = initials,
                            color = Color.White,
                            fontSize = 14.5.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    if (thread.isUnread) {
                        Box(
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .offset(x = 2.dp, y = (-2).dp)
                                .size(13.dp)
                                .clip(CircleShape)
                                .background(QuantBrandTokens.AmberHalo),
                            contentAlignment = Alignment.Center
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(7.dp)
                                    .clip(CircleShape)
                                    .background(QuantBrandTokens.AmberPrimary)
                                    .border(1.dp, QuantBrandTokens.CardObsidian, CircleShape)
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.width(12.dp))

                // Thread Content Column
                Column(
                    modifier = Modifier.weight(1f)
                ) {
                    // Row 1: Sender name (14.5sp semi-bold) + verified domain badge + relative time (in amber if unread or slate if read)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = thread.sender,
                            fontSize = 14.5.sp,
                            fontWeight = if (thread.isUnread) FontWeight.SemiBold else FontWeight.Medium,
                            color = if (thread.isUnread) QuantBrandTokens.TextWhite else QuantBrandTokens.TextRead,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false)
                        )

                        if (isVerifiedSender) {
                            Spacer(modifier = Modifier.width(4.dp))
                            Icon(
                                imageVector = Icons.Filled.CheckCircle,
                                contentDescription = "Verified Sender",
                                tint = Color(0xFF38, 0xBD, 0xF8),
                                modifier = Modifier.size(13.dp)
                            )
                        }

                        Spacer(modifier = Modifier.weight(1f))

                        Text(
                            text = thread.time,
                            fontSize = 12.sp,
                            fontWeight = if (thread.isUnread) FontWeight.SemiBold else FontWeight.Normal,
                            color = if (thread.isUnread) QuantBrandTokens.AmberPrimary else QuantBrandTokens.TextMuted
                        )
                    }

                    Spacer(modifier = Modifier.height(3.dp))

                    // Row 2: Subject in #F8FAFC (14sp medium)
                    Text(
                        text = thread.subject,
                        fontSize = 14.sp,
                        fontWeight = if (thread.isUnread) FontWeight.Medium else FontWeight.Normal,
                        color = QuantBrandTokens.TextWhite,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )

                    Spacer(modifier = Modifier.height(3.dp))

                    // Row 3: Snippet in #94A3B8 (12.5sp regular, 18sp line height)
                    Text(
                        text = thread.snippet,
                        fontSize = 12.5.sp,
                        fontWeight = FontWeight.Normal,
                        color = QuantBrandTokens.TextSecondary,
                        lineHeight = 18.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Row 4: Attachment & Tags (sleek tag pills with soft background tints, clean attachment capsule) + Quick Action Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Sleek Category Tag Pill with soft background tint
                val tagColor = TagColors.getTagColor(thread.tag, accentColor)
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(tagColor.copy(alpha = 0.14f))
                        .border(0.8.dp, tagColor.copy(alpha = 0.35f), RoundedCornerShape(6.dp))
                        .padding(horizontal = 8.dp, vertical = 2.5.dp)
                ) {
                    Text(
                        text = thread.tag,
                        fontSize = 10.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = tagColor
                    )
                }

                // Clean Attachment Capsule with file size
                if (thread.hasAttachment) {
                    Spacer(modifier = Modifier.width(8.dp))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(QuantBrandTokens.AttachmentBg)
                            .border(0.8.dp, QuantBrandTokens.AttachmentBorder, RoundedCornerShape(6.dp))
                            .padding(horizontal = 8.dp, vertical = 2.5.dp)
                    ) {
                        Text(
                            text = "📎 ${thread.attachmentText ?: "attachment"}",
                            fontSize = 10.5.sp,
                            color = QuantBrandTokens.TextSecondary,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }

                Spacer(modifier = Modifier.weight(1f))

                // Quick Action Row: Refined Star toggle (gold #F59E0B), Archive button, Snooze button with 34dp touch targets and smooth haptics
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    // Star button
                    IconButton(
                        onClick = { onToggleStar(thread) },
                        modifier = Modifier.size(34.dp)
                    ) {
                        Icon(
                            imageVector = if (thread.isStarred) Icons.Filled.Star else Icons.Filled.StarBorder,
                            contentDescription = if (thread.isStarred) "Starred" else "Star",
                            tint = if (thread.isStarred) QuantBrandTokens.StarGold else QuantBrandTokens.ActionIconTint,
                            modifier = Modifier.size(18.dp)
                        )
                    }

                    // Quick Archive [📥]
                    IconButton(
                        onClick = { onArchive(thread) },
                        modifier = Modifier.size(34.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Archive,
                            contentDescription = "Archive",
                            tint = QuantBrandTokens.ActionIconTint,
                            modifier = Modifier.size(17.dp)
                        )
                    }

                    // Snooze [⏰]
                    IconButton(
                        onClick = { onSnooze(thread) },
                        modifier = Modifier.size(34.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Schedule,
                            contentDescription = "Snooze",
                            tint = QuantBrandTokens.ActionIconTint,
                            modifier = Modifier.size(17.dp)
                        )
                    }
                }
            }
        }
    }
}

/**
 * Empty State: "Inbox Zero · All caught up! ✨" matching InboxZeroState.tsx.
 */
@Composable
fun MailInboxZeroState(
    lens: String,
    onResetLens: () -> Unit,
    modifier: Modifier = Modifier
) {
    val infiniteTransition = rememberInfiniteTransition(label = "inbox_zero_float")
    val floatOffset by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = -6f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 2100, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "inboxZeroFloat"
    )

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 56.dp, horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        // Floating QuantMail emblem with glowing aura
        Box(
            modifier = Modifier
                .offset(y = floatOffset.dp)
                .size(76.dp)
                .clip(CircleShape)
                .background(QuantBrandTokens.CardObsidian)
                .border(
                    BorderStroke(
                        1.5.dp,
                        Brush.linearGradient(
                            listOf(QuantBrandTokens.AmberPrimary, QuantBrandTokens.CardBorder)
                        )
                    ),
                    CircleShape
                ),
            contentAlignment = Alignment.Center
        ) {
            Text(text = "✨", fontSize = 32.sp)
        }

        Spacer(modifier = Modifier.height(20.dp))

        Text(
            text = "Inbox Zero · All caught up! ✨",
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
            color = QuantBrandTokens.TextWhite
        )

        Spacer(modifier = Modifier.height(6.dp))

        Text(
            text = if (lens == "all") {
                "All done for the day · Enjoy your empty inbox."
            } else {
                "No conversations in “$lens”. Try switching lenses or clearing filters."
            },
            fontSize = 13.sp,
            color = QuantBrandTokens.TextMuted,
            textAlign = TextAlign.Center
        )

        if (lens != "all") {
            Spacer(modifier = Modifier.height(16.dp))
            Button(
                onClick = onResetLens,
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = QuantBrandTokens.LensInactiveBg,
                    contentColor = QuantBrandTokens.AmberPrimary
                ),
                border = BorderStroke(1.dp, QuantBrandTokens.LensInactiveBorder)
            ) {
                Text(
                    text = "View All Mail",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}

/**
 * Returns canonical avatar initials for ecosystem senders.
 */
fun getInitialsForSender(sender: String): String = AvatarGradientCache.getInitials(sender)

/**
 * Returns multi-color gradient brush for identity avatars based on sender / initials.
 */
fun getAvatarGradient(sender: String, initials: String): Brush = AvatarGradientCache.getGradient(sender, initials)

/**
 * Returns text color for category tag chips.
 */
fun getTagTextColor(tag: String, accentColor: Color): Color = TagColors.getTagColor(tag, accentColor)


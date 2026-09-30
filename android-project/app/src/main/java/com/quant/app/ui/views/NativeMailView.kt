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
 * Pre-defined design tokens for QuantMail Native Views matching QuantMail Web and Superhuman.
 */
object QuantBrandTokens {
    val VoidCanvas = Color(0xFF09, 0x0A, 0x0C)
    val CardObsidian = Color(0xFF11, 0x13, 0x18)
    val CardBorder = Color(0xFF1E, 0x22, 0x2A)

    // Amber / Radiant Tokens
    val AmberPrimary = Color(0xFFFF, 0x8C, 0x42)
    val AmberHalo = Color(0x4D, 0xFF, 0x8C, 0x42) // 0.3 outer halo
    val AmberTintBg = Color(0xFF2B, 0x1A, 0x11)
    val AmberGlowBorder = Color(0xFFFF, 0x8C, 0x42)

    // Lens Filter Tokens
    val LensInactiveBg = Color(0xFF13, 0x15, 0x1A)
    val LensInactiveBorder = Color(0xFF22, 0x26, 0x30)
    val LensInactiveText = Color(0xFF94, 0xA3, 0xB8)

    // Typography Tokens
    val TextWhite = Color(0xFFF8, 0xFA, 0xFC)
    val TextMuted = Color(0xFF94, 0xA3, 0xB8)
    val TextSubtle = Color(0xFF64, 0x74, 0x8B)
    val TextRead = Color(0xFFCBD5E1)

    // Functional Tokens
    val StarGold = Color(0xFFF5, 0x9E, 0x0B)
    val BadgeDarkText = Color(0xFF09, 0x0A, 0x0C)
    val BadgeMutedBg = Color(0xFF28, 0x2C, 0x35)
    val AttachmentBg = Color(0xFF1E, 0x22, 0x2A)
    val AttachmentBorder = Color(0xFF2E, 0x34, 0x42)
    val ActionIconTint = Color(0xFF64, 0x74, 0x8B)

    // Priority Radar Hero Tokens
    val RadarBorderGradient = listOf(
        Color(0xFF28, 0x2C, 0x35),
        Color(0x66, 0xFF, 0x8C, 0x42),
        Color(0xFF28, 0x2C, 0x35)
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
 * Pre-defined category tag colors.
 */
object TagColors {
    val Mint = Color(0xFF34, 0xD3, 0x99)
    val Sky = Color(0xFF60, 0xA5, 0xFA)
    val Gold = Color(0xFFFB, 0xBF, 0x24)
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
            .padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        lenses.forEach { lens ->
            val isSelected = lens.key == selectedLens

            val backgroundColor = if (isSelected) QuantBrandTokens.AmberTintBg else QuantBrandTokens.LensInactiveBg
            val borderColor = if (isSelected) QuantBrandTokens.AmberGlowBorder else QuantBrandTokens.LensInactiveBorder
            val textColor = if (isSelected) Color.White else QuantBrandTokens.LensInactiveText

            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .background(backgroundColor)
                    .border(
                        width = if (isSelected) 1.2.dp else 1.dp,
                        color = borderColor,
                        shape = RoundedCornerShape(20.dp)
                    )
                    .clickable { onLensSelect(lens.key) }
                    .padding(horizontal = 14.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = lens.label,
                    color = textColor,
                    fontSize = 13.sp,
                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium
                )

                if (lens.countBadge != null) {
                    Spacer(modifier = Modifier.width(6.dp))
                    val badgeBg = if (lens.isAccentBadge) QuantBrandTokens.AmberPrimary else QuantBrandTokens.BadgeMutedBg
                    val badgeTextColor = if (lens.isAccentBadge) QuantBrandTokens.BadgeDarkText else QuantBrandTokens.TextRead

                    Box(
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(badgeBg)
                            .padding(horizontal = 6.dp, vertical = 1.5.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = lens.countBadge,
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
 * "✨ Quant AI Priority Radar" Hero Card:
 * Frosted Obsidian surface (Color(0xFF11, 0x13, 0x18), border gradient with subtle amber glow).
 * Sparkle icon, Title "✨ 3 Priority Conversations Require Attention", Subtitle "Synthesized by Quanty AI from 14 active threads".
 * Quick action button "[Triage All (E)]" with haptic feedback.
 */
@Composable
fun QuantAiPriorityRadarHeroCard(
    priorityCount: Int = 3,
    totalThreads: Int = 14,
    accentColor: Color = QuantBrandTokens.AmberPrimary,
    onTriageClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        onClick = onTriageClick,
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 4.dp),
        shape = RoundedCornerShape(14.dp),
        color = QuantBrandTokens.CardObsidian,
        border = BorderStroke(
            1.dp,
            Brush.horizontalGradient(QuantBrandTokens.RadarBorderGradient)
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Sparkle icon badge with glowing ember halo
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(Color(0x26, 0xFF, 0x8C, 0x42))
                    .border(1.dp, Color(0x55, 0xFF, 0x8C, 0x42), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Filled.AutoAwesome,
                    contentDescription = "Priority Radar",
                    tint = QuantBrandTokens.AmberPrimary,
                    modifier = Modifier.size(18.dp)
                )
            }

            Spacer(modifier = Modifier.width(12.dp))

            // Title & Subtitle
            Column(
                modifier = Modifier.weight(1f)
            ) {
                Text(
                    text = "✨ $priorityCount Priority Conversations Require Attention",
                    color = Color.White,
                    fontSize = 13.5.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                Spacer(modifier = Modifier.height(2.dp))

                Text(
                    text = "Synthesized by Quanty AI from $totalThreads active threads",
                    color = QuantBrandTokens.TextMuted,
                    fontSize = 11.5.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            Spacer(modifier = Modifier.width(8.dp))

            // Quick action button: [Triage All (E)]
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(QuantBrandTokens.AmberTintBg)
                    .border(1.dp, Color(0x55, 0xFF, 0x8C, 0x42), RoundedCornerShape(8.dp))
                    .clickable { onTriageClick() }
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "[Triage All (E)]",
                    color = QuantBrandTokens.AmberPrimary,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

/**
 * High-Fidelity Email Thread Card:
 * Frosted Obsidian card container Color(0xFF11, 0x13, 0x18) on Canvas Void Color(0xFF09, 0x0A, 0x0C) with border Color(0xFF1E, 0x22, 0x2A), 14.dp rounded corners.
 * Left: Identity Avatar with cached multi-color gradient initials (CG, QE, TS, SP, etc.).
 * Unread indicator: Radiant glowing beacon dot (#FF8C42 with 0.3 outer halo).
 * Sender name in crisp white (FontWeight.Bold if unread), time in #FF8C42 (unread) or #64748B (read).
 * Subject line in crisp white typography (#F8FAFC).
 * Snippet preview in muted slate Color(0xFF94, 0xA3, 0xB8) (2 lines).
 * Attachment pill ('📎 filename.pdf (X MB)') with clean borders.
 * Action row: Star icon button (toggles gold #F59E0B), Quick Archive [📥], Snooze [⏰] with smooth touch feedback.
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

    Surface(
        onClick = onClick,
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 4.dp),
        shape = RoundedCornerShape(14.dp),
        color = QuantBrandTokens.CardObsidian,
        border = BorderStroke(1.dp, QuantBrandTokens.CardBorder)
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
                // Identity Avatar with cached multi-color gradient initials
                Box(
                    modifier = Modifier
                        .size(42.dp)
                        .clip(CircleShape)
                        .background(avatarGradient),
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

                // Thread Content Column
                Column(
                    modifier = Modifier.weight(1f)
                ) {
                    // Row 1: Sender name + radiant glowing beacon dot (#FF8C42 with 0.3 outer halo) + time
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        if (thread.isUnread) {
                            Box(
                                modifier = Modifier
                                    .size(12.dp)
                                    .clip(CircleShape)
                                    .background(QuantBrandTokens.AmberHalo),
                                contentAlignment = Alignment.Center
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(6.5.dp)
                                        .clip(CircleShape)
                                        .background(QuantBrandTokens.AmberPrimary)
                                )
                            }
                            Spacer(modifier = Modifier.width(6.dp))
                        }

                        Text(
                            text = thread.sender,
                            fontSize = 14.sp,
                            fontWeight = if (thread.isUnread) FontWeight.Bold else FontWeight.Medium,
                            color = if (thread.isUnread) Color.White else QuantBrandTokens.TextRead,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f)
                        )

                        Spacer(modifier = Modifier.width(6.dp))

                        Text(
                            text = thread.time,
                            fontSize = 11.5.sp,
                            fontWeight = if (thread.isUnread) FontWeight.SemiBold else FontWeight.Normal,
                            color = if (thread.isUnread) QuantBrandTokens.AmberPrimary else QuantBrandTokens.TextSubtle
                        )
                    }

                    Spacer(modifier = Modifier.height(4.dp))

                    // Row 2: Subject line in crisp typography (#F8FAFC)
                    Text(
                        text = thread.subject,
                        fontSize = 13.5.sp,
                        fontWeight = if (thread.isUnread) FontWeight.SemiBold else FontWeight.Normal,
                        color = QuantBrandTokens.TextWhite,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )

                    Spacer(modifier = Modifier.height(4.dp))

                    // Row 3: Snippet preview in muted slate Color(0xFF94, 0xA3, 0xB8) (2 lines)
                    Text(
                        text = thread.snippet,
                        fontSize = 12.5.sp,
                        color = QuantBrandTokens.TextMuted,
                        lineHeight = 17.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Row 4: Tag chip, Attachment pill & Action icons
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Category Tag Chip
                val tagColor = TagColors.getTagColor(thread.tag, accentColor)
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .background(tagColor.copy(alpha = 0.15f))
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = thread.tag,
                        fontSize = 10.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = tagColor
                    )
                }

                // Attachment pill ('📎 filename.pdf (X MB)') with clean borders
                if (thread.hasAttachment) {
                    Spacer(modifier = Modifier.width(8.dp))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(QuantBrandTokens.AttachmentBg)
                            .border(1.dp, QuantBrandTokens.AttachmentBorder, RoundedCornerShape(6.dp))
                            .padding(horizontal = 8.dp, vertical = 3.dp)
                    ) {
                        Text(
                            text = "📎 ${thread.attachmentText ?: "attachment"}",
                            fontSize = 10.5.sp,
                            color = QuantBrandTokens.TextMuted,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }

                Spacer(modifier = Modifier.weight(1f))

                // Action Row: Star icon button (toggles gold #F59E0B), Quick Archive [📥], Snooze [⏰]
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    // Star button
                    IconButton(
                        onClick = { onToggleStar(thread) },
                        modifier = Modifier.size(30.dp)
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
                        modifier = Modifier.size(30.dp)
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
                        modifier = Modifier.size(30.dp)
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
                .background(Color(0xFF13, 0x15, 0x1A))
                .border(
                    BorderStroke(
                        1.5.dp,
                        Brush.linearGradient(
                            listOf(Color(0xFFFF, 0x8C, 0x42), Color(0xFF28, 0x2C, 0x35))
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
            color = Color.White
        )

        Spacer(modifier = Modifier.height(6.dp))

        Text(
            text = if (lens == "all") {
                "All done for the day · Enjoy your empty inbox."
            } else {
                "No conversations in “$lens”. Try switching lenses or clearing filters."
            },
            fontSize = 13.sp,
            color = Color(0xFF64, 0x74, 0x8B),
            textAlign = TextAlign.Center
        )

        if (lens != "all") {
            Spacer(modifier = Modifier.height(16.dp))
            Button(
                onClick = onResetLens,
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFF1E, 0x22, 0x2C),
                    contentColor = Color(0xFFFF, 0x8C, 0x42)
                ),
                border = BorderStroke(1.dp, Color(0xFF33, 0x3A, 0x47))
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


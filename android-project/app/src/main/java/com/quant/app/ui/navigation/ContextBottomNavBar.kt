package com.quant.app.ui.navigation

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
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
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.CallSplit
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.CalendarViewMonth
import androidx.compose.material.icons.filled.CallSplit
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.Contacts
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.FolderShared
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.GroupWork
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Today
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
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
 * Context navigation destination item model for pillar sub-navigation.
 *
 * @property id Unique identifier for the sub-destination (e.g. "inbox", "priority").
 * @property label Human-readable title displayed below the icon (11sp).
 * @property icon Material 3 vector icon representing the destination.
 * @property badgeCount Unread count or notification indicator (0 means no badge).
 */
data class ContextNavDestination(
    val id: String,
    val label: String,
    val icon: ImageVector,
    val badgeCount: Int = 0,
)

/**
 * Sealed class hierarchy defining all pillar sub-navigation destinations
 * across the 5 sovereign productivity pillars.
 */
sealed class PillarSubTab(
    val destination: ContextNavDestination
) {
    // 1. Mail Sub-Tabs
    data object MailInbox : PillarSubTab(ContextNavDestination("inbox", "Inbox", Icons.Default.Inbox, 12))
    data object MailPriority : PillarSubTab(ContextNavDestination("priority", "Priority", Icons.Default.Star, 3))
    data object MailTeams : PillarSubTab(ContextNavDestination("teams", "Teams", Icons.Default.Group, 5))
    data object MailSent : PillarSubTab(ContextNavDestination("sent", "Sent", Icons.AutoMirrored.Filled.Send, 0))
    data object MailArchive : PillarSubTab(ContextNavDestination("archive", "Archive", Icons.Default.Archive, 0))

    // 2. Calendar Sub-Tabs
    data object CalendarAgenda : PillarSubTab(ContextNavDestination("agenda", "Agenda", Icons.Default.Today, 0))
    data object CalendarMonth : PillarSubTab(ContextNavDestination("month", "Month", Icons.Default.CalendarViewMonth, 0))
    data object CalendarBooking : PillarSubTab(ContextNavDestination("booking", "Booking", Icons.Default.Link, 0))
    data object CalendarQuantMeet : PillarSubTab(ContextNavDestination("quantmeet", "QuantMeet", Icons.Default.Videocam, 0))
    data object CalendarReminders : PillarSubTab(ContextNavDestination("reminders", "Reminders", Icons.Default.Notifications, 0))

    // 3. Drive Sub-Tabs
    data object DriveMyFiles : PillarSubTab(ContextNavDestination("my_files", "My Files", Icons.Default.Folder, 0))
    data object DriveShared : PillarSubTab(ContextNavDestination("shared", "Shared", Icons.Default.FolderShared, 0))
    data object DriveVault : PillarSubTab(ContextNavDestination("vault", "Vault", Icons.Default.Lock, 0))
    data object DriveStarred : PillarSubTab(ContextNavDestination("starred", "Starred", Icons.Default.Star, 0))
    data object DriveCleaner : PillarSubTab(ContextNavDestination("cleaner", "Cleaner", Icons.Default.AutoAwesome, 0))

    // 4. Contacts Sub-Tabs
    data object ContactsAll : PillarSubTab(ContextNavDestination("contacts", "Contacts", Icons.Default.Contacts, 8))
    data object ContactsVips : PillarSubTab(ContextNavDestination("vips", "VIPs", Icons.Default.Star, 0))
    data object ContactsCompanies : PillarSubTab(ContextNavDestination("companies", "Companies", Icons.Default.Business, 0))
    data object ContactsAiDedup : PillarSubTab(ContextNavDestination("ai_dedup", "AI Dedup", Icons.Default.AutoAwesome, 0))
    data object ContactsCircles : PillarSubTab(ContextNavDestination("circles", "Circles", Icons.Default.GroupWork, 0))

    // 5. QuantGit Sub-Tabs
    data object GitRepos : PillarSubTab(ContextNavDestination("repos", "Repos", Icons.Default.Code, 0))
    data object GitPrs : PillarSubTab(ContextNavDestination("prs", "PRs", Icons.AutoMirrored.Filled.CallSplit, 1))
    data object GitIssues : PillarSubTab(ContextNavDestination("issues", "Issues", Icons.Default.ErrorOutline, 0))
    data object GitActions : PillarSubTab(ContextNavDestination("actions", "Actions", Icons.Default.PlayArrow, 0))
    data object GitCopilot : PillarSubTab(ContextNavDestination("copilot", "Copilot", Icons.Default.AutoAwesome, 0))
}

/**
 * Returns the context-specific sub-navigation destinations for the given productivity pillar:
 * - Mail: [Inbox] (12), [Priority] (3), [Teams] (5), [Sent], [Archive]
 * - Calendar: [Agenda], [Month], [Booking], [QuantMeet], [Reminders]
 * - Drive: [My Files], [Shared], [Vault] (AES-256 E2EE), [Starred], [Cleaner] (FastCDC)
 * - Contacts: [Contacts] (8), [VIPs], [Companies], [AI Dedup], [Circles]
 * - QuantGit: [Repos], [PRs] (1), [Issues], [Actions] (CI/CD), [Copilot]
 */
fun getSubTabsForPillar(pillar: ProductivityTab): List<ContextNavDestination> {
    return when (pillar) {
        ProductivityTab.Mail -> listOf(
            PillarSubTab.MailInbox.destination,
            PillarSubTab.MailPriority.destination,
            PillarSubTab.MailTeams.destination,
            PillarSubTab.MailSent.destination,
            PillarSubTab.MailArchive.destination,
        )
        ProductivityTab.Calendar -> listOf(
            PillarSubTab.CalendarAgenda.destination,
            PillarSubTab.CalendarMonth.destination,
            PillarSubTab.CalendarBooking.destination,
            PillarSubTab.CalendarQuantMeet.destination,
            PillarSubTab.CalendarReminders.destination,
        )
        ProductivityTab.Drive -> listOf(
            PillarSubTab.DriveMyFiles.destination,
            PillarSubTab.DriveShared.destination,
            PillarSubTab.DriveVault.destination,
            PillarSubTab.DriveStarred.destination,
            PillarSubTab.DriveCleaner.destination,
        )
        ProductivityTab.Contacts -> listOf(
            PillarSubTab.ContactsAll.destination,
            PillarSubTab.ContactsVips.destination,
            PillarSubTab.ContactsCompanies.destination,
            PillarSubTab.ContactsAiDedup.destination,
            PillarSubTab.ContactsCircles.destination,
        )
        ProductivityTab.QuantGit -> listOf(
            PillarSubTab.GitRepos.destination,
            PillarSubTab.GitPrs.destination,
            PillarSubTab.GitIssues.destination,
            PillarSubTab.GitActions.destination,
            PillarSubTab.GitCopilot.destination,
        )
    }
}

/**
 * Sovereign Jetpack Compose Context-Specific Bottom Navigation Bar for the Quant Sovereign Android App.
 *
 * Replaces generic 5-app tabs with context-specific sub-navigation tailored to the active pillar.
 *
 * Visual Architecture:
 * - Surface: Deep obsidian frosted bar (`#0D1017`) with hairline top divider (`#1E2433`).
 * - Active indicator: Smooth, modern rounded pill container (width 54dp, height 32dp)
 *   with soft tinted background (`accentColor.copy(alpha = 0.16f)`) and spring color animation.
 * - Material 3 vector icons, 11sp typography, badges with crisp contrast.
 * - Support `isVisible: Boolean = true` for auto-hiding scroll animations (`AnimatedVisibility(visible = isVisible, enter = slideInVertically { it }, exit = slideOutVertically { it })`).
 * - Native haptic feedback on tab selection.
 * - Zero raw Unicode emojis. Zero clipPath calls.
 *
 * @param activePillar The currently active productivity pillar (Mail, Calendar, Drive, Contacts, QuantGit).
 * @param selectedTabId ID of the currently selected sub-tab destination. If null, defaults to first tab.
 * @param onTabSelected Callback invoked when a sub-tab destination is selected.
 * @param modifier Composable modifier for styling and layout positioning.
 * @param accentColor Accent tint color inherited from the active pillar.
 * @param isVisible Controls bar visibility for auto-hiding scroll animations.
 * @param badgeOverrides Optional dynamic map of sub-tab IDs to badge counts for runtime overrides.
 */
@Composable
fun ContextBottomNavBar(
    activePillar: ProductivityTab,
    selectedTabId: String? = null,
    onTabSelected: (ContextNavDestination) -> Unit,
    modifier: Modifier = Modifier,
    accentColor: Color = activePillar.tabAccentColor,
    isVisible: Boolean = true,
    badgeOverrides: Map<String, Int> = emptyMap(),
) {
    val haptic = LocalHapticFeedback.current
    val subTabs = remember(activePillar) { getSubTabsForPillar(activePillar) }
    val currentSelectedId = selectedTabId ?: subTabs.firstOrNull()?.id.orEmpty()

    AnimatedVisibility(
        visible = isVisible,
        enter = slideInVertically(
            animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
            initialOffsetY = { it }
        ),
        exit = slideOutVertically(
            animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
            targetOffsetY = { it }
        ),
        modifier = modifier
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFF0D, 0x10, 0x17))
        ) {
            // Hairline top divider #1E2433
            HorizontalDivider(
                thickness = 1.dp,
                color = Color(0xFF1E, 0x24, 0x33)
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(64.dp)
                    .padding(horizontal = 6.dp),
                horizontalArrangement = Arrangement.SpaceAround,
                verticalAlignment = Alignment.CenterVertically
            ) {
                subTabs.forEach { destination ->
                    val isSelected = destination.id == currentSelectedId

                    val iconTint by animateColorAsState(
                        targetValue = if (isSelected) accentColor else Color(0xFF94, 0xA3, 0xB8),
                        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
                        label = "contextIconTint_${destination.id}"
                    )

                    val pillBackground by animateColorAsState(
                        targetValue = if (isSelected) accentColor.copy(alpha = 0.16f) else Color.Transparent,
                        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
                        label = "contextPillBackground_${destination.id}"
                    )

                    val textColor by animateColorAsState(
                        targetValue = if (isSelected) accentColor else Color(0xFF94, 0xA3, 0xB8),
                        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
                        label = "contextTextColor_${destination.id}"
                    )

                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                                onClick = {
                                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                    onTabSelected(destination)
                                }
                            ),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        // Smooth, modern rounded pill container (width 54dp, height 32dp)
                        Box(
                            modifier = Modifier
                                .size(width = 54.dp, height = 32.dp)
                                .background(pillBackground, RoundedCornerShape(16.dp)),
                            contentAlignment = Alignment.Center
                        ) {
                            // Anchor container for icon and badge
                            Box(
                                modifier = Modifier.size(24.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = destination.icon,
                                    contentDescription = destination.label,
                                    tint = iconTint,
                                    modifier = Modifier.size(20.dp)
                                )

                                // Crisp contrast badge if count > 0
                                val effectiveBadgeCount = badgeOverrides[destination.id] ?: destination.badgeCount
                                if (effectiveBadgeCount > 0) {
                                    val badgeText = if (effectiveBadgeCount > 99) "99+" else effectiveBadgeCount.toString()
                                    val badgeTextColor = if (accentColor == Color(0xFFF5, 0x9E, 0x0B)) {
                                        Color(0xFF0D, 0x10, 0x17)
                                    } else {
                                        Color.White
                                    }

                                    Box(
                                        modifier = Modifier
                                            .align(Alignment.TopEnd)
                                            .offset(x = 8.dp, y = (-6).dp)
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(accentColor)
                                            .border(1.5.dp, Color(0xFF0D, 0x10, 0x17), RoundedCornerShape(8.dp))
                                            .padding(horizontal = 4.5.dp, vertical = 0.5.dp),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(
                                            text = badgeText,
                                            color = badgeTextColor,
                                            fontSize = 9.sp,
                                            fontWeight = FontWeight.ExtraBold,
                                            lineHeight = 11.sp
                                        )
                                    }
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(4.dp))

                        // Crisp 11sp typography with smooth color transition
                        Text(
                            text = destination.label,
                            color = textColor,
                            fontSize = 11.sp,
                            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            textAlign = TextAlign.Center,
                            letterSpacing = 0.15.sp
                        )
                    }
                }
            }

            // Respect gesture bar and system navigation bar insets
            Spacer(modifier = Modifier.navigationBarsPadding())
        }
    }
}

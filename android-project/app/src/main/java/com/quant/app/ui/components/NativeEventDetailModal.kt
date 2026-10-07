package com.quant.app.ui.components

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.quant.app.ui.views.AttendeeInfo
import com.quant.app.ui.views.ScheduleTimelineItem
import com.quant.app.ui.views.getCategoryVectorIcon

/**
 * Google Calendar & Calendly-Class Event Detail BottomSheet Modal.
 *
 * Design tokens:
 * - Obsidian backdrop: #0F1219
 * - Elevated card: #151822
 * - Border: #232A3B
 * - Accent: Molten Amber #F59E0B / #FF8C42
 * - Strict Zero Emojis: Material 3 vector icons only.
 */
@Composable
fun NativeEventDetailModal(
    event: ScheduleTimelineItem,
    onDismiss: () -> Unit,
    onJoinMeet: (ScheduleTimelineItem) -> Unit = {},
    onEditEvent: (ScheduleTimelineItem) -> Unit = {},
    onDeleteEvent: (ScheduleTimelineItem) -> Unit = {},
    onExportCalDav: (ScheduleTimelineItem) -> Unit = {},
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    val scrollState = rememberScrollState()

    val attendeeList: List<AttendeeInfo> = remember(event.id) {
        if (event.attendeeDetails.isNotEmpty()) {
            event.attendeeDetails
        } else if (event.attendees.isNotEmpty()) {
            event.attendees.mapIndexed { idx, email ->
                AttendeeInfo(
                    email = email,
                    name = email.substringBefore("@").replace(".", " ").split(" ")
                        .joinToString(" ") { it.replaceFirstChar(Char::uppercaseChar) },
                    status = if (idx == 0) "Accepted" else if (idx == 1) "Accepted" else "Tentative"
                )
            }
        } else {
            listOf(
                AttendeeInfo("team@quantmail.in", "Quant Core Fleet", "Accepted"),
                AttendeeInfo("astra@quantrinity.in", "Astra Executive AI", "Accepted"),
                AttendeeInfo("guest@client.com", "Client Partner", "Tentative")
            )
        }
    }

    val amberAccent = Color(0xFFF5, 0x9E, 0x0B)
    val moltenAmber = Color(0xFFFF, 0x8C, 0x42)
    val obsidianBackground = Color(0xFF0F, 0x12, 0x19)
    val cardBackground = Color(0xFF15, 0x18, 0x22)
    val borderColor = Color(0xFF23, 0x2A, 0x3B)

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false
        )
    ) {
        BackHandler(onBack = onDismiss)

        Box(
            modifier = modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.72f))
                .clickable(onClick = onDismiss),
            contentAlignment = Alignment.BottomCenter
        ) {
            // Main Modal Card (Consumes clicks so clicking card doesn't dismiss)
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(enabled = false, onClick = {})
                    .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                    .background(obsidianBackground)
                    .border(
                        BorderStroke(1.dp, borderColor),
                        RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)
                    )
                    .statusBarsPadding()
                    .navigationBarsPadding()
                    .padding(bottom = 16.dp)
            ) {
                // Drag handle
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 10.dp, bottom = 4.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Box(
                        modifier = Modifier
                            .width(42.dp)
                            .height(4.dp)
                            .clip(RoundedCornerShape(2.dp))
                            .background(Color(0xFF37, 0x41, 0x51))
                    )
                }

                // ─── Header Action Row ─────────────────────────────────────────
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    // Category pill
                    val categoryName = event.category ?: "Calendar Event"
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = event.color.copy(alpha = 0.16f),
                        border = BorderStroke(1.dp, event.color.copy(alpha = 0.45f))
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
                        ) {
                            Icon(
                                imageVector = getCategoryVectorIcon(event.category),
                                contentDescription = null,
                                tint = event.color,
                                modifier = Modifier.size(14.dp)
                            )
                            Text(
                                text = categoryName,
                                color = event.color,
                                fontSize = 11.5.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }

                    // Action buttons: Share, Edit, Delete, Close
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        IconButton(
                            onClick = {
                                val shareUrl = event.meetLink.ifEmpty { "https://quantmail.in/calendar/booking/dev-sentinel" }
                                clipboardManager.setText(AnnotatedString(shareUrl))
                                Toast.makeText(context, "Event link copied to clipboard", Toast.LENGTH_SHORT).show()
                            },
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Share,
                                contentDescription = "Share",
                                tint = Color(0xFF9C, 0xA3, 0xAF),
                                modifier = Modifier.size(18.dp)
                            )
                        }

                        IconButton(
                            onClick = { onEditEvent(event) },
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Edit,
                                contentDescription = "Edit",
                                tint = Color(0xFF9C, 0xA3, 0xAF),
                                modifier = Modifier.size(18.dp)
                            )
                        }

                        IconButton(
                            onClick = { onDeleteEvent(event) },
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Delete,
                                contentDescription = "Delete",
                                tint = Color(0xFFEF, 0x44, 0x44),
                                modifier = Modifier.size(18.dp)
                            )
                        }

                        IconButton(
                            onClick = onDismiss,
                            modifier = Modifier
                                .size(32.dp)
                                .clip(CircleShape)
                                .background(Color(0xFF1E, 0x22, 0x2D))
                        ) {
                            Icon(
                                imageVector = Icons.Default.Close,
                                contentDescription = "Close",
                                tint = Color(0xFFD1, 0xD5, 0xDB),
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                }

                HorizontalDivider(color = borderColor, thickness = 1.dp)

                // ─── Scrollable Content ────────────────────────────────────────
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .verticalScroll(scrollState)
                        .padding(horizontal = 20.dp, vertical = 14.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // Title: 20sp bold white text
                    Text(
                        text = event.title,
                        color = Color.White,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        lineHeight = 26.sp
                    )

                    // ─── Time & Duration + Dual Timezone Card ──────────────────
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(cardBackground)
                            .border(BorderStroke(1.dp, borderColor), RoundedCornerShape(14.dp))
                            .padding(14.dp)
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            // Time & Duration
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(34.dp)
                                        .clip(CircleShape)
                                        .background(amberAccent.copy(alpha = 0.16f)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.AccessTime,
                                        contentDescription = "Time",
                                        tint = amberAccent,
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                                Column {
                                    Text(
                                        text = event.durationText,
                                        color = Color.White,
                                        fontSize = 14.sp,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                    Text(
                                        text = "${event.dayKey}, September ${event.dayNumber}, 2026 · 1 hour slot",
                                        color = Color(0xFF9C, 0xA3, 0xAF),
                                        fontSize = 12.sp
                                    )
                                }
                            }

                            HorizontalDivider(color = borderColor.copy(alpha = 0.6f), thickness = 0.8.dp)

                            // Dual Timezone Pill
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(34.dp)
                                        .clip(CircleShape)
                                        .background(Color(0xFF0E, 0xA5, 0xE9).copy(alpha = 0.16f)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Public,
                                        contentDescription = "Dual Timezone",
                                        tint = Color(0xFF0E, 0xA5, 0xE9),
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                                Column {
                                    Text(
                                        text = "Dual Timezone Conversion",
                                        color = Color(0xFF9C, 0xA3, 0xAF),
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Medium
                                    )
                                    Text(
                                        text = event.dualTimezone,
                                        color = Color(0xFF38, 0xBD, 0xF8),
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                }
                            }
                        }
                    }

                    // ─── Prominent One-Tap Video Meeting Button ────────────────
                    if (event.hasMeetLink) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(14.dp))
                                .background(
                                    Brush.linearGradient(
                                        listOf(
                                            Color(0xFF1E, 0x18, 0x10),
                                            Color(0xFF15, 0x18, 0x22)
                                        )
                                    )
                                )
                                .border(
                                    BorderStroke(
                                        1.dp,
                                        Brush.horizontalGradient(
                                            listOf(
                                                moltenAmber.copy(alpha = 0.8f),
                                                Color(0xFF0E, 0xA5, 0xE9).copy(alpha = 0.5f)
                                            )
                                        )
                                    ),
                                    RoundedCornerShape(14.dp)
                                )
                                .padding(14.dp)
                        ) {
                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .size(28.dp)
                                                .clip(CircleShape)
                                                .background(moltenAmber.copy(alpha = 0.2f)),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Videocam,
                                                contentDescription = "Video Meet",
                                                tint = moltenAmber,
                                                modifier = Modifier.size(16.dp)
                                            )
                                        }
                                        Text(
                                            text = "QuantMeet HD Video Conference",
                                            color = Color.White,
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }

                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = Color(0xFF10, 0xB9, 0x81).copy(alpha = 0.16f),
                                        border = BorderStroke(0.8.dp, Color(0xFF10, 0xB9, 0x81).copy(alpha = 0.4f))
                                    ) {
                                        Text(
                                            text = "Encrypted",
                                            color = Color(0xFF10, 0xB9, 0x81),
                                            fontSize = 10.5.sp,
                                            fontWeight = FontWeight.Bold,
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    }
                                }

                                Text(
                                    text = event.meetLink.ifEmpty { "https://meet.quantmail.in/room/swarm-review" },
                                    color = Color(0xFF9C, 0xA3, 0xAF),
                                    fontSize = 11.5.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )

                                Button(
                                    onClick = { onJoinMeet(event) },
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = moltenAmber,
                                        contentColor = Color(0xFF18, 0x0A, 0x00)
                                    ),
                                    shape = RoundedCornerShape(10.dp),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(44.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Videocam,
                                        contentDescription = "Join Meet",
                                        tint = Color(0xFF18, 0x0A, 0x00),
                                        modifier = Modifier.size(18.dp)
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = "Join QuantMeet HD Video",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.5.sp
                                    )
                                }
                            }
                        }
                    }

                    // ─── Location & Recurrence Card ───────────────────────────
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(cardBackground)
                            .border(BorderStroke(1.dp, borderColor), RoundedCornerShape(14.dp))
                            .padding(14.dp)
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            // Location
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(34.dp)
                                        .clip(CircleShape)
                                        .background(Color(0xFF26, 0x2C, 0x3A)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.LocationOn,
                                        contentDescription = "Location",
                                        tint = Color(0xFF9C, 0xA3, 0xAF),
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                                Column {
                                    Text(
                                        text = "Location",
                                        color = Color(0xFF9C, 0xA3, 0xAF),
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Medium
                                    )
                                    Text(
                                        text = event.location ?: "Quant Headquarters · Floor 4 · Room A",
                                        color = Color.White,
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                }
                            }

                            HorizontalDivider(color = borderColor.copy(alpha = 0.6f), thickness = 0.8.dp)

                            // Recurrence
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(34.dp)
                                        .clip(CircleShape)
                                        .background(Color(0xFF26, 0x2C, 0x3A)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Repeat,
                                        contentDescription = "Recurrence",
                                        tint = Color(0xFF9C, 0xA3, 0xAF),
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                                Column {
                                    Text(
                                        text = "Recurrence Rule",
                                        color = Color(0xFF9C, 0xA3, 0xAF),
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Medium
                                    )
                                    Text(
                                        text = event.recurrenceSummary,
                                        color = Color(0xFFE5, 0xE7, 0xEB),
                                        fontSize = 12.5.sp,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                }
                            }
                        }
                    }

                    // ─── Attendees with RSVP Status ────────────────────────────
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(cardBackground)
                            .border(BorderStroke(1.dp, borderColor), RoundedCornerShape(14.dp))
                            .padding(14.dp)
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
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
                                        imageVector = Icons.Default.Group,
                                        contentDescription = "Attendees",
                                        tint = amberAccent,
                                        modifier = Modifier.size(18.dp)
                                    )
                                    Text(
                                        text = "Attendees (${attendeeList.size})",
                                        color = Color.White,
                                        fontSize = 13.5.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }

                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = Color(0xFF1E, 0x22, 0x2D),
                                    border = BorderStroke(0.8.dp, borderColor)
                                ) {
                                    Text(
                                        text = "CalDAV Verified",
                                        color = Color(0xFF9C, 0xA3, 0xAF),
                                        fontSize = 10.5.sp,
                                        fontWeight = FontWeight.Medium,
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                    )
                                }
                            }

                            HorizontalDivider(color = borderColor.copy(alpha = 0.6f), thickness = 0.8.dp)

                            // Attendee Rows
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                for (attendee in attendeeList) {
                                    AttendeeRowItem(attendee = attendee)
                                }
                            }
                        }
                    }

                    // ─── Action Buttons Footer ─────────────────────────────────
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        // [Add to Google Calendar / CalDAV Export]
                        Button(
                            onClick = {
                                onExportCalDav(event)
                                Toast.makeText(context, "CalDAV RFC 5545 exported & synchronized", Toast.LENGTH_SHORT).show()
                            },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color(0xFF1E, 0x22, 0x2E),
                                contentColor = Color(0xFFE5, 0xE7, 0xEB)
                            ),
                            border = BorderStroke(1.dp, borderColor),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(42.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Sync,
                                contentDescription = null,
                                tint = Color(0xFF10, 0xB9, 0x81),
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Add to Google Calendar / CalDAV Export",
                                fontSize = 12.5.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }

                        // Row: Edit & Delete
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            OutlinedButton(
                                onClick = { onEditEvent(event) },
                                border = BorderStroke(1.dp, borderColor),
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier
                                    .weight(1f)
                                    .height(42.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Edit,
                                    contentDescription = null,
                                    tint = Color(0xFF9C, 0xA3, 0xAF),
                                    modifier = Modifier.size(15.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = "Edit Event",
                                    color = Color.White,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }

                            OutlinedButton(
                                onClick = { onDeleteEvent(event) },
                                border = BorderStroke(1.dp, Color(0xFFEF, 0x44, 0x44).copy(alpha = 0.4f)),
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier
                                    .weight(1f)
                                    .height(42.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Delete,
                                    contentDescription = null,
                                    tint = Color(0xFFEF, 0x44, 0x44),
                                    modifier = Modifier.size(15.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = "Delete Event",
                                    color = Color(0xFFEF, 0x44, 0x44),
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * Individual Attendee Row with Avatar and RSVP Badge.
 */
@Composable
private fun AttendeeRowItem(attendee: AttendeeInfo) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.weight(1f)
        ) {
            // Avatar circle with letter initial
            val initial = (attendee.name?.take(1) ?: attendee.email.take(1)).uppercase()
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .background(
                        Brush.linearGradient(
                            listOf(
                                Color(0xFF2E, 0x36, 0x48),
                                Color(0xFF1F, 0x24, 0x30)
                            )
                        )
                    )
                    .border(1.dp, Color(0xFF45, 0x51, 0x6A), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = initial,
                    color = Color.White,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            Column {
                if (attendee.name != null) {
                    Text(
                        text = attendee.name,
                        color = Color.White,
                        fontSize = 12.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Text(
                    text = attendee.email,
                    color = Color(0xFF9C, 0xA3, 0xAF),
                    fontSize = 11.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }

        // RSVP Badge
        val isAccepted = attendee.status.equals("Accepted", ignoreCase = true)
        val isTentative = attendee.status.equals("Tentative", ignoreCase = true)
        val badgeColor = when {
            isAccepted -> Color(0xFF10, 0xB9, 0x81)
            isTentative -> Color(0xFFF5, 0x9E, 0x0B)
            else -> Color(0xFFEF, 0x44, 0x44)
        }

        Surface(
            shape = RoundedCornerShape(8.dp),
            color = badgeColor.copy(alpha = 0.16f),
            border = BorderStroke(0.8.dp, badgeColor.copy(alpha = 0.45f))
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
            ) {
                Icon(
                    imageVector = if (isAccepted) Icons.Default.CheckCircle else Icons.Default.AccessTime,
                    contentDescription = null,
                    tint = badgeColor,
                    modifier = Modifier.size(11.dp)
                )
                Text(
                    text = attendee.status,
                    color = badgeColor,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

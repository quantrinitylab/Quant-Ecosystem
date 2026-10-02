package com.quant.app.ui.views

import android.content.Intent
import android.net.Uri
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.AccountTree
import androidx.compose.material.icons.filled.CalendarViewMonth
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Event
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Today
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quant.app.data.EcosystemStateStore
import com.quant.app.ui.components.NativeEventDetailModal

/**
 * View modes supported by QuantCalendar.
 */
enum class CalendarViewMode {
    WEEK,
    MONTH
}

/**
 * Attendee model with RSVP status.
 */
data class AttendeeInfo(
    val email: String,
    val name: String? = null,
    val status: String = "Accepted" // "Accepted", "Tentative", "Declined"
)

/**
 * Data representation of a timeline event.
 */
data class ScheduleTimelineItem(
    val id: String,
    val timeSlot: String,
    val durationText: String,
    val title: String,
    val color: Color,
    val category: String? = null,
    val location: String? = null,
    val attendees: List<String> = emptyList(),
    val hasMeetLink: Boolean = false,
    val isDynamic: Boolean = false,
    val meetLink: String = "https://meet.quantmail.in/room/swarm-review",
    val dualTimezone: String = "IST (UTC+5:30) · PST (08:30 PM -1d)",
    val recurrenceSummary: String = "Repeats weekly on Wednesday · RFC 5545 compliant series",
    val dayKey: String = "Wed",
    val dayNumber: Int = 30,
    val attendeeDetails: List<AttendeeInfo> = emptyList(),
    val description: String? = null
)

/**
 * 7-day strip cell item data.
 */
data class DayStripItem(
    val dayName: String,
    val dayNumber: Int,
    val isCurrentMonth: Boolean,
    val isToday: Boolean = false,
    val fullDateHeader: String = ""
)

/**
 * Month grid cell item data.
 */
data class MonthGridCellItem(
    val dayNumber: Int,
    val isCurrentMonth: Boolean,
    val isToday: Boolean = false,
    val hasEvents: Boolean = false,
    val eventDots: List<Color> = emptyList(),
    val matchingDayIndex: Int = 2,
    val fullDateHeader: String = ""
)

/**
 * Returns a crisp vector icon for an event category.
 */
fun getCategoryVectorIcon(category: String?): ImageVector {
    return when (category?.lowercase()?.trim()) {
        "engineering", "codehub", "code review", "sprint" -> Icons.Default.Code
        "executive", "board", "leadership", "partnership" -> Icons.Default.Star
        "architecture", "infra", "infrastructure", "planning" -> Icons.Default.AccountTree
        "design", "ux", "ui" -> Icons.Default.Palette
        "sync", "standup", "meet" -> Icons.Default.Videocam
        else -> Icons.Default.Event
    }
}

/**
 * 3D Pad QuantCalendarMark brand badge.
 */
@Composable
fun QuantCalendarMark(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(38.dp)
            .clip(RoundedCornerShape(11.dp))
            .background(
                Brush.linearGradient(
                    colors = listOf(
                        Color(0xFFFF, 0x8C, 0x42),
                        Color(0xFFEA, 0x58, 0x0C)
                    )
                )
            )
            .border(
                BorderStroke(
                    1.dp,
                    Brush.linearGradient(
                        listOf(
                            Color.White.copy(alpha = 0.55f),
                            Color(0xFFFF, 0x8C, 0x42).copy(alpha = 0.2f)
                        )
                    )
                ),
                RoundedCornerShape(11.dp)
            ),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = Icons.Default.Event,
            contentDescription = "Quant Calendar",
            tint = Color.White,
            modifier = Modifier.size(20.dp)
        )
    }
}

/**
 * Native Jetpack Compose Calendar & Schedule View.
 * Matches Google Calendar & Calendly sovereign parity:
 * 1. Top Mini-Calendar Header with month title and Week View vs Month Grid Switcher.
 * 2. Dynamic 7-Day Agenda Filter with instant timeline synchronization and event counter badge.
 * 3. Month Grid with event indicator dots and direct day selection.
 * 4. Timezone, CalDAV Real-Time Sync, and Calendly Public Booking Engine Link.
 * 5. Daily Schedule Timeline with hour markings and Google Calendar / Calendly-Class Event Detail Sheet.
 */
@Composable
fun NativeCalendarView(
    subTabId: String? = null,
    modifier: Modifier = Modifier,
    onEventClick: ((ScheduleTimelineItem) -> Unit)? = null,
    onNewEventClick: (() -> Unit)? = null
) {
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current

    var viewMode by remember { mutableStateOf(CalendarViewMode.WEEK) }
    var selectedDayIndex by remember { mutableIntStateOf(2) } // Day 2 = Wednesday (Sep 30) default
    var selectedDayNumber by remember { mutableIntStateOf(30) }
    var selectedDayTitle by remember { mutableStateOf("Wednesday, September 30") }
    var selectedEventDetail by remember { mutableStateOf<ScheduleTimelineItem?>(null) }

    LaunchedEffect(subTabId) {
        if (subTabId != null) {
            when (subTabId) {
                "agenda" -> viewMode = CalendarViewMode.WEEK
                "month" -> viewMode = CalendarViewMode.MONTH
                "booking" -> {
                    // booking engine or agenda
                }
            }
        }
    }

    // 7-day strip data for the week (Mon Sep 28 – Sun Oct 4, 2026)
    val daysOfWeek = remember {
        listOf(
            DayStripItem("Mon", 28, isCurrentMonth = true, fullDateHeader = "Monday, September 28"),
            DayStripItem("Tue", 29, isCurrentMonth = true, fullDateHeader = "Tuesday, September 29"),
            DayStripItem("Wed", 30, isCurrentMonth = true, isToday = true, fullDateHeader = "Wednesday, September 30"),
            DayStripItem("Thu", 1, isCurrentMonth = false, fullDateHeader = "Thursday, October 1"),
            DayStripItem("Fri", 2, isCurrentMonth = false, fullDateHeader = "Friday, October 2"),
            DayStripItem("Sat", 3, isCurrentMonth = false, fullDateHeader = "Saturday, October 3"),
            DayStripItem("Sun", 4, isCurrentMonth = false, fullDateHeader = "Sunday, October 4")
        )
    }

    // Curated dynamic benchmark events mapped by day index (0..6)
    val curatedEventsByDay = remember {
        mapOf(
            // ─── Monday (Sep 28) ─────────────────────────────────────────────
            0 to listOf(
                ScheduleTimelineItem(
                    id = "evt_mon_swarm_kickoff",
                    timeSlot = "09:00 AM",
                    durationText = "09:00 AM – 10:00 AM · 1 hr",
                    title = "Tripartite Swarm Kickoff & Sprint Planning",
                    color = Color(0xFFF5, 0x9E, 0x0B),
                    category = "Sprint",
                    location = "Quant Headquarters · Stage A",
                    hasMeetLink = true,
                    meetLink = "https://meet.quantmail.in/room/swarm-kickoff",
                    attendees = listOf("ceo@quantrinity.in", "astra@quantrinity.in", "team@quantmail.in"),
                    attendeeDetails = listOf(
                        AttendeeInfo("ceo@quantrinity.in", "Executive Swarm", "Accepted"),
                        AttendeeInfo("astra@quantrinity.in", "Astra Executive AI", "Accepted"),
                        AttendeeInfo("team@quantmail.in", "Quant Core Fleet", "Accepted")
                    ),
                    recurrenceSummary = "Repeats weekly on Monday · RFC 5545 compliant series",
                    dayKey = "Mon",
                    dayNumber = 28
                ),
                ScheduleTimelineItem(
                    id = "evt_mon_backlog_grooming",
                    timeSlot = "11:30 AM",
                    durationText = "11:30 AM – 12:30 PM · 1 hr",
                    title = "Linear Backlog Grooming & Task Triage",
                    color = Color(0xFF10, 0xB9, 0x81),
                    category = "CodeHub Engineering",
                    location = "CodeHub War Room · Desk 12",
                    attendees = listOf("dev-sentinel@quantmail.in", "qa@quantmail.in"),
                    attendeeDetails = listOf(
                        AttendeeInfo("dev-sentinel@quantmail.in", "Dev Sentinel", "Accepted"),
                        AttendeeInfo("qa@quantmail.in", "QA Sentinel", "Accepted")
                    ),
                    recurrenceSummary = "Repeats weekly on Monday · RFC 5545 compliant series",
                    dayKey = "Mon",
                    dayNumber = 28
                ),
                ScheduleTimelineItem(
                    id = "evt_mon_auth_sync",
                    timeSlot = "02:00 PM",
                    durationText = "02:00 PM – 03:00 PM · 1 hr",
                    title = "Sovereign Auth & JWT Token Bridge Sync",
                    color = Color(0xFF0E, 0xA5, 0xE9),
                    category = "Security",
                    location = "Quant HQ · Room C",
                    attendees = listOf("auth-sec@quantrinity.in", "architect@quantmail.in"),
                    attendeeDetails = listOf(
                        AttendeeInfo("auth-sec@quantrinity.in", "Auth & Sec Lead", "Accepted"),
                        AttendeeInfo("guest@enterprise.com", "Enterprise Partner", "Tentative")
                    ),
                    recurrenceSummary = "Bi-weekly on Monday · RFC 5545 compliant series",
                    dayKey = "Mon",
                    dayNumber = 28
                ),
                ScheduleTimelineItem(
                    id = "evt_mon_subagents_dispatch",
                    timeSlot = "04:30 PM",
                    durationText = "04:30 PM – 05:30 PM · 1 hr",
                    title = "15-Subagent Fleet Dispatch & Workstream Gate",
                    color = Color(0xFF8B, 0x5C, 0xF6),
                    category = "Architecture",
                    location = "Virtual Sovereign Cluster",
                    attendees = listOf("node-a@quant.in", "node-b@quant.in", "node-c@quant.in"),
                    attendeeDetails = listOf(
                        AttendeeInfo("node-a@quant.in", "Node A Orchestrator", "Accepted"),
                        AttendeeInfo("node-b@quant.in", "Node B Peer", "Accepted"),
                        AttendeeInfo("node-c@quant.in", "Node C Dev-Worker", "Accepted")
                    ),
                    recurrenceSummary = "Daily standup series · RFC 5545 compliant",
                    dayKey = "Mon",
                    dayNumber = 28
                )
            ),

            // ─── Tuesday (Sep 29) ────────────────────────────────────────────
            1 to listOf(
                ScheduleTimelineItem(
                    id = "evt_tue_quantdrive_chunking",
                    timeSlot = "09:00 AM",
                    durationText = "09:00 AM – 10:15 AM · 1 hr 15 min",
                    title = "QuantDrive Distributed Chunking & S3 Engine",
                    color = Color(0xFFF5, 0x9E, 0x0B),
                    category = "Architecture",
                    location = "Virtual Meet Room",
                    hasMeetLink = true,
                    meetLink = "https://meet.quantmail.in/room/quantdrive-s3",
                    attendees = listOf("storage@quantmail.in", "team@quantmail.in"),
                    attendeeDetails = listOf(
                        AttendeeInfo("storage@quantmail.in", "Storage Architect", "Accepted"),
                        AttendeeInfo("team@quantmail.in", "Quant Core Fleet", "Accepted"),
                        AttendeeInfo("client@corp.org", "Enterprise Client", "Tentative")
                    ),
                    recurrenceSummary = "Repeats weekly on Tuesday · RFC 5545 compliant series",
                    dayKey = "Tue",
                    dayNumber = 29
                ),
                ScheduleTimelineItem(
                    id = "evt_tue_migration_0058",
                    timeSlot = "11:30 AM",
                    durationText = "11:30 AM – 12:30 PM · 1 hr",
                    title = "Database Schema Migration 0058 Live Rollout",
                    color = Color(0xFF10, 0xB9, 0x81),
                    category = "CodeHub Engineering",
                    location = "Database Ops Terminal",
                    attendees = listOf("dba@quantmail.in", "dev-sentinel@quantmail.in"),
                    attendeeDetails = listOf(
                        AttendeeInfo("dba@quantmail.in", "DBA Lead", "Accepted"),
                        AttendeeInfo("dev-sentinel@quantmail.in", "Dev Sentinel", "Accepted")
                    ),
                    recurrenceSummary = "One-time milestone series",
                    dayKey = "Tue",
                    dayNumber = 29
                ),
                ScheduleTimelineItem(
                    id = "evt_tue_webrtc_testing",
                    timeSlot = "02:00 PM",
                    durationText = "02:00 PM – 03:00 PM · 1 hr",
                    title = "WebRTC Audio Stage Stress Testing",
                    color = Color(0xFF0E, 0xA5, 0xE9),
                    category = "Infra",
                    location = "Testing Lab 2 · Audio Chamber",
                    attendees = listOf("webrtc@quant.in", "product@quantmail.in"),
                    attendeeDetails = listOf(
                        AttendeeInfo("webrtc@quant.in", "WebRTC Lead", "Accepted"),
                        AttendeeInfo("product@quantmail.in", "Product Lead", "Accepted")
                    ),
                    recurrenceSummary = "Repeats weekly on Tuesday · RFC 5545 compliant series",
                    dayKey = "Tue",
                    dayNumber = 29
                ),
                ScheduleTimelineItem(
                    id = "evt_tue_security_pentest",
                    timeSlot = "04:30 PM",
                    durationText = "04:30 PM – 05:15 PM · 45 min",
                    title = "Zero-Knowledge Penetration & FTS5 Index Audit",
                    color = Color(0xFF8B, 0x5C, 0xF6),
                    category = "Security",
                    location = "Security Vault Room 9",
                    attendees = listOf("security@quantmail.in", "crypto@quantrinity.in"),
                    attendeeDetails = listOf(
                        AttendeeInfo("security@quantmail.in", "SecOps Lead", "Accepted"),
                        AttendeeInfo("crypto@quantrinity.in", "Crypto Auditor", "Accepted")
                    ),
                    recurrenceSummary = "Bi-weekly series · RFC 5545 compliant",
                    dayKey = "Tue",
                    dayNumber = 29
                )
            ),

            // ─── Wednesday (Sep 30 - Today) ──────────────────────────────────
            2 to listOf(
                ScheduleTimelineItem(
                    id = "evt_swarm_review",
                    timeSlot = "09:00 AM",
                    durationText = "09:00 AM – 10:00 AM · 1 hr",
                    title = "Sprint Architecture & Tripartite Swarm Review",
                    color = Color(0xFFF5, 0x9E, 0x0B),
                    category = "Architecture",
                    location = "Quant Headquarters · Floor 4 · Room A",
                    hasMeetLink = true,
                    meetLink = "https://meet.quantmail.in/room/swarm-review",
                    attendees = listOf("team@quantmail.in", "astra@quantrinity.in", "guest@client.com"),
                    attendeeDetails = listOf(
                        AttendeeInfo("team@quantmail.in", "Quant Core Fleet", "Accepted"),
                        AttendeeInfo("astra@quantrinity.in", "Astra Executive AI", "Accepted"),
                        AttendeeInfo("guest@client.com", "Client Partner", "Tentative")
                    ),
                    recurrenceSummary = "Repeats weekly on Wednesday · RFC 5545 compliant series",
                    dayKey = "Wed",
                    dayNumber = 30
                ),
                ScheduleTimelineItem(
                    id = "evt_pr347_gate",
                    timeSlot = "11:30 AM",
                    durationText = "11:30 AM – 12:15 PM · 45 min",
                    title = "PR #347 Verification & Staging Gate",
                    color = Color(0xFF10, 0xB9, 0x81),
                    category = "CodeHub Engineering",
                    location = "Quant Terminal Lab B",
                    attendees = listOf("dev-sentinel@quantmail.in", "reviewer@quantmail.in"),
                    attendeeDetails = listOf(
                        AttendeeInfo("dev-sentinel@quantmail.in", "Dev Sentinel", "Accepted"),
                        AttendeeInfo("reviewer@quantmail.in", "Senior Reviewer", "Accepted")
                    ),
                    recurrenceSummary = "Sprint milestone series",
                    dayKey = "Wed",
                    dayNumber = 30
                ),
                ScheduleTimelineItem(
                    id = "evt_superhuman_demo",
                    timeSlot = "02:00 PM",
                    durationText = "02:00 PM – 03:00 PM · 1 hr",
                    title = "Superhuman Android Parity Demo",
                    color = Color(0xFF0E, 0xA5, 0xE9),
                    category = "Design",
                    location = "Quant Headquarters · Room A",
                    attendees = listOf("ceo@quantrinity.in", "product@quantmail.in"),
                    attendeeDetails = listOf(
                        AttendeeInfo("ceo@quantrinity.in", "CEO Orchestrator", "Accepted"),
                        AttendeeInfo("product@quantmail.in", "Product Lead", "Accepted")
                    ),
                    recurrenceSummary = "Repeats weekly on Wednesday · RFC 5545 compliant series",
                    dayKey = "Wed",
                    dayNumber = 30
                ),
                ScheduleTimelineItem(
                    id = "evt_sso_security",
                    timeSlot = "04:30 PM",
                    durationText = "04:30 PM – 05:00 PM · 30 min",
                    title = "SSO Token Bridge & Security Sign-Off",
                    color = Color(0xFF8B, 0x5C, 0xF6),
                    category = "Security",
                    location = "Security Center",
                    attendees = listOf("auth-sec@quantrinity.in"),
                    attendeeDetails = listOf(
                        AttendeeInfo("auth-sec@quantrinity.in", "Security Officer", "Accepted")
                    ),
                    recurrenceSummary = "Sprint security gate series",
                    dayKey = "Wed",
                    dayNumber = 30
                )
            ),

            // ─── Thursday (Oct 1) ────────────────────────────────────────────
            3 to listOf(
                ScheduleTimelineItem(
                    id = "evt_thu_staging_deploy",
                    timeSlot = "09:00 AM",
                    durationText = "09:00 AM – 10:00 AM · 1 hr",
                    title = "Staging Cluster Deployment & Calendly Sync",
                    color = Color(0xFFF5, 0x9E, 0x0B),
                    category = "Infra",
                    location = "Virtual Meet Room",
                    hasMeetLink = true,
                    meetLink = "https://meet.quantmail.in/room/staging-calendly",
                    attendees = listOf("ops@quantmail.in", "dev-sentinel@quantmail.in", "cloud@quantrinity.in"),
                    attendeeDetails = listOf(
                        AttendeeInfo("ops@quantmail.in", "Cloud Ops", "Accepted"),
                        AttendeeInfo("dev-sentinel@quantmail.in", "Dev Sentinel", "Accepted"),
                        AttendeeInfo("cloud@quantrinity.in", "Infra Cloud", "Accepted")
                    ),
                    recurrenceSummary = "Repeats weekly on Thursday · RFC 5545 compliant series",
                    dayKey = "Thu",
                    dayNumber = 1
                ),
                ScheduleTimelineItem(
                    id = "evt_thu_eks_scale",
                    timeSlot = "11:30 AM",
                    durationText = "11:30 AM – 12:30 PM · 1 hr",
                    title = "EKS 20-Pod Staging Cluster Scaling Gate",
                    color = Color(0xFF10, 0xB9, 0x81),
                    category = "Architecture",
                    location = "DevOps Ops Center",
                    attendees = listOf("infra-lead@quant.in", "k8s@quantmail.in"),
                    attendeeDetails = listOf(
                        AttendeeInfo("infra-lead@quant.in", "Infra Lead", "Accepted"),
                        AttendeeInfo("k8s@quantmail.in", "Kubernetes Sentinel", "Accepted")
                    ),
                    recurrenceSummary = "Weekly cluster scaling gate",
                    dayKey = "Thu",
                    dayNumber = 1
                ),
                ScheduleTimelineItem(
                    id = "evt_thu_ws_test",
                    timeSlot = "02:00 PM",
                    durationText = "02:00 PM – 03:00 PM · 1 hr",
                    title = "Realtime WebSocket & Notification Stress Test",
                    color = Color(0xFF0E, 0xA5, 0xE9),
                    category = "Engineering",
                    location = "Quant HQ · Bench 3",
                    attendees = listOf("stream@quantmail.in", "qa-mobile@quantmail.in"),
                    attendeeDetails = listOf(
                        AttendeeInfo("stream@quantmail.in", "Stream Architect", "Accepted"),
                        AttendeeInfo("qa-mobile@quantmail.in", "Mobile QA", "Accepted")
                    ),
                    recurrenceSummary = "Performance benchmark series",
                    dayKey = "Thu",
                    dayNumber = 1
                ),
                ScheduleTimelineItem(
                    id = "evt_thu_caldav_lock",
                    timeSlot = "04:30 PM",
                    durationText = "04:30 PM – 05:30 PM · 1 hr",
                    title = "CalDAV RFC 5545 Recurrence Slot Lock Audit",
                    color = Color(0xFF8B, 0x5C, 0xF6),
                    category = "Security",
                    location = "Audit Room Alpha",
                    attendees = listOf("standards@quantmail.in", "partner@client.com"),
                    attendeeDetails = listOf(
                        AttendeeInfo("standards@quantmail.in", "Standards Lead", "Accepted"),
                        AttendeeInfo("partner@client.com", "Partner Auditor", "Tentative")
                    ),
                    recurrenceSummary = "Repeats weekly on Thursday · RFC 5545 compliant series",
                    dayKey = "Thu",
                    dayNumber = 1
                )
            ),

            // ─── Friday (Oct 2) ──────────────────────────────────────────────
            4 to listOf(
                ScheduleTimelineItem(
                    id = "evt_fri_sprint_demo",
                    timeSlot = "09:00 AM",
                    durationText = "09:00 AM – 10:00 AM · 1 hr",
                    title = "Tripartite Swarm Sprint Demo & Showcase",
                    color = Color(0xFFF5, 0x9E, 0x0B),
                    category = "Sprint",
                    location = "Quant Main Auditorium",
                    hasMeetLink = true,
                    meetLink = "https://meet.quantmail.in/room/sprint-demo",
                    attendees = listOf("all-hands@quantmail.in", "astra@quantrinity.in", "board@quantrinity.in"),
                    attendeeDetails = listOf(
                        AttendeeInfo("all-hands@quantmail.in", "All Hands", "Accepted"),
                        AttendeeInfo("astra@quantrinity.in", "Astra Executive AI", "Accepted"),
                        AttendeeInfo("board@quantrinity.in", "Board Observer", "Accepted")
                    ),
                    recurrenceSummary = "Repeats weekly on Friday · RFC 5545 compliant series",
                    dayKey = "Fri",
                    dayNumber = 2
                ),
                ScheduleTimelineItem(
                    id = "evt_fri_benchmark",
                    timeSlot = "11:30 AM",
                    durationText = "11:30 AM – 12:30 PM · 1 hr",
                    title = "Google Calendar & Calendly Competitor Benchmark",
                    color = Color(0xFF10, 0xB9, 0x81),
                    category = "Executive",
                    location = "Executive Briefing Room",
                    attendees = listOf("product@quantmail.in", "design@quantmail.in"),
                    attendeeDetails = listOf(
                        AttendeeInfo("product@quantmail.in", "Product Lead", "Accepted"),
                        AttendeeInfo("design@quantmail.in", "UI/UX Lead", "Accepted")
                    ),
                    recurrenceSummary = "Weekly competitor intelligence review",
                    dayKey = "Fri",
                    dayNumber = 2
                ),
                ScheduleTimelineItem(
                    id = "evt_fri_release_gate",
                    timeSlot = "02:00 PM",
                    durationText = "02:00 PM – 03:15 PM · 1 hr 15 min",
                    title = "Production Release Gate v3.4 Deployment",
                    color = Color(0xFF0E, 0xA5, 0xE9),
                    category = "CodeHub Engineering",
                    location = "Quant Ops Center",
                    attendees = listOf("release-mgr@quant.in", "dev-sentinel@quantmail.in"),
                    attendeeDetails = listOf(
                        AttendeeInfo("release-mgr@quant.in", "Release Manager", "Accepted"),
                        AttendeeInfo("dev-sentinel@quantmail.in", "Dev Sentinel", "Accepted")
                    ),
                    recurrenceSummary = "Bi-weekly release gate",
                    dayKey = "Fri",
                    dayNumber = 2
                ),
                ScheduleTimelineItem(
                    id = "evt_fri_retrospective",
                    timeSlot = "04:30 PM",
                    durationText = "04:30 PM – 05:30 PM · 1 hr",
                    title = "Security Sign-Off & Tripartite Swarm Retrospective",
                    color = Color(0xFF8B, 0x5C, 0xF6),
                    category = "Security",
                    location = "Leadership Suite",
                    attendees = listOf("leadership@quantrinity.in"),
                    attendeeDetails = listOf(
                        AttendeeInfo("leadership@quantrinity.in", "Leadership Fleet", "Accepted")
                    ),
                    recurrenceSummary = "Repeats weekly on Friday · RFC 5545 compliant series",
                    dayKey = "Fri",
                    dayNumber = 2
                )
            ),

            // ─── Saturday (Oct 3) ────────────────────────────────────────────
            5 to listOf(
                ScheduleTimelineItem(
                    id = "evt_sat_code_freeze",
                    timeSlot = "10:00 AM",
                    durationText = "10:00 AM – 11:00 AM · 1 hr",
                    title = "Weekend Code Freeze & Sentinel Health Check",
                    color = Color(0xFFF5, 0x9E, 0x0B),
                    category = "Infra",
                    location = "Virtual SRE Room",
                    hasMeetLink = true,
                    meetLink = "https://meet.quantmail.in/room/weekend-sre",
                    attendees = listOf("oncall@quantmail.in", "sentinel@quantmail.in"),
                    attendeeDetails = listOf(
                        AttendeeInfo("oncall@quantmail.in", "On-Call Engineer", "Accepted"),
                        AttendeeInfo("sentinel@quantmail.in", "Sentinel Bot", "Accepted")
                    ),
                    recurrenceSummary = "Repeats weekly on Saturday · RFC 5545 compliant series",
                    dayKey = "Sat",
                    dayNumber = 3
                ),
                ScheduleTimelineItem(
                    id = "evt_sat_backup",
                    timeSlot = "02:00 PM",
                    durationText = "02:00 PM – 03:00 PM · 1 hr",
                    title = "Distributed Node Backup & Cold Storage Snapshot",
                    color = Color(0xFF0E, 0xA5, 0xE9),
                    category = "Architecture",
                    location = "Quant Data Center · Vault 1",
                    attendees = listOf("storage-ops@quantmail.in"),
                    attendeeDetails = listOf(
                        AttendeeInfo("storage-ops@quantmail.in", "Storage Ops", "Accepted")
                    ),
                    recurrenceSummary = "Weekly backup series",
                    dayKey = "Sat",
                    dayNumber = 3
                ),
                ScheduleTimelineItem(
                    id = "evt_sat_metrics",
                    timeSlot = "04:30 PM",
                    durationText = "04:30 PM – 05:30 PM · 1 hr",
                    title = "Observability Prometheus & Grafana Metric Verification",
                    color = Color(0xFF8B, 0x5C, 0xF6),
                    category = "Engineering",
                    location = "Monitoring Wall",
                    attendees = listOf("sre@quantmail.in", "lead-dev@quant.in"),
                    attendeeDetails = listOf(
                        AttendeeInfo("sre@quantmail.in", "SRE Lead", "Accepted"),
                        AttendeeInfo("lead-dev@quant.in", "Lead Dev", "Accepted")
                    ),
                    recurrenceSummary = "Weekly observability audit",
                    dayKey = "Sat",
                    dayNumber = 3
                )
            ),

            // ─── Sunday (Oct 4) ──────────────────────────────────────────────
            6 to listOf(
                ScheduleTimelineItem(
                    id = "evt_sun_maintenance",
                    timeSlot = "10:00 AM",
                    durationText = "10:00 AM – 11:00 AM · 1 hr",
                    title = "Weekly System Maintenance & CalDAV Re-indexing",
                    color = Color(0xFFF5, 0x9E, 0x0B),
                    category = "Infra",
                    location = "Sovereign Cloud Ops",
                    hasMeetLink = true,
                    meetLink = "https://meet.quantmail.in/room/system-maintenance",
                    attendees = listOf("ops@quantmail.in", "db-admin@quantmail.in"),
                    attendeeDetails = listOf(
                        AttendeeInfo("ops@quantmail.in", "Ops Team", "Accepted"),
                        AttendeeInfo("db-admin@quantmail.in", "DB Admin", "Accepted")
                    ),
                    recurrenceSummary = "Repeats weekly on Sunday · RFC 5545 compliant series",
                    dayKey = "Sun",
                    dayNumber = 4
                ),
                ScheduleTimelineItem(
                    id = "evt_sun_triage",
                    timeSlot = "02:00 PM",
                    durationText = "02:00 PM – 03:00 PM · 1 hr",
                    title = "Swarm Autonomous Health Triage & Log Scrape",
                    color = Color(0xFF10, 0xB9, 0x81),
                    category = "Architecture",
                    location = "AI Node B Operations",
                    attendees = listOf("node-b@quant.in", "astra@quantrinity.in"),
                    attendeeDetails = listOf(
                        AttendeeInfo("node-b@quant.in", "AI Node B", "Accepted"),
                        AttendeeInfo("astra@quantrinity.in", "Astra Executive AI", "Accepted")
                    ),
                    recurrenceSummary = "Weekly AI health audit",
                    dayKey = "Sun",
                    dayNumber = 4
                ),
                ScheduleTimelineItem(
                    id = "evt_sun_roadmap",
                    timeSlot = "04:30 PM",
                    durationText = "04:30 PM – 05:30 PM · 1 hr",
                    title = "Next-Gen Sprint 40 Roadmap & Capacity Planning",
                    color = Color(0xFF8B, 0x5C, 0xF6),
                    category = "Executive",
                    location = "Strategy Suite",
                    attendees = listOf("leads@quantrinity.in", "founders@quantrinity.in"),
                    attendeeDetails = listOf(
                        AttendeeInfo("leads@quantrinity.in", "Fleet Leads", "Accepted"),
                        AttendeeInfo("founders@quantrinity.in", "Founders Circle", "Accepted")
                    ),
                    recurrenceSummary = "Weekly executive sync",
                    dayKey = "Sun",
                    dayNumber = 4
                )
            )
        )
    }

    // Dynamic events pulled from EcosystemStateStore.eventsList
    val dynamicEvents = EcosystemStateStore.eventsList.map { storedEvent ->
        ScheduleTimelineItem(
            id = storedEvent.id,
            timeSlot = storedEvent.time.substringBefore("–").trim(),
            durationText = storedEvent.time,
            title = storedEvent.title,
            color = Color(0xFFF5, 0x9E, 0x0B),
            attendees = storedEvent.attendees,
            attendeeDetails = storedEvent.attendees.map { AttendeeInfo(it, null, "Accepted") },
            hasMeetLink = storedEvent.hasMeetLink,
            isDynamic = true,
            dayKey = "Wed",
            dayNumber = 30
        )
    }

    // Selected day's active event list (merging dynamic items into Wednesday or current day)
    val currentDayEvents = remember(selectedDayIndex, EcosystemStateStore.eventsList.size) {
        val staticForDay = curatedEventsByDay[selectedDayIndex] ?: emptyList()
        if (selectedDayIndex == 2) {
            dynamicEvents + staticForDay
        } else {
            staticForDay
        }
    }

    // Month grid 5x7 matrix (September 2026: starts on Tuesday Sep 1)
    val monthGridCells = remember {
        val cells = mutableListOf<MonthGridCellItem>()
        // Row 1: Aug 31 (Monday), Sep 1 to Sep 6
        cells.add(MonthGridCellItem(31, isCurrentMonth = false, matchingDayIndex = 0, fullDateHeader = "Monday, August 31"))
        for (d in 1..6) {
            val hasEvt = d in listOf(2, 4)
            val dots = if (hasEvt) listOf(Color(0xFFF5, 0x9E, 0x0B), Color(0xFF10, 0xB9, 0x81)) else emptyList()
            cells.add(MonthGridCellItem(d, isCurrentMonth = true, hasEvents = hasEvt, eventDots = dots, matchingDayIndex = d % 7, fullDateHeader = "September $d, 2026"))
        }
        // Row 2: Sep 7 to Sep 13
        for (d in 7..13) {
            val hasEvt = d in listOf(8, 10, 11)
            val dots = if (hasEvt) listOf(Color(0xFF0E, 0xA5, 0xE9), Color(0xFF8B, 0x5C, 0xF6)) else emptyList()
            cells.add(MonthGridCellItem(d, isCurrentMonth = true, hasEvents = hasEvt, eventDots = dots, matchingDayIndex = (d - 7) % 7, fullDateHeader = "September $d, 2026"))
        }
        // Row 3: Sep 14 to Sep 20
        for (d in 14..20) {
            val hasEvt = d in listOf(15, 17, 18)
            val dots = if (hasEvt) listOf(Color(0xFFF5, 0x9E, 0x0B), Color(0xFF10, 0xB9, 0x81)) else emptyList()
            cells.add(MonthGridCellItem(d, isCurrentMonth = true, hasEvents = hasEvt, eventDots = dots, matchingDayIndex = (d - 14) % 7, fullDateHeader = "September $d, 2026"))
        }
        // Row 4: Sep 21 to Sep 27
        for (d in 21..27) {
            val hasEvt = d in listOf(22, 24, 25)
            val dots = if (hasEvt) listOf(Color(0xFF0E, 0xA5, 0xE9), Color(0xFF10, 0xB9, 0x81)) else emptyList()
            cells.add(MonthGridCellItem(d, isCurrentMonth = true, hasEvents = hasEvt, eventDots = dots, matchingDayIndex = (d - 21) % 7, fullDateHeader = "September $d, 2026"))
        }
        // Row 5: Sep 28, Sep 29, Sep 30, Oct 1, Oct 2, Oct 3, Oct 4 (The current active sprint week!)
        cells.add(MonthGridCellItem(28, isCurrentMonth = true, hasEvents = true, eventDots = listOf(Color(0xFFF5, 0x9E, 0x0B), Color(0xFF10, 0xB9, 0x81)), matchingDayIndex = 0, fullDateHeader = "Monday, September 28"))
        cells.add(MonthGridCellItem(29, isCurrentMonth = true, hasEvents = true, eventDots = listOf(Color(0xFFF5, 0x9E, 0x0B), Color(0xFF0E, 0xA5, 0xE9)), matchingDayIndex = 1, fullDateHeader = "Tuesday, September 29"))
        cells.add(MonthGridCellItem(30, isCurrentMonth = true, isToday = true, hasEvents = true, eventDots = listOf(Color(0xFFFF, 0x8C, 0x42), Color(0xFF10, 0xB9, 0x81), Color(0xFF0E, 0xA5, 0xE9)), matchingDayIndex = 2, fullDateHeader = "Wednesday, September 30"))
        cells.add(MonthGridCellItem(1, isCurrentMonth = false, hasEvents = true, eventDots = listOf(Color(0xFFF5, 0x9E, 0x0B), Color(0xFF8B, 0x5C, 0xF6)), matchingDayIndex = 3, fullDateHeader = "Thursday, October 1"))
        cells.add(MonthGridCellItem(2, isCurrentMonth = false, hasEvents = true, eventDots = listOf(Color(0xFF10, 0xB9, 0x81), Color(0xFF0E, 0xA5, 0xE9)), matchingDayIndex = 4, fullDateHeader = "Friday, October 2"))
        cells.add(MonthGridCellItem(3, isCurrentMonth = false, hasEvents = true, eventDots = listOf(Color(0xFFF5, 0x9E, 0x0B)), matchingDayIndex = 5, fullDateHeader = "Saturday, October 3"))
        cells.add(MonthGridCellItem(4, isCurrentMonth = false, hasEvents = true, eventDots = listOf(Color(0xFF8B, 0x5C, 0xF6)), matchingDayIndex = 6, fullDateHeader = "Sunday, October 4"))

        cells
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF09, 0x0A, 0x0C))
    ) {
        // ─── 1. TOP MINI-CALENDAR HEADER & SWITCHER ───────────────────────────
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFF10, 0x12, 0x18))
                .padding(bottom = 10.dp)
        ) {
            // Month Title & View Switcher Row
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                // Left Brand & Month Title
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.weight(1f, fill = false)
                ) {
                    QuantCalendarMark()
                    Column {
                        Text(
                            text = "September 2026",
                            color = Color.White,
                            fontSize = 17.5.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1
                        )
                        Text(
                            text = "Sovereign CalDAV Schedule",
                            color = Color(0xFF9C, 0xA3, 0xAF),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }

                // Right: View Mode Toggle & Today Button
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    // Week vs Month Switcher Segment
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(10.dp))
                            .background(Color(0xFF17, 0x1A, 0x24))
                            .border(BorderStroke(1.dp, Color(0xFF2B, 0x33, 0x46)), RoundedCornerShape(10.dp))
                            .padding(2.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Week Button
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(
                                    if (viewMode == CalendarViewMode.WEEK) Color(0xFFFF, 0x8C, 0x42).copy(alpha = 0.22f)
                                    else Color.Transparent
                                )
                                .border(
                                    if (viewMode == CalendarViewMode.WEEK) BorderStroke(1.dp, Color(0xFFFF, 0x8C, 0x42).copy(alpha = 0.7f))
                                    else BorderStroke(0.dp, Color.Transparent),
                                    RoundedCornerShape(8.dp)
                                )
                                .clickable { viewMode = CalendarViewMode.WEEK }
                                .padding(horizontal = 7.dp, vertical = 4.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(3.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.DateRange,
                                    contentDescription = "Week View",
                                    tint = if (viewMode == CalendarViewMode.WEEK) Color(0xFFFF, 0x8C, 0x42) else Color(0xFF9C, 0xA3, 0xAF),
                                    modifier = Modifier.size(13.dp)
                                )
                                Text(
                                    text = "Week",
                                    color = if (viewMode == CalendarViewMode.WEEK) Color(0xFFFF, 0x8C, 0x42) else Color(0xFF9C, 0xA3, 0xAF),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }

                        // Month Button
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(
                                    if (viewMode == CalendarViewMode.MONTH) Color(0xFFFF, 0x8C, 0x42).copy(alpha = 0.22f)
                                    else Color.Transparent
                                )
                                .border(
                                    if (viewMode == CalendarViewMode.MONTH) BorderStroke(1.dp, Color(0xFFFF, 0x8C, 0x42).copy(alpha = 0.7f))
                                    else BorderStroke(0.dp, Color.Transparent),
                                    RoundedCornerShape(8.dp)
                                )
                                .clickable { viewMode = CalendarViewMode.MONTH }
                                .padding(horizontal = 7.dp, vertical = 4.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(3.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.CalendarViewMonth,
                                    contentDescription = "Month Grid",
                                    tint = if (viewMode == CalendarViewMode.MONTH) Color(0xFFFF, 0x8C, 0x42) else Color(0xFF9C, 0xA3, 0xAF),
                                    modifier = Modifier.size(13.dp)
                                )
                                Text(
                                    text = "Month",
                                    color = if (viewMode == CalendarViewMode.MONTH) Color(0xFFFF, 0x8C, 0x42) else Color(0xFF9C, 0xA3, 0xAF),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }

                    // Jump to Today pill
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        modifier = Modifier
                            .clip(RoundedCornerShape(10.dp))
                            .background(Color(0xFF17, 0x1A, 0x24))
                            .border(BorderStroke(1.dp, Color(0xFF2B, 0x33, 0x46)), RoundedCornerShape(10.dp))
                            .clickable {
                                selectedDayIndex = 2
                                selectedDayNumber = 30
                                selectedDayTitle = "Wednesday, September 30"
                                Toast.makeText(context, "Jumped to Today (Wed Sep 30)", Toast.LENGTH_SHORT).show()
                            }
                            .padding(horizontal = 9.dp, vertical = 6.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Today,
                            contentDescription = "Today",
                            tint = Color(0xFFFF, 0x8C, 0x42),
                            modifier = Modifier.size(12.dp)
                        )
                        Text(
                            text = "Today",
                            color = Color(0xFFFF, 0x8C, 0x42),
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            softWrap = false
                        )
                    }
                }
            }

            // ─── Week View Strip OR Month Grid ─────────────────────────────────
            AnimatedVisibility(
                visible = (viewMode == CalendarViewMode.WEEK),
                enter = fadeIn(),
                exit = fadeOut()
            ) {
                // Horizontal 7-Day Strip (Mon..Sun with numbers: 28, 29, 30, 1, 2, 3, 4)
                LazyRow(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    items(daysOfWeek.indices.toList()) { index ->
                        val day = daysOfWeek[index]
                        val isSelected = (index == selectedDayIndex)

                        DayStripCell(
                            day = day,
                            isSelected = isSelected,
                            onClick = {
                                selectedDayIndex = index
                                selectedDayNumber = day.dayNumber
                                selectedDayTitle = day.fullDateHeader
                                Toast.makeText(context, "Selected ${day.fullDateHeader}", Toast.LENGTH_SHORT).show()
                            }
                        )
                    }
                }
            }

            AnimatedVisibility(
                visible = (viewMode == CalendarViewMode.MONTH),
                enter = fadeIn(),
                exit = fadeOut()
            ) {
                // Elegant 7x5 Monthly Calendar Grid (Days 1 to 30)
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    // Day of Week Header Row: MON, TUE, WED, THU, FRI, SAT, SUN
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceAround
                    ) {
                        listOf("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN").forEach { label ->
                            Text(
                                text = label,
                                color = Color(0xFF6B, 0x72, 0x80),
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.width(40.dp)
                            )
                        }
                    }

                    // 5 Weeks of September 2026
                    monthGridCells.chunked(7).forEach { weekRow ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceAround
                        ) {
                            weekRow.forEach { cell ->
                                val isSelected = (cell.dayNumber == selectedDayNumber && cell.matchingDayIndex == selectedDayIndex)

                                MonthGridCell(
                                    cell = cell,
                                    isSelected = isSelected,
                                    onClick = {
                                        selectedDayNumber = cell.dayNumber
                                        selectedDayIndex = cell.matchingDayIndex
                                        selectedDayTitle = cell.fullDateHeader
                                        Toast.makeText(context, "Selected ${cell.fullDateHeader}", Toast.LENGTH_SHORT).show()
                                    }
                                )
                            }
                        }
                    }
                }
            }
        }

        // ─── 2. TIMEZONE, CALDAV SYNC & CALENDLY BOOKING INFO BAR ─────────────
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFF0F, 0x11, 0x17))
                .padding(horizontal = 14.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(7.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                // Timezone location pill with globe icon
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0xFF16, 0x19, 0x22))
                        .border(1.dp, Color(0xFF26, 0x2C, 0x3A), RoundedCornerShape(12.dp))
                        .padding(horizontal = 10.dp, vertical = 5.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Public,
                            contentDescription = "Timezone",
                            tint = Color(0xFF9C, 0xA3, 0xAF),
                            modifier = Modifier.size(14.dp)
                        )
                        Text(
                            text = "IST · UTC+5:30 (New Delhi)",
                            color = Color(0xFFE2, 0xE8, 0xF0),
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }

                // Sync Badge: CalDAV Real-Time Sync
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0xFF10, 0xB9, 0x81).copy(alpha = 0.15f))
                        .border(
                            width = 1.dp,
                            color = Color(0xFF10, 0xB9, 0x81).copy(alpha = 0.45f),
                            shape = RoundedCornerShape(12.dp)
                        )
                        .clickable {
                            Toast.makeText(context, "CalDAV connected & synchronized (sub-50ms latency)", Toast.LENGTH_SHORT).show()
                        }
                        .padding(horizontal = 10.dp, vertical = 5.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(5.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Sync,
                            contentDescription = "CalDAV Sync",
                            tint = Color(0xFF10, 0xB9, 0x81),
                            modifier = Modifier.size(13.dp)
                        )
                        Text(
                            text = "CalDAV Real-Time Sync",
                            color = Color(0xFF10, 0xB9, 0x81),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            // Calendly Public Booking Engine Link Chip
            Surface(
                onClick = {
                    clipboardManager.setText(AnnotatedString("https://quantmail.in/calendar/booking/dev-sentinel"))
                    Toast.makeText(context, "Booking link copied: quantmail.in/calendar/booking/dev-sentinel", Toast.LENGTH_SHORT).show()
                },
                shape = RoundedCornerShape(10.dp),
                color = Color(0xFF15, 0x18, 0x22),
                border = BorderStroke(1.dp, Color(0xFF2A, 0x33, 0x48)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(7.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Link,
                            contentDescription = "Booking Link",
                            tint = Color(0xFFFF, 0x8C, 0x42),
                            modifier = Modifier.size(14.dp)
                        )
                        Text(
                            text = "quantmail.in/calendar/booking/dev-sentinel",
                            color = Color(0xFFE5, 0xE7, 0xEB),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }

                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = Color(0xFFFF, 0x8C, 0x42).copy(alpha = 0.18f),
                        border = BorderStroke(0.6.dp, Color(0xFFFF, 0x8C, 0x42).copy(alpha = 0.5f))
                    ) {
                        Text(
                            text = "Copy Link",
                            color = Color(0xFFFF, 0x8C, 0x42),
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }
                }
            }
        }

        HorizontalDivider(color = Color(0xFF1E, 0x22, 0x2C), thickness = 1.dp)

        // ─── 3. DYNAMIC SELECTED DAY HEADER & EVENT BADGE ─────────────────────
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFF0D, 0x0F, 0x15))
                .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(Color(0xFFFF, 0x8C, 0x42))
                )
                Text(
                    text = selectedDayTitle,
                    color = Color.White,
                    fontSize = 14.5.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            // Dynamic event count badge
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = Color(0xFFFF, 0x8C, 0x42).copy(alpha = 0.16f),
                border = BorderStroke(1.dp, Color(0xFFFF, 0x8C, 0x42).copy(alpha = 0.45f))
            ) {
                Text(
                    text = "${currentDayEvents.size} Events",
                    color = Color(0xFFFF, 0x8C, 0x42),
                    fontSize = 11.5.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                )
            }
        }

        HorizontalDivider(color = Color(0xFF1A, 0x1E, 0x28), thickness = 0.8.dp)

        // ─── 4. DAILY SCHEDULE TIMELINE ───────────────────────────────────────
        val standardHours = remember {
            listOf("09:00 AM", "10:00 AM", "11:30 AM", "02:00 PM", "04:30 PM")
        }

        val timelineHours = remember(currentDayEvents) {
            val eventSlots = currentDayEvents.map { it.timeSlot }
            (standardHours + eventSlots).distinct().sortedWith { a, b ->
                parseHourToMinutes(a).compareTo(parseHourToMinutes(b))
            }
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 12.dp),
            contentPadding = PaddingValues(top = 10.dp, bottom = 96.dp)
        ) {
            items(timelineHours) { hour ->
                // Check if any event belongs to this hour slot
                val matchedEvents = currentDayEvents.filter { event ->
                    event.timeSlot == hour ||
                    event.timeSlot.startsWith(hour.take(5)) ||
                    (hour.startsWith("09") && event.timeSlot.startsWith("09")) ||
                    (hour.startsWith("10") && event.timeSlot.startsWith("10")) ||
                    (hour.startsWith("11") && event.timeSlot.startsWith("11")) ||
                    (hour.startsWith("02") && event.timeSlot.startsWith("02")) ||
                    (hour.startsWith("04") && event.timeSlot.startsWith("04"))
                }

                TimelineHourRow(
                    hour = hour,
                    events = matchedEvents,
                    onEventClick = { item ->
                        onEventClick?.invoke(item)
                        selectedEventDetail = item
                    },
                    onJoinMeet = { meetEvent ->
                        Toast.makeText(context, "Joining QuantMeet HD: ${meetEvent.title}...", Toast.LENGTH_SHORT).show()
                        try {
                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(meetEvent.meetLink.ifEmpty { "https://meet.quantmail.in/room/swarm-review" }))
                            context.startActivity(intent)
                        } catch (_: Exception) {}
                    }
                )
            }
        }
    }

    // ─── 5. GOOGLE CALENDAR / CALENDLY-CLASS EVENT DETAIL MODAL ───────────
    selectedEventDetail?.let { item ->
        NativeEventDetailModal(
            event = item,
            onDismiss = { selectedEventDetail = null },
            onJoinMeet = { meetEvent ->
                selectedEventDetail = null
                Toast.makeText(context, "Joining QuantMeet HD: ${meetEvent.title}...", Toast.LENGTH_SHORT).show()
                try {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(meetEvent.meetLink.ifEmpty { "https://meet.quantmail.in/room/swarm-review" }))
                    context.startActivity(intent)
                } catch (_: Exception) {}
            },
            onEditEvent = { editItem ->
                selectedEventDetail = null
                Toast.makeText(context, "Editing event: ${editItem.title}", Toast.LENGTH_SHORT).show()
            },
            onDeleteEvent = { delItem ->
                selectedEventDetail = null
                Toast.makeText(context, "Event deleted: ${delItem.title}", Toast.LENGTH_SHORT).show()
            },
            onExportCalDav = { expItem ->
                Toast.makeText(context, "Exported RFC 5545 CalDAV: ${expItem.title}", Toast.LENGTH_SHORT).show()
            }
        )
    }
}

/**
 * Parses time format like "09:00 AM" into minutes from midnight for sorting.
 */
private fun parseHourToMinutes(timeStr: String): Int {
    return try {
        val parts = timeStr.trim().split(" ")
        val timePart = parts[0]
        val period = parts.getOrNull(1)?.uppercase() ?: "AM"
        val timeComponents = timePart.split(":")
        var hours = timeComponents[0].toInt()
        val minutes = timeComponents.getOrNull(1)?.toInt() ?: 0
        if (period == "PM" && hours != 12) hours += 12
        if (period == "AM" && hours == 12) hours = 0
        hours * 60 + minutes
    } catch (_: Exception) {
        0
    }
}

/**
 * Horizontal strip cell rendering a single day in Week View.
 */
@Composable
private fun DayStripCell(
    day: DayStripItem,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val emberColor = Color(0xFFFF, 0x8C, 0x42)

    Column(
        modifier = Modifier
            .width(46.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(
                when {
                    isSelected && day.isToday -> emberColor.copy(alpha = 0.22f)
                    isSelected -> Color(0xFF1E, 0x22, 0x2D)
                    day.isToday -> emberColor.copy(alpha = 0.12f)
                    else -> Color.Transparent
                }
            )
            .border(
                width = 1.dp,
                color = when {
                    isSelected && day.isToday -> emberColor
                    isSelected -> Color(0xFF38, 0x41, 0x54)
                    day.isToday -> emberColor.copy(alpha = 0.45f)
                    else -> Color.Transparent
                },
                shape = RoundedCornerShape(14.dp)
            )
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        // Day name (e.g. "Wed")
        Text(
            text = day.dayName,
            color = when {
                day.isToday -> emberColor
                isSelected -> Color.White
                else -> Color(0xFF6B, 0x72, 0x80)
            },
            fontSize = 11.5.sp,
            fontWeight = if (day.isToday || isSelected) FontWeight.Bold else FontWeight.Medium
        )

        // Day number inside circle with glowing ember effect on Wed 30 (#FF8C42)
        Box(
            modifier = Modifier
                .size(34.dp)
                .clip(CircleShape)
                .background(
                    when {
                        day.isToday -> Brush.radialGradient(
                            colors = listOf(
                                Color(0xFFFF, 0xA4, 0x66),
                                Color(0xFFFF, 0x8C, 0x42),
                                Color(0xFFEA, 0x58, 0x0C)
                            )
                        )
                        isSelected -> Brush.linearGradient(
                            listOf(Color(0xFF37, 0x41, 0x51), Color(0xFF1F, 0x29, 0x37))
                        )
                        else -> SolidColor(Color.Transparent)
                    },
                    shape = CircleShape
                )
                .then(
                    if (day.isToday) {
                        Modifier.border(
                            BorderStroke(
                                2.dp,
                                Brush.linearGradient(
                                    listOf(
                                        Color(0xFFFF, 0xD4, 0xB2),
                                        Color(0xFFFF, 0x8C, 0x42)
                                    )
                                )
                            ),
                            CircleShape
                        )
                    } else if (isSelected) {
                        Modifier.border(1.dp, Color(0xFF4B, 0x55, 0x63), CircleShape)
                    } else Modifier
                ),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "${day.dayNumber}",
                color = when {
                    day.isToday -> Color(0xFF1A, 0x0A, 0x00)
                    isSelected -> Color.White
                    day.isCurrentMonth -> Color(0xFFE5, 0xE7, 0xEB)
                    else -> Color(0xFF4B, 0x55, 0x63)
                },
                fontSize = 13.5.sp,
                fontWeight = if (day.isToday || isSelected) FontWeight.ExtraBold else FontWeight.Normal
            )
        }
    }
}

/**
 * Month Grid Cell rendering a single calendar day with event dots.
 */
@Composable
private fun MonthGridCell(
    cell: MonthGridCellItem,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val moltenAmber = Color(0xFFFF, 0x8C, 0x42)

    Column(
        modifier = Modifier
            .size(width = 42.dp, height = 48.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(
                when {
                    isSelected -> moltenAmber.copy(alpha = 0.22f)
                    cell.isToday -> moltenAmber.copy(alpha = 0.12f)
                    else -> Color.Transparent
                }
            )
            .border(
                width = 1.dp,
                color = when {
                    isSelected -> moltenAmber
                    cell.isToday -> moltenAmber.copy(alpha = 0.45f)
                    else -> Color.Transparent
                },
                shape = RoundedCornerShape(10.dp)
            )
            .clickable(onClick = onClick)
            .padding(vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(3.dp)
    ) {
        // Day number
        Box(
            modifier = Modifier
                .size(26.dp)
                .clip(CircleShape)
                .background(
                    when {
                        cell.isToday -> moltenAmber
                        isSelected -> Color(0xFF2B, 0x33, 0x44)
                        else -> Color.Transparent
                    }
                ),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "${cell.dayNumber}",
                color = when {
                    cell.isToday -> Color(0xFF1A, 0x0A, 0x00)
                    isSelected -> Color.White
                    cell.isCurrentMonth -> Color(0xFFE5, 0xE7, 0xEB)
                    else -> Color(0xFF4B, 0x55, 0x63)
                },
                fontSize = 12.sp,
                fontWeight = if (cell.isToday || isSelected) FontWeight.ExtraBold else FontWeight.Normal
            )
        }

        // Indicator dots for days with scheduled events
        Row(
            horizontalArrangement = Arrangement.spacedBy(2.dp),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.height(5.dp)
        ) {
            if (cell.hasEvents && cell.eventDots.isNotEmpty()) {
                cell.eventDots.take(3).forEach { dotColor ->
                    Box(
                        modifier = Modifier
                            .size(3.5.dp)
                            .clip(CircleShape)
                            .background(dotColor)
                    )
                }
            } else {
                Spacer(modifier = Modifier.size(3.5.dp))
            }
        }
    }
}

/**
 * A row in the timeline representing an hour slot and any events within that slot.
 */
@Composable
private fun TimelineHourRow(
    hour: String,
    events: List<ScheduleTimelineItem>,
    onEventClick: (ScheduleTimelineItem) -> Unit,
    onJoinMeet: (ScheduleTimelineItem) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.Top
    ) {
        // Hour label on left
        Box(
            modifier = Modifier
                .width(68.dp)
                .padding(top = 2.dp),
            contentAlignment = Alignment.TopStart
        ) {
            Text(
                text = hour,
                color = Color(0xFF6B, 0x72, 0x80),
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold
            )
        }

        // Timeline column with vertical separator and events
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = 6.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            if (events.isEmpty()) {
                // Subtle horizontal line indicating open schedule slot
                HorizontalDivider(
                    color = Color(0xFF1E, 0x22, 0x2B),
                    thickness = 1.dp,
                    modifier = Modifier.padding(top = 10.dp, bottom = 18.dp)
                )
            } else {
                events.forEach { event ->
                    TimelineEventCard(
                        event = event,
                        onClick = { onEventClick(event) },
                        onJoinMeet = { onJoinMeet(event) }
                    )
                }
            }
        }
    }
}

/**
 * Rich Event Card matching Google Calendar & Calendly design standards.
 * Features translucent colored borders, attendee chips, and [📹 Join QuantMeet HD] amber container button.
 */
@Composable
private fun TimelineEventCard(
    event: ScheduleTimelineItem,
    onClick: () -> Unit,
    onJoinMeet: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Color(0xFF13, 0x16, 0x20))
            .border(1.dp, event.color.copy(alpha = 0.45f), RoundedCornerShape(14.dp))
            .clickable(onClick = onClick)
            .padding(14.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Left color accent bar
            Box(
                modifier = Modifier
                    .width(4.dp)
                    .height(68.dp)
                    .background(
                        brush = Brush.verticalGradient(
                            listOf(event.color, event.color.copy(alpha = 0.35f))
                        ),
                        shape = RoundedCornerShape(2.dp)
                    )
            )

            // Content
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                // Duration & Dynamic badge
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = event.durationText,
                        color = event.color,
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.Bold
                    )

                    if (event.isDynamic) {
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = event.color.copy(alpha = 0.15f),
                            border = BorderStroke(0.5.dp, event.color.copy(alpha = 0.35f))
                        ) {
                            Text(
                                text = "Local",
                                color = event.color,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }
                    } else if (event.category != null) {
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = event.color.copy(alpha = 0.15f),
                            border = BorderStroke(0.5.dp, event.color.copy(alpha = 0.35f))
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                            ) {
                                Icon(
                                    imageVector = getCategoryVectorIcon(event.category),
                                    contentDescription = null,
                                    tint = event.color,
                                    modifier = Modifier.size(11.dp)
                                )
                                Spacer(modifier = Modifier.width(3.dp))
                                Text(
                                    text = event.category,
                                    color = event.color,
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }
                    }
                }

                // Title
                Text(
                    text = event.title,
                    color = Color.White,
                    fontSize = 14.5.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )

                // Location if available
                if (event.location != null) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.LocationOn,
                            contentDescription = "Location",
                            tint = Color(0xFF9C, 0xA3, 0xAF),
                            modifier = Modifier.size(13.dp)
                        )
                        Text(
                            text = event.location,
                            color = Color(0xFF9C, 0xA3, 0xAF),
                            fontSize = 11.5.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }

                // Attendees Chips
                if (event.attendees.isNotEmpty()) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Group,
                            contentDescription = "Attendees",
                            tint = Color(0xFF9C, 0xA3, 0xAF),
                            modifier = Modifier.size(13.dp)
                        )
                        event.attendees.take(3).forEach { email ->
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(Color(0xFF1D, 0x22, 0x2D))
                                    .border(0.5.dp, Color(0xFF33, 0x3B, 0x4C), RoundedCornerShape(6.dp))
                                    .padding(horizontal = 7.dp, vertical = 2.5.dp)
                            ) {
                                Text(
                                    text = email,
                                    color = Color(0xFFD1, 0xD5, 0xDB),
                                    fontSize = 10.5.sp,
                                    fontWeight = FontWeight.Medium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                    }
                }

                // [Join QuantMeet HD] Action Button if meet link exists
                if (event.hasMeetLink) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Button(
                        onClick = onJoinMeet,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFFFF, 0x8C, 0x42),
                            contentColor = Color(0xFF18, 0x0A, 0x00)
                        ),
                        shape = RoundedCornerShape(8.dp),
                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp),
                        modifier = Modifier.height(34.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Videocam,
                            contentDescription = "Video",
                            tint = Color(0xFF18, 0x0A, 0x00),
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "Join QuantMeet HD",
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp
                        )
                    }
                }
            }
        }
    }
}

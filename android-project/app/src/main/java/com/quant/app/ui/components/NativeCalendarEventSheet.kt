package com.quant.app.ui.components

import android.widget.Toast
import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Modal sheet for creating new QuantCalendar events.
 * Features:
 * - Header: Close [✕], Title "New Event", Save button [Save Event] (Amber #F59E0B).
 * - Title input ("Sprint Planning & Architecture Review").
 * - Date & Time pickers ("Today · 10:00 AM – 11:00 AM" with duration quick chips).
 * - Attendees text field with chip styling ("team@quantmail.in").
 * - "Add QuantMeet HD Video link" switch toggle (default true).
 * - Timezone badge ("IST · UTC+5:30").
 */
@Composable
fun NativeCalendarEventSheet(
    onDismiss: () -> Unit,
    onSave: (title: String, dateTime: String, attendees: List<String>, isMeetLink: Boolean) -> Unit,
    accentColor: Color = Color(0xFFF5, 0x9E, 0x0B), // Calendar Amber
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val scrollState = rememberScrollState()

    var title by remember { mutableStateOf("Sprint Planning & Architecture Review") }
    var selectedDateTime by remember { mutableStateOf("Today · 10:00 AM – 11:00 AM") }
    var selectedDuration by remember { mutableStateOf("1h") }
    var attendeeInput by remember { mutableStateOf("") }
    val attendeeChips = remember {
        mutableStateListOf("team@quantmail.in")
    }
    var isMeetLinkEnabled by remember { mutableStateOf(true) }
    var notes by remember { mutableStateOf("") }

    // Intercept native hardware back press to dismiss cleanly
    BackHandler(onBack = onDismiss)

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF0F, 0x11, 0x15))
            .statusBarsPadding()
            .imePadding()
    ) {
        // 1. Header Bar: Close [✕], Title "New Event", Save [Save Event]
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(60.dp)
                .padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                IconButton(onClick = onDismiss) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = "Close",
                        tint = Color.White
                    )
                }

                Text(
                    text = "New Event",
                    color = Color.White,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            // Save Event button (Amber Color(0xFFF5, 0x9E, 0x0B))
            Button(
                onClick = {
                    if (title.isBlank()) {
                        Toast.makeText(context, "Please enter an event title", Toast.LENGTH_SHORT).show()
                        return@Button
                    }
                    val allAttendees = (attendeeChips + listOf(attendeeInput.trim()).filter { it.isNotBlank() })
                    com.quant.app.data.EcosystemStateStore.addEvent(
                        title = title,
                        time = selectedDateTime,
                        attendees = allAttendees,
                        hasMeetLink = isMeetLinkEnabled
                    )
                    onSave(title, selectedDateTime, allAttendees, isMeetLinkEnabled)
                    Toast.makeText(context, "📅 Event scheduled: $title", Toast.LENGTH_SHORT).show()
                    onDismiss()
                },
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = accentColor,
                    contentColor = Color.Black
                ),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Check,
                        contentDescription = "Save",
                        tint = Color.Black,
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        text = "Save Event",
                        color = Color.Black,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }

        HorizontalDivider(thickness = 0.5.dp, color = Color(0xFF26, 0x2A, 0x33))

        // 2. Scrollable Event Form
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(scrollState)
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            // Event Title Input
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = "EVENT TITLE",
                    color = Color(0xFF9C, 0xA3, 0xAF),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 1.sp
                )

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0xFF16, 0x18, 0x1D))
                        .border(1.dp, Color(0xFF26, 0x2A, 0x33), RoundedCornerShape(12.dp))
                        .padding(horizontal = 14.dp, vertical = 12.dp)
                ) {
                    BasicTextField(
                        value = title,
                        onValueChange = { title = it },
                        textStyle = TextStyle(
                            color = Color.White,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Medium
                        ),
                        cursorBrush = SolidColor(accentColor),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        decorationBox = { innerTextField ->
                            if (title.isEmpty()) {
                                Text(
                                    text = "Add title...",
                                    color = Color(0xFF6B, 0x72, 0x80),
                                    fontSize = 16.sp
                                )
                            }
                            innerTextField()
                        }
                    )
                }
            }

            // Date & Time Picker Section with Timezone Badge
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "SCHEDULE & TIME",
                        color = Color(0xFF9C, 0xA3, 0xAF),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = 1.sp
                    )

                    // Timezone Badge ("IST · UTC+5:30")
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(accentColor.copy(alpha = 0.12f))
                            .border(1.dp, accentColor.copy(alpha = 0.35f), RoundedCornerShape(6.dp))
                            .padding(horizontal = 8.dp, vertical = 3.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Public,
                                contentDescription = "Timezone",
                                tint = accentColor,
                                modifier = Modifier.size(12.dp)
                            )
                            Text(
                                text = "IST · UTC+5:30",
                                color = accentColor,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }

                // Interactive Date & Time Card
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0xFF16, 0x18, 0x1D))
                        .border(1.dp, Color(0xFF26, 0x2A, 0x33), RoundedCornerShape(12.dp))
                        .padding(14.dp)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(36.dp)
                                    .clip(CircleShape)
                                    .background(accentColor.copy(alpha = 0.15f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Default.CalendarToday,
                                    contentDescription = "Calendar",
                                    tint = accentColor,
                                    modifier = Modifier.size(18.dp)
                                )
                            }

                            Column {
                                Text(
                                    text = selectedDateTime,
                                    color = Color.White,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                                Text(
                                    text = "Repeats: Does not repeat · 10 min reminder",
                                    color = Color(0xFF9C, 0xA3, 0xAF),
                                    fontSize = 12.sp
                                )
                            }
                        }

                        // Duration Pills (30m, 1h, 1.5h, All day)
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            listOf("30m", "1h", "1.5h", "All day").forEach { duration ->
                                val isSelected = selectedDuration == duration
                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(
                                            if (isSelected) accentColor.copy(alpha = 0.2f)
                                            else Color(0xFF1E, 0x22, 0x2B)
                                        )
                                        .border(
                                            1.dp,
                                            if (isSelected) accentColor else Color(0xFF2E, 0x34, 0x42),
                                            RoundedCornerShape(8.dp)
                                        )
                                        .clickable {
                                            selectedDuration = duration
                                            selectedDateTime = when (duration) {
                                                "30m" -> "Today · 10:00 AM – 10:30 AM"
                                                "1h" -> "Today · 10:00 AM – 11:00 AM"
                                                "1.5h" -> "Today · 10:00 AM – 11:30 AM"
                                                else -> "Today · All Day"
                                            }
                                        }
                                        .padding(vertical = 6.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = duration,
                                        color = if (isSelected) accentColor else Color(0xFFD1, 0xD5, 0xDB),
                                        fontSize = 12.sp,
                                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // Attendees Section with Chips
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = "ATTENDEES",
                    color = Color(0xFF9C, 0xA3, 0xAF),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 1.sp
                )

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0xFF16, 0x18, 0x1D))
                        .border(1.dp, Color(0xFF26, 0x2A, 0x33), RoundedCornerShape(12.dp))
                        .padding(horizontal = 14.dp, vertical = 10.dp)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (attendeeChips.isNotEmpty()) {
                            LazyRow(
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                items(attendeeChips) { chip ->
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(Color(0xFF1E, 0x22, 0x2B))
                                            .border(1.dp, Color(0xFF2E, 0x34, 0x42), RoundedCornerShape(8.dp))
                                            .padding(horizontal = 8.dp, vertical = 4.dp)
                                    ) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.People,
                                                contentDescription = null,
                                                tint = accentColor,
                                                modifier = Modifier.size(12.dp)
                                            )
                                            Text(
                                                text = chip,
                                                color = Color(0xFFE5, 0xE7, 0xEB),
                                                fontSize = 12.sp,
                                                fontWeight = FontWeight.Medium
                                            )
                                            Icon(
                                                imageVector = Icons.Default.Close,
                                                contentDescription = "Remove",
                                                tint = Color(0xFF9C, 0xA3, 0xAF),
                                                modifier = Modifier
                                                    .size(14.dp)
                                                    .clickable { attendeeChips.remove(chip) }
                                            )
                                        }
                                    }
                                }
                            }
                        }

                        BasicTextField(
                            value = attendeeInput,
                            onValueChange = { text ->
                                if (text.endsWith(",") || text.endsWith(" ") || text.endsWith("\n")) {
                                    val clean = text.trim(',', ' ', '\n')
                                    if (clean.isNotBlank() && !attendeeChips.contains(clean)) {
                                        attendeeChips.add(clean)
                                    }
                                    attendeeInput = ""
                                } else {
                                    attendeeInput = text
                                }
                            },
                            textStyle = TextStyle(
                                color = Color.White,
                                fontSize = 14.sp
                            ),
                            cursorBrush = SolidColor(accentColor),
                            singleLine = true,
                            decorationBox = { innerTextField ->
                                Box {
                                    if (attendeeInput.isEmpty()) {
                                        Text(
                                            text = "Add attendees (type email and space/comma)...",
                                            color = Color(0xFF6B, 0x72, 0x80),
                                            fontSize = 13.sp
                                        )
                                    }
                                    innerTextField()
                                }
                            }
                        )
                    }
                }
            }

            // QuantMeet HD Video Link Toggle
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color(0xFF16, 0x18, 0x1D))
                    .border(1.dp, Color(0xFF26, 0x2A, 0x33), RoundedCornerShape(12.dp))
                    .padding(14.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        modifier = Modifier.weight(1f),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(CircleShape)
                                .background(Color(0xFF3B, 0x82, 0xF6).copy(alpha = 0.15f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.Videocam,
                                contentDescription = "QuantMeet Video",
                                tint = Color(0xFF60, 0xA5, 0xFA),
                                modifier = Modifier.size(20.dp)
                            )
                        }

                        Column {
                            Text(
                                text = "Add QuantMeet HD Video link",
                                color = Color.White,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                text = "End-to-end encrypted audio/video conference",
                                color = Color(0xFF9C, 0xA3, 0xAF),
                                fontSize = 12.sp
                            )
                        }
                    }

                    Switch(
                        checked = isMeetLinkEnabled,
                        onCheckedChange = { isMeetLinkEnabled = it },
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = Color.Black,
                            checkedTrackColor = accentColor,
                            uncheckedThumbColor = Color(0xFF9C, 0xA3, 0xAF),
                            uncheckedTrackColor = Color(0xFF26, 0x2A, 0x33)
                        )
                    )
                }
            }

            // Event Notes / Agenda
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = "NOTES & AGENDA",
                    color = Color(0xFF9C, 0xA3, 0xAF),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 1.sp
                )

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(90.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0xFF16, 0x18, 0x1D))
                        .border(1.dp, Color(0xFF26, 0x2A, 0x33), RoundedCornerShape(12.dp))
                        .padding(14.dp)
                ) {
                    BasicTextField(
                        value = notes,
                        onValueChange = { notes = it },
                        textStyle = TextStyle(
                            color = Color.White,
                            fontSize = 14.sp,
                            lineHeight = 20.sp
                        ),
                        cursorBrush = SolidColor(accentColor),
                        modifier = Modifier.fillMaxSize(),
                        decorationBox = { innerTextField ->
                            if (notes.isEmpty()) {
                                Text(
                                    text = "Add agenda, meeting documents or video link notes...",
                                    color = Color(0xFF6B, 0x72, 0x80),
                                    fontSize = 13.sp
                                )
                            }
                            innerTextField()
                        }
                    )
                }
            }
        }
    }
}

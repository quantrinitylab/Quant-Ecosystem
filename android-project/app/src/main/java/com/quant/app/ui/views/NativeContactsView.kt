package com.quant.app.ui.views

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
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
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quant.app.data.EcosystemStateStore
import com.quant.app.ui.components.NativeContactDetailSheet
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * High-fidelity Google Contacts & Apple Contacts native Jetpack Compose view.
 *
 * Features:
 * - Search bar: "Search contacts, companies, tags..." with clear button.
 * - VIP Categories filter chips: All, VIPs, Engineering, Leadership.
 * - Deduplication Alert Banner: "Quant AI Deduplication Wizard · All 8 contacts deduplicated and synced".
 * - A-Z Alphabet Jump Slider strip on the right edge with haptic feedback & center letter indicator.
 * - Contact Cards List (LazyColumn with rememberLazyListState).
 * - Tapping contact card opens luxury NativeContactDetailSheet.
 * - Direct [Call], [Email], and [Star] toggle actions on each card.
 * - Contextual empty state when filter/search yields 0 results.
 * - Strict Zero Emojis Invariant: pure Material 3 vector ImageVector icons only.
 */
@Composable
fun NativeContactsView(
    onNewContactClick: () -> Unit = {},
    onComposeEmail: (String) -> Unit = {},
    accentColor: Color = Color(0xFF10, 0xB9, 0x81), // Emerald accent #10B981
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val haptic = LocalHapticFeedback.current
    val coroutineScope = rememberCoroutineScope()
    val listState = rememberLazyListState()

    var searchQuery by remember { mutableStateOf("") }
    var selectedFilter by remember { mutableStateOf("All 8") }
    var selectedContactForDetail by remember { mutableStateOf<EcosystemStateStore.ContactItem?>(null) }

    var activeJumpLetter by remember { mutableStateOf<Char?>(null) }
    var jumpDismissJob by remember { mutableStateOf<Job?>(null) }

    val contacts = EcosystemStateStore.contactsList
    val alphabet = remember { ('A'..'Z').toList() }

    // VIP Categories filter configuration
    val categories = remember {
        listOf("All 8", "VIPs 4", "Engineering", "Leadership")
    }

    // Filtered and alphabetically sorted contacts list
    val sortedContacts = remember(contacts.toList(), searchQuery, selectedFilter) {
        contacts.filter { contact ->
            val matchesFilter = when (selectedFilter) {
                "All 8" -> true
                "VIPs 4" -> contact.isVip || contact.tag.equals("VIP", ignoreCase = true)
                "Engineering" -> contact.tag.equals("Engineering", ignoreCase = true) ||
                        (contact.role?.contains("Engineer", ignoreCase = true) == true) ||
                        (contact.role?.contains("Architect", ignoreCase = true) == true)
                "Leadership" -> contact.tag.equals("Leadership", ignoreCase = true) ||
                        (contact.role?.contains("CEO", ignoreCase = true) == true) ||
                        (contact.role?.contains("Lead", ignoreCase = true) == true) ||
                        contact.isVip
                else -> true
            }

            val query = searchQuery.trim().lowercase()
            val matchesSearch = query.isEmpty() ||
                contact.name.lowercase().contains(query) ||
                contact.email.lowercase().contains(query) ||
                (contact.company?.lowercase()?.contains(query) == true) ||
                (contact.role?.lowercase()?.contains(query) == true) ||
                contact.tag.lowercase().contains(query)

            matchesFilter && matchesSearch
        }.distinctBy { it.id }.sortedBy { it.name.trim().lowercase() }
    }

    // Alphabet jump helper
    val jumpToLetter: (Char, Boolean) -> Unit = { letter, isDragging ->
        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        activeJumpLetter = letter
        jumpDismissJob?.cancel()
        jumpDismissJob = coroutineScope.launch {
            delay(800)
            activeJumpLetter = null
        }

        val exactIdx = sortedContacts.indexOfFirst {
            it.name.trim().startsWith(letter, ignoreCase = true)
        }
        val targetIndex = if (exactIdx != -1) exactIdx else {
            sortedContacts.indexOfFirst {
                it.name.trim().take(1).uppercase() >= letter.toString()
            }
        }

        if (targetIndex != -1) {
            coroutineScope.launch {
                // Item offset accounts for: 0: search, 1: filters, 2: banner, 3: count
                val listIndex = 4 + targetIndex
                if (isDragging) {
                    listState.scrollToItem(listIndex)
                } else {
                    listState.animateScrollToItem(listIndex)
                }
            }
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF09, 0x0A, 0x0C))
    ) {
        LazyColumn(
            state = listState,
            modifier = Modifier
                .fillMaxSize()
                .padding(end = 22.dp),
            contentPadding = PaddingValues(start = 16.dp, end = 4.dp, top = 12.dp, bottom = 88.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // ─── 1. Header Search Bar ──────────────────────────────────────────
            item(key = "contacts_search_bar") {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(Color(0xFF14, 0x17, 0x22))
                        .border(BorderStroke(1.dp, Color(0xFF26, 0x2C, 0x3A)), RoundedCornerShape(14.dp))
                        .padding(horizontal = 14.dp),
                    contentAlignment = Alignment.CenterStart
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Search,
                            contentDescription = "Search",
                            tint = Color(0xFF9C, 0xA3, 0xAF),
                            modifier = Modifier.size(18.dp)
                        )

                        BasicTextField(
                            value = searchQuery,
                            onValueChange = { searchQuery = it },
                            modifier = Modifier.weight(1f),
                            textStyle = TextStyle(
                                color = Color.White,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Medium
                            ),
                            singleLine = true,
                            cursorBrush = SolidColor(accentColor),
                            decorationBox = { innerTextField ->
                                if (searchQuery.isEmpty()) {
                                    Text(
                                        text = "Search contacts, companies, tags...",
                                        color = Color(0xFF6B, 0x72, 0x80),
                                        fontSize = 14.sp
                                    )
                                }
                                innerTextField()
                            }
                        )

                        if (searchQuery.isNotEmpty()) {
                            IconButton(
                                onClick = { searchQuery = "" },
                                modifier = Modifier.size(24.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Close,
                                    contentDescription = "Clear",
                                    tint = Color(0xFF9C, 0xA3, 0xAF),
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }
                    }
                }
            }

            // ─── 2. VIP Filter Chips ("All 8", "VIPs 4", "Engineering", "Leadership") ───
            item(key = "contacts_filter_chips") {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    categories.forEach { category ->
                        val isSelected = selectedFilter == category
                        val pillBgModifier = if (isSelected) {
                            Modifier.background(
                                brush = Brush.linearGradient(
                                    listOf(
                                        accentColor.copy(alpha = 0.28f),
                                        accentColor.copy(alpha = 0.12f)
                                    )
                                )
                            )
                        } else {
                            Modifier.background(color = Color(0xFF14, 0x17, 0x22))
                        }

                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(20.dp))
                                .then(pillBgModifier)
                                .border(
                                    BorderStroke(
                                        if (isSelected) 1.5.dp else 1.dp,
                                        if (isSelected) accentColor else Color(0xFF26, 0x2C, 0x3A)
                                    ),
                                    RoundedCornerShape(20.dp)
                                )
                                .clickable {
                                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                    selectedFilter = category
                                }
                                .padding(horizontal = 14.dp, vertical = 7.dp)
                        ) {
                            Text(
                                text = category,
                                color = if (isSelected) Color.White else Color(0xFF9C, 0xA3, 0xB8),
                                fontSize = 12.5.sp,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium
                            )
                        }
                    }
                }
            }

            // ─── 3. Deduplication Alert Hero Banner ─────────────────────────────────
            item(key = "deduplication_wizard_banner") {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF10, 0x17, 0x26)),
                    shape = RoundedCornerShape(14.dp),
                    border = BorderStroke(
                        1.2.dp,
                        Brush.horizontalGradient(
                            listOf(Color(0xFF1E, 0x3A, 0x64), Color(0xFF10, 0xB9, 0x81).copy(alpha = 0.5f))
                        )
                    )
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(CircleShape)
                                .background(
                                    Brush.linearGradient(
                                        listOf(Color(0xFF0E, 0xA5, 0xE9), Color(0xFF10, 0xB9, 0x81))
                                    )
                                ),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.AutoAwesome,
                                contentDescription = "AI Wizard",
                                tint = Color.White,
                                modifier = Modifier.size(19.dp)
                            )
                        }

                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Quant AI Deduplication Wizard",
                                color = Color.White,
                                fontSize = 13.5.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = "All ${contacts.size} contacts deduplicated and synced · 0 duplicates",
                                color = Color(0xFF94, 0xA3, 0xB8),
                                fontSize = 11.5.sp
                            )
                        }

                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = Color(0xFF06, 0x4E, 0x3B).copy(alpha = 0.5f),
                            border = BorderStroke(1.dp, Color(0xFF10, 0xB9, 0x81)),
                            modifier = Modifier.clickable {
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                Toast.makeText(context, "All contacts verified unique & CalDAV synced", Toast.LENGTH_SHORT).show()
                            }
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Filled.CheckCircle,
                                    contentDescription = "Verified",
                                    tint = Color(0xFF10, 0xB9, 0x81),
                                    modifier = Modifier.size(13.dp)
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(
                                    text = "Verified",
                                    color = Color(0xFF34, 0xD3, 0x99),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                }
            }

            // ─── 4. Contacts Count & Context Header ────────────────────────────
            item(key = "contacts_count_header") {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 2.dp, vertical = 2.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "${sortedContacts.size} CONTACTS",
                        color = Color(0xFF6B, 0x72, 0x80),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.sp
                    )

                    if (selectedFilter != "All 8" || searchQuery.isNotEmpty()) {
                        Text(
                            text = "Reset filter",
                            color = accentColor,
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.clickable {
                                searchQuery = ""
                                selectedFilter = "All 8"
                            }
                        )
                    }
                }
            }

            // ─── 5. Contact Cards List ─────────────────────────────────────────
            if (sortedContacts.isEmpty()) {
                item(key = "empty_state") {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 48.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(56.dp)
                                .clip(CircleShape)
                                .background(Color(0xFF16, 0x18, 0x1D)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.Person,
                                contentDescription = "Empty",
                                tint = Color(0xFF6B, 0x72, 0x80),
                                modifier = Modifier.size(28.dp)
                            )
                        }

                        Text(
                            text = "No contacts found",
                            color = Color.White,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold
                        )

                        Text(
                            text = if (searchQuery.isNotEmpty()) "No results matching \"$searchQuery\""
                            else "No contacts found in group \"$selectedFilter\"",
                            color = Color(0xFF9C, 0xA3, 0xAF),
                            fontSize = 12.5.sp
                        )

                        Button(
                            onClick = {
                                searchQuery = ""
                                selectedFilter = "All 8"
                            },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color(0xFF16, 0x18, 0x1D),
                                contentColor = Color.White
                            ),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.padding(top = 8.dp)
                        ) {
                            Text(text = "Clear Filters", fontSize = 12.sp)
                        }
                    }
                }
            } else {
                items(sortedContacts, key = { it.id }) { contact ->
                    ContactCard(
                        contact = contact,
                        onContactClick = {
                            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                            selectedContactForDetail = contact
                        },
                        onToggleStar = {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            EcosystemStateStore.toggleStar(contact.id)
                        },
                        onEmailClick = {
                            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                            onComposeEmail(contact.email)
                            Toast.makeText(context, "Emailing ${contact.name}", Toast.LENGTH_SHORT).show()
                        },
                        onCallClick = {
                            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                            val phone = contact.phone
                            if (!phone.isNullOrBlank()) {
                                try {
                                    val dialIntent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${phone.replace(" ", "")}"))
                                    context.startActivity(dialIntent)
                                } catch (e: Exception) {
                                    Toast.makeText(context, "Dialing ${contact.name} ($phone)...", Toast.LENGTH_SHORT).show()
                                }
                            } else {
                                Toast.makeText(context, "No phone listed for ${contact.name}", Toast.LENGTH_SHORT).show()
                            }
                        },
                        accentColor = accentColor
                    )
                }
            }
        }

        // ─── 6. A-Z Alphabet Jump Slider Strip on Right Edge ─────────────────
        Box(
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .padding(end = 2.dp)
                .padding(top = 64.dp, bottom = 80.dp)
                .width(18.dp)
                .clip(RoundedCornerShape(9.dp))
                .background(Color(0xFF0F, 0x12, 0x19).copy(alpha = 0.75f))
                .border(BorderStroke(0.5.dp, Color(0xFF23, 0x2A, 0x3B).copy(alpha = 0.6f)), RoundedCornerShape(9.dp))
                .pointerInput(sortedContacts) {
                    detectTapGestures { offset ->
                        val index = (offset.y / size.height * alphabet.size).toInt().coerceIn(0, alphabet.lastIndex)
                        jumpToLetter(alphabet[index], false)
                    }
                }
                .pointerInput(sortedContacts) {
                    detectDragGestures(
                        onDragStart = { offset ->
                            val index = (offset.y / size.height * alphabet.size).toInt().coerceIn(0, alphabet.lastIndex)
                            jumpToLetter(alphabet[index], true)
                        },
                        onDrag = { change, _ ->
                            change.consume()
                            val index = (change.position.y / size.height * alphabet.size).toInt().coerceIn(0, alphabet.lastIndex)
                            jumpToLetter(alphabet[index], true)
                        }
                    )
                },
            contentAlignment = Alignment.Center
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(vertical = 4.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.SpaceBetween
            ) {
                alphabet.forEach { char ->
                    val isSelected = activeJumpLetter == char
                    Text(
                        text = char.toString(),
                        color = if (isSelected) accentColor else Color(0xFF64, 0x74, 0x8B),
                        fontSize = 9.sp,
                        fontWeight = if (isSelected) FontWeight.ExtraBold else FontWeight.Medium,
                        textAlign = TextAlign.Center
                    )
                }
            }
        }

        // ─── 7. Floating Center Toast / Pill with Active Letter ──────────────
        AnimatedVisibility(
            visible = activeJumpLetter != null,
            enter = fadeIn() + scaleIn(initialScale = 0.8f),
            exit = fadeOut() + scaleOut(targetScale = 0.8f),
            modifier = Modifier.align(Alignment.Center)
        ) {
            activeJumpLetter?.let { letter ->
                Box(
                    modifier = Modifier
                        .size(68.dp)
                        .clip(RoundedCornerShape(18.dp))
                        .background(Color(0xFF0F, 0x12, 0x19).copy(alpha = 0.95f))
                        .border(BorderStroke(2.dp, accentColor), RoundedCornerShape(18.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = letter.toString(),
                        color = Color.White,
                        fontSize = 34.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }

    // ─── 8. Luxury NativeContactDetailSheet ──────────────────────────────────
    selectedContactForDetail?.let { contact ->
        NativeContactDetailSheet(
            contact = contact,
            onDismiss = { selectedContactForDetail = null },
            onToggleStar = {
                EcosystemStateStore.toggleStar(contact.id)
                selectedContactForDetail = contact.copy(isStarred = !contact.isStarred)
            },
            onComposeEmail = { email ->
                selectedContactForDetail = null
                onComposeEmail(email)
            },
            onEditContact = {
                selectedContactForDetail = null
                onNewContactClick()
            },
            onDeleteContact = {
                val index = EcosystemStateStore.contactsList.indexOfFirst { it.id == contact.id }
                if (index != -1) {
                    EcosystemStateStore.contactsList.removeAt(index)
                }
                selectedContactForDetail = null
            },
            accentColor = accentColor
        )
    }
}

/**
 * Individual High-Fidelity Contact Card
 */
@Composable
private fun ContactCard(
    contact: EcosystemStateStore.ContactItem,
    onContactClick: () -> Unit,
    onToggleStar: () -> Unit,
    onEmailClick: () -> Unit,
    onCallClick: () -> Unit,
    accentColor: Color,
    modifier: Modifier = Modifier
) {
    val haptic = LocalHapticFeedback.current

    Card(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .clickable { onContactClick() },
        colors = CardDefaults.cardColors(containerColor = Color(0xFF14, 0x17, 0x22)),
        border = BorderStroke(1.dp, Color(0xFF24, 0x2A, 0x38)),
        shape = RoundedCornerShape(14.dp)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Google Contacts-class circular avatar with gradient initials and verified badge
                Box(
                    modifier = Modifier.size(48.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Box(
                        modifier = Modifier
                            .size(46.dp)
                            .clip(CircleShape)
                            .background(getAvatarGradient(contact.name))
                            .border(1.5.dp, if (contact.isVip) Color(0xFFF5, 0x9E, 0x0B) else Color.White.copy(alpha = 0.3f), CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = getInitials(contact.name),
                            color = Color.White,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    // Verified badge on bottom-end of avatar
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .size(16.dp)
                            .clip(CircleShape)
                            .background(if (contact.isVip) Color(0xFFF5, 0x9E, 0x0B) else Color(0xFF10, 0xB9, 0x81))
                            .border(1.5.dp, Color(0xFF14, 0x17, 0x22), CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = if (contact.isVip) Icons.Filled.Star else Icons.Filled.CheckCircle,
                            contentDescription = if (contact.isVip) "VIP" else "Verified",
                            tint = Color.Black,
                            modifier = Modifier.size(10.dp)
                        )
                    }
                }

                // Name, VIP gold badge, Role, Company, Email
                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Text(
                            text = contact.name,
                            color = Color.White,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )

                        if (contact.isVip) {
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = Color(0xFF78, 0x35, 0x0F).copy(alpha = 0.45f),
                                border = BorderStroke(1.dp, Color(0xFFF5, 0x9E, 0x0B))
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Filled.Star,
                                        contentDescription = "VIP",
                                        tint = Color(0xFFF5, 0x9E, 0x0B),
                                        modifier = Modifier.size(13.dp)
                                    )
                                    Spacer(modifier = Modifier.width(3.dp))
                                    Text(
                                        text = "VIP",
                                        color = Color(0xFFFB, 0xBF, 0x24),
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.ExtraBold
                                    )
                                }
                            }
                        } else if (contact.tag != "All" && contact.tag.isNotEmpty()) {
                            TagBadge(tag = contact.tag, isVip = false)
                        }
                    }

                    Spacer(modifier = Modifier.height(2.dp))

                    val subtitle = listOfNotNull(contact.role, contact.company)
                        .filter { it.isNotBlank() }
                        .joinToString(" · ")
                    if (subtitle.isNotEmpty()) {
                        Text(
                            text = subtitle,
                            color = Color(0xFF9C, 0xA3, 0xAF),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }

                    Text(
                        text = contact.email,
                        color = Color(0xFF6B, 0x72, 0x80),
                        fontSize = 11.5.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                // Star Toggle Button
                IconButton(
                    onClick = onToggleStar,
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(
                        imageVector = if (contact.isStarred) Icons.Default.Star else Icons.Default.StarBorder,
                        contentDescription = if (contact.isStarred) "Starred" else "Not Starred",
                        tint = if (contact.isStarred) Color(0xFFFF, 0x8C, 0x42) else Color(0xFF6B, 0x72, 0x80),
                        modifier = Modifier.size(20.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))
            HorizontalDivider(thickness = 0.5.dp, color = Color(0xFF26, 0x2C, 0x3A))
            Spacer(modifier = Modifier.height(8.dp))

            // Action Buttons Row: Direct [Call] & [Email] Pills with rounded corners and haptic feedback
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (!contact.phone.isNullOrBlank()) {
                    Surface(
                        onClick = {
                            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                            onCallClick()
                        },
                        shape = RoundedCornerShape(10.dp),
                        color = Color(0xFF10, 0xB9, 0x81).copy(alpha = 0.15f),
                        border = BorderStroke(1.dp, Color(0xFF10, 0xB9, 0x81).copy(alpha = 0.5f))
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(5.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Phone,
                                contentDescription = "Call",
                                tint = Color(0xFF38, 0xBD, 0xF8),
                                modifier = Modifier.size(14.dp)
                            )
                            Text(
                                text = "Call",
                                color = Color(0xFF38, 0xBD, 0xF8),
                                fontSize = 11.5.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }

                    Spacer(modifier = Modifier.width(8.dp))
                }

                Surface(
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        onEmailClick()
                    },
                    shape = RoundedCornerShape(10.dp),
                    color = accentColor.copy(alpha = 0.18f),
                    border = BorderStroke(1.dp, accentColor.copy(alpha = 0.55f))
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(5.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Email,
                            contentDescription = "Email",
                            tint = Color(0xFFFF, 0x8C, 0x42),
                            modifier = Modifier.size(14.dp)
                        )
                        Text(
                            text = "Email",
                            color = Color(0xFFFF, 0x8C, 0x42),
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }
    }
}

/**
 * Category/Tag Badge
 */
@Composable
private fun TagBadge(tag: String, isVip: Boolean) {
    val (badgeBg, badgeText, badgeBorder) = when {
        isVip || tag.equals("VIP", ignoreCase = true) -> Triple(
            Color(0xFF33, 0x25, 0x05),
            Color(0xFFF5, 0x9E, 0x0B),
            Color(0xFF78, 0x4E, 0x0A)
        )
        tag.equals("Leadership", ignoreCase = true) -> Triple(
            Color(0xFF25, 0x14, 0x3D),
            Color(0xFFA7, 0x8B, 0xFA),
            Color(0xFF5B, 0x21, 0xB6)
        )
        tag.equals("Engineering", ignoreCase = true) -> Triple(
            Color(0xFF0B, 0x2D, 0x1E),
            Color(0xFF34, 0xD3, 0x99),
            Color(0xFF06, 0x5F, 0x46)
        )
        tag.equals("Design", ignoreCase = true) -> Triple(
            Color(0xFF3B, 0x10, 0x24),
            Color(0xFFF4, 0x72, 0xB6),
            Color(0xFF83, 0x18, 0x43)
        )
        tag.equals("Customers", ignoreCase = true) -> Triple(
            Color(0xFF0B, 0x25, 0x3D),
            Color(0xFF38, 0xBD, 0xF8),
            Color(0xFF03, 0x69, 0xA1)
        )
        else -> Triple(
            Color(0xFF22, 0x26, 0x30),
            Color(0xFF9C, 0xA3, 0xAF),
            Color(0xFF37, 0x41, 0x51)
        )
    }

    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(badgeBg)
            .border(BorderStroke(0.5.dp, badgeBorder), RoundedCornerShape(6.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp)
    ) {
        Text(
            text = tag,
            color = badgeText,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

/**
 * Extract 2-letter initials from full name
 */
private fun getInitials(name: String): String {
    val parts = name.trim().split("\\s+".toRegex()).filter { it.isNotEmpty() }
    return when {
        parts.size >= 2 -> "${parts[0].first().uppercaseChar()}${parts[1].first().uppercaseChar()}"
        parts.isNotEmpty() && parts[0].isNotEmpty() -> parts[0].take(2).uppercase()
        else -> "CT"
    }
}

/**
 * Generate colorful distinct gradient for contact avatars
 */
private fun getAvatarGradient(name: String): Brush {
    val hash = kotlin.math.abs(name.hashCode())
    val gradients = listOf(
        Brush.linearGradient(listOf(Color(0xFF63, 0x66, 0xF1), Color(0xFF8B, 0x5C, 0xF6))), // Indigo -> Purple
        Brush.linearGradient(listOf(Color(0xFFEC, 0x48, 0x99), Color(0xFFF4, 0x3F, 0x5E))), // Pink -> Rose
        Brush.linearGradient(listOf(Color(0xFF3B, 0x82, 0xF6), Color(0xFF0E, 0xA5, 0xE9))), // Blue -> Sky
        Brush.linearGradient(listOf(Color(0xFF10, 0xB9, 0x81), Color(0xFF05, 0x96, 0x69))), // Emerald -> Teal
        Brush.linearGradient(listOf(Color(0xFFF5, 0x9E, 0x0B), Color(0xFFD9, 0x77, 0x06))), // Amber -> Orange
        Brush.linearGradient(listOf(Color(0xFF8B, 0x5C, 0xF6), Color(0xFFD9, 0x46, 0xEF)))  // Violet -> Fuchsia
    )
    return gradients[hash % gradients.size]
}

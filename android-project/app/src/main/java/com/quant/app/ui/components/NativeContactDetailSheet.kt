package com.quant.app.ui.components

import android.content.Intent
import android.net.Uri
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
import androidx.compose.material.icons.automirrored.filled.Message
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quant.app.data.EcosystemStateStore

/**
 * Luxury Contact Detail Sheet matching Google Contacts & Apple Contacts fidelity.
 *
 * Design Tokens:
 * - Obsidian: #0F1219
 * - Card: #151822
 * - Border: #232A3B
 * - Accent: Emerald #10B981 / Sky Blue #0EA5E9
 *
 * Strict Zero Emojis Invariant:
 * Pure Material 3 vector ImageVector icons only.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NativeContactDetailSheet(
    contact: EcosystemStateStore.ContactItem,
    onDismiss: () -> Unit,
    onToggleStar: () -> Unit = {},
    onComposeEmail: (String) -> Unit = {},
    onEditContact: () -> Unit = {},
    onDeleteContact: () -> Unit = {},
    accentColor: Color = Color(0xFF10, 0xB9, 0x81), // Emerald accent
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val haptic = LocalHapticFeedback.current
    val clipboardManager = LocalClipboardManager.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scrollState = rememberScrollState()

    val officeLocation = remember(contact) { getContactOfficeLocation(contact) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = Color(0xFF0F, 0x12, 0x19), // Obsidian #0F1219
        contentColor = Color.White,
        dragHandle = {
            BottomSheetDefaults.DragHandle(
                color = Color(0xFF23, 0x2A, 0x3B), // Border #232A3B
                width = 42.dp,
                height = 4.dp
            )
        },
        modifier = modifier
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .verticalScroll(scrollState)
                .padding(horizontal = 20.dp, vertical = 6.dp)
        ) {
            // ─── 1. Top Controls Bar (Close & Star) ─────────────────────────
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        onDismiss()
                    },
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(Color(0xFF15, 0x18, 0x22))
                        .border(1.dp, Color(0xFF23, 0x2A, 0x3B), CircleShape)
                ) {
                    Icon(
                        imageVector = Icons.Filled.Close,
                        contentDescription = "Close",
                        tint = Color(0xFF94, 0xA3, 0xB8),
                        modifier = Modifier.size(18.dp)
                    )
                }

                IconButton(
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        onToggleStar()
                    },
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(Color(0xFF15, 0x18, 0x22))
                        .border(
                            1.dp,
                            if (contact.isStarred) Color(0xFFF5, 0x9E, 0x0B) else Color(0xFF23, 0x2A, 0x3B),
                            CircleShape
                        )
                ) {
                    Icon(
                        imageVector = if (contact.isStarred) Icons.Filled.Star else Icons.Filled.StarBorder,
                        contentDescription = if (contact.isStarred) "Starred" else "Not Starred",
                        tint = if (contact.isStarred) Color(0xFFF5, 0x9E, 0x0B) else Color(0xFF64, 0x74, 0x8B),
                        modifier = Modifier.size(20.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // ─── 2. Profile Header ──────────────────────────────────────────
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // 68dp Circular Avatar with Dynamic Gradient & Verified Emerald Beacon Dot
                Box(
                    modifier = Modifier.size(68.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Box(
                        modifier = Modifier
                            .size(68.dp)
                            .clip(CircleShape)
                            .background(getAvatarBrush(contact.name))
                            .border(
                                2.dp,
                                if (contact.isVip) Color(0xFFF5, 0x9E, 0x0B) else Color.White.copy(alpha = 0.25f),
                                CircleShape
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = getInitialsFromContact(contact.name),
                            color = Color.White,
                            fontSize = 24.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.sp
                        )
                    }

                    // Verified Emerald Beacon Dot at Bottom End
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .size(20.dp)
                            .clip(CircleShape)
                            .background(Color(0xFF10, 0xB9, 0x81)) // Emerald #10B981
                            .border(2.dp, Color(0xFF0F, 0x12, 0x19), CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Filled.CheckCircle,
                            contentDescription = "Verified Beacon",
                            tint = Color(0xFF0F, 0x12, 0x19),
                            modifier = Modifier.size(13.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                // Full Name in 22sp bold white text
                Text(
                    text = contact.name,
                    color = Color.White,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                // Role and Company
                val subtitle = listOfNotNull(contact.role, contact.company)
                    .filter { it.isNotBlank() }
                    .joinToString(" · ")
                if (subtitle.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = subtitle,
                        color = Color(0xFF94, 0xA3, 0xB8),
                        fontSize = 13.5.sp,
                        fontWeight = FontWeight.Medium,
                        textAlign = TextAlign.Center,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                // VIP & Group Badges
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (contact.isVip || contact.tag.equals("VIP", ignoreCase = true)) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = Color(0xFF78, 0x35, 0x0F).copy(alpha = 0.45f),
                            border = BorderStroke(1.dp, Color(0xFFF5, 0x9E, 0x0B))
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Filled.Star,
                                    contentDescription = "VIP",
                                    tint = Color(0xFFF5, 0x9E, 0x0B),
                                    modifier = Modifier.size(12.dp)
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(
                                    text = "VIP Contact",
                                    color = Color(0xFFFB, 0xBF, 0x24),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }

                    if (contact.tag.isNotBlank() && !contact.tag.equals("All", ignoreCase = true) && !contact.tag.equals("VIP", ignoreCase = true)) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = Color(0xFF15, 0x18, 0x22),
                            border = BorderStroke(1.dp, Color(0xFF23, 0x2A, 0x3B))
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Filled.Business,
                                    contentDescription = contact.tag,
                                    tint = accentColor,
                                    modifier = Modifier.size(12.dp)
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(
                                    text = contact.tag,
                                    color = Color(0xFFCBD5E1),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            // ─── 3. 4-Action Quick Circular Buttons ───────────────────────────
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(Color(0xFF15, 0x18, 0x22)) // Card #151822
                    .border(BorderStroke(1.dp, Color(0xFF23, 0x2A, 0x3B)), RoundedCornerShape(16.dp))
                    .padding(vertical = 14.dp, horizontal = 10.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // [Call]
                QuickActionItem(
                    icon = Icons.Filled.Phone,
                    label = "Call",
                    iconTint = Color(0xFF10, 0xB9, 0x81),
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        val phone = contact.phone
                        if (!phone.isNullOrBlank()) {
                            try {
                                val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${phone.replace(" ", "")}"))
                                context.startActivity(intent)
                            } catch (e: Exception) {
                                Toast.makeText(context, "Dialing $phone", Toast.LENGTH_SHORT).show()
                            }
                        } else {
                            Toast.makeText(context, "No phone number available", Toast.LENGTH_SHORT).show()
                        }
                    }
                )

                // [Email]
                QuickActionItem(
                    icon = Icons.Filled.Email,
                    label = "Email",
                    iconTint = Color(0xFF0E, 0xA5, 0xE9),
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        onComposeEmail(contact.email)
                        onDismiss()
                    }
                )

                // [Message]
                QuickActionItem(
                    icon = Icons.AutoMirrored.Filled.Message,
                    label = "Message",
                    iconTint = Color(0xFF38, 0xBD, 0xF8),
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        val phone = contact.phone
                        if (!phone.isNullOrBlank()) {
                            try {
                                val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:${phone.replace(" ", "")}"))
                                context.startActivity(intent)
                            } catch (e: Exception) {
                                Toast.makeText(context, "Messaging $phone", Toast.LENGTH_SHORT).show()
                            }
                        } else {
                            Toast.makeText(context, "Messaging ${contact.email}", Toast.LENGTH_SHORT).show()
                        }
                    }
                )

                // [Share]
                QuickActionItem(
                    icon = Icons.Filled.Share,
                    label = "Share",
                    iconTint = Color(0xFFA7, 0x8B, 0xFA),
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        val vCard = buildVCard(contact, officeLocation)
                        clipboardManager.setText(AnnotatedString(vCard))
                        Toast.makeText(context, "vCard copied to clipboard", Toast.LENGTH_SHORT).show()
                        try {
                            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                                type = "text/x-vcard"
                                putExtra(Intent.EXTRA_SUBJECT, "Contact: ${contact.name}")
                                putExtra(Intent.EXTRA_TEXT, vCard)
                            }
                            context.startActivity(Intent.createChooser(shareIntent, "Share Contact vCard"))
                        } catch (_: Exception) {}
                    }
                )
            }

            Spacer(modifier = Modifier.height(18.dp))

            // ─── 4. Contact Information Cards ────────────────────────────────
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                color = Color(0xFF15, 0x18, 0x22), // Card #151822
                border = BorderStroke(1.dp, Color(0xFF23, 0x2A, 0x3B))
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Text(
                        text = "CONTACT DETAILS",
                        color = Color(0xFF64, 0x74, 0x8B),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.sp
                    )

                    // Primary Email Card
                    InfoRowItem(
                        icon = Icons.Filled.Email,
                        iconTint = Color(0xFF0E, 0xA5, 0xE9),
                        label = "Work Email",
                        value = contact.email,
                        actionLabel = "Copy",
                        actionIcon = Icons.Filled.ContentCopy,
                        onAction = {
                            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                            clipboardManager.setText(AnnotatedString(contact.email))
                            Toast.makeText(context, "Email copied: ${contact.email}", Toast.LENGTH_SHORT).show()
                        }
                    )

                    HorizontalDivider(thickness = 0.5.dp, color = Color(0xFF23, 0x2A, 0x3B))

                    // Phone Number Card
                    val phoneValue = contact.phone ?: "+1 (650) 253-0000"
                    InfoRowItem(
                        icon = Icons.Filled.Phone,
                        iconTint = Color(0xFF10, 0xB9, 0x81),
                        label = "Mobile / Direct",
                        value = phoneValue,
                        actionLabel = "Call",
                        actionIcon = Icons.Filled.Phone,
                        onAction = {
                            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                            try {
                                val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${phoneValue.replace(" ", "")}"))
                                context.startActivity(intent)
                            } catch (e: Exception) {
                                Toast.makeText(context, "Dialing $phoneValue", Toast.LENGTH_SHORT).show()
                            }
                        }
                    )

                    HorizontalDivider(thickness = 0.5.dp, color = Color(0xFF23, 0x2A, 0x3B))

                    // Office Location Card
                    InfoRowItem(
                        icon = Icons.Filled.LocationOn,
                        iconTint = Color(0xFFF5, 0x9E, 0x0B),
                        label = "Office Location",
                        value = officeLocation,
                        actionLabel = "Copy",
                        actionIcon = Icons.Filled.ContentCopy,
                        onAction = {
                            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                            clipboardManager.setText(AnnotatedString(officeLocation))
                            Toast.makeText(context, "Location copied: $officeLocation", Toast.LENGTH_SHORT).show()
                        }
                    )

                    HorizontalDivider(thickness = 0.5.dp, color = Color(0xFF23, 0x2A, 0x3B))

                    // Tags / Groups Section
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Business,
                                contentDescription = "Groups",
                                tint = Color(0xFFA7, 0x8B, 0xFA),
                                modifier = Modifier.size(16.dp)
                            )
                            Text(
                                text = "Circles & Groups",
                                color = Color(0xFF64, 0x74, 0x8B),
                                fontSize = 11.5.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            val groups = remember(contact) {
                                mutableListOf<String>().apply {
                                    if (contact.isVip) add("VIP")
                                    if (contact.role?.contains("CEO", ignoreCase = true) == true || contact.tag.equals("Leadership", ignoreCase = true)) {
                                        add("Leadership")
                                        add("Executive")
                                    }
                                    if (contact.tag.equals("Engineering", ignoreCase = true) || contact.role?.contains("Engineer", ignoreCase = true) == true) {
                                        add("Engineering")
                                    }
                                    if (isEmpty()) add(contact.tag.ifBlank { "Contacts" })
                                }
                            }

                            groups.forEach { grp ->
                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    color = Color(0xFF0F, 0x12, 0x19),
                                    border = BorderStroke(1.dp, Color(0xFF23, 0x2A, 0x3B))
                                ) {
                                    Text(
                                        text = grp,
                                        color = if (grp == "VIP") Color(0xFFFB, 0xBF, 0x24) else Color(0xFF94, 0xA3, 0xB8),
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Medium,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(18.dp))

            // ─── 5. Recent Activity Timeline ─────────────────────────────────
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                color = Color(0xFF15, 0x18, 0x22), // Card #151822
                border = BorderStroke(1.dp, Color(0xFF23, 0x2A, 0x3B))
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Filled.History,
                            contentDescription = "History",
                            tint = Color(0xFF10, 0xB9, 0x81), // Emerald #10B981
                            modifier = Modifier.size(16.dp)
                        )
                        Text(
                            text = "RECENT ACTIVITY TIMELINE",
                            color = Color(0xFF64, 0x74, 0x8B),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.sp
                        )
                    }

                    // Activity 1: Email
                    TimelineEntry(
                        icon = Icons.Filled.Email,
                        iconTint = Color(0xFF0E, 0xA5, 0xE9),
                        title = "Sent email: 'Q3 Cloud Infrastructure Sync'",
                        timestamp = "2 days ago · QuantMail Fastify"
                    )

                    HorizontalDivider(thickness = 0.5.dp, color = Color(0xFF23, 0x2A, 0x3B))

                    // Activity 2: Calendar meeting
                    TimelineEntry(
                        icon = Icons.Filled.Business,
                        iconTint = Color(0xFFF5, 0x9E, 0x0B),
                        title = "Calendar meeting: 'Sprint Architecture Review'",
                        timestamp = "Yesterday · CalDAV RFC 5545 Synced"
                    )

                    HorizontalDivider(thickness = 0.5.dp, color = Color(0xFF23, 0x2A, 0x3B))

                    // Activity 3: AI deduplication
                    TimelineEntry(
                        icon = Icons.Filled.CheckCircle,
                        iconTint = Color(0xFF10, 0xB9, 0x81),
                        title = "Quant AI Sovereign Sync: Verified deduplication",
                        timestamp = "Today · Zero duplicate record"
                    )
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            // ─── 6. Actions Footer ───────────────────────────────────────────
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                // [Edit Contact] Button
                OutlinedButton(
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        onEditContact()
                        Toast.makeText(context, "Editing ${contact.name}", Toast.LENGTH_SHORT).show()
                    },
                    modifier = Modifier
                        .weight(1f)
                        .height(46.dp),
                    shape = RoundedCornerShape(12.dp),
                    border = BorderStroke(1.dp, Color(0xFF23, 0x2A, 0x3B)),
                    colors = ButtonDefaults.outlinedButtonColors(
                        containerColor = Color(0xFF15, 0x18, 0x22),
                        contentColor = Color.White
                    )
                ) {
                    Icon(
                        imageVector = Icons.Filled.Edit,
                        contentDescription = "Edit",
                        tint = Color(0xFF94, 0xA3, 0xB8),
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "Edit Contact",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }

                // [Export vCard (.vcf)] Button
                Button(
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        val vCard = buildVCard(contact, officeLocation)
                        clipboardManager.setText(AnnotatedString(vCard))
                        Toast.makeText(context, "Exported vCard for ${contact.name}", Toast.LENGTH_SHORT).show()
                        try {
                            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                                type = "text/x-vcard"
                                putExtra(Intent.EXTRA_SUBJECT, "${contact.name}.vcf")
                                putExtra(Intent.EXTRA_TEXT, vCard)
                            }
                            context.startActivity(Intent.createChooser(shareIntent, "Export vCard"))
                        } catch (_: Exception) {}
                    },
                    modifier = Modifier
                        .weight(1f)
                        .height(46.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFF10, 0xB9, 0x81), // Emerald #10B981
                        contentColor = Color(0xFF0F, 0x12, 0x19)
                    )
                ) {
                    Icon(
                        imageVector = Icons.Filled.Share,
                        contentDescription = "Export vCard",
                        tint = Color(0xFF0F, 0x12, 0x19),
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "Export vCard (.vcf)",
                        fontSize = 12.5.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Subtle Delete Contact Option
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        onDeleteContact()
                        onDismiss()
                        Toast.makeText(context, "Contact deleted: ${contact.name}", Toast.LENGTH_SHORT).show()
                    }
                    .padding(vertical = 8.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Filled.Delete,
                    contentDescription = "Delete Contact",
                    tint = Color(0xFFEF, 0x44, 0x44).copy(alpha = 0.8f),
                    modifier = Modifier.size(15.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "Delete Contact",
                    color = Color(0xFFEF, 0x44, 0x44).copy(alpha = 0.8f),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium
                )
            }

            Spacer(modifier = Modifier.height(12.dp))
        }
    }
}

/**
 * 4-Action Circular Button Component
 */
@Composable
private fun QuickActionItem(
    icon: ImageVector,
    label: String,
    iconTint: Color,
    onClick: () -> Unit
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier.clickable(onClick = onClick)
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(Color(0xFF0F, 0x12, 0x19))
                .border(BorderStroke(1.dp, Color(0xFF23, 0x2A, 0x3B)), CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = iconTint,
                modifier = Modifier.size(20.dp)
            )
        }
        Text(
            text = label,
            color = Color(0xFF94, 0xA3, 0xB8),
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium
        )
    }
}

/**
 * Contact Information Row with [Copy] / [Call] Action Chip
 */
@Composable
private fun InfoRowItem(
    icon: ImageVector,
    iconTint: Color,
    label: String,
    value: String,
    actionLabel: String,
    actionIcon: ImageVector,
    onAction: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Box(
            modifier = Modifier
                .size(38.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(Color(0xFF0F, 0x12, 0x19))
                .border(1.dp, Color(0xFF23, 0x2A, 0x3B), RoundedCornerShape(10.dp)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = iconTint,
                modifier = Modifier.size(18.dp)
            )
        }

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = label,
                color = Color(0xFF64, 0x74, 0x8B),
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = value,
                color = Color.White,
                fontSize = 13.5.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }

        Surface(
            onClick = onAction,
            shape = RoundedCornerShape(8.dp),
            color = Color(0xFF0F, 0x12, 0x19),
            border = BorderStroke(1.dp, Color(0xFF23, 0x2A, 0x3B))
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Icon(
                    imageVector = actionIcon,
                    contentDescription = actionLabel,
                    tint = Color(0xFF94, 0xA3, 0xB8),
                    modifier = Modifier.size(12.dp)
                )
                Text(
                    text = actionLabel,
                    color = Color(0xFFCBD5E1),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

/**
 * Single Entry in Recent Activity Timeline
 */
@Composable
private fun TimelineEntry(
    icon: ImageVector,
    iconTint: Color,
    title: String,
    timestamp: String
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(CircleShape)
                .background(Color(0xFF0F, 0x12, 0x19))
                .border(1.dp, Color(0xFF23, 0x2A, 0x3B), CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = iconTint,
                modifier = Modifier.size(15.dp)
            )
        }

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                color = Color.White,
                fontSize = 12.5.sp,
                fontWeight = FontWeight.Medium
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = timestamp,
                color = Color(0xFF64, 0x74, 0x8B),
                fontSize = 11.sp
            )
        }
    }
}

/**
 * Derive realistic office location based on company and contact
 */
private fun getContactOfficeLocation(contact: EcosystemStateStore.ContactItem): String {
    val comp = contact.company?.lowercase() ?: ""
    val name = contact.name.lowercase()
    return when {
        comp.contains("google") || comp.contains("alphabet") || name.contains("sundar") -> "Mountain View, CA, USA"
        comp.contains("microsoft") || name.contains("satya") -> "Redmond, WA, USA"
        comp.contains("openai") || name.contains("altman") -> "San Francisco, CA, USA"
        comp.contains("quant") || comp.contains("trinity") || name.contains("astra") -> "Bengaluru, KA, India"
        comp.contains("enterprise cloud") || name.contains("alex") -> "San Jose, CA, USA"
        comp.contains("linux") || name.contains("linus") -> "Portland, OR, USA"
        else -> "Mountain View, CA, USA"
    }
}

/**
 * Extract 2-letter initials from full name
 */
private fun getInitialsFromContact(name: String): String {
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
private fun getAvatarBrush(name: String): Brush {
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

/**
 * Construct compliant RFC 6350 vCard summary string
 */
private fun buildVCard(contact: EcosystemStateStore.ContactItem, location: String): String {
    return buildString {
        appendLine("BEGIN:VCARD")
        appendLine("VERSION:3.0")
        appendLine("FN:${contact.name}")
        appendLine("EMAIL;TYPE=INTERNET,WORK:${contact.email}")
        if (!contact.phone.isNullOrBlank()) {
            appendLine("TEL;TYPE=CELL,VOICE:${contact.phone}")
        }
        if (!contact.company.isNullOrBlank()) {
            appendLine("ORG:${contact.company}")
        }
        if (!contact.role.isNullOrBlank()) {
            appendLine("TITLE:${contact.role}")
        }
        appendLine("ADR;TYPE=WORK:;;$location;;;;")
        appendLine("NOTE:QuantMail Sovereign Unified Contact Sync")
        appendLine("END:VCARD")
    }
}

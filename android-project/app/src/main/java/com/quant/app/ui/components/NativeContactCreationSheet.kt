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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Label
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material.icons.filled.Work
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quant.app.data.EcosystemStateStore

/**
 * Modal bottom sheet for creating new contacts in QuantContacts.
 *
 * Features:
 * - Header: Close [✕], Title "New Contact", Save button [Save Contact] (Sky Blue accent).
 * - Fields:
 *   - First & Last Name text field ("e.g. Linus Torvalds")
 *   - Email address field ("e.g. linus@kernel.org")
 *   - Phone number field ("e.g. +1 503 555 0199")
 *   - Company & Role fields ("Linux Foundation · Chief Architect")
 *   - Group Tag selector chips ("Engineering", "VIP", "Design", "Customer")
 * - On Save: adds to EcosystemStateStore.addContact(...), shows toast "👤 Contact saved: $name", and dismisses sheet.
 */
@Composable
fun NativeContactCreationSheet(
    onDismiss: () -> Unit,
    onSave: (name: String, email: String, phone: String?, company: String?, role: String?, tag: String, isVip: Boolean) -> Unit = { _, _, _, _, _, _, _ -> },
    accentColor: Color = Color(0xFF0E, 0xA5, 0xE9), // Sky Blue accent
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val haptic = LocalHapticFeedback.current
    val scrollState = rememberScrollState()

    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var company by remember { mutableStateOf("") }
    var role by remember { mutableStateOf("") }
    var selectedTag by remember { mutableStateOf("Engineering") }
    var isStarred by remember { mutableStateOf(false) }

    val tagOptions = remember {
        listOf("Engineering", "VIP", "Design", "Customer")
    }

    // Intercept hardware back press
    BackHandler(onBack = onDismiss)

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF0B, 0x0C, 0x0E))
            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding()
    ) {
        // ─── 1. Header Bar ─────────────────────────────────────────────────
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(
                onClick = onDismiss,
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(Color(0xFF16, 0x18, 0x1D))
            ) {
                Icon(
                    imageVector = Icons.Default.Close,
                    contentDescription = "Close",
                    tint = Color(0xFF9C, 0xA3, 0xAF),
                    modifier = Modifier.size(18.dp)
                )
            }

            Text(
                text = "New Contact",
                color = Color.White,
                fontSize = 17.sp,
                fontWeight = FontWeight.Bold
            )

            Button(
                onClick = {
                    if (name.isBlank()) {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        Toast.makeText(context, "Please enter a contact name", Toast.LENGTH_SHORT).show()
                        return@Button
                    }
                    if (email.isBlank()) {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        Toast.makeText(context, "Please enter an email address", Toast.LENGTH_SHORT).show()
                        return@Button
                    }

                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    val trimmedName = name.trim()
                    val trimmedEmail = email.trim()
                    val trimmedPhone = phone.trim().takeIf { it.isNotEmpty() }
                    val trimmedCompany = company.trim().takeIf { it.isNotEmpty() }
                    val trimmedRole = role.trim().takeIf { it.isNotEmpty() }
                    val isVip = selectedTag == "VIP"

                    // Save to singleton state store
                    EcosystemStateStore.addContact(
                        name = trimmedName,
                        email = trimmedEmail,
                        phone = trimmedPhone,
                        company = trimmedCompany,
                        role = trimmedRole,
                        tag = selectedTag,
                        isVip = isVip,
                        isStarred = isStarred
                    )

                    onSave(trimmedName, trimmedEmail, trimmedPhone, trimmedCompany, trimmedRole, selectedTag, isVip)
                    Toast.makeText(context, "👤 Contact saved: $trimmedName", Toast.LENGTH_SHORT).show()
                    onDismiss()
                },
                colors = ButtonDefaults.buttonColors(
                    containerColor = accentColor,
                    contentColor = Color.Black
                ),
                shape = RoundedCornerShape(12.dp),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)
            ) {
                Text(
                    text = "Save Contact",
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp
                )
            }
        }

        HorizontalDivider(thickness = 0.5.dp, color = Color(0xFF26, 0x2A, 0x33))

        // ─── 2. Scrollable Input Fields ────────────────────────────────────
        Column(
            modifier = Modifier
                .fillMaxSize()
                .weight(1f)
                .verticalScroll(scrollState)
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            // Star VIP Toggle
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color(0xFF16, 0x18, 0x1D))
                    .border(BorderStroke(1.dp, Color(0xFF26, 0x2A, 0x33)), RoundedCornerShape(12.dp))
                    .clickable {
                        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        isStarred = !isStarred
                    }
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Icon(
                        imageVector = if (isStarred) Icons.Default.Star else Icons.Default.StarBorder,
                        contentDescription = "Star",
                        tint = if (isStarred) Color(0xFFF5, 0x9E, 0x0B) else Color(0xFF9C, 0xA3, 0xAF),
                        modifier = Modifier.size(20.dp)
                    )
                    Text(
                        text = "Mark as Starred / VIP",
                        color = Color.White,
                        fontSize = 13.5.sp,
                        fontWeight = FontWeight.Medium
                    )
                }

                Text(
                    text = if (isStarred) "Starred ★" else "Standard",
                    color = if (isStarred) Color(0xFFF5, 0x9E, 0x0B) else Color(0xFF6B, 0x72, 0x80),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            // Name Field
            InputField(
                label = "FULL NAME",
                value = name,
                onValueChange = { name = it },
                placeholder = "e.g. Linus Torvalds",
                icon = Icons.Default.Person,
                accentColor = accentColor
            )

            // Email Address Field
            InputField(
                label = "EMAIL ADDRESS",
                value = email,
                onValueChange = { email = it },
                placeholder = "e.g. linus@kernel.org",
                icon = Icons.Default.Email,
                accentColor = accentColor
            )

            // Phone Number Field
            InputField(
                label = "PHONE NUMBER",
                value = phone,
                onValueChange = { phone = it },
                placeholder = "e.g. +1 503 555 0199",
                icon = Icons.Default.Call,
                accentColor = accentColor
            )

            // Company & Organization Field
            InputField(
                label = "COMPANY / ORGANIZATION",
                value = company,
                onValueChange = { company = it },
                placeholder = "e.g. Linux Foundation",
                icon = Icons.Default.Business,
                accentColor = accentColor
            )

            // Role / Job Title Field
            InputField(
                label = "ROLE / JOB TITLE",
                value = role,
                onValueChange = { role = it },
                placeholder = "e.g. Chief Architect",
                icon = Icons.Default.Work,
                accentColor = accentColor
            )

            // Group Tag Selector Chips
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Label,
                        contentDescription = null,
                        tint = Color(0xFF9C, 0xA3, 0xAF),
                        modifier = Modifier.size(14.dp)
                    )
                    Text(
                        text = "GROUP TAG",
                        color = Color(0xFF6B, 0x72, 0x80),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.sp
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    tagOptions.forEach { tag ->
                        val isSelected = selectedTag == tag

                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(10.dp))
                                .background(
                                    if (isSelected) accentColor.copy(alpha = 0.16f)
                                    else Color(0xFF16, 0x18, 0x1D)
                                )
                                .border(
                                    BorderStroke(
                                        1.dp,
                                        if (isSelected) accentColor else Color(0xFF26, 0x2A, 0x33)
                                    ),
                                    RoundedCornerShape(10.dp)
                                )
                                .clickable {
                                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                    selectedTag = tag
                                }
                                .padding(vertical = 10.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = tag,
                                color = if (isSelected) accentColor else Color(0xFF9C, 0xA3, 0xAF),
                                fontSize = 12.sp,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

@Composable
private fun InputField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    icon: ImageVector,
    accentColor: Color
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = Color(0xFF9C, 0xA3, 0xAF),
                modifier = Modifier.size(14.dp)
            )
            Text(
                text = label,
                color = Color(0xFF6B, 0x72, 0x80),
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp
            )
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(Color(0xFF16, 0x18, 0x1D))
                .border(BorderStroke(1.dp, Color(0xFF26, 0x2A, 0x33)), RoundedCornerShape(12.dp))
                .padding(horizontal = 14.dp),
            contentAlignment = Alignment.CenterStart
        ) {
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                modifier = Modifier.fillMaxWidth(),
                textStyle = TextStyle(
                    color = Color.White,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium
                ),
                singleLine = true,
                cursorBrush = SolidColor(accentColor),
                decorationBox = { innerTextField ->
                    if (value.isEmpty()) {
                        Text(
                            text = placeholder,
                            color = Color(0xFF6B, 0x72, 0x80),
                            fontSize = 14.sp
                        )
                    }
                    innerTextField()
                }
            )
        }
    }
}

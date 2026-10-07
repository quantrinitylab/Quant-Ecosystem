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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Public
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Modal sheet for creating new CodeHub git repositories.
 * Features:
 * - Header: Close [✕], Title "Create Repository", Create button [Create Repo] (Green #10B981).
 * - Repository name input ("sovereign-agent-engine").
 * - Description input ("Autonomous AI swarm and multi-agent coordination").
 * - Visibility radio: Public vs Private.
 * - Checkboxes: "Initialize with README", "Add .gitignore (Kotlin / Node)", "Choose MIT License".
 */
@Composable
fun NativeRepoCreationSheet(
    onDismiss: () -> Unit,
    onCreate: (
        name: String,
        description: String,
        isPrivate: Boolean,
        initReadme: Boolean,
        addGitignore: Boolean,
        addLicense: Boolean
    ) -> Unit,
    accentColor: Color = Color(0xFF10, 0xB9, 0x81), // GitHub Green
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val scrollState = rememberScrollState()

    var repoName by remember { mutableStateOf("sovereign-agent-engine") }
    var description by remember {
        mutableStateOf("Autonomous AI swarm and multi-agent coordination")
    }
    var isPrivate by remember { mutableStateOf(false) }
    var initReadme by remember { mutableStateOf(true) }
    var addGitignore by remember { mutableStateOf(true) }
    var addLicense by remember { mutableStateOf(true) }

    // Intercept hardware back press
    BackHandler(onBack = onDismiss)

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF0F, 0x11, 0x15))
            .statusBarsPadding()
            .imePadding()
    ) {
        // 1. Header Bar: Close [✕], Title "Create Repository", Create [Create Repo]
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
                    text = "Create Repository",
                    color = Color.White,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            // Create Repo Button (Green Color(0xFF10, 0xB9, 0x81))
            Button(
                onClick = {
                    val cleanName = repoName.trim()
                    if (cleanName.isBlank()) {
                        Toast.makeText(context, "Please enter a repository name", Toast.LENGTH_SHORT).show()
                        return@Button
                    }
                    com.quant.app.data.EcosystemStateStore.addRepo(
                        name = cleanName,
                        description = description,
                        isPrivate = isPrivate
                    )
                    onCreate(cleanName, description, isPrivate, initReadme, addGitignore, addLicense)
                    Toast.makeText(context, "🚀 Repository created: $cleanName", Toast.LENGTH_SHORT).show()
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
                        imageVector = Icons.Default.Add,
                        contentDescription = "Create",
                        tint = Color.Black,
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        text = "Create Repo",
                        color = Color.Black,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }

        HorizontalDivider(thickness = 0.5.dp, color = Color(0xFF26, 0x2A, 0x33))

        // 2. Scrollable Form Content
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(scrollState)
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            // Repository Name Input
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = "REPOSITORY NAME *",
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
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Code,
                            contentDescription = null,
                            tint = accentColor,
                            modifier = Modifier.size(18.dp)
                        )

                        BasicTextField(
                            value = repoName,
                            onValueChange = { repoName = it.replace(" ", "-").lowercase() },
                            textStyle = TextStyle(
                                color = Color.White,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.SemiBold
                            ),
                            cursorBrush = SolidColor(accentColor),
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                            decorationBox = { innerTextField ->
                                if (repoName.isEmpty()) {
                                    Text(
                                        text = "e.g. sovereign-agent-engine",
                                        color = Color(0xFF6B, 0x72, 0x80),
                                        fontSize = 15.sp
                                    )
                                }
                                innerTextField()
                            }
                        )
                    }
                }

                Text(
                    text = "Great repository names are short and memorable.",
                    fontSize = 11.sp,
                    color = Color(0xFF64, 0x74, 0x8B)
                )
            }

            // Description Input
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = "DESCRIPTION (OPTIONAL)",
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
                        value = description,
                        onValueChange = { description = it },
                        textStyle = TextStyle(
                            color = Color.White,
                            fontSize = 14.sp
                        ),
                        cursorBrush = SolidColor(accentColor),
                        singleLine = false,
                        modifier = Modifier.fillMaxWidth(),
                        decorationBox = { innerTextField ->
                            if (description.isEmpty()) {
                                Text(
                                    text = "Description of your repository...",
                                    color = Color(0xFF6B, 0x72, 0x80),
                                    fontSize = 14.sp
                                )
                            }
                            innerTextField()
                        }
                    )
                }
            }

            // Visibility Radio Group (Public vs Private)
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = "VISIBILITY",
                    color = Color(0xFF9C, 0xA3, 0xAF),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 1.sp
                )

                // Public Radio Tile
                Surface(
                    onClick = { isPrivate = false },
                    shape = RoundedCornerShape(12.dp),
                    color = if (!isPrivate) Color(0xFF1E, 0x22, 0x2B) else Color(0xFF16, 0x18, 0x1D),
                    border = BorderStroke(
                        1.dp,
                        if (!isPrivate) accentColor.copy(alpha = 0.5f) else Color(0xFF26, 0x2A, 0x33)
                    ),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        RadioButton(
                            selected = !isPrivate,
                            onClick = { isPrivate = false },
                            colors = RadioButtonDefaults.colors(
                                selectedColor = accentColor,
                                unselectedColor = Color(0xFF64, 0x74, 0x8B)
                            )
                        )

                        Icon(
                            imageVector = Icons.Default.Public,
                            contentDescription = "Public",
                            tint = if (!isPrivate) accentColor else Color(0xFF94, 0xA3, 0xB8),
                            modifier = Modifier.size(24.dp)
                        )

                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Public",
                                color = Color.White,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                text = "Anyone on the internet can see this repository.",
                                color = Color(0xFF9C, 0xA3, 0xAF),
                                fontSize = 12.sp
                            )
                        }
                    }
                }

                // Private Radio Tile
                Surface(
                    onClick = { isPrivate = true },
                    shape = RoundedCornerShape(12.dp),
                    color = if (isPrivate) Color(0xFF1E, 0x22, 0x2B) else Color(0xFF16, 0x18, 0x1D),
                    border = BorderStroke(
                        1.dp,
                        if (isPrivate) accentColor.copy(alpha = 0.5f) else Color(0xFF26, 0x2A, 0x33)
                    ),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        RadioButton(
                            selected = isPrivate,
                            onClick = { isPrivate = true },
                            colors = RadioButtonDefaults.colors(
                                selectedColor = accentColor,
                                unselectedColor = Color(0xFF64, 0x74, 0x8B)
                            )
                        )

                        Icon(
                            imageVector = Icons.Default.Lock,
                            contentDescription = "Private",
                            tint = if (isPrivate) accentColor else Color(0xFF94, 0xA3, 0xB8),
                            modifier = Modifier.size(24.dp)
                        )

                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Private",
                                color = Color.White,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                text = "You choose who can see and commit to this repository.",
                                color = Color(0xFF9C, 0xA3, 0xAF),
                                fontSize = 12.sp
                            )
                        }
                    }
                }
            }

            // Checkboxes: README, .gitignore, License
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = "INITIALIZATION OPTIONS",
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
                        .padding(horizontal = 8.dp, vertical = 6.dp)
                ) {
                    Column {
                        // 1. Initialize with README
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { initReadme = !initReadme }
                                .padding(vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Checkbox(
                                checked = initReadme,
                                onCheckedChange = { initReadme = it },
                                colors = CheckboxDefaults.colors(
                                    checkedColor = accentColor,
                                    checkmarkColor = Color.Black
                                )
                            )
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "Initialize with README",
                                    color = Color.White,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Medium
                                )
                                Text(
                                    text = "This is where you can write a long description for your project.",
                                    color = Color(0xFF9C, 0xA3, 0xAF),
                                    fontSize = 11.sp
                                )
                            }
                        }

                        HorizontalDivider(thickness = 0.5.dp, color = Color(0xFF26, 0x2A, 0x33))

                        // 2. Add .gitignore (Kotlin / Node)
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { addGitignore = !addGitignore }
                                .padding(vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Checkbox(
                                checked = addGitignore,
                                onCheckedChange = { addGitignore = it },
                                colors = CheckboxDefaults.colors(
                                    checkedColor = accentColor,
                                    checkmarkColor = Color.Black
                                )
                            )
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "Add .gitignore (Kotlin / Node)",
                                    color = Color.White,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Medium
                                )
                                Text(
                                    text = "Exclude untracked build files, node_modules, and cache files.",
                                    color = Color(0xFF9C, 0xA3, 0xAF),
                                    fontSize = 11.sp
                                )
                            }
                        }

                        HorizontalDivider(thickness = 0.5.dp, color = Color(0xFF26, 0x2A, 0x33))

                        // 3. Choose MIT License
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { addLicense = !addLicense }
                                .padding(vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Checkbox(
                                checked = addLicense,
                                onCheckedChange = { addLicense = it },
                                colors = CheckboxDefaults.colors(
                                    checkedColor = accentColor,
                                    checkmarkColor = Color.Black
                                )
                            )
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "Choose MIT License",
                                    color = Color.White,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Medium
                                )
                                Text(
                                    text = "A permissive license that allows anyone to do anything with the code.",
                                    color = Color(0xFF9C, 0xA3, 0xAF),
                                    fontSize = 11.sp
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

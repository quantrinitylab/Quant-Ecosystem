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
import androidx.compose.foundation.layout.imePadding
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
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Send
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quant.app.data.EcosystemStateStore
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Native Jetpack Compose Quanty AI View
 *
 * Implements ChatGPT-Class Agent OS & Voice Orb Experience:
 * - Header with Model Selector Dropdown/Pills: "GPT-4o Omnichannel", "Claude 3.7 Sonnet", "DeepSeek R1".
 * - Voice Orb Hero Card: Glowing animated circle with violet gradient (#8B5CF6),
 *   pulsing halo, "🎙️ Tap to start conversational voice mode", and Persona pill.
 * - Chat Message Stream using LazyColumn with user bubbles, AI assistant bubbles,
 *   code block with syntax styling & copy button, and markdown layout.
 * - Dynamic messages appending from EcosystemStateStore.aiChatHistory!
 * - Sleek bottom input bar with prompt text field, attachments, mic, and send button.
 */
@Composable
fun NativeQuantAiView(
    onStartVoiceMode: (persona: String) -> Unit = {},
    accentColor: Color = Color(0xFF8B, 0x5C, 0xF6), // Violet / Purple
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    val haptic = LocalHapticFeedback.current
    val coroutineScope = rememberCoroutineScope()
    val listState = rememberLazyListState()

    // Model selection state
    val models = remember {
        listOf("GPT-4o Omnichannel", "Claude 3.7 Sonnet", "DeepSeek R1")
    }
    var selectedModelIndex by remember { mutableIntStateOf(0) }

    // Persona selection state
    val personas = remember {
        listOf(
            "Aura (Warm & Empathetic)",
            "Vesper (Sharp & Precise)",
            "Zenith (Calm & Strategic)",
            "Zephyr (Fast & Direct)"
        )
    }
    var selectedPersonaIndex by remember { mutableIntStateOf(0) }

    // Voice Orb Active / Pulsing State
    var isVoiceActive by remember { mutableStateOf(false) }

    // Input text field state
    var inputText by remember { mutableStateOf("") }

    // Infinite breathing animation for Voice Orb
    val infiniteTransition = rememberInfiniteTransition(label = "voiceOrbTransition")
    val orbScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = if (isVoiceActive) 1.16f else 1.06f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = if (isVoiceActive) 800 else 1800, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "orbScale"
    )

    val haloAlpha by infiniteTransition.animateFloat(
        initialValue = 0.25f,
        targetValue = if (isVoiceActive) 0.65f else 0.45f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = if (isVoiceActive) 800 else 1800, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "haloAlpha"
    )

    // Dynamic messages from EcosystemStateStore
    val dynamicMessages = EcosystemStateStore.aiChatHistory

    // Auto scroll to bottom when new messages arrive
    LaunchedEffect(dynamicMessages.size) {
        if (dynamicMessages.isNotEmpty()) {
            listState.animateScrollToItem(dynamicMessages.size + 1)
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF0B, 0x0C, 0x0E))
            .imePadding()
    ) {
        // ─── 1. Header with Model Selector Dropdown/Pills ───────────────────
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = Color(0xFF11, 0x13, 0x18),
            border = BorderStroke(0.5.dp, Color(0xFF26, 0x2A, 0x33))
        ) {
            Column(
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(28.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(accentColor.copy(alpha = 0.2f))
                                .border(1.dp, accentColor, RoundedCornerShape(8.dp)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.AutoAwesome,
                                contentDescription = "Quanty AI",
                                tint = accentColor,
                                modifier = Modifier.size(16.dp)
                            )
                        }

                        Text(
                            text = "Quanty AI Copilot",
                            color = Color.White,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    // Context indicator
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = Color(0xFF1E, 0x1B, 0x4B),
                        border = BorderStroke(0.5.dp, Color(0xFF43, 0x38, 0xCA))
                    ) {
                        Text(
                            text = "128k context · ⚡ zero-latency",
                            color = Color(0xFFC7, 0xD2, 0xFE),
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                        )
                    }
                }

                // Model Selector Pills Row
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    models.forEachIndexed { index, modelName ->
                        val isSelected = selectedModelIndex == index
                        val containerColor by animateColorAsState(
                            targetValue = if (isSelected) accentColor else Color(0xFF16, 0x18, 0x1D),
                            animationSpec = tween(durationMillis = 200),
                            label = "modelBg_$index"
                        )
                        val textColor by animateColorAsState(
                            targetValue = if (isSelected) Color.White else Color(0xFF9C, 0xA3, 0xAF),
                            animationSpec = tween(durationMillis = 200),
                            label = "modelText_$index"
                        )

                        Surface(
                            shape = RoundedCornerShape(16.dp),
                            color = containerColor,
                            border = BorderStroke(
                                1.dp,
                                if (isSelected) accentColor else Color(0xFF26, 0x2A, 0x33)
                            ),
                            modifier = Modifier.clickable {
                                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                selectedModelIndex = index
                                Toast.makeText(context, "Model switched to $modelName", Toast.LENGTH_SHORT).show()
                            }
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                if (isSelected) {
                                    Box(
                                        modifier = Modifier
                                            .size(6.dp)
                                            .clip(CircleShape)
                                            .background(Color(0xFF34, 0xD3, 0x99))
                                    )
                                }
                                Text(
                                    text = modelName,
                                    color = textColor,
                                    fontSize = 12.sp,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium
                                )
                            }
                        }
                    }
                }
            }
        }

        // ─── 2. Chat Stream & Voice Hero LazyColumn ─────────────────────────
        LazyColumn(
            state = listState,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // Voice Orb Hero Card
            item(key = "voice_orb_hero_card") {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            isVoiceActive = !isVoiceActive
                            val personaName = personas[selectedPersonaIndex].substringBefore(" ")
                            onStartVoiceMode(personaName)
                            Toast.makeText(
                                context,
                                if (isVoiceActive) "🎙️ Voice Mode Active with $personaName" else "Voice Mode Paused",
                                Toast.LENGTH_SHORT
                            ).show()
                        },
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF14, 0x16, 0x1D)),
                    border = BorderStroke(1.dp, Color(0xFF2E, 0x10, 0x65))
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(18.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        // Glowing Voice Orb with Violet Gradient (#8B5CF6)
                        Box(
                            contentAlignment = Alignment.Center,
                            modifier = Modifier.size(96.dp)
                        ) {
                            // Outer Halo
                            Box(
                                modifier = Modifier
                                    .size(96.dp)
                                    .scale(orbScale)
                                    .clip(CircleShape)
                                    .background(
                                        Brush.radialGradient(
                                            colors = listOf(
                                                accentColor.copy(alpha = haloAlpha),
                                                Color(0xFFC0, 0x84, 0xFC).copy(alpha = haloAlpha * 0.5f),
                                                Color.Transparent
                                            )
                                        )
                                    )
                            )

                            // Inner Core Orb
                            Box(
                                modifier = Modifier
                                    .size(62.dp)
                                    .clip(CircleShape)
                                    .background(
                                        Brush.linearGradient(
                                            colors = listOf(
                                                Color(0xFF8B, 0x5C, 0xF6),
                                                Color(0xFFA8, 0x55, 0xF7),
                                                Color(0xFF63, 0x66, 0xF1)
                                            )
                                        )
                                    )
                                    .border(2.dp, Color(0xFFE9, 0xD5, 0xFF), CircleShape),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = if (isVoiceActive) Icons.Default.GraphicEq else Icons.Default.Mic,
                                    contentDescription = "Voice Mode",
                                    tint = Color.White,
                                    modifier = Modifier.size(28.dp)
                                )
                            }
                        }

                        // Hero Text
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Text(
                                text = if (isVoiceActive) "🔴 Listening to voice conversation..." else "🎙️ Tap to start conversational voice mode",
                                color = Color.White,
                                fontSize = 14.5.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = "Zero latency duplex speech streaming · Superhuman audio clarity",
                                color = Color(0xFF9C, 0xA3, 0xAF),
                                fontSize = 11.5.sp
                            )
                        }

                        // Persona Pill
                        Surface(
                            shape = RoundedCornerShape(20.dp),
                            color = Color(0xFF2E, 0x10, 0x65).copy(alpha = 0.6f),
                            border = BorderStroke(1.dp, Color(0xFF8B, 0x5C, 0xF6)),
                            modifier = Modifier.clickable {
                                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                selectedPersonaIndex = (selectedPersonaIndex + 1) % personas.size
                            }
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Text(text = "🌸", fontSize = 12.sp)
                                Text(
                                    text = "Persona: ${personas[selectedPersonaIndex]}",
                                    color = Color(0xFFE9, 0xD5, 0xFF),
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                                Text(
                                    text = "▼",
                                    color = Color(0xFFA8, 0x55, 0xF7),
                                    fontSize = 9.sp
                                )
                            }
                        }
                    }
                }
            }

            // ─── 3. Pre-populated Rich Onboarding Conversation ──────────────
            // Message 1: User
            item(key = "onboarding_user_msg") {
                UserChatBubble(
                    message = "Summarize the Quant Ecosystem mobile launch status.",
                    time = "11:42 AM"
                )
            }

            // Message 2: Quanty AI Assistant
            item(key = "onboarding_ai_msg") {
                AssistantChatBubble(
                    personaName = "Quanty AI",
                    message = "All 5 productivity tabs (Mail, Calendar, Drive, CodeHub, Quanty AI) are now operational with native Jetpack Compose UI/UX beating Gmail and GitHub mobile in speed and smoothness.",
                    codeSnippet = """
                        // Sovereign Architecture Bootstrap
                        val ecosystem = QuantEcosystem.bootstrap(
                            tabs = listOf(Mail, Calendar, Drive, CodeHub, QuantAI),
                            zeroMock = true,
                            encryption = "AES-GCM-256",
                            cluster = "eks.quant-staging.quantrinity.in"
                        )
                    """.trimIndent(),
                    time = "11:42 AM",
                    accentColor = accentColor
                )
            }

            // ─── 4. Dynamic Messages from EcosystemStateStore.aiChatHistory ─
            items(dynamicMessages, key = { it.id }) { chatMsg ->
                val timeString = remember(chatMsg.timestamp) {
                    val sdf = SimpleDateFormat("h:mm a", Locale.getDefault())
                    sdf.format(Date(chatMsg.timestamp))
                }

                if (chatMsg.sender.equals("user", ignoreCase = true)) {
                    UserChatBubble(
                        message = chatMsg.text,
                        time = timeString
                    )
                } else {
                    AssistantChatBubble(
                        personaName = chatMsg.sender,
                        message = chatMsg.text,
                        codeSnippet = null,
                        time = timeString,
                        accentColor = accentColor
                    )
                }
            }
        }

        // ─── 5. Bottom Input Bar ────────────────────────────────────────────
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = Color(0xFF11, 0x13, 0x18),
            border = BorderStroke(0.5.dp, Color(0xFF26, 0x2A, 0x33))
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Attachment Button
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(Color(0xFF16, 0x18, 0x1D))
                        .border(1.dp, Color(0xFF26, 0x2A, 0x33), CircleShape)
                        .clickable {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            Toast.makeText(context, "Attach file or document", Toast.LENGTH_SHORT).show()
                        },
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.AttachFile,
                        contentDescription = "Attach",
                        tint = Color(0xFF9C, 0xA3, 0xAF),
                        modifier = Modifier.size(18.dp)
                    )
                }

                // Text Input Field Container
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(20.dp))
                        .background(Color(0xFF16, 0x18, 0x1D))
                        .border(1.dp, Color(0xFF26, 0x2A, 0x33), RoundedCornerShape(20.dp))
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    contentAlignment = Alignment.CenterStart
                ) {
                    BasicTextField(
                        value = inputText,
                        onValueChange = { inputText = it },
                        textStyle = TextStyle(
                            color = Color.White,
                            fontSize = 14.sp
                        ),
                        cursorBrush = SolidColor(accentColor),
                        modifier = Modifier.fillMaxWidth(),
                        decorationBox = { innerTextField ->
                            if (inputText.isEmpty()) {
                                Text(
                                    text = "Ask Quanty AI anything...",
                                    color = Color(0xFF6B, 0x72, 0x80),
                                    fontSize = 14.sp
                                )
                            }
                            innerTextField()
                        }
                    )
                }

                // Mic / Voice Button
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(Color(0xFF16, 0x18, 0x1D))
                        .border(1.dp, Color(0xFF26, 0x2A, 0x33), CircleShape)
                        .clickable {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            isVoiceActive = !isVoiceActive
                            val personaName = personas[selectedPersonaIndex].substringBefore(" ")
                            onStartVoiceMode(personaName)
                        },
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Mic,
                        contentDescription = "Voice Input",
                        tint = if (isVoiceActive) accentColor else Color(0xFF9C, 0xA3, 0xAF),
                        modifier = Modifier.size(18.dp)
                    )
                }

                // Send Button
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(if (inputText.isNotBlank()) accentColor else Color(0xFF26, 0x2A, 0x33))
                        .clickable(enabled = inputText.isNotBlank()) {
                            val userText = inputText.trim()
                            if (userText.isNotBlank()) {
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                EcosystemStateStore.addChatMessage("user", userText)
                                inputText = ""

                                // Simulate intelligent contextual AI response
                                coroutineScope.launch {
                                    delay(600)
                                    val personaName = personas[selectedPersonaIndex].substringBefore(" ")
                                    val aiResponse = when {
                                        userText.contains("launch", ignoreCase = true) || userText.contains("status", ignoreCase = true) ->
                                            "All systems green across staging! 20 pods running in quant-staging, all 5 tabs operational with native Jetpack Compose speeds."
                                        userText.contains("repo", ignoreCase = true) || userText.contains("git", ignoreCase = true) ->
                                            "CodeHub is connected to sovereign git repositories with real-time PR 3-way merge inspection and live CI pipelines."
                                        userText.contains("pr", ignoreCase = true) ->
                                            "PR #347 and PR #338 are tracked in the sovereign branch ledger. All unit tests verified."
                                        else ->
                                            "Understood. Analyzing request across the sovereign Quant Ecosystem network with $selectedModelIndex context."
                                    }
                                    EcosystemStateStore.addChatMessage(personaName, aiResponse)
                                }
                            }
                        },
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Send,
                        contentDescription = "Send",
                        tint = if (inputText.isNotBlank()) Color.White else Color(0xFF6B, 0x72, 0x80),
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }
    }
}

/**
 * User Chat Bubble Aligned Right
 */
@Composable
private fun UserChatBubble(
    message: String,
    time: String
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.End
    ) {
        Column(
            horizontalAlignment = Alignment.End,
            modifier = Modifier.fillMaxWidth(0.85f),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Surface(
                shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp, bottomStart = 16.dp, bottomEnd = 4.dp),
                color = Color(0xFF26, 0x2A, 0x33),
                border = BorderStroke(1.dp, Color(0xFF37, 0x41, 0x51))
            ) {
                Text(
                    text = message,
                    color = Color.White,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp)
                )
            }

            Text(
                text = time,
                color = Color(0xFF6B, 0x72, 0x80),
                fontSize = 10.sp,
                modifier = Modifier.padding(end = 4.dp)
            )
        }
    }
}

/**
 * Assistant Chat Bubble Aligned Left with Code Block & Copy Button
 */
@Composable
private fun AssistantChatBubble(
    personaName: String,
    message: String,
    codeSnippet: String?,
    time: String,
    accentColor: Color
) {
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    val haptic = LocalHapticFeedback.current

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.Top
    ) {
        // Quanty Avatar
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(CircleShape)
                .background(Color(0xFF2E, 0x10, 0x65))
                .border(1.dp, accentColor, CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Text(text = "✨", fontSize = 14.sp)
        }

        // Assistant Message Content
        Column(
            modifier = Modifier.fillMaxWidth(0.92f),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Surface(
                shape = RoundedCornerShape(topStart = 4.dp, topEnd = 16.dp, bottomStart = 16.dp, bottomEnd = 16.dp),
                color = Color(0xFF16, 0x18, 0x1D),
                border = BorderStroke(1.dp, Color(0xFF2E, 0x10, 0x65))
            ) {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    // Persona Header
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = personaName,
                            color = Color(0xFFC0, 0x84, 0xFC),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )

                        Text(
                            text = time,
                            color = Color(0xFF6B, 0x72, 0x80),
                            fontSize = 10.sp
                        )
                    }

                    // Main Text Message
                    Text(
                        text = message,
                        color = Color(0xFFE5, 0xE7, 0xEB),
                        fontSize = 14.sp,
                        lineHeight = 20.sp
                    )

                    // Optional Code Snippet Block with Copy Action
                    if (!codeSnippet.isNullOrBlank()) {
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = Color(0xFF0F, 0x11, 0x15),
                            border = BorderStroke(0.5.dp, Color(0xFF26, 0x2A, 0x33)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.fillMaxWidth()) {
                                // Code Header Bar
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .background(Color(0xFF1A, 0x1D, 0x24))
                                        .padding(horizontal = 10.dp, vertical = 6.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = "KOTLIN",
                                        color = Color(0xFF9C, 0xA3, 0xAF),
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        letterSpacing = 1.sp
                                    )

                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                                        modifier = Modifier.clickable {
                                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                            clipboardManager.setText(AnnotatedString(codeSnippet))
                                            Toast.makeText(context, "📋 Code copied to clipboard", Toast.LENGTH_SHORT).show()
                                        }
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.ContentCopy,
                                            contentDescription = "Copy Code",
                                            tint = accentColor,
                                            modifier = Modifier.size(13.dp)
                                        )
                                        Text(
                                            text = "Copy",
                                            color = accentColor,
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.SemiBold
                                        )
                                    }
                                }

                                // Code Content
                                Text(
                                    text = codeSnippet,
                                    color = Color(0xFF93, 0xC5, 0xFD),
                                    fontSize = 11.5.sp,
                                    fontFamily = FontFamily.Monospace,
                                    lineHeight = 16.sp,
                                    modifier = Modifier.padding(10.dp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

package com.quant.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.FloatingActionButtonDefaults
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
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Model representing an audio room participant (Speaker, Host, Moderator, Listener).
 */
data class AudioParticipant(
    val id: String,
    val name: String,
    val role: String, // "Host", "Moderator", "Speaker", "Listener"
    val isMuted: Boolean = false,
    val handRaised: Boolean = false,
    val isSpeaking: Boolean = false,
    val avatarEmoji: String = "👤",
    val avatarColorSeed: Long = 0xFF4F46E5
)

/**
 * Default sample speakers and listeners for preview & default stage rendering.
 */
val SAMPLE_STAGE_SPEAKERS = listOf(
    AudioParticipant(
        id = "user_1",
        name = "Astra Sovereign",
        role = "Host",
        isMuted = false,
        handRaised = false,
        isSpeaking = true,
        avatarEmoji = "👑",
        avatarColorSeed = 0xFF6366F1
    ),
    AudioParticipant(
        id = "user_2",
        name = "Kaelen Voss",
        role = "Moderator",
        isMuted = false,
        handRaised = false,
        isSpeaking = false,
        avatarEmoji = "⚡",
        avatarColorSeed = 0xFF06B6D4
    ),
    AudioParticipant(
        id = "user_3",
        name = "Elena Rostova",
        role = "Speaker",
        isMuted = true,
        handRaised = true,
        isSpeaking = false,
        avatarEmoji = "💎",
        avatarColorSeed = 0xFFEC4899
    ),
    AudioParticipant(
        id = "user_4",
        name = "Marcus Drake",
        role = "Speaker",
        isMuted = false,
        handRaised = false,
        isSpeaking = true,
        avatarEmoji = "🚀",
        avatarColorSeed = 0xFF10B981
    ),
    AudioParticipant(
        id = "user_5",
        name = "Devon Miles",
        role = "Speaker",
        isMuted = true,
        handRaised = false,
        isSpeaking = false,
        avatarEmoji = "🎨",
        avatarColorSeed = 0xFFF59E0B
    ),
    AudioParticipant(
        id = "user_6",
        name = "Serena Lin",
        role = "Speaker",
        isMuted = true,
        handRaised = true,
        isSpeaking = false,
        avatarEmoji = "🌟",
        avatarColorSeed = 0xFF8B5CF6
    )
)

val SAMPLE_STAGE_LISTENERS = listOf(
    AudioParticipant("lis_1", "Alex Rivera", "Listener", isMuted = true, avatarEmoji = "👓", avatarColorSeed = 0xFF3B82F6),
    AudioParticipant("lis_2", "Sam Chen", "Listener", isMuted = true, avatarEmoji = "🎧", avatarColorSeed = 0xFF14B8A6),
    AudioParticipant("lis_3", "Priya Patel", "Listener", isMuted = true, avatarEmoji = "🌺", avatarColorSeed = 0xFFF43F5E),
    AudioParticipant("lis_4", "Jordan Blake", "Listener", isMuted = true, avatarEmoji = "🎸", avatarColorSeed = 0xFFEAB308),
    AudioParticipant("lis_5", "Taylor Kim", "Listener", isMuted = true, avatarEmoji = "🕶️", avatarColorSeed = 0xFF64748B),
    AudioParticipant("lis_6", "Morgan Lee", "Listener", isMuted = true, avatarEmoji = "💻", avatarColorSeed = 0xFF84CC16)
)

/**
 * Jetpack Compose Chatter Live Audio Room Stage Component.
 *
 * Provides:
 * - Stage header with Room Title, Topic tag, and pulsating LIVE listener badge.
 * - Grid of active speakers with circular avatar placeholders, speaking border pulse animation, and mute/hand indicators.
 * - Secondary section for audience listeners with quick avatar chips.
 * - Bottom floating control bar with Mute/Unmute microphone button, Raise Hand toggle FAB, and Leave Room pill button.
 */
@Composable
fun AudioRoomStage(
    modifier: Modifier = Modifier,
    roomTitle: String = "🎙️ Quant Sovereign AI & Agentic OS Summit",
    roomTopic: String = "Artificial Intelligence • Voice & Swarm Systems",
    listenerCount: Int = 1420,
    speakers: List<AudioParticipant> = SAMPLE_STAGE_SPEAKERS,
    listeners: List<AudioParticipant> = SAMPLE_STAGE_LISTENERS,
    initialMuted: Boolean = true,
    initialHandRaised: Boolean = false,
    onToggleMute: (Boolean) -> Unit = {},
    onToggleRaiseHand: (Boolean) -> Unit = {},
    onLeaveRoom: () -> Unit = {},
    onParticipantClick: (AudioParticipant) -> Unit = {},
    onMinimize: () -> Unit = {}
) {
    var isMuted by remember { mutableStateOf(initialMuted) }
    var isHandRaised by remember { mutableStateOf(initialHandRaised) }

    Surface(
        modifier = modifier.fillMaxSize(),
        color = Color(0xFF0A0C12)
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(bottom = 96.dp) // Leave clearance for bottom floating control bar
            ) {
                // Stage Header
                AudioRoomStageHeader(
                    title = roomTitle,
                    topic = roomTopic,
                    listenerCount = listenerCount,
                    onMinimize = onMinimize
                )

                // Speakers & Listeners Grid
                LazyVerticalGrid(
                    columns = GridCells.Fixed(3),
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                        .padding(horizontal = 16.dp),
                    contentPadding = PaddingValues(vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Section header: Speakers
                    item(span = { GridItemSpan(3) }) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = "STAGE SPEAKERS (${speakers.size})",
                                color = Color(0xFF94A3B8),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 1.sp
                            )
                            Text(
                                text = "Tap speaker for profile",
                                color = Color(0xFF64748B),
                                fontSize = 11.sp
                            )
                        }
                    }

                    // Speakers items
                    items(speakers, key = { it.id }) { speaker ->
                        AudioSpeakerGridItem(
                            participant = speaker,
                            onClick = { onParticipantClick(speaker) }
                        )
                    }

                    // Section divider & header: Audience Listeners
                    item(span = { GridItemSpan(3) }) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = "LISTENERS (%,d)".format(listenerCount),
                                color = Color(0xFF94A3B8),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 1.sp
                            )
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = Color(0x3338BDF8)
                            ) {
                                Text(
                                    text = "✋ Raise hand to speak",
                                    color = Color(0xFF38BDF8),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Medium,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                )
                            }
                        }
                    }

                    // Listeners items (compact)
                    items(listeners, key = { it.id }) { listener ->
                        AudioListenerGridItem(
                            participant = listener,
                            onClick = { onParticipantClick(listener) }
                        )
                    }
                }
            }

            // Bottom Floating Control Bar
            AudioRoomBottomControlBar(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(horizontal = 16.dp, vertical = 18.dp),
                isMuted = isMuted,
                isHandRaised = isHandRaised,
                onToggleMute = {
                    isMuted = !isMuted
                    onToggleMute(isMuted)
                },
                onToggleRaiseHand = {
                    isHandRaised = !isHandRaised
                    onToggleRaiseHand(isHandRaised)
                },
                onLeaveRoom = onLeaveRoom
            )
        }
    }
}

/**
 * Stage Top Header containing Title, Topic tag, and live listener badge.
 */
@Composable
private fun AudioRoomStageHeader(
    title: String,
    topic: String,
    listenerCount: Int,
    onMinimize: () -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = Color(0xF012151F),
        border = BorderStroke(1.dp, Color(0x1A4F46E5))
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 14.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                // Live listener count badge
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = Color(0xFF1E2235),
                    border = BorderStroke(1.dp, Color(0x33EF4444))
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Pulsing LIVE red dot
                        PulsingLiveDot()
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "LIVE",
                            color = Color(0xFFEF4444),
                            fontWeight = FontWeight.Black,
                            fontSize = 11.sp,
                            letterSpacing = 1.sp
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "👥 %,d".format(listenerCount),
                            color = Color(0xFFE2E8F0),
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 12.sp
                        )
                    }
                }

                // Header action: Minimize button
                Surface(
                    shape = CircleShape,
                    color = Color(0xFF1F2433),
                    modifier = Modifier.clickable { onMinimize() }
                ) {
                    Box(
                        modifier = Modifier.size(32.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "⌄",
                            color = Color.White,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Room Title
            Text(
                text = title,
                color = Color.White,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )

            Spacer(modifier = Modifier.height(4.dp))

            // Topic Tag
            Text(
                text = topic,
                color = Color(0xFF818CF8),
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

/**
 * Pulsing red live indicator dot.
 */
@Composable
private fun PulsingLiveDot() {
    val infiniteTransition = rememberInfiniteTransition(label = "LivePulse")
    val scale by infiniteTransition.animateFloat(
        initialValue = 0.85f,
        targetValue = 1.25f,
        animationSpec = infiniteRepeatable(
            animation = tween(700, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "DotScale"
    )
    val alpha by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 0.4f,
        animationSpec = infiniteRepeatable(
            animation = tween(700, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "DotAlpha"
    )

    Box(
        modifier = Modifier
            .size(8.dp)
            .graphicsLayer(scaleX = scale, scaleY = scale, alpha = alpha)
            .clip(CircleShape)
            .background(Color(0xFFEF4444))
    )
}

/**
 * Individual Speaker Grid Card with avatar, speaking pulse animation, and mute icon.
 */
@Composable
private fun AudioSpeakerGridItem(
    participant: AudioParticipant,
    onClick: () -> Unit
) {
    // Pulse animation when speaking
    val infiniteTransition = rememberInfiniteTransition(label = "SpeakerSpeakingPulse")
    val pulseBorderWidth by infiniteTransition.animateFloat(
        initialValue = 2f,
        targetValue = 5f,
        animationSpec = infiniteRepeatable(
            animation = tween(500, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "SpeakingPulseWidth"
    )
    val pulseGlowAlpha by infiniteTransition.animateFloat(
        initialValue = 0.9f,
        targetValue = 0.3f,
        animationSpec = infiniteRepeatable(
            animation = tween(500, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "SpeakingGlowAlpha"
    )

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick
            ),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier.size(84.dp),
            contentAlignment = Alignment.Center
        ) {
            // Animated Speaking Ring
            if (participant.isSpeaking) {
                Box(
                    modifier = Modifier
                        .size(84.dp)
                        .clip(CircleShape)
                        .border(
                            width = pulseBorderWidth.dp,
                            color = Color(0xFF10B981).copy(alpha = pulseGlowAlpha),
                            shape = CircleShape
                        )
                )
            }

            // Avatar Container
            Surface(
                modifier = Modifier.size(72.dp),
                shape = CircleShape,
                color = Color(participant.avatarColorSeed),
                border = BorderStroke(
                    width = if (participant.isSpeaking) 2.5.dp else 1.5.dp,
                    color = if (participant.isSpeaking) Color(0xFF10B981) else Color(0x334B5563)
                ),
                shadowElevation = if (participant.isSpeaking) 8.dp else 2.dp
            ) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = participant.avatarEmoji,
                        fontSize = 32.sp
                    )
                }
            }

            // Hand Raised Badge (Top-Right)
            if (participant.handRaised) {
                Surface(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .offset(x = 2.dp, y = (-2).dp),
                    shape = CircleShape,
                    color = Color(0xFFF59E0B),
                    border = BorderStroke(1.5.dp, Color(0xFF0A0C12)),
                    shadowElevation = 4.dp
                ) {
                    Box(
                        modifier = Modifier.size(24.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "✋",
                            fontSize = 12.sp
                        )
                    }
                }
            }

            // Mute Icon Badge (Bottom-Right)
            Surface(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .offset(x = 2.dp, y = 2.dp),
                shape = CircleShape,
                color = if (participant.isMuted) Color(0xFFEF4444) else Color(0xFF10B981),
                border = BorderStroke(1.5.dp, Color(0xFF0A0C12)),
                shadowElevation = 4.dp
            ) {
                Box(
                    modifier = Modifier.size(22.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = if (participant.isMuted) "✕" else "🎙️",
                        color = Color.White,
                        fontSize = if (participant.isMuted) 10.sp else 9.sp,
                        fontWeight = FontWeight.Black
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(6.dp))

        // Name
        Text(
            text = participant.name,
            color = Color.White,
            fontWeight = FontWeight.SemiBold,
            fontSize = 12.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(2.dp))

        // Role Badge
        val roleBgColor = when (participant.role.lowercase()) {
            "host" -> Color(0x338B5CF6)
            "moderator" -> Color(0x3306B6D4)
            else -> Color(0x224B5563)
        }
        val roleTextColor = when (participant.role.lowercase()) {
            "host" -> Color(0xFFA78BFA)
            "moderator" -> Color(0xFF67E8F9)
            else -> Color(0xFF94A3B8)
        }

        Surface(
            shape = RoundedCornerShape(8.dp),
            color = roleBgColor
        ) {
            Text(
                text = participant.role,
                color = roleTextColor,
                fontSize = 10.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
            )
        }
    }
}

/**
 * Compact Listener Grid Item for audience members.
 */
@Composable
private fun AudioListenerGridItem(
    participant: AudioParticipant,
    onClick: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick
            ),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Surface(
            modifier = Modifier.size(48.dp),
            shape = CircleShape,
            color = Color(participant.avatarColorSeed),
            border = BorderStroke(1.dp, Color(0x2264748B))
        ) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = participant.avatarEmoji,
                    fontSize = 20.sp
                )
            }
        }

        Spacer(modifier = Modifier.height(4.dp))

        Text(
            text = participant.name,
            color = Color(0xFFCBD5E1),
            fontSize = 11.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center
        )
    }
}

/**
 * Bottom Floating Control Bar with Mute toggle, Raise Hand FAB, and Leave Room pill button.
 */
@Composable
private fun AudioRoomBottomControlBar(
    modifier: Modifier = Modifier,
    isMuted: Boolean,
    isHandRaised: Boolean,
    onToggleMute: () -> Unit,
    onToggleRaiseHand: () -> Unit,
    onLeaveRoom: () -> Unit
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .shadow(20.dp, CircleShape),
        shape = CircleShape,
        color = Color(0xF2161A26),
        border = BorderStroke(1.dp, Color(0x334F46E5))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            // Mute / Unmute Microphone Toggle Button
            Surface(
                shape = CircleShape,
                color = if (isMuted) Color(0xFF262C3D) else Color(0xFF10B981),
                border = BorderStroke(
                    width = 1.dp,
                    color = if (isMuted) Color(0xFF374151) else Color(0xFF34D399)
                ),
                modifier = Modifier.clickable { onToggleMute() }
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = if (isMuted) "🔇" else "🎙️",
                        fontSize = 16.sp
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = if (isMuted) "Muted" else "Mic On",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp
                    )
                }
            }

            // Raise Hand Toggle FAB
            val handScale by animateFloatAsState(
                targetValue = if (isHandRaised) 1.08f else 1f,
                animationSpec = spring(dampingRatio = 0.6f),
                label = "HandScale"
            )

            FloatingActionButton(
                onClick = onToggleRaiseHand,
                modifier = Modifier
                    .size(46.dp)
                    .graphicsLayer(scaleX = handScale, scaleY = handScale),
                shape = CircleShape,
                containerColor = if (isHandRaised) Color(0xFFF59E0B) else Color(0xFF262C3D),
                contentColor = Color.White,
                elevation = FloatingActionButtonDefaults.elevation(defaultElevation = 6.dp)
            ) {
                Text(
                    text = "✋",
                    fontSize = 20.sp
                )
            }

            // Leave Room Pill Button
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = Color(0x28EF4444),
                border = BorderStroke(1.dp, Color(0x66EF4444)),
                modifier = Modifier.clickable { onLeaveRoom() }
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "✌️",
                        fontSize = 14.sp
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "Leave Quietly",
                        color = Color(0xFFEF4444),
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp
                    )
                }
            }
        }
    }
}

@Preview
@Composable
fun AudioRoomStagePreview() {
    AudioRoomStage()
}

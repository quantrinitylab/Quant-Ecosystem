package com.quant.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.sin
import kotlin.random.Random

/**
 * Model representing a virtual gift item in the Shortie / Live video stream creator economy.
 */
data class VirtualGiftItem(
    val id: String,
    val name: String,
    val icon: String,
    val coinCost: Int
)

/**
 * Internal model for tracking active animated floating gift bursts.
 */
private data class ActiveGiftBurst(
    val burstId: Long,
    val gift: VirtualGiftItem,
    val startOffsetX: Float,
    val targetOffsetX: Float,
    val durationMs: Int = 1800,
    val comboCount: Int = 1
)

/**
 * Standard virtual gifts catalog matching Shortie & QuantNeon creator economy.
 */
val DEFAULT_VIRTUAL_GIFTS = listOf(
    VirtualGiftItem("gift_rose", "Rose", "🌹", 1),
    VirtualGiftItem("gift_heart", "Heart", "💖", 5),
    VirtualGiftItem("gift_diamond", "Diamond", "💎", 50),
    VirtualGiftItem("gift_rocket", "Rocket", "🚀", 100),
    VirtualGiftItem("gift_car", "Sports Car", "🏎️", 500),
    VirtualGiftItem("gift_crown", "Crown", "👑", 1000),
    VirtualGiftItem("gift_star", "Supernova", "🌟", 2500)
)

/**
 * Jetpack Compose Shortie Virtual Gifts Overlay.
 *
 * Provides:
 * - Floating gifts selector bottom sheet / bar with animated entrance and exit.
 * - Dynamic animated burst / float particles with physics sway and scale effects.
 * - Live coin balance badge with top-up / recharge trigger.
 * - Interactive gift selection and high-contrast Send action with combo counter.
 */
@Composable
fun VirtualGiftOverlay(
    modifier: Modifier = Modifier,
    isVisible: Boolean = true,
    userCoinBalance: Int = 1250,
    gifts: List<VirtualGiftItem> = DEFAULT_VIRTUAL_GIFTS,
    recipientName: String = "Creator",
    onSendGift: (VirtualGiftItem, comboCount: Int) -> Unit = { _, _ -> },
    onRechargeCoins: () -> Unit = {},
    onDismiss: () -> Unit = {}
) {
    var selectedGift by remember { mutableStateOf(gifts.firstOrNull() ?: DEFAULT_VIRTUAL_GIFTS[0]) }
    var currentBalance by remember { mutableIntStateOf(userCoinBalance) }
    var comboCount by remember { mutableIntStateOf(1) }
    var lastGiftTime by remember { mutableLongStateOf(0L) }
    val activeBursts = remember { mutableStateListOf<ActiveGiftBurst>() }
    val scope = rememberCoroutineScope()

    // Sync external coin balance updates
    LaunchedEffect(userCoinBalance) {
        currentBalance = userCoinBalance
    }

    Box(
        modifier = modifier
            .fillMaxSize()
    ) {
        // Floating animated gift particles overlay across entire screen
        activeBursts.forEach { burst ->
            AnimatedFloatingGiftParticle(
                burst = burst,
                onFinished = {
                    activeBursts.remove(burst)
                }
            )
        }

        // Combo notification toast near center-bottom
        AnimatedVisibility(
            visible = comboCount > 1,
            enter = fadeIn() + slideInVertically(initialOffsetY = { 30 }),
            exit = fadeOut(),
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 260.dp)
        ) {
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = Color(0xDD1E1B4B),
                border = BorderStroke(1.dp, Color(0xFF818CF8)),
                shadowElevation = 8.dp
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "COMBO x$comboCount",
                        color = Color(0xFFFDE047),
                        fontWeight = FontWeight.Black,
                        fontSize = 15.sp,
                        letterSpacing = 1.sp
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = selectedGift.icon,
                        fontSize = 18.sp
                    )
                }
            }
        }

        // Bottom floating gifts selector bar
        AnimatedVisibility(
            visible = isVisible,
            enter = slideInVertically(initialOffsetY = { it }) + fadeIn(),
            exit = slideOutVertically(targetOffsetY = { it }) + fadeOut(),
            modifier = Modifier.align(Alignment.BottomCenter)
        ) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .shadow(16.dp, RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)),
                shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
                color = Color(0xF00D0F17),
                border = BorderStroke(1.dp, Color(0x334F46E5))
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp)
                ) {
                    // Drag handle / grab bar
                    Box(
                        modifier = Modifier
                            .align(Alignment.CenterHorizontally)
                            .size(width = 36.dp, height = 4.dp)
                            .clip(CircleShape)
                            .background(Color(0xFF333846))
                    )

                    Spacer(modifier = Modifier.height(10.dp))

                    // Header row: Title + Coin Badge + Close Button
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = "Send Virtual Gift",
                                    color = Color.White,
                                    fontSize = 16.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = "✨",
                                    fontSize = 14.sp
                                )
                            }
                            Text(
                                text = "Support $recipientName with live gifts",
                                color = Color(0xFF94A3B8),
                                fontSize = 12.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }

                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            // Coin Balance Pill Badge
                            Surface(
                                shape = RoundedCornerShape(16.dp),
                                color = Color(0xFF1E2230),
                                border = BorderStroke(1.dp, Color(0xFF374151)),
                                modifier = Modifier.clickable { onRechargeCoins() }
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = "🪙",
                                        fontSize = 13.sp
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text(
                                        text = "%,d".format(currentBalance),
                                        color = Color(0xFFFDE047),
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.sp
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Box(
                                        modifier = Modifier
                                            .size(16.dp)
                                            .clip(CircleShape)
                                            .background(Color(0xFF6366F1)),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(
                                            text = "+",
                                            color = Color.White,
                                            fontWeight = FontWeight.Black,
                                            fontSize = 11.sp
                                        )
                                    }
                                }
                            }

                            // Dismiss button
                            Box(
                                modifier = Modifier
                                    .size(28.dp)
                                    .clip(CircleShape)
                                    .background(Color(0xFF262A38))
                                    .clickable { onDismiss() },
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "✕",
                                    color = Color(0xFF94A3B8),
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    // Horizontal Gifts Selector Carousel
                    LazyRow(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        contentPadding = PaddingValues(horizontal = 2.dp, vertical = 4.dp)
                    ) {
                        items(gifts, key = { it.id }) { gift ->
                            val isSelected = gift.id == selectedGift.id
                            val canAfford = currentBalance >= gift.coinCost

                            GiftSelectorItemCard(
                                gift = gift,
                                isSelected = isSelected,
                                canAfford = canAfford,
                                onClick = {
                                    selectedGift = gift
                                    // Quick tap trigger preview
                                    val now = System.currentTimeMillis()
                                    if (now - lastGiftTime < 1500 && selectedGift.id == gift.id) {
                                        comboCount++
                                    } else {
                                        comboCount = 1
                                    }
                                    lastGiftTime = now
                                }
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    // Bottom Control Row: Selected Gift Summary + Send Button
                    val canAffordSelected = currentBalance >= selectedGift.coinCost

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text(
                                text = "${selectedGift.icon} ${selectedGift.name}",
                                color = Color.White,
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 14.sp
                            )
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = "Cost: ",
                                    color = Color(0xFF94A3B8),
                                    fontSize = 12.sp
                                )
                                Text(
                                    text = "${selectedGift.coinCost} Coins",
                                    color = if (canAffordSelected) Color(0xFF38BDF8) else Color(0xFFF87171),
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 12.sp
                                )
                            }
                        }

                        // Send Gift Button
                        val sendButtonScale by animateFloatAsState(
                            targetValue = if (canAffordSelected) 1f else 0.95f,
                            animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy),
                            label = "SendButtonScale"
                        )

                        Button(
                            onClick = {
                                if (canAffordSelected) {
                                    currentBalance -= selectedGift.coinCost
                                    val now = System.currentTimeMillis()
                                    if (now - lastGiftTime < 2000) {
                                        comboCount++
                                    } else {
                                        comboCount = 1
                                    }
                                    lastGiftTime = now

                                    // Spawn burst animation
                                    val newBurst = ActiveGiftBurst(
                                        burstId = now + Random.nextLong(1000),
                                        gift = selectedGift,
                                        startOffsetX = Random.nextFloat() * 120f - 60f,
                                        targetOffsetX = Random.nextFloat() * 200f - 100f,
                                        durationMs = 1600 + Random.nextInt(400),
                                        comboCount = comboCount
                                    )
                                    activeBursts.add(newBurst)

                                    // Invoke callback
                                    onSendGift(selectedGift, comboCount)
                                } else {
                                    onRechargeCoins()
                                }
                            },
                            modifier = Modifier
                                .graphicsLayer(scaleX = sendButtonScale, scaleY = sendButtonScale)
                                .height(42.dp),
                            shape = RoundedCornerShape(21.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (canAffordSelected) Color(0xFF6366F1) else Color(0xFF374151),
                                contentColor = Color.White
                            ),
                            elevation = ButtonDefaults.buttonElevation(defaultElevation = 6.dp)
                        ) {
                            Text(
                                text = if (canAffordSelected) "Send ${selectedGift.icon}" else "Get Coins",
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * Individual Gift Selector Card inside the horizontal carousel.
 */
@Composable
private fun GiftSelectorItemCard(
    gift: VirtualGiftItem,
    isSelected: Boolean,
    canAfford: Boolean,
    onClick: () -> Unit
) {
    val scale by animateFloatAsState(
        targetValue = if (isSelected) 1.08f else 1f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy),
        label = "GiftItemScale"
    )

    val borderColor = when {
        isSelected -> Color(0xFF818CF8)
        canAfford -> Color(0x334B5563)
        else -> Color(0x1A4B5563)
    }

    val backgroundColor = when {
        isSelected -> Color(0xFF232738)
        canAfford -> Color(0xFF161922)
        else -> Color(0x80161922)
    }

    Card(
        modifier = Modifier
            .width(76.dp)
            .height(96.dp)
            .graphicsLayer(scaleX = scale, scaleY = scale)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick
            ),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = backgroundColor),
        border = BorderStroke(if (isSelected) 2.dp else 1.dp, borderColor)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(vertical = 8.dp, horizontal = 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = gift.icon,
                fontSize = 28.sp,
                textAlign = TextAlign.Center
            )

            Text(
                text = gift.name,
                color = if (canAfford) Color.White else Color(0xFF6B7280),
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center
            )

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Text(
                    text = "🪙",
                    fontSize = 10.sp
                )
                Spacer(modifier = Modifier.width(2.dp))
                Text(
                    text = "${gift.coinCost}",
                    color = if (canAfford) Color(0xFFFDE047) else Color(0xFF9CA3AF),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

/**
 * Animated Floating Gift Particle that moves upward with physics-style wobble and fade out.
 */
@Composable
private fun AnimatedFloatingGiftParticle(
    burst: ActiveGiftBurst,
    onFinished: () -> Unit
) {
    val progress = remember { Animatable(0f) }

    LaunchedEffect(burst.burstId) {
        progress.animateTo(
            targetValue = 1f,
            animationSpec = tween(
                durationMillis = burst.durationMs,
                easing = LinearEasing
            )
        )
        onFinished()
    }

    val t = progress.value
    // Float upwards from bottom (e.g., -40dp up to -520dp)
    val offsetY = -520f * t
    // Sinusoidal sway
    val sway = sin(t * Math.PI.toFloat() * 3f) * 28f
    val currentOffsetX = burst.startOffsetX + (burst.targetOffsetX - burst.startOffsetX) * t + sway

    // Scale pop then gentle dissipation
    val scale = when {
        t < 0.15f -> 0.4f + (t / 0.15f) * 0.9f
        t > 0.8f -> 1.3f - ((t - 0.8f) / 0.2f) * 0.4f
        else -> 1.3f
    }

    // Alpha fade
    val alpha = if (t > 0.65f) (1f - (t - 0.65f) / 0.35f).coerceIn(0f, 1f) else 1f

    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.BottomCenter
    ) {
        Column(
            modifier = Modifier
                .offset(x = currentOffsetX.dp, y = (offsetY - 140f).dp)
                .graphicsLayer(
                    alpha = alpha,
                    scaleX = scale,
                    scaleY = scale,
                    rotationZ = sin(t * Math.PI.toFloat() * 2f) * 12f
                ),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = burst.gift.icon,
                fontSize = 44.sp,
                textAlign = TextAlign.Center
            )
            if (burst.comboCount > 1) {
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = Color(0xE64F46E5),
                    border = BorderStroke(1.dp, Color(0xFFA5B4FC))
                ) {
                    Text(
                        text = "x${burst.comboCount}",
                        color = Color(0xFFFDE047),
                        fontWeight = FontWeight.Black,
                        fontSize = 11.sp,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                    )
                }
            }
        }
    }
}

@Preview
@Composable
fun VirtualGiftOverlayPreview() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0B0C10))
    ) {
        VirtualGiftOverlay(
            isVisible = true,
            userCoinBalance = 1500,
            recipientName = "Aria Starlight"
        )
    }
}

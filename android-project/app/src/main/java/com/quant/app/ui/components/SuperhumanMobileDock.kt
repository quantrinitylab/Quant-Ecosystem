package com.quant.app.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material.icons.outlined.Archive
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Superhuman-Class Mobile Triage Dock for QuantMail.
 * Floats directly above the bottom navigation bar to provide sub-5ms inbox triage:
 * - Done / Archive (E)
 * - Snooze (S)
 * - Star (★)
 * - Compose / Reply (R)
 * - Undo (Z)
 * - Fast Command Palette (⌘K)
 */
@Composable
fun SuperhumanMobileDock(
  onArchive: () -> Unit = {},
  onSnooze: () -> Unit = {},
  onStar: () -> Unit = {},
  onReply: () -> Unit = {},
  onUndo: () -> Unit = {},
  onCommandPalette: () -> Unit = {},
  onNavigateNext: () -> Unit = {},
  onNavigatePrev: () -> Unit = {},
  accentColor: Color = Color(0xFFFF, 0x8C, 0x42),
  modifier: Modifier = Modifier,
) {
  val haptic = LocalHapticFeedback.current
  var isStarred by remember { mutableStateOf(false) }
  var lastActionMessage by remember { mutableStateOf<String?>(null) }

  Column(
    modifier = modifier
      .fillMaxWidth()
      .padding(horizontal = 16.dp, vertical = 6.dp),
    horizontalAlignment = Alignment.CenterHorizontally
  ) {
    // Optional ephemeral Undo pill above dock
    AnimatedVisibility(
      visible = lastActionMessage != null,
      enter = fadeIn() + scaleIn(initialScale = 0.8f),
      exit = fadeOut() + scaleOut(targetScale = 0.8f)
    ) {
      Surface(
        shape = RoundedCornerShape(16.dp),
        color = Color(0xFF14, 0x18, 0x24),
        border = androidx.compose.foundation.BorderStroke(1.dp, accentColor.copy(alpha = 0.5f)),
        shadowElevation = 6.dp,
        modifier = Modifier.padding(bottom = 6.dp)
      ) {
        Row(
          modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
          Text(
            text = lastActionMessage ?: "",
            color = Color.White,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium
          )

          Box(
            modifier = Modifier
              .clip(RoundedCornerShape(8.dp))
              .background(accentColor.copy(alpha = 0.2f))
              .clickable {
                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                onUndo()
                lastActionMessage = null
              }
              .padding(horizontal = 8.dp, vertical = 2.dp)
          ) {
            Text(
              text = "Undo (Z)",
              color = accentColor,
              fontSize = 11.sp,
              fontWeight = FontWeight.Bold
            )
          }

          Icon(
            imageVector = Icons.Default.Close,
            contentDescription = "Dismiss",
            tint = Color(0xFF94, 0xA3, 0xB8),
            modifier = Modifier
              .size(16.dp)
              .clickable { lastActionMessage = null }
          )
        }
      }
    }

    // Main Superhuman Floating Dock Capsule
    Surface(
      shape = RoundedCornerShape(22.dp),
      color = Color(0xFF10, 0x12, 0x1A).copy(alpha = 0.96f),
      border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF28, 0x2E, 0x3D)),
      shadowElevation = 8.dp
    ) {
      Row(
        modifier = Modifier
          .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
      ) {
        // 1. Done / Archive (E)
        DockActionButton(
          icon = Icons.Outlined.Archive,
          label = "Done",
          keyHint = "E",
          accentColor = accentColor,
          onClick = {
            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            lastActionMessage = "Conversation marked done"
            onArchive()
          }
        )

        // 2. Snooze (S)
        DockActionButton(
          icon = Icons.Outlined.Schedule,
          label = "Snooze",
          keyHint = "S",
          accentColor = Color(0xFFF5, 0x9E, 0x0B),
          onClick = {
            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            lastActionMessage = "Snoozed until tomorrow 8:00 AM"
            onSnooze()
          }
        )

        // 3. Star (★)
        DockActionButton(
          icon = if (isStarred) Icons.Default.Star else Icons.Default.StarBorder,
          label = if (isStarred) "Starred" else "Star",
          keyHint = "★",
          accentColor = if (isStarred) Color(0xFFF5, 0x9E, 0x0B) else Color(0xFF94, 0xA3, 0xB8),
          iconTint = if (isStarred) Color(0xFFF5, 0x9E, 0x0B) else Color(0xFFCBD5E1),
          onClick = {
            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            isStarred = !isStarred
            onStar()
          }
        )

        // 4. Reply / Compose (R)
        DockActionButton(
          icon = Icons.Default.Edit,
          label = "Reply",
          keyHint = "R",
          accentColor = accentColor,
          onClick = {
            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            onReply()
          }
        )

        // Vertical divider
        Box(
          modifier = Modifier
            .size(width = 1.dp, height = 22.dp)
            .background(Color(0xFF28, 0x2E, 0x3D))
        )

        // 5. ⌘K Command Palette / Search Trigger
        Surface(
          shape = RoundedCornerShape(14.dp),
          color = accentColor.copy(alpha = 0.16f),
          border = androidx.compose.foundation.BorderStroke(1.dp, accentColor.copy(alpha = 0.35f)),
          modifier = Modifier
            .clickable(
              interactionSource = remember { MutableInteractionSource() },
              indication = null,
              onClick = {
                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                onCommandPalette()
              }
            )
        ) {
          Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
          ) {
            Icon(
              imageVector = Icons.Default.AutoAwesome,
              contentDescription = "Command Palette",
              tint = accentColor,
              modifier = Modifier.size(16.dp)
            )
            Text(
              text = "⌘K",
              color = accentColor,
              fontSize = 11.5.sp,
              fontWeight = FontWeight.Bold
            )
          }
        }
      }
    }
  }
}

@Composable
private fun DockActionButton(
  icon: ImageVector,
  label: String,
  keyHint: String,
  accentColor: Color,
  iconTint: Color = Color(0xFFD1, 0xD5, 0xDB),
  onClick: () -> Unit,
) {
  Box(
    modifier = Modifier
      .clip(RoundedCornerShape(12.dp))
      .clickable(
        interactionSource = remember { MutableInteractionSource() },
        indication = null,
        onClick = onClick
      )
      .padding(horizontal = 8.dp, vertical = 6.dp),
    contentAlignment = Alignment.Center
  ) {
    Row(
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
      Icon(
        imageVector = icon,
        contentDescription = label,
        tint = iconTint,
        modifier = Modifier.size(17.dp)
      )
      Text(
        text = keyHint,
        color = Color(0xFF64, 0x74, 0x8B),
        fontSize = 10.sp,
        fontWeight = FontWeight.SemiBold
      )
    }
  }
}

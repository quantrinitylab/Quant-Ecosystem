package com.quant.app.ui.navigation

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Sovereign Jetpack Compose Bottom Navigation Bar for the Quant Unified Productivity Suite.
 * Displays the 5 sovereign pillars:
 * 1. Mail (#FF8C42) - Unread count badge '12'
 * 2. Calendar (#F59E0B) - Today's day number '1'
 * 3. Drive (#38BDF8)
 * 4. Contacts (#10B981)
 * 5. QuantGit (#A78BFA)
 *
 * Features:
 * - Sleek Frosted Obsidian surface Color(0xFF09, 0x0A, 0x0C)
 * - Frosted hairline top border Color(0xFF1E, 0x22, 0x2A)
 * - Active tab indicator pill with smooth spring animation and glowing accent color
 * - Unread count badge on Mail tab ('12') and today's day number on Calendar tab ('1')
 * - Native haptic feedback on tab press
 */
@Composable
fun QuantBottomNavBar(
  activeTab: ProductivityTab,
  accentColor: Color = activeTab.tabAccentColor,
  onTabSelected: (ProductivityTab) -> Unit,
  modifier: Modifier = Modifier,
) {
  val haptic = LocalHapticFeedback.current

  Column(
    modifier = modifier
      .fillMaxWidth()
      .background(Color(0xFF09, 0x0A, 0x0C))
  ) {
    // Frosted top border Color(0xFF1E, 0x22, 0x2A)
    HorizontalDivider(
      thickness = 1.dp,
      color = Color(0xFF1E, 0x22, 0x2A)
    )

    Row(
      modifier = Modifier
        .fillMaxWidth()
        .height(64.dp)
        .padding(horizontal = 6.dp),
      horizontalArrangement = Arrangement.SpaceAround,
      verticalAlignment = Alignment.CenterVertically
    ) {
      ProductivityTab.entries.forEach { tab ->
        val isSelected = tab == activeTab
        val tabColor = tab.tabAccentColor

        val iconTint by animateColorAsState(
          targetValue = if (isSelected) tabColor else Color(0xFF9C, 0xA3, 0xAF),
          animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
          label = "tabIconTint_${tab.name}"
        )

        val pillBackground by animateColorAsState(
          targetValue = if (isSelected) tabColor.copy(alpha = 0.18f) else Color.Transparent,
          animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
          label = "tabPillBackground_${tab.name}"
        )

        val pillBorderColor by animateColorAsState(
          targetValue = if (isSelected) tabColor.copy(alpha = 0.40f) else Color.Transparent,
          animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
          label = "tabPillBorder_${tab.name}"
        )

        val textColor by animateColorAsState(
          targetValue = if (isSelected) tabColor else Color(0xFF9C, 0xA3, 0xAF),
          animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
          label = "tabTextColor_${tab.name}"
        )

        Column(
          modifier = Modifier
            .weight(1f)
            .clickable(
              interactionSource = remember { MutableInteractionSource() },
              indication = null,
              onClick = {
                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                onTabSelected(tab)
              }
            ),
          horizontalAlignment = Alignment.CenterHorizontally,
          verticalArrangement = Arrangement.Center
        ) {
          Box(
            modifier = Modifier
              .size(width = 48.dp, height = 28.dp)
              .clip(RoundedCornerShape(14.dp))
              .background(pillBackground)
              .border(1.dp, pillBorderColor, RoundedCornerShape(14.dp)),
            contentAlignment = Alignment.Center
          ) {
            Icon(
              imageVector = tab.icon,
              contentDescription = tab.title,
              tint = iconTint,
              modifier = Modifier.size(20.dp)
            )

            // Unread count badge on Mail tab ('12')
            if (tab == ProductivityTab.Mail) {
              Box(
                modifier = Modifier
                  .align(Alignment.TopEnd)
                  .offset(x = 5.dp, y = (-5).dp)
                  .clip(CircleShape)
                  .background(Color(0xFFFF, 0x8C, 0x42))
                  .border(1.dp, Color(0xFF09, 0x0A, 0x0C), CircleShape)
                  .padding(horizontal = 4.dp, vertical = 0.5.dp),
                contentAlignment = Alignment.Center
              ) {
                Text(
                  text = "12",
                  color = Color(0xFF09, 0x0A, 0x0C),
                  fontSize = 8.5.sp,
                  fontWeight = FontWeight.ExtraBold,
                  lineHeight = 10.sp
                )
              }
            }

            // Today's day number badge on Calendar tab ('1')
            if (tab == ProductivityTab.Calendar) {
              Box(
                modifier = Modifier
                  .align(Alignment.TopEnd)
                  .offset(x = 4.dp, y = (-5).dp)
                  .clip(CircleShape)
                  .background(Color(0xFFF5, 0x9E, 0x0B))
                  .border(1.dp, Color(0xFF09, 0x0A, 0x0C), CircleShape)
                  .padding(horizontal = 4.dp, vertical = 0.5.dp),
                contentAlignment = Alignment.Center
              ) {
                Text(
                  text = "1",
                  color = Color(0xFF09, 0x0A, 0x0C),
                  fontSize = 8.5.sp,
                  fontWeight = FontWeight.ExtraBold,
                  lineHeight = 10.sp
                )
              }
            }
          }

          Spacer(modifier = Modifier.height(3.dp))

          Text(
            text = tab.title,
            color = textColor,
            fontSize = 10.5.sp,
            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center
          )
        }
      }
    }

    // Respect gesture pill and navigation bar insets
    Spacer(modifier = Modifier.navigationBarsPadding())
  }
}

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
import androidx.compose.ui.draw.shadow
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
 * 1. Mail (#FF8C42) - Clean unread count badge '12' with drop shadow and crisp contrast
 * 2. Calendar (#F59E0B) - Clean today's day number '1' badge
 * 3. Drive (#38BDF8)
 * 4. Contacts (#10B981)
 * 5. QuantGit (#A78BFA)
 *
 * Visual Architecture:
 * - Surface: Deep obsidian frosted bar (#0D1017) with hairline divider (#1E2433).
 * - Active indicator: Smooth, modern rounded pill container (width 54dp, height 32dp)
 *   with soft tinted background (tabColor 14% alpha) and smooth spring animation.
 *   Completely borderless (no harsh outline border).
 * - Badges: Clean, beautifully positioned Material 3 style badges with crisp cutout borders.
 * - Typography: 11sp medium label below the icon with smooth color transition.
 * - Native haptic feedback on tab selection.
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
      .background(Color(0xFF0D, 0x10, 0x17))
  ) {
    // Subtle hairline divider #1E2433 at the top
    HorizontalDivider(
      thickness = 1.dp,
      color = Color(0xFF1E, 0x24, 0x33)
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
          targetValue = if (isSelected) tabColor else Color(0xFF94, 0xA3, 0xB8),
          animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
          label = "tabIconTint_${tab.name}"
        )

        val pillBackground by animateColorAsState(
          targetValue = if (isSelected) tabColor.copy(alpha = 0.14f) else Color.Transparent,
          animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
          label = "tabPillBackground_${tab.name}"
        )

        val textColor by animateColorAsState(
          targetValue = if (isSelected) tabColor else Color(0xFF94, 0xA3, 0xB8),
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
          // Smooth, modern rounded pill container (width 54dp, height 32dp)
          Box(
            modifier = Modifier
              .size(width = 54.dp, height = 32.dp)
              .background(pillBackground, RoundedCornerShape(16.dp)),
            contentAlignment = Alignment.Center
          ) {
            // Anchor container for icon and badge
            Box(
              modifier = Modifier.size(24.dp),
              contentAlignment = Alignment.Center
            ) {
              Icon(
                imageVector = tab.icon,
                contentDescription = tab.title,
                tint = iconTint,
                modifier = Modifier.size(20.dp)
              )

              // Clean Material 3 style badge for Mail tab: unread count '12' with drop shadow & crisp cutout
              if (tab == ProductivityTab.Mail) {
                Box(
                  modifier = Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = 8.dp, y = (-6).dp)
                    .shadow(3.dp, RoundedCornerShape(8.dp), ambientColor = Color.Black.copy(alpha = 0.6f))
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color(0xFFFF, 0x8C, 0x42))
                    .border(1.5.dp, Color(0xFF0D, 0x10, 0x17), RoundedCornerShape(8.dp))
                    .padding(horizontal = 4.5.dp, vertical = 0.5.dp),
                  contentAlignment = Alignment.Center
                ) {
                  Text(
                    text = "12",
                    color = Color.White,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.ExtraBold,
                    lineHeight = 11.sp
                  )
                }
              }

              // Clean Material 3 style badge for Calendar tab: today's day number '1'
              if (tab == ProductivityTab.Calendar) {
                Box(
                  modifier = Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = 7.dp, y = (-6).dp)
                    .shadow(3.dp, CircleShape, ambientColor = Color.Black.copy(alpha = 0.6f))
                    .clip(CircleShape)
                    .background(Color(0xFFF5, 0x9E, 0x0B))
                    .border(1.5.dp, Color(0xFF0D, 0x10, 0x17), CircleShape)
                    .size(14.dp),
                  contentAlignment = Alignment.Center
                ) {
                  Text(
                    text = "1",
                    color = Color(0xFF0D, 0x10, 0x17),
                    fontSize = 8.5.sp,
                    fontWeight = FontWeight.ExtraBold,
                    lineHeight = 10.sp
                  )
                }
              }
            }
          }

          Spacer(modifier = Modifier.height(4.dp))

          // Clean 11sp medium label below the icon with smooth color transition
          Text(
            text = tab.title,
            color = textColor,
            fontSize = 11.sp,
            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
            letterSpacing = 0.15.sp
          )
        }
      }
    }

    // Respect gesture pill and navigation bar insets
    Spacer(modifier = Modifier.navigationBarsPadding())
  }
}

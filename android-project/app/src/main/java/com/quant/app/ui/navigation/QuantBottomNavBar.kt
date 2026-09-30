package com.quant.app.ui.navigation

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * High-fidelity Jetpack Compose Bottom Navigation Bar for the Quant Unified Productivity Suite.
 * Displays the 5 primary tabs: Mail, Calendar, Drive, CodeHub, and Quanty AI.
 */
@Composable
fun QuantBottomNavBar(
  activeTab: ProductivityTab,
  accentColor: Color,
  onTabSelected: (ProductivityTab) -> Unit,
  modifier: Modifier = Modifier,
) {
  Column(
    modifier = modifier
      .fillMaxWidth()
      .background(Color(0xFF16, 0x18, 0x1D))
  ) {
    // Subtle frosted hairline top divider
    HorizontalDivider(
      thickness = 0.5.dp,
      color = Color(0x22, 0xFF, 0xFF, 0xFF)
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

        val iconTint by animateColorAsState(
          targetValue = if (isSelected) accentColor else Color(0xFF9C, 0xA3, 0xAF),
          animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
          label = "tabIconTint_${tab.name}"
        )

        val pillBackground by animateColorAsState(
          targetValue = if (isSelected) accentColor.copy(alpha = 0.16f) else Color.Transparent,
          animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
          label = "tabPillBackground_${tab.name}"
        )

        val textColor by animateColorAsState(
          targetValue = if (isSelected) accentColor else Color(0xFF9C, 0xA3, 0xAF),
          animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
          label = "tabTextColor_${tab.name}"
        )

        Column(
          modifier = Modifier
            .weight(1f)
            .clickable(
              interactionSource = remember { MutableInteractionSource() },
              indication = null,
              onClick = { onTabSelected(tab) }
            ),
          horizontalAlignment = Alignment.CenterHorizontally,
          verticalArrangement = Arrangement.Center
        ) {
          Box(
            modifier = Modifier
              .size(width = 46.dp, height = 28.dp)
              .clip(RoundedCornerShape(14.dp))
              .background(pillBackground),
            contentAlignment = Alignment.Center
          ) {
            Icon(
              imageVector = tab.icon,
              contentDescription = tab.title,
              tint = iconTint,
              modifier = Modifier.size(20.dp)
            )
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

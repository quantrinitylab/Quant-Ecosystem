package com.quant.app.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBox
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Cloud
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Upload
import androidx.compose.ui.graphics.vector.ImageVector

/**
 * The 5 core pillars of the Quant Sovereign Unified Productivity Suite:
 * 1. Mail (QuantMail)
 * 2. Calendar (QuantCalendar)
 * 3. Drive (QuantDrive)
 * 4. Contacts (QuantContacts)
 * 5. QuantGit (QuantGit / CodeHub)
 */
enum class ProductivityTab(
  val title: String,
  val url: String,
  val icon: ImageVector,
  val fabLabel: String,
  val fabIcon: ImageVector,
  val tabAccentColor: androidx.compose.ui.graphics.Color,
) {
  Mail(
    title = "Mail",
    url = "https://quantmail.in/",
    icon = Icons.Default.Email,
    fabLabel = "Compose",
    fabIcon = Icons.Default.Edit,
    tabAccentColor = androidx.compose.ui.graphics.Color(0xFFFF, 0x8C, 0x42), // #FF8C42
  ),
  Calendar(
    title = "Calendar",
    url = "https://quantmail.in/calendar",
    icon = Icons.Default.DateRange,
    fabLabel = "New Event",
    fabIcon = Icons.Default.Add,
    tabAccentColor = androidx.compose.ui.graphics.Color(0xFFF5, 0x9E, 0x0B), // #F59E0B
  ),
  Drive(
    title = "Drive",
    url = "https://quantmail.in/drive",
    icon = Icons.Default.Cloud,
    fabLabel = "Upload",
    fabIcon = Icons.Default.Upload,
    tabAccentColor = androidx.compose.ui.graphics.Color(0xFF38, 0xBD, 0xF8), // #38BDF8
  ),
  Contacts(
    title = "Contacts",
    url = "https://quantmail.in/contacts",
    icon = Icons.Default.AccountBox,
    fabLabel = "New Contact",
    fabIcon = Icons.Default.PersonAdd,
    tabAccentColor = androidx.compose.ui.graphics.Color(0xFF10, 0xB9, 0x81), // #10B981
  ),
  QuantGit(
    title = "QuantGit",
    url = "https://quantmail.in/quantgit",
    icon = Icons.Default.Code,
    fabLabel = "New Repo",
    fabIcon = Icons.Default.Add,
    tabAccentColor = androidx.compose.ui.graphics.Color(0xFFA7, 0x8B, 0xFA), // #A78BFA
  );

  companion object {
    /**
     * Resolves the active ProductivityTab from the currently loaded WebView URL.
     */
    fun fromUrl(url: String?): ProductivityTab {
      val trimmed = url?.trim()?.lowercase() ?: return Mail
      return when {
        trimmed.contains("/calendar") -> Calendar
        trimmed.contains("/drive") -> Drive
        trimmed.contains("/contacts") -> Contacts
        trimmed.contains("/quantgit") || trimmed.contains("/codehub") -> QuantGit
        else -> Mail
      }
    }
  }
}

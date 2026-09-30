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
) {
  Mail(
    title = "Mail",
    url = "https://quantmail.in/",
    icon = Icons.Default.Email,
    fabLabel = "Compose",
    fabIcon = Icons.Default.Edit,
  ),
  Calendar(
    title = "Calendar",
    url = "https://quantmail.in/calendar",
    icon = Icons.Default.DateRange,
    fabLabel = "New Event",
    fabIcon = Icons.Default.Add,
  ),
  Drive(
    title = "Drive",
    url = "https://quantmail.in/drive",
    icon = Icons.Default.Cloud,
    fabLabel = "Upload",
    fabIcon = Icons.Default.Upload,
  ),
  Contacts(
    title = "Contacts",
    url = "https://quantmail.in/contacts",
    icon = Icons.Default.AccountBox,
    fabLabel = "New Contact",
    fabIcon = Icons.Default.PersonAdd,
  ),
  QuantGit(
    title = "QuantGit",
    url = "https://quantmail.in/quantgit",
    icon = Icons.Default.Code,
    fabLabel = "New Repo",
    fabIcon = Icons.Default.Add,
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

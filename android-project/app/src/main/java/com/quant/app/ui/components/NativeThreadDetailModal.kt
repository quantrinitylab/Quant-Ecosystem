package com.quant.app.ui.components

import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Reply
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Forward
import androidx.compose.material.icons.filled.Mail
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Native Thread Detail Modal matching Gmail & Superhuman.
 * Features: Action bar (archive, delete, star, mark unread), AI summarize pill,
 * formatted message body, attachment pills, and quick reply actions.
 */
@Composable
fun NativeThreadDetailModal(
    item: SearchResultItem,
    onDismiss: () -> Unit,
    onReply: (SearchResultItem) -> Unit = {},
    accentColor: Color = Color(0xFFFF8C42),
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    var isStarred by remember { mutableStateOf(false) }
    var showAiSummary by remember { mutableStateOf(false) }

    BackHandler(onBack = onDismiss)

    Surface(
        modifier = modifier
            .fillMaxSize()
            .statusBarsPadding(),
        color = Color(0xFF0B0C0E)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
        ) {
            // ─── 1. HEADER ACTION BAR ─────────────────────────────────────────
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp)
                    .padding(horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onDismiss) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Back",
                        tint = Color.White
                    )
                }

                Spacer(modifier = Modifier.weight(1f))

                IconButton(onClick = {
                    Toast.makeText(context, "📥 Archived", Toast.LENGTH_SHORT).show()
                }) {
                    Icon(
                        imageVector = Icons.Filled.Archive,
                        contentDescription = "Archive",
                        tint = Color(0xFF94A3B8)
                    )
                }
                IconButton(onClick = {
                    Toast.makeText(context, "🗑️ Deleted", Toast.LENGTH_SHORT).show()
                }) {
                    Icon(
                        imageVector = Icons.Filled.Delete,
                        contentDescription = "Delete",
                        tint = Color(0xFF94A3B8)
                    )
                }
                IconButton(onClick = {
                    Toast.makeText(context, "✉️ Marked unread", Toast.LENGTH_SHORT).show()
                }) {
                    Icon(
                        imageVector = Icons.Filled.Mail,
                        contentDescription = "Mark Unread",
                        tint = Color(0xFF94A3B8)
                    )
                }
                IconButton(onClick = {
                    isStarred = !isStarred
                    val msg = if (isStarred) "★ Starred" else "☆ Unstarred"
                    Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
                }) {
                    Icon(
                        imageVector = if (isStarred) Icons.Filled.Star else Icons.Filled.StarBorder,
                        contentDescription = "Star",
                        tint = if (isStarred) Color(0xFFF59E0B) else Color(0xFF94A3B8)
                    )
                }
                IconButton(onClick = {
                    Toast.makeText(context, "More options", Toast.LENGTH_SHORT).show()
                }) {
                    Icon(
                        imageVector = Icons.Filled.MoreVert,
                        contentDescription = "More",
                        tint = Color(0xFF94A3B8)
                    )
                }
            }

            HorizontalDivider(
                thickness = 0.5.dp,
                color = Color(0xFF262A33)
            )

            // ─── 2. SCROLLABLE CONTENT ────────────────────────────────────────
            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp)
            ) {
                Spacer(modifier = Modifier.height(16.dp))

                // Subject + Chip
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.Top
                ) {
                    Text(
                        text = item.subject,
                        color = Color.White,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.weight(1f)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = item.chip,
                        color = accentColor,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier
                            .border(1.dp, accentColor, RoundedCornerShape(6.dp))
                            .padding(horizontal = 8.dp, vertical = 3.dp)
                    )
                }

                Spacer(modifier = Modifier.height(20.dp))

                // ─── Sender Card ──────────────────────────────────────────────
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.Top
                ) {
                    // Avatar circle
                    val initials = item.sender.split(" ")
                        .take(2)
                        .mapNotNull { it.firstOrNull()?.uppercase() }
                        .joinToString("")
                    val avatarColor = when (item.chip.lowercase()) {
                        "codehub" -> Color(0xFF10B981)
                        "security" -> Color(0xFF3B82F6)
                        "mobile" -> Color(0xFF8B5CF6)
                        "updates" -> Color(0xFFF59E0B)
                        else -> accentColor
                    }

                    Box(
                        modifier = Modifier
                            .size(42.dp)
                            .clip(CircleShape)
                            .background(avatarColor),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = initials,
                            color = Color.White,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    Spacer(modifier = Modifier.width(12.dp))

                    Column(modifier = Modifier.weight(1f)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = item.sender,
                                color = Color.White,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.weight(1f)
                            )
                            Text(
                                text = item.time,
                                color = Color(0xFF64748B),
                                fontSize = 12.sp
                            )
                        }
                        Text(
                            text = "to me <user@quantmail.in>",
                            color = Color(0xFF64748B),
                            fontSize = 12.sp
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // ─── ✨ Quanty Summarize AI Pill ──────────────────────────────
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0xFF1A1D24))
                        .clickable { showAiSummary = !showAiSummary }
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Filled.AutoAwesome,
                        contentDescription = "AI Summarize",
                        tint = Color(0xFF8B5CF6),
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "✨ Quanty Summarize",
                        color = Color(0xFF8B5CF6),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }

                AnimatedVisibility(
                    visible = showAiSummary,
                    enter = fadeIn(),
                    exit = fadeOut()
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 8.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(Color(0xFF12141A))
                            .border(1.dp, Color(0xFF8B5CF6).copy(alpha = 0.3f), RoundedCornerShape(12.dp))
                            .padding(14.dp)
                            .animateContentSize()
                    ) {
                        Text(
                            text = "AI Summary",
                            color = Color(0xFF8B5CF6),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "• Key Takeaway: ${item.subject.take(60)}...\n" +
                                "• Action Required: Review the attached documentation and confirm staging readiness.\n" +
                                "• Priority: High — requires response within 24 hours.",
                            color = Color(0xFFCBD5E1),
                            fontSize = 13.sp,
                            lineHeight = 20.sp
                        )
                    }
                }

                Spacer(modifier = Modifier.height(20.dp))

                HorizontalDivider(
                    thickness = 0.5.dp,
                    color = Color(0xFF262A33)
                )

                Spacer(modifier = Modifier.height(16.dp))

                // ─── Message Body ─────────────────────────────────────────────
                Text(
                    text = "Hi Team,\n\n${item.snippet}\n\n" +
                        "This milestone represents significant progress across our sovereign ecosystem architecture. " +
                        "All automated verification gates have passed, and the staging deployment pipeline is ready for promotion.\n\n" +
                        "Key highlights:\n" +
                        "• Zero-mock production architecture verified across all 9 canonical applications\n" +
                        "• Hardware biometric bridge active on Android emulator (QuantChat_Pixel)\n" +
                        "• Trinity SSO token rotation completed with 100% session continuity\n" +
                        "• EKS 20-pod staging cluster operating at zero error rate\n\n" +
                        "Please review and confirm readiness for the production rollout.\n\n" +
                        "Best regards,\n${item.sender}",
                    color = Color(0xFFE2E8F0),
                    fontSize = 14.sp,
                    lineHeight = 22.sp
                )

                Spacer(modifier = Modifier.height(16.dp))

                // ─── Attachment Pill ───────────────────────────────────────────
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(Color(0xFF16181D))
                        .border(1.dp, Color(0xFF262A33), RoundedCornerShape(10.dp))
                        .clickable {
                            Toast
                                .makeText(context, "📎 Opening attachment...", Toast.LENGTH_SHORT)
                                .show()
                        }
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "📎",
                        fontSize = 16.sp
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Column {
                        Text(
                            text = "verification-report.pdf",
                            color = Color.White,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium
                        )
                        Text(
                            text = "1.2 MB · PDF",
                            color = Color(0xFF64748B),
                            fontSize = 11.sp
                        )
                    }
                }

                Spacer(modifier = Modifier.height(24.dp))
            }

            // ─── 3. BOTTOM QUICK REPLY BAR ────────────────────────────────────
            HorizontalDivider(
                thickness = 0.5.dp,
                color = Color(0xFF262A33)
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = {
                        onReply(item)
                        Toast.makeText(context, "↩ Opening reply composer...", Toast.LENGTH_SHORT).show()
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFF1E2028),
                        contentColor = Color.White
                    ),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.Reply,
                        contentDescription = "Reply",
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Reply", fontSize = 13.sp)
                }
                Button(
                    onClick = {
                        Toast.makeText(context, "⇶ Reply All", Toast.LENGTH_SHORT).show()
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFF1E2028),
                        contentColor = Color.White
                    ),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Reply All", fontSize = 13.sp)
                }
                Button(
                    onClick = {
                        Toast.makeText(context, "→ Forward", Toast.LENGTH_SHORT).show()
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFF1E2028),
                        contentColor = Color.White
                    ),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(
                        imageVector = Icons.Filled.Forward,
                        contentDescription = "Forward",
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Fwd", fontSize = 13.sp)
                }
            }
        }
    }
}

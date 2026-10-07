package com.quant.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quant.app.ui.navigation.ProductivityTab
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Sovereign Brand & Logo Marks for the Quant Ecosystem.
 *
 * Mathematical, native Jetpack Compose translations of:
 * - apps/quantmail/src/components/QuantMailLogo.tsx (QuantMailLavaMark)
 * - apps/quantmail/src/components/QuantCalendarLogo.tsx (QuantCalendarMark)
 * - apps/quantmail/src/components/QuantDriveLogo.tsx (QuantDriveMark)
 * - apps/quantmail/src/components/QuantContactsLogo.tsx (QuantContactsMark)
 * - apps/quantmail/src/components/QuantGitLogo.tsx (QuantGitMark)
 * - apps/quantmail/src/components/BrandWordmark.tsx (BrandWordmark)
 */

object QuantBrandTokens {
    val Ember = Color(0xFFFF, 0x8C, 0x42)
    val EmberHot = Color(0xFFFF, 0xB8, 0x75)
    val EmberDeep = Color(0xE8, 0x75, 0x2F)
    val EmberInk = Color(0x1A, 0x0F, 0x08)
    val Peach = Color(0xFF, 0xD9, 0xB8)
    val CanvasDark = Color(0x09, 0x0A, 0x0C)
}

/**
 * Helper to build the family's signature 22% squircle path on a 100-unit virtual buffer.
 */
private fun createSquirclePath(
    s: Float,
    cx: Float = 50f * s,
    cy: Float = 50f * s,
    half: Float = 45f * s,
    radius: Float = 22f * s
): Path {
    return Path().apply {
        addRoundRect(
            RoundRect(
                left = cx - half,
                top = cy - half,
                right = cx + half,
                bottom = cy + half,
                cornerRadius = CornerRadius(radius, radius)
            )
        )
    }
}

/**
 * Creates the exact bezier path of the solid white "M" Quanty mascot silhouette.
 */
private fun createMPath(s: Float, offsetY: Float = 0f): Path {
    val x = 23f * s
    val y = (30f + offsetY) * s
    val w = 54f * s
    val h = 44f * s
    val r = 7f * s

    return Path().apply {
        moveTo(x + r, y + h)
        // Corner at lower left
        quadraticTo(x, y + h, x, y + h - r)
        lineTo(x, y + 12f * s)
        // Left ear
        cubicTo(x, y + 4f * s, x + 4f * s, y, x + 9f * s, y)
        // Down into center valley notch
        cubicTo(x + 15f * s, y + 2f * s, x + 21f * s, y + 17f * s, x + 27f * s, y + 17f * s)
        // Back up to right ear
        cubicTo(x + 33f * s, y + 17f * s, x + 39f * s, y + 2f * s, x + 45f * s, y)
        // Over right ear
        cubicTo(x + 50f * s, y, x + w, y + 4f * s, x + w, y + 12f * s)
        lineTo(x + w, y + h - r)
        // Corner at lower right
        quadraticTo(x + w, y + h, x + w - r, y + h)
        close()
    }
}

// =============================================================================
// PRE-ALLOCATED DRAWING CACHES (ZERO GC / INSTANTANEOUS <1ms ART FRAME BUDGET)
// =============================================================================

/**
 * Pre-allocated drawing cache for QuantMailLavaMark.
 * All paths, brushes, and dimensions are calculated once per size and reused.
 */
private class QuantMailDrawingCache(val s: Float) {
    val cx = 50f * s
    val cy = 50f * s
    val half = 45f * s
    val radius = 22f * s
    val x0 = cx - half
    val y0 = cy - half
    val edge = half * 2f

    // 0. Ambient glowing halo (extends 4dp / ~10f * s beyond the 45f * s squircle)
    val glowRadius = 54f * s
    val haloBrush = Brush.radialGradient(
        0.00f to Color(0xFFFF, 0x8C, 0x42).copy(alpha = 0.25f),
        0.65f to Color(0xFFFF, 0x8C, 0x42).copy(alpha = 0.12f),
        1.00f to Color(0xFFFF, 0x8C, 0x42).copy(alpha = 0.00f),
        center = Offset(cx, cy),
        radius = glowRadius
    )

    // Plate paths
    val platePath = createSquirclePath(s, cx, cy, half, radius)
    val fresnelPath = createSquirclePath(s, cx, cy + 1.5f * s, half - 1.5f * s, 22f * s - 1.5f * s)
    val bezelPath = createSquirclePath(s, cx, cy, half, radius)

    // Molten Ember Plate Brushes
    val baseFloorBrush = Brush.radialGradient(
        0.00f to Color(0xFFFF, 0xC1, 0x89),
        0.30f to Color(0xFFFF, 0x94, 0x50),
        0.50f to Color(0xFFFF, 0x8C, 0x42),
        0.74f to Color(0xC8, 0x52, 0x0F),
        1.00f to Color(0x6E, 0x26, 0x06),
        center = Offset(cx - 8f * s, cy - 10f * s),
        radius = 82f * s
    )
    val layer1Brush = Brush.radialGradient(
        0.00f to Color(0xEE, 0x76, 0x22),
        0.42f to Color(0xC6, 0x52, 0x0F),
        0.78f to Color(140, 52, 10, 140),
        1.00f to Color(96, 32, 6, 0),
        center = Offset(cx - 3f * s, cy + 7f * s),
        radius = 58f * s
    )
    val layer2Brush = Brush.radialGradient(
        0.00f to Color(0xFFFF, 0x8C, 0x42),
        0.38f to Color(0xF8, 0x7A, 0x2C),
        0.72f to Color(226, 100, 30, 128),
        1.00f to Color(200, 80, 22, 0),
        center = Offset(cx - 6f * s, cy - 4f * s),
        radius = 50f * s
    )
    val layer3Brush = Brush.radialGradient(
        0.00f to Color(0xFFFF, 0xF1, 0xD6),
        0.26f to Color(0xFFFF, 0xC5, 0x84),
        0.62f to Color(255, 158, 78, 117),
        1.00f to Color(255, 140, 66, 0),
        center = Offset(cx - 13f * s, cy - 14f * s),
        radius = 37f * s
    )
    val layer4Brush = Brush.radialGradient(
        0.00f to Color(20, 9, 3, 178),
        0.42f to Color(44, 18, 6, 97),
        1.00f to Color(70, 30, 12, 0),
        center = Offset(cx + 19f * s, cy + 21f * s),
        radius = 40f * s
    )
    val domeBrush = Brush.verticalGradient(
        0.00f to Color(255, 255, 255, 25),
        0.34f to Color(255, 255, 255, 5),
        0.72f to Color(0, 0, 0, 18),
        1.00f to Color(0, 0, 0, 69),
        startY = cy - half,
        endY = cy + half
    )
    val fresnelBrush = Brush.verticalGradient(
        0.00f to Color(255, 240, 220, 128),
        0.30f to Color(255, 226, 196, 31),
        1.00f to Color(255, 214, 176, 0),
        startY = cy - half,
        endY = cy + half * 0.5f
    )
    val bezelBrush = Brush.linearGradient(
        0.00f to Color(255, 255, 255, 117),
        0.40f to Color(255, 214, 170, 71),
        1.00f to Color(255, 255, 255, 20),
        start = Offset(cx - half, cy - half),
        end = Offset(cx + half, cy + half)
    )

    // Mascot Paths
    val sidewallPath = createMPath(s, offsetY = 2.8f)
    val mPath = createMPath(s)

    // Mascot Brushes
    val sidewallBrush = Brush.verticalGradient(
        0.0f to Color(0xC4, 0x61, 0x1F),
        1.0f to Color(0x5E, 0x23, 0x0A),
        startY = 30f * s,
        endY = 76.8f * s
    )
    val mascotBodyBrush = Brush.linearGradient(
        0.00f to Color(0xFF, 0xFF, 0xFF),
        0.46f to Color(0xF7, 0xF8, 0xFB),
        1.00f to Color(0xE3, 0xE6, 0xED),
        start = Offset(23f * s, 30f * s),
        end = Offset(77f * s, 74f * s)
    )
    val bounceLightBrush = Brush.verticalGradient(
        0.0f to Color(255, 150, 80, 0),
        1.0f to Color(255, 150, 80, 80),
        startY = 59f * s,
        endY = 74f * s
    )
    val creaseOcclusionBrush = Brush.radialGradient(
        0.0f to Color(120, 58, 20, 80),
        0.6f to Color(120, 58, 20, 25),
        1.0f to Color(120, 58, 20, 0),
        center = Offset(50f * s, 47f * s),
        radius = 15f * s
    )

    // Cheek blush (warm glowing #FF7A00 with 0.38 alpha)
    val blushR = 6.2f * s
    val blushY = 65.5f * s
    val leftBlushX = (50f - 9.5f - 7.5f) * s
    val rightBlushX = (50f + 9.5f + 7.5f) * s
    val blushBrushLeft = Brush.radialGradient(
        0.00f to Color(0xFFFF, 0x7A, 0x00).copy(alpha = 0.38f),
        0.60f to Color(0xFFFF, 0x7A, 0x00).copy(alpha = 0.15f),
        1.00f to Color(0xFFFF, 0x7A, 0x00).copy(alpha = 0.00f),
        center = Offset(leftBlushX, blushY),
        radius = blushR
    )
    val blushBrushRight = Brush.radialGradient(
        0.00f to Color(0xFFFF, 0x7A, 0x00).copy(alpha = 0.38f),
        0.60f to Color(0xFFFF, 0x7A, 0x00).copy(alpha = 0.15f),
        1.00f to Color(0xFFFF, 0x7A, 0x00).copy(alpha = 0.00f),
        center = Offset(rightBlushX, blushY),
        radius = blushR
    )

    // Expressive Eyes (Dark Espresso Fill + White Catchlights)
    val eyeCy = 60f * s
    val eyeDx = 9.5f * s
    val leftEyeX = (50f - eyeDx) * s
    val rightEyeX = (50f + eyeDx) * s
    val r = 3.6f * s
    val cr = r * 0.28f

    val leftPupilBrush = Brush.radialGradient(
        0.00f to Color(0x3A, 0x28, 0x1E),
        0.55f to Color(0x17, 0x0F, 0x0A),
        1.00f to Color(0x08, 0x06, 0x05),
        center = Offset(leftEyeX - r * 0.3f, eyeCy - r * 0.34f),
        radius = r * 1.15f
    )
    val rightPupilBrush = Brush.radialGradient(
        0.00f to Color(0x3A, 0x28, 0x1E),
        0.55f to Color(0x17, 0x0F, 0x0A),
        1.00f to Color(0x08, 0x06, 0x05),
        center = Offset(rightEyeX - r * 0.3f, eyeCy - r * 0.34f),
        radius = r * 1.15f
    )

    val winkArc = Path().apply {
        val arcR = r * 1.26f
        val arcCy = eyeCy + 1.5f * s
        arcTo(
            rect = Rect(leftEyeX - arcR, arcCy - arcR, leftEyeX + arcR, arcCy + arcR),
            startAngleDegrees = 207f,
            sweepAngleDegrees = 126f,
            forceMoveTo = true
        )
    }

    val mascotOutlineBrush = Brush.linearGradient(
        0.00f to Color(255, 252, 248, 230),
        0.45f to Color(255, 220, 186, 90),
        1.00f to Color(140, 60, 16, 115),
        start = Offset(23f * s, 30f * s),
        end = Offset(77f * s, 74f * s)
    )
}

/**
 * Pre-allocated drawing cache for QuantCalendarMark.
 */
private class QuantCalendarDrawingCache(val s: Float) {
    val cx = 50f * s
    val cy = 50f * s
    val half = 45f * s
    val radius = 22f * s
    val x0 = cx - half
    val y0 = cy - half
    val edge = half * 2f

    // 0. Ambient Halo (Amber glow)
    val glowRadius = 54f * s
    val haloBrush = Brush.radialGradient(
        0.00f to Color(0xFFF5, 0x9E, 0x0B).copy(alpha = 0.25f),
        0.65f to Color(0xFFF5, 0x9E, 0x0B).copy(alpha = 0.12f),
        1.00f to Color(0xFFF5, 0x9E, 0x0B).copy(alpha = 0.00f),
        center = Offset(cx, cy),
        radius = glowRadius
    )

    val platePath = createSquirclePath(s, cx, cy, half, radius)
    val fresnelPath = createSquirclePath(s, cx, cy + 1.5f * s, half - 1.5f * s, 22f * s - 1.5f * s)
    val bezelPath = createSquirclePath(s, cx, cy, half, radius)

    // Molten plate brushes (shares master family ramp)
    val baseFloorBrush = Brush.radialGradient(
        0.00f to Color(0xFFFF, 0xC1, 0x89),
        0.30f to Color(0xFFFF, 0x94, 0x50),
        0.50f to Color(0xFFFF, 0x8C, 0x42),
        0.74f to Color(0xC8, 0x52, 0x0F),
        1.00f to Color(0x6E, 0x26, 0x06),
        center = Offset(cx - 8f * s, cy - 10f * s),
        radius = 82f * s
    )
    val layer1Brush = Brush.radialGradient(
        0.00f to Color(0xEE, 0x76, 0x22),
        0.42f to Color(0xC6, 0x52, 0x0F),
        0.78f to Color(140, 52, 10, 140),
        1.00f to Color(96, 32, 6, 0),
        center = Offset(cx - 3f * s, cy + 7f * s),
        radius = 58f * s
    )
    val layer2Brush = Brush.radialGradient(
        0.00f to Color(0xFFFF, 0x8C, 0x42),
        0.38f to Color(0xF8, 0x7A, 0x2C),
        0.72f to Color(226, 100, 30, 128),
        1.00f to Color(200, 80, 22, 0),
        center = Offset(cx - 6f * s, cy - 4f * s),
        radius = 50f * s
    )
    val layer3Brush = Brush.radialGradient(
        0.00f to Color(0xFFFF, 0xF1, 0xD6),
        0.26f to Color(0xFFFF, 0xC5, 0x84),
        0.62f to Color(255, 158, 78, 117),
        1.00f to Color(255, 140, 66, 0),
        center = Offset(cx - 13f * s, cy - 14f * s),
        radius = 37f * s
    )
    val layer4Brush = Brush.radialGradient(
        0.00f to Color(20, 9, 3, 178),
        0.42f to Color(44, 18, 6, 97),
        1.00f to Color(70, 30, 12, 0),
        center = Offset(cx + 19f * s, cy + 21f * s),
        radius = 40f * s
    )
    val domeBrush = Brush.verticalGradient(
        0.00f to Color(255, 255, 255, 25),
        0.34f to Color(255, 255, 255, 5),
        0.72f to Color(0, 0, 0, 18),
        1.00f to Color(0, 0, 0, 69),
        startY = cy - half,
        endY = cy + half
    )
    val fresnelBrush = Brush.verticalGradient(
        0.00f to Color(255, 240, 220, 128),
        0.30f to Color(255, 226, 196, 31),
        1.00f to Color(255, 214, 176, 0),
        startY = cy - half,
        endY = cy + half * 0.5f
    )
    val bezelBrush = Brush.linearGradient(
        0.00f to Color(255, 255, 255, 117),
        0.40f to Color(255, 214, 170, 71),
        1.00f to Color(255, 255, 255, 20),
        start = Offset(cx - half, cy - half),
        end = Offset(cx + half, cy + half)
    )

    // Calendar Pad Dimensions & Paths
    val padX = 22f * s
    val padY = 26f * s
    val padW = 56f * s
    val padH = 52f * s
    val padR = 9f * s
    val headH = 13f * s

    val backSheetPath = Path().apply {
        addRoundRect(
            RoundRect(
                padX - 2f * s,
                padY - 2f * s,
                padX + padW + 2f * s,
                padY + padH + 2f * s,
                CornerRadius(padR + 2f * s, padR + 2f * s)
            )
        )
    }
    val backSheetBrush = Brush.linearGradient(
        0.00f to Color(0x7A, 0x35, 0x10),
        0.55f to Color(0x4A, 0x1D, 0x06),
        1.00f to Color(0x2A, 0x0F, 0x04),
        start = Offset(padX, padY),
        end = Offset(padX + padW, padY + padH)
    )

    val padSidewallPath = Path().apply {
        addRoundRect(
            RoundRect(
                padX,
                padY + 3.2f * s,
                padX + padW,
                padY + padH + 3.2f * s,
                CornerRadius(padR, padR)
            )
        )
    }
    val padSidewallBrush = Brush.verticalGradient(
        0.0f to Color(0xD7, 0x9A, 0x67),
        1.0f to Color(0x8A, 0x4A, 0x1C),
        startY = padY,
        endY = padY + padH + 3.2f * s
    )

    val padPath = Path().apply {
        addRoundRect(
            RoundRect(
                padX,
                padY,
                padX + padW,
                padY + padH,
                CornerRadius(padR, padR)
            )
        )
    }
    val padFaceBrush = Brush.verticalGradient(
        0.00f to Color(0xFF, 0xD2, 0xA8),
        0.30f to Color(0xFF, 0xEE, 0xDD),
        0.68f to Color(0xF4, 0xF2, 0xF1),
        1.00f to Color(0xDF, 0xE2, 0xE9),
        startY = padY,
        endY = padY + padH
    )

    val railBrush = Brush.linearGradient(
        0.00f to QuantBrandTokens.EmberHot,
        0.55f to QuantBrandTokens.Ember,
        1.00f to QuantBrandTokens.EmberDeep,
        start = Offset(padX, padY),
        end = Offset(padX + padW, padY + headH)
    )
    val railHighlightBrush = Brush.verticalGradient(
        0.0f to Color(255, 255, 255, 87),
        1.0f to Color(90, 34, 6, 82),
        startY = padY,
        endY = padY + headH
    )

    val frostedRimBrush = Brush.verticalGradient(
        0.0f to Color(255, 214, 172, 230),
        0.4f to Color(255, 165, 96, 128),
        1.0f to Color(226, 116, 46, 178),
        startY = padY,
        endY = padY + padH
    )

    // Binder Posts
    val postY = padY - 5.6f * s
    val postH = 11.4f * s
    val postW = 5f * s
    val postR = 2.5f * s
    val post1X = padX + 16f * s
    val post2X = padX + padW - 16f * s

    val postWall1 = Path().apply {
        addRoundRect(RoundRect(post1X - postW / 2f, postY + 1.7f * s, post1X + postW / 2f, postY + postH + 1.7f * s, CornerRadius(postR, postR)))
    }
    val postWall2 = Path().apply {
        addRoundRect(RoundRect(post2X - postW / 2f, postY + 1.7f * s, post2X + postW / 2f, postY + postH + 1.7f * s, CornerRadius(postR, postR)))
    }
    val postFace1 = Path().apply {
        addRoundRect(RoundRect(post1X - postW / 2f, postY, post1X + postW / 2f, postY + postH, CornerRadius(postR, postR)))
    }
    val postFace2 = Path().apply {
        addRoundRect(RoundRect(post2X - postW / 2f, postY, post2X + postW / 2f, postY + postH, CornerRadius(postR, postR)))
    }
    val postWallBrush = Brush.verticalGradient(
        0.0f to Color(0xB4, 0x70, 0x3C),
        1.0f to Color(0x6B, 0x38, 0x19),
        startY = postY,
        endY = postY + postH + 1.7f * s
    )
    val postFaceBrush1 = Brush.linearGradient(
        0.00f to Color(0xFF, 0xFF, 0xFF),
        0.46f to Color(0xFF, 0xF1, 0xE1),
        1.00f to QuantBrandTokens.Peach,
        start = Offset(post1X - postW / 2f, postY),
        end = Offset(post1X + postW / 2f, postY + postH)
    )
    val postFaceBrush2 = Brush.linearGradient(
        0.00f to Color(0xFF, 0xFF, 0xFF),
        0.46f to Color(0xFF, 0xF1, 0xE1),
        1.00f to QuantBrandTokens.Peach,
        start = Offset(post2X - postW / 2f, postY),
        end = Offset(post2X + postW / 2f, postY + postH)
    )

    // Pre-allocated Text Paint for day number
    val textPaint = android.graphics.Paint().apply {
        isAntiAlias = true
        color = 0xFF1A0F08.toInt()
        typeface = android.graphics.Typeface.create(
            android.graphics.Typeface.DEFAULT,
            android.graphics.Typeface.BOLD
        )
        textSize = 28f * s
        textAlign = android.graphics.Paint.Align.CENTER
    }
    val textCenterY = padY + headH + (padH - headH) / 2f
    val textBaseline = textCenterY - (textPaint.fontMetrics.descent + textPaint.fontMetrics.ascent) / 2f
}

/**
 * Pre-allocated drawing cache for QuantDriveMark.
 */
private class QuantDriveDrawingCache(val s: Float) {
    val cx = 50f * s
    val cy = 50f * s
    val half = 45f * s
    val radius = 22f * s
    val x0 = cx - half
    val y0 = cy - half
    val edge = half * 2f

    // 0. Ambient Halo (Sky blue glow)
    val glowRadius = 54f * s
    val haloBrush = Brush.radialGradient(
        0.00f to Color(0xFF38, 0xBD, 0xF8).copy(alpha = 0.22f),
        0.65f to Color(0xFF38, 0xBD, 0xF8).copy(alpha = 0.10f),
        1.00f to Color(0xFF38, 0xBD, 0xF8).copy(alpha = 0.00f),
        center = Offset(cx, cy),
        radius = glowRadius
    )

    val platePath = createSquirclePath(s, cx, cy, half, radius)
    val fresnelPath = createSquirclePath(s, cx, cy + 1.5f * s, half - 1.5f * s, 22f * s - 1.5f * s)
    val bezelPath = createSquirclePath(s, cx, cy, half, radius)

    // Master molten ember plate brushes
    val baseFloorBrush = Brush.radialGradient(
        0.00f to Color(0xFFFF, 0xC1, 0x89),
        0.30f to Color(0xFFFF, 0x94, 0x50),
        0.50f to Color(0xFFFF, 0x8C, 0x42),
        0.74f to Color(0xC8, 0x52, 0x0F),
        1.00f to Color(0x6E, 0x26, 0x06),
        center = Offset(cx - 8f * s, cy - 10f * s),
        radius = 82f * s
    )
    val layer1Brush = Brush.radialGradient(
        0.00f to Color(0xEE, 0x76, 0x22),
        0.42f to Color(0xC6, 0x52, 0x0F),
        0.78f to Color(140, 52, 10, 140),
        1.00f to Color(96, 32, 6, 0),
        center = Offset(cx - 3f * s, cy + 7f * s),
        radius = 58f * s
    )
    val layer2Brush = Brush.radialGradient(
        0.00f to Color(0xFFFF, 0x8C, 0x42),
        0.38f to Color(0xF8, 0x7A, 0x2C),
        0.72f to Color(226, 100, 30, 128),
        1.00f to Color(200, 80, 22, 0),
        center = Offset(cx - 6f * s, cy - 4f * s),
        radius = 50f * s
    )
    val layer3Brush = Brush.radialGradient(
        0.00f to Color(0xFFFF, 0xF1, 0xD6),
        0.26f to Color(0xFFFF, 0xC5, 0x84),
        0.62f to Color(255, 158, 78, 117),
        1.00f to Color(255, 140, 66, 0),
        center = Offset(cx - 13f * s, cy - 14f * s),
        radius = 37f * s
    )
    val layer4Brush = Brush.radialGradient(
        0.00f to Color(20, 9, 3, 178),
        0.42f to Color(44, 18, 6, 97),
        1.00f to Color(70, 30, 12, 0),
        center = Offset(cx + 19f * s, cy + 21f * s),
        radius = 40f * s
    )
    val domeBrush = Brush.verticalGradient(
        0.00f to Color(255, 255, 255, 25),
        0.34f to Color(255, 255, 255, 5),
        0.72f to Color(0, 0, 0, 18),
        1.00f to Color(0, 0, 0, 69),
        startY = cy - half,
        endY = cy + half
    )
    val fresnelBrush = Brush.verticalGradient(
        0.00f to Color(255, 240, 220, 128),
        0.30f to Color(255, 226, 196, 31),
        1.00f to Color(255, 214, 176, 0),
        startY = cy - half,
        endY = cy + half * 0.5f
    )
    val bezelBrush = Brush.linearGradient(
        0.00f to Color(255, 255, 255, 117),
        0.40f to Color(255, 214, 170, 71),
        1.00f to Color(255, 255, 255, 20),
        start = Offset(cx - half, cy - half),
        end = Offset(cx + half, cy + half)
    )

    // Discs & Cloud Geometry
    val ox = cx
    val oy = cy + 2f * s

    val p1Y = oy + 13f * s
    val p1Rx = 23f * s
    val p1Ry = 7.5f * s
    val p1H = 3.5f * s

    val p1SidePath = Path().apply {
        arcTo(Rect(ox - p1Rx, p1Y + p1H - p1Ry, ox + p1Rx, p1Y + p1H + p1Ry), 0f, 180f, false)
        lineTo(ox - p1Rx, p1Y)
        arcTo(Rect(ox - p1Rx, p1Y - p1Ry, ox + p1Rx, p1Y + p1Ry), 180f, -180f, false)
        close()
    }
    val p1SideBrush = Brush.verticalGradient(
        0.0f to Color(0x38, 0x16, 0x08),
        1.0f to Color(0x12, 0x07, 0x03),
        startY = p1Y,
        endY = p1Y + p1H + p1Ry
    )
    val p1TopBrush = Brush.linearGradient(
        0.0f to Color(0x24, 0x12, 0x08),
        0.5f to Color(0x48, 0x1F, 0x0D),
        1.0f to Color(0x1A, 0x0D, 0x06),
        start = Offset(ox - p1Rx, p1Y),
        end = Offset(ox + p1Rx, p1Y)
    )

    val p2Y = oy + 7f * s
    val p2Rx = 21f * s
    val p2Ry = 6.8f * s
    val p2H = 3.2f * s

    val p2SidePath = Path().apply {
        arcTo(Rect(ox - p2Rx, p2Y + p2H - p2Ry, ox + p2Rx, p2Y + p2H + p2Ry), 0f, 180f, false)
        lineTo(ox - p2Rx, p2Y)
        arcTo(Rect(ox - p2Rx, p2Y - p2Ry, ox + p2Rx, p2Y + p2Ry), 180f, -180f, false)
        close()
    }
    val p2SideBrush = Brush.verticalGradient(
        0.0f to Color(0x8A, 0x3B, 0x0E),
        1.0f to Color(0x33, 0x12, 0x04),
        startY = p2Y,
        endY = p2Y + p2H + p2Ry
    )
    val p2TopBrush = Brush.linearGradient(
        0.00f to Color(0x7A, 0x36, 0x0D),
        0.45f to QuantBrandTokens.Ember,
        1.00f to Color(0x4A, 0x1D, 0x06),
        start = Offset(ox - p2Rx, p2Y),
        end = Offset(ox + p2Rx, p2Y)
    )

    // Frosted Cloud Surface
    val sc = 0.88f * s
    val cloudCy = oy - 7f * s
    val cloudPath = Path().apply {
        addRoundRect(RoundRect(ox - 22f * sc, cloudCy - 4f * sc, ox + 22f * sc, cloudCy + 16f * sc, CornerRadius(10f * sc, 10f * sc)))
        addOval(Rect(ox - 20f * sc, cloudCy - 15f * sc, ox + 2f * sc, cloudCy + 7f * sc))
        addOval(Rect(ox - 10f * sc, cloudCy - 23f * sc, ox + 18f * sc, cloudCy + 5f * sc))
        addOval(Rect(ox + 5f * sc, cloudCy - 11f * sc, ox + 23f * sc, cloudCy + 7f * sc))
    }
    val cloudBrush = Brush.linearGradient(
        0.00f to Color(0xFF, 0xFF, 0xFF),
        0.35f to Color(0xFF, 0xF8, 0xF0),
        0.75f to Color(0xFF, 0xE2, 0xC6),
        1.00f to Color(0xFF, 0xB2, 0x7D),
        start = Offset(ox - 18f * s, oy - 20f * s),
        end = Offset(ox + 18f * s, oy + 4f * s)
    )
    val cloudStrokeBrush = Brush.linearGradient(
        0.0f to Color(255, 255, 255, 242),
        0.5f to Color(255, 200, 150, 153),
        1.0f to Color(168, 70, 18, 178),
        start = Offset(ox - 18f * s, oy - 20f * s),
        end = Offset(ox + 18f * s, oy + 4f * s)
    )

    // Data Diamond Nucleus
    val coreY = oy - 4f * s
    val coreSize = 4.2f * s
    val coreGlowBrush = Brush.radialGradient(
        0.0f to Color(255, 180, 80, 166),
        0.5f to Color(255, 140, 66, 51),
        1.0f to Color(255, 140, 66, 0),
        center = Offset(ox, coreY),
        radius = 8f * s
    )
    val diamondPath = Path().apply {
        moveTo(ox, coreY - coreSize)
        lineTo(ox + coreSize, coreY)
        lineTo(ox, coreY + coreSize)
        lineTo(ox - coreSize, coreY)
        close()
    }
    val diamondBrush = Brush.verticalGradient(
        0.0f to Color(0xFF, 0xF9, 0xE6),
        0.5f to Color(0xFF, 0x9B, 0x42),
        1.0f to Color(0xB8, 0x45, 0x0C),
        startY = coreY - coreSize,
        endY = coreY + coreSize
    )
}

/**
 * Pre-allocated drawing cache for QuantContactsMark.
 */
private class QuantContactsDrawingCache(val s: Float) {
    val cx = 50f * s
    val cy = 50f * s
    val half = 45f * s
    val radius = 22f * s
    val x0 = cx - half
    val y0 = cy - half
    val edge = half * 2f

    // 0. Ambient Halo (Emerald / Teal glow)
    val glowRadius = 54f * s
    val haloBrush = Brush.radialGradient(
        0.00f to Color(0xFF10, 0xB9, 0x81).copy(alpha = 0.22f),
        0.65f to Color(0xFF10, 0xB9, 0x81).copy(alpha = 0.10f),
        1.00f to Color(0xFF10, 0xB9, 0x81).copy(alpha = 0.00f),
        center = Offset(cx, cy),
        radius = glowRadius
    )

    val platePath = createSquirclePath(s, cx, cy, half, radius)
    val fresnelPath = createSquirclePath(s, cx, cy + 1.5f * s, half - 1.5f * s, 22f * s - 1.5f * s)
    val bezelPath = createSquirclePath(s, cx, cy, half, radius)

    // Master plate brushes
    val baseFloorBrush = Brush.radialGradient(
        0.00f to Color(0xFFFF, 0xC1, 0x89),
        0.30f to Color(0xFFFF, 0x94, 0x50),
        0.50f to Color(0xFFFF, 0x8C, 0x42),
        0.74f to Color(0xC8, 0x52, 0x0F),
        1.00f to Color(0x6E, 0x26, 0x06),
        center = Offset(cx - 8f * s, cy - 10f * s),
        radius = 82f * s
    )
    val layer1Brush = Brush.radialGradient(
        0.00f to Color(0xEE, 0x76, 0x22),
        0.42f to Color(0xC6, 0x52, 0x0F),
        0.78f to Color(140, 52, 10, 140),
        1.00f to Color(96, 32, 6, 0),
        center = Offset(cx - 3f * s, cy + 7f * s),
        radius = 58f * s
    )
    val layer2Brush = Brush.radialGradient(
        0.00f to Color(0xFFFF, 0x8C, 0x42),
        0.38f to Color(0xF8, 0x7A, 0x2C),
        0.72f to Color(226, 100, 30, 128),
        1.00f to Color(200, 80, 22, 0),
        center = Offset(cx - 6f * s, cy - 4f * s),
        radius = 50f * s
    )
    val layer3Brush = Brush.radialGradient(
        0.00f to Color(0xFFFF, 0xF1, 0xD6),
        0.26f to Color(0xFFFF, 0xC5, 0x84),
        0.62f to Color(255, 158, 78, 117),
        1.00f to Color(255, 140, 66, 0),
        center = Offset(cx - 13f * s, cy - 14f * s),
        radius = 37f * s
    )
    val layer4Brush = Brush.radialGradient(
        0.00f to Color(20, 9, 3, 178),
        0.42f to Color(44, 18, 6, 97),
        1.00f to Color(70, 30, 12, 0),
        center = Offset(cx + 19f * s, cy + 21f * s),
        radius = 40f * s
    )
    val domeBrush = Brush.verticalGradient(
        0.00f to Color(255, 255, 255, 25),
        0.34f to Color(255, 255, 255, 5),
        0.72f to Color(0, 0, 0, 18),
        1.00f to Color(0, 0, 0, 69),
        startY = cy - half,
        endY = cy + half
    )
    val fresnelBrush = Brush.verticalGradient(
        0.00f to Color(255, 240, 220, 128),
        0.30f to Color(255, 226, 196, 31),
        1.00f to Color(255, 214, 176, 0),
        startY = cy - half,
        endY = cy + half * 0.5f
    )
    val bezelBrush = Brush.linearGradient(
        0.00f to Color(255, 255, 255, 117),
        0.40f to Color(255, 214, 170, 71),
        1.00f to Color(255, 255, 255, 20),
        start = Offset(cx - half, cy - half),
        end = Offset(cx + half, cy + half)
    )

    // Back Figure (Peach)
    val backX = 69f * s
    val backHeadY = 36f * s
    val backHeadR = 9.5f * s
    val backShY = 70f * s
    val backShRx = 18f * s
    val backShRy = 18f * s

    val backFigurePath = Path().apply {
        addOval(Rect(backX - backHeadR, backHeadY - backHeadR, backX + backHeadR, backHeadY + backHeadR))
        moveTo(backX - backShRx - 3f * s, 100f * s)
        lineTo(backX - backShRx, backShY)
        arcTo(Rect(backX - backShRx, backShY - backShRy, backX + backShRx, backShY + backShRy), 180f, 180f, false)
        lineTo(backX + backShRx + 3f * s, 100f * s)
        close()
    }
    val backSidewallBrush = Brush.verticalGradient(
        0.0f to Color(0xC4, 0x85, 0x5A),
        1.0f to Color(0x7A, 0x45, 0x25),
        startY = backHeadY - backHeadR,
        endY = 100f * s
    )
    val backFaceBrush = Brush.linearGradient(
        0.00f to Color(0xFF, 0xEB, 0xD8),
        0.40f to QuantBrandTokens.Peach,
        0.72f to Color(0xDD, 0x9E, 0x6E),
        1.00f to Color(0xA9, 0x66, 0x3A),
        start = Offset(backX - 16f * s, 24f * s),
        end = Offset(backX + 14f * s, 98f * s)
    )
    val backSeamBrush = Brush.linearGradient(
        0.00f to Color(94, 40, 10, 133),
        0.42f to Color(112, 52, 18, 56),
        1.00f to Color(120, 58, 22, 0),
        start = Offset(backX - 14f * s, 24f * s),
        end = Offset(backX + 16f * s, 78f * s)
    )

    // Front Figure (Dark Ember)
    val frontX = 41f * s
    val frontHeadY = 41f * s
    val frontHeadR = 12f * s
    val frontShY = 76f * s
    val frontShRx = 23f * s
    val frontShRy = 16f * s

    val frontBodyPath = Path().apply {
        moveTo(frontX - frontShRx - 3f * s, 100f * s)
        lineTo(frontX - frontShRx, frontShY)
        arcTo(Rect(frontX - frontShRx, frontShY - frontShRy, frontX + frontShRx, frontShY + frontShRy), 180f, 180f, false)
        lineTo(frontX + frontShRx + 3f * s, 100f * s)
        close()
    }
    val frontFigurePath = Path().apply {
        addOval(Rect(frontX - frontHeadR, frontHeadY - frontHeadR, frontX + frontHeadR, frontHeadY + frontHeadR))
        addPath(frontBodyPath)
    }
    val frontSidewallBrush = Brush.verticalGradient(
        0.0f to Color(0x40, 0x20, 0x0E),
        1.0f to QuantBrandTokens.EmberInk,
        startY = frontHeadY - frontHeadR,
        endY = 100f * s
    )
    val frontFaceBrush = Brush.linearGradient(
        0.00f to Color(0x7A, 0x3F, 0x1C),
        0.34f to Color(0x5C, 0x30, 0x16),
        1.00f to Color(0x2B, 0x1A, 0x11),
        start = Offset(frontX - 20f * s, 30f * s),
        end = Offset(frontX + 20f * s, 98f * s)
    )
    val frontShoulderLightBrush = Brush.linearGradient(
        0.00f to Color.White.copy(alpha = 0.9f),
        0.30f to Color(255, 240, 220, 128),
        0.56f to Color(255, 214, 172, 31),
        0.84f to Color(255, 226, 190, 133),
        1.00f to Color(255, 208, 164, 51),
        start = Offset(frontX - 21f * s, 52f * s),
        end = Offset(frontX + 20f * s, 84f * s)
    )
    val headRimPath = Path().apply {
        arcTo(Rect(frontX - frontHeadR, frontHeadY - frontHeadR, frontX + frontHeadR, frontHeadY + frontHeadR), 140f, 188f, false)
    }
    val headRimBrush = Brush.linearGradient(
        0.00f to Color.Transparent,
        0.40f to Color.White.copy(alpha = 0.88f),
        0.72f to Color(255, 238, 216, 89),
        1.00f to Color.Transparent,
        start = Offset(frontX - frontHeadR, frontHeadY),
        end = Offset(frontX + frontHeadR, frontHeadY)
    )
}

/**
 * Pre-allocated drawing cache for QuantGitMark.
 */
private class QuantGitDrawingCache(val s: Float) {
    val cx = 50f * s
    val cy = 50f * s
    val half = 45f * s
    val radius = 22f * s
    val x0 = cx - half
    val y0 = cy - half
    val edge = half * 2f

    // 0. Ambient Halo (Purple / Chrome glow)
    val glowRadius = 54f * s
    val haloBrush = Brush.radialGradient(
        0.00f to Color(0xFFA7, 0x8B, 0xFA).copy(alpha = 0.22f),
        0.65f to Color(0xFFA7, 0x8B, 0xFA).copy(alpha = 0.10f),
        1.00f to Color(0xFFA7, 0x8B, 0xFA).copy(alpha = 0.00f),
        center = Offset(cx, cy),
        radius = glowRadius
    )

    val platePath = createSquirclePath(s, cx, cy, half, radius)
    val obsidianBaseBrush = Brush.linearGradient(
        0.00f to Color(0x23, 0x27, 0x2F),
        0.42f to Color(0x0F, 0x11, 0x16),
        1.00f to Color(0x05, 0x06, 0x09),
        start = Offset(cx - half, cy - half),
        end = Offset(cx + half, cy + half)
    )
    val coolSheenBrush = Brush.radialGradient(
        0.00f to Color(198, 218, 255, 48),
        0.45f to Color(126, 156, 205, 18),
        1.00f to Color(96, 126, 175, 0),
        center = Offset(cx - 15f * s, cy - 18f * s),
        radius = 38f * s
    )
    val warmReflectionBrush = Brush.radialGradient(
        0.00f to Color(255, 140, 66, 56),
        0.50f to Color(198, 88, 30, 23),
        1.00f to Color(255, 140, 66, 0),
        center = Offset(cx + 19f * s, cy + 20f * s),
        radius = 44f * s
    )

    // Top-right corner specular notch
    val notchClip = Path().apply {
        moveTo(cx + half - 32f * s, cy - half)
        lineTo(cx + half, cy - half)
        lineTo(cx + half, cy - half + 32f * s)
        close()
    }
    val notchPath = createSquirclePath(s, cx, cy, half - 2.8f * s, 22f * s - 2.8f * s)
    val notchBrush = Brush.linearGradient(
        0.00f to Color.Transparent,
        0.42f to Color.White.copy(alpha = 0.72f),
        0.60f to Color(255, 246, 232, 148),
        1.00f to Color.Transparent,
        start = Offset(cx + half - 27f * s, cy - half),
        end = Offset(cx + half, cy - half + 27f * s)
    )

    // Git Rotated Diamond
    val dHalf = 22f * s
    val dR = 6f * s
    val diamondWall = Path().apply {
        addRoundRect(RoundRect(cx - dHalf, cy - dHalf + 3f * s, cx + dHalf, cy + dHalf + 3f * s, CornerRadius(dR, dR)))
    }
    val diamondWallBrush = Brush.verticalGradient(
        0.0f to Color(0x7A, 0x3A, 0x12),
        1.0f to Color(0x25, 0x12, 0x0A),
        startY = cy - dHalf,
        endY = cy + dHalf + 3f * s
    )
    val diamondFace = Path().apply {
        addRoundRect(RoundRect(cx - dHalf, cy - dHalf, cx + dHalf, cy + dHalf, CornerRadius(dR, dR)))
    }
    val diamondFaceBrush = Brush.linearGradient(
        0.00f to Color(0xFF, 0xC4, 0x93),
        0.42f to QuantBrandTokens.Ember,
        0.76f to QuantBrandTokens.EmberDeep,
        1.00f to Color(0xB9, 0x55, 0x0F),
        start = Offset(cx - dHalf, cy - dHalf),
        end = Offset(cx + dHalf, cy + dHalf)
    )
    val diamondDomeBrush = Brush.verticalGradient(
        0.00f to Color(255, 255, 255, 41),
        0.42f to Color.Transparent,
        1.00f to Color(88, 30, 4, 87),
        startY = cy - dHalf,
        endY = cy + dHalf
    )

    // Git Graph (Trunk and Branch)
    val trunkA = Offset(45.05f * s, 62.02f * s)
    val trunkB = Offset(62.02f * s, 45.05f * s)
    val peel = Offset(52.83f * s, 54.24f * s)
    val fork = Offset(57.07f * s, 50.00f * s)
    val leaf = Offset(47.17f * s, 40.10f * s)
    val graphPath = Path().apply {
        moveTo(trunkA.x, trunkA.y)
        lineTo(trunkB.x, trunkB.y)
        moveTo(peel.x, peel.y)
        quadraticTo(fork.x, fork.y, leaf.x, leaf.y)
    }
    val graphInkBrush = Brush.linearGradient(
        0.00f to Color(0xFF, 0xFF, 0xFF),
        0.55f to Color(0xFF, 0xF6, 0xEC),
        1.00f to Color(0xF0, 0xDC, 0xCA),
        start = Offset(28f * s, 28f * s),
        end = Offset(72f * s, 72f * s)
    )

    // Iridescent Chrome Bezel
    val chromeBezelPath = createSquirclePath(s, cx, cy)
    val chromeSweepBrush = Brush.sweepGradient(
        0.00f to Color(0xFF, 0xFF, 0xFF),
        0.06f to Color(0xE4, 0xEB, 0xF4),
        0.14f to Color(0x7E, 0x89, 0x98),
        0.22f to Color(0x0E, 0x11, 0x16),
        0.30f to Color(0xA8, 0xB2, 0xC0),
        0.38f to Color(0xFF, 0xFF, 0xFF),
        0.46f to Color(0xB7, 0x9F, 0xE0),
        0.54f to Color(0x2E, 0x32, 0x3A),
        0.63f to Color(0x0C, 0x10, 0x15),
        0.71f to Color(0xBC, 0xC8, 0xD4),
        0.79f to Color(0xFF, 0xD9, 0xA0),
        0.87f to Color(0x5A, 0x50, 0x48),
        0.94f to Color(0x14, 0x18, 0x1F),
        1.00f to Color(0xFF, 0xFF, 0xFF),
        center = Offset(cx, cy)
    )
}

// =============================================================================
// MARKS (STATIC, CACHED, INSTANTANEOUS <1ms RENDERING)
// =============================================================================

/**
 * QuantMailLavaMark:
 * The signature 40dp molten ember squircle plate with rich radials
 * (#FFC189 -> #FF9450 -> #FF8C42 -> #C8520F -> #6E2606), warm side-wall drop shadow,
 * 3D sculpted white 'M' Quanty mascot body, notch valley crease occlusion,
 * two large expressive pupils with dark espresso fill, sparkling white catchlights,
 * warm glowing cheek blush (#FF7A00 with 0.38 alpha), and crisp glass rim stroke.
 * Includes an ambient glowing halo extending 4dp beyond the squircle plate.
 */
@Composable
fun QuantMailLavaMark(
    size: Dp = 40.dp,
    isWinking: Boolean = false,
    onClick: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    val density = LocalDensity.current
    val sizePx = with(density) { size.toPx() }
    val s = sizePx / 100f
    val cache = remember(sizePx) { QuantMailDrawingCache(s) }

    var userWinking by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val activeWinking = isWinking || userWinking

    val clickableModifier = if (onClick != null) {
        modifier.clickable(
            interactionSource = remember { MutableInteractionSource() },
            indication = null
        ) {
            userWinking = true
            scope.launch {
                delay(600)
                userWinking = false
            }
            onClick()
        }
    } else modifier

    Canvas(modifier = clickableModifier.size(size)) {
        // 0. Ambient glowing halo radiating 4dp beyond squircle plate
        drawCircle(
            brush = cache.haloBrush,
            radius = cache.glowRadius,
            center = Offset(cache.cx, cache.cy)
        )

        // 1. Molten Ember Squircle Plate
        drawRoundRect(brush = cache.baseFloorBrush, topLeft = Offset(cache.x0, cache.y0), size = Size(cache.edge, cache.edge), cornerRadius = CornerRadius(22f * s, 22f * s))
        drawRoundRect(brush = cache.layer1Brush, topLeft = Offset(cache.x0, cache.y0), size = Size(cache.edge, cache.edge), cornerRadius = CornerRadius(22f * s, 22f * s))
        drawRoundRect(brush = cache.layer2Brush, topLeft = Offset(cache.x0, cache.y0), size = Size(cache.edge, cache.edge), cornerRadius = CornerRadius(22f * s, 22f * s))
        drawRoundRect(brush = cache.layer3Brush, topLeft = Offset(cache.x0, cache.y0), size = Size(cache.edge, cache.edge), cornerRadius = CornerRadius(22f * s, 22f * s))
        drawRoundRect(brush = cache.layer4Brush, topLeft = Offset(cache.x0, cache.y0), size = Size(cache.edge, cache.edge), cornerRadius = CornerRadius(22f * s, 22f * s))
        drawRoundRect(brush = cache.domeBrush, topLeft = Offset(cache.x0, cache.y0), size = Size(cache.edge, cache.edge), cornerRadius = CornerRadius(22f * s, 22f * s))
        drawPath(path = cache.fresnelPath, brush = cache.fresnelBrush, style = Stroke(width = 2.4f * s))

        // 2. Mascot drawn at Canvas level (zero clipping)
        // Warm sidewall extrusion for "M" paper thickness
        drawPath(path = cache.sidewallPath, brush = cache.sidewallBrush)

        // 3D sculpted solid white "M" Quanty mascot body
        drawPath(path = cache.mPath, brush = cache.mascotBodyBrush)

        // Bounce light along bottom edge
        drawRoundRect(
            brush = cache.bounceLightBrush,
            topLeft = Offset(23f * s, 59f * s),
            size = Size(54f * s, 15f * s),
            cornerRadius = CornerRadius(7f * s, 7f * s)
        )

        // Notch valley crease occlusion
        drawCircle(
            brush = cache.creaseOcclusionBrush,
            radius = 15f * s,
            center = Offset(50f * s, 47f * s)
        )

        // Warm glowing cheek blush (#FF7A00 with 0.38 alpha)
        drawCircle(
            brush = cache.blushBrushLeft,
            radius = cache.blushR,
            center = Offset(cache.leftBlushX, cache.blushY)
        )
        drawCircle(
            brush = cache.blushBrushRight,
            radius = cache.blushR,
            center = Offset(cache.rightBlushX, cache.blushY)
        )

        // Left Eye: Wink arc if winking, otherwise dark espresso pupil + sparkle
        if (activeWinking) {
            drawPath(
                path = cache.winkArc,
                color = Color(0x17, 0x0F, 0x0A),
                style = Stroke(width = 2.4f * s, cap = StrokeCap.Round)
            )
        } else {
            drawOval(
                brush = cache.leftPupilBrush,
                topLeft = Offset(cache.leftEyeX - cache.r, cache.eyeCy - cache.r),
                size = Size(cache.r * 2f, cache.r * 2f)
            )
            drawOval(
                color = Color.White.copy(alpha = 0.88f),
                topLeft = Offset(cache.leftEyeX - cache.r * 0.3f - cache.cr, cache.eyeCy - cache.r * 0.46f - cache.cr),
                size = Size(cache.cr * 2f, cache.cr * 2f)
            )
        }

        // Right Eye: Lively open pupil + sparkle
        drawOval(
            brush = cache.rightPupilBrush,
            topLeft = Offset(cache.rightEyeX - cache.r, cache.eyeCy - cache.r),
            size = Size(cache.r * 2f, cache.r * 2f)
        )
        drawOval(
            color = Color.White.copy(alpha = 0.88f),
            topLeft = Offset(cache.rightEyeX - cache.r * 0.3f - cache.cr, cache.eyeCy - cache.r * 0.46f - cache.cr),
            size = Size(cache.cr * 2f, cache.cr * 2f)
        )

        // Mascot outline stroke
        drawPath(path = cache.mPath, brush = cache.mascotOutlineBrush, style = Stroke(width = 1.1f * s))

        // Crisp glass specular outer bezel stroke
        drawPath(path = cache.bezelPath, brush = cache.bezelBrush, style = Stroke(width = 1.4f * s))
    }
}

/**
 * QuantCalendarMark:
 * Ember plate squircle with 3D frosted pad standing proud with 2 binder posts,
 * header rail, and crisp day number text in ember ink (#1A0F08).
 * Fully cached with zero allocations during draw.
 */
@Composable
fun QuantCalendarMark(
    size: Dp = 40.dp,
    dayNumber: Int = 30,
    modifier: Modifier = Modifier
) {
    val density = LocalDensity.current
    val sizePx = with(density) { size.toPx() }
    val s = sizePx / 100f
    val cache = remember(sizePx) { QuantCalendarDrawingCache(s) }

    Canvas(modifier = modifier.size(size)) {
        // 0. Ambient glowing halo
        drawCircle(
            brush = cache.haloBrush,
            radius = cache.glowRadius,
            center = Offset(cache.cx, cache.cy)
        )

        // 1. Squircle plate (molten ember background plate & rotated back sheet)
        drawRoundRect(brush = cache.baseFloorBrush, topLeft = Offset(cache.x0, cache.y0), size = Size(cache.edge, cache.edge), cornerRadius = CornerRadius(22f * s, 22f * s))
        drawRoundRect(brush = cache.layer1Brush, topLeft = Offset(cache.x0, cache.y0), size = Size(cache.edge, cache.edge), cornerRadius = CornerRadius(22f * s, 22f * s))
        drawRoundRect(brush = cache.layer2Brush, topLeft = Offset(cache.x0, cache.y0), size = Size(cache.edge, cache.edge), cornerRadius = CornerRadius(22f * s, 22f * s))
        drawRoundRect(brush = cache.layer3Brush, topLeft = Offset(cache.x0, cache.y0), size = Size(cache.edge, cache.edge), cornerRadius = CornerRadius(22f * s, 22f * s))
        drawRoundRect(brush = cache.layer4Brush, topLeft = Offset(cache.x0, cache.y0), size = Size(cache.edge, cache.edge), cornerRadius = CornerRadius(22f * s, 22f * s))
        drawRoundRect(brush = cache.domeBrush, topLeft = Offset(cache.x0, cache.y0), size = Size(cache.edge, cache.edge), cornerRadius = CornerRadius(22f * s, 22f * s))
        drawPath(path = cache.fresnelPath, brush = cache.fresnelBrush, style = Stroke(width = 2.4f * s))

        // Back sheet offset
        rotate(-4.5f, pivot = Offset(cache.cx, cache.cy)) {
            drawPath(path = cache.backSheetPath, brush = cache.backSheetBrush)
            drawPath(path = cache.backSheetPath, color = Color(255, 198, 148, 128), style = Stroke(width = 0.9f * s))
        }

        // 2. Pad drawn at Canvas level (zero clipping)
        // Pad thickness sidewall
        drawPath(path = cache.padSidewallPath, brush = cache.padSidewallBrush)

        // Frosted Pad face
        drawPath(path = cache.padPath, brush = cache.padFaceBrush)

        // Header rail
        drawRoundRect(brush = cache.railBrush, topLeft = Offset(cache.padX, cache.padY), size = Size(cache.padW, cache.headH), cornerRadius = CornerRadius(cache.padR, cache.padR))
        drawRoundRect(brush = cache.railHighlightBrush, topLeft = Offset(cache.padX, cache.padY), size = Size(cache.padW, cache.headH), cornerRadius = CornerRadius(cache.padR, cache.padR))
        drawRect(color = Color(0, 0, 0, 102), topLeft = Offset(cache.padX, cache.padY + cache.headH - 0.7f * s), size = Size(cache.padW, 0.7f * s))

        // Day Number Text in crisp ember ink (#1A0F08)
        drawIntoCanvas { canvas ->
            canvas.nativeCanvas.drawText(dayNumber.toString(), cache.cx, cache.textBaseline, cache.textPaint)
        }

        // Frosted rim outline
        drawPath(path = cache.padPath, brush = cache.frostedRimBrush, style = Stroke(width = 1f * s))

        // Binder Posts standing proud
        drawPath(path = cache.postWall1, brush = cache.postWallBrush)
        drawPath(path = cache.postWall2, brush = cache.postWallBrush)
        drawPath(path = cache.postFace1, brush = cache.postFaceBrush1)
        drawPath(path = cache.postFace2, brush = cache.postFaceBrush2)

        drawRoundRect(
            color = Color.White.copy(alpha = 0.85f),
            topLeft = Offset(cache.post1X - 0.65f * s, cache.postY + 1.5f * s),
            size = Size(1.3f * s, 3.4f * s),
            cornerRadius = CornerRadius(0.65f * s, 0.65f * s)
        )
        drawRoundRect(
            color = Color.White.copy(alpha = 0.85f),
            topLeft = Offset(cache.post2X - 0.65f * s, cache.postY + 1.5f * s),
            size = Size(1.3f * s, 3.4f * s),
            cornerRadius = CornerRadius(0.65f * s, 0.65f * s)
        )

        // Glass bezel
        drawPath(path = cache.bezelPath, brush = cache.bezelBrush, style = Stroke(width = 1.4f * s))
    }
}

/**
 * QuantDriveMark:
 * Ember plate squircle with sleek multi-layered cloud platter symbol in crisp white,
 * isometric storage discs, and glowing data core.
 * Fully cached with zero allocations during draw.
 */
@Composable
fun QuantDriveMark(
    size: Dp = 40.dp,
    modifier: Modifier = Modifier
) {
    val density = LocalDensity.current
    val sizePx = with(density) { size.toPx() }
    val s = sizePx / 100f
    val cache = remember(sizePx) { QuantDriveDrawingCache(s) }

    Canvas(modifier = modifier.size(size)) {
        // 0. Ambient glowing halo
        drawCircle(
            brush = cache.haloBrush,
            radius = cache.glowRadius,
            center = Offset(cache.cx, cache.cy)
        )

        // 1. Squircle plate (molten ember background plate)
        drawRoundRect(brush = cache.baseFloorBrush, topLeft = Offset(cache.x0, cache.y0), size = Size(cache.edge, cache.edge), cornerRadius = CornerRadius(22f * s, 22f * s))
        drawRoundRect(brush = cache.layer1Brush, topLeft = Offset(cache.x0, cache.y0), size = Size(cache.edge, cache.edge), cornerRadius = CornerRadius(22f * s, 22f * s))
        drawRoundRect(brush = cache.layer2Brush, topLeft = Offset(cache.x0, cache.y0), size = Size(cache.edge, cache.edge), cornerRadius = CornerRadius(22f * s, 22f * s))
        drawRoundRect(brush = cache.layer3Brush, topLeft = Offset(cache.x0, cache.y0), size = Size(cache.edge, cache.edge), cornerRadius = CornerRadius(22f * s, 22f * s))
        drawRoundRect(brush = cache.layer4Brush, topLeft = Offset(cache.x0, cache.y0), size = Size(cache.edge, cache.edge), cornerRadius = CornerRadius(22f * s, 22f * s))
        drawRoundRect(brush = cache.domeBrush, topLeft = Offset(cache.x0, cache.y0), size = Size(cache.edge, cache.edge), cornerRadius = CornerRadius(22f * s, 22f * s))
        drawPath(path = cache.fresnelPath, brush = cache.fresnelBrush, style = Stroke(width = 2.4f * s))

        // Platter 1: Bottom Obsidian-Ember Storage Disc
        drawPath(path = cache.p1SidePath, brush = cache.p1SideBrush)
        drawOval(brush = cache.p1TopBrush, topLeft = Offset(cache.ox - cache.p1Rx, cache.p1Y - cache.p1Ry), size = Size(cache.p1Rx * 2f, cache.p1Ry * 2f))
        drawOval(color = Color(255, 140, 66, 89), topLeft = Offset(cache.ox - cache.p1Rx, cache.p1Y - cache.p1Ry), size = Size(cache.p1Rx * 2f, cache.p1Ry * 2f), style = Stroke(width = 0.8f * s))

        // Platter 2: Middle Amber-Gold Storage Disc
        drawPath(path = cache.p2SidePath, brush = cache.p2SideBrush)
        drawOval(brush = cache.p2TopBrush, topLeft = Offset(cache.ox - cache.p2Rx, cache.p2Y - cache.p2Ry), size = Size(cache.p2Rx * 2f, cache.p2Ry * 2f))
        drawOval(color = Color(255, 200, 140, 115), topLeft = Offset(cache.ox - cache.p2Rx, cache.p2Y - cache.p2Ry), size = Size(cache.p2Rx * 2f, cache.p2Ry * 2f), style = Stroke(width = 0.8f * s))
        drawOval(color = Color(255, 230, 200, 64), topLeft = Offset(cache.ox - 15f * s, cache.p2Y - 4.8f * s), size = Size(30f * s, 9.6f * s), style = Stroke(width = 0.6f * s))

        // Platter 3: Sleek Frosted Cloud Surface
        drawPath(path = cache.cloudPath, brush = cache.cloudBrush)
        drawPath(path = cache.cloudPath, brush = cache.cloudStrokeBrush, style = Stroke(width = 1.1f * s))

        // Glowing data diamond nucleus
        drawCircle(brush = cache.coreGlowBrush, radius = 8f * s, center = Offset(cache.ox, cache.coreY))
        drawPath(path = cache.diamondPath, brush = cache.diamondBrush)
        drawPath(path = cache.diamondPath, color = Color.White, style = Stroke(width = 0.7f * s))

        // Floating data nodes
        drawCircle(color = Color(255, 235, 200, 204), radius = 1.2f * s, center = Offset(cache.ox + 22f * s, cache.oy - 6f * s))
        drawCircle(color = Color(255, 235, 200, 166), radius = 1.0f * s, center = Offset(cache.ox - 20f * s, cache.oy - 3f * s))
        drawCircle(color = Color(255, 235, 200, 128), radius = 0.9f * s, center = Offset(cache.ox + 16f * s, cache.oy - 12f * s))

        // Glass bezel
        drawPath(path = cache.bezelPath, brush = cache.bezelBrush, style = Stroke(width = 1.4f * s))
    }
}

/**
 * QuantContactsMark:
 * Ember plate squircle with two overlapping silhouette figures with warm plate lighting,
 * lit shoulder rim arc, and crescent head rim.
 * Fully cached with zero allocations during draw.
 */
@Composable
fun QuantContactsMark(
    size: Dp = 40.dp,
    modifier: Modifier = Modifier
) {
    val density = LocalDensity.current
    val sizePx = with(density) { size.toPx() }
    val s = sizePx / 100f
    val cache = remember(sizePx) { QuantContactsDrawingCache(s) }

    Canvas(modifier = modifier.size(size)) {
        // 0. Ambient glowing halo
        drawCircle(
            brush = cache.haloBrush,
            radius = cache.glowRadius,
            center = Offset(cache.cx, cache.cy)
        )

        // 1. Squircle plate (molten ember background plate)
        drawRoundRect(brush = cache.baseFloorBrush, topLeft = Offset(cache.x0, cache.y0), size = Size(cache.edge, cache.edge), cornerRadius = CornerRadius(22f * s, 22f * s))
        drawRoundRect(brush = cache.layer1Brush, topLeft = Offset(cache.x0, cache.y0), size = Size(cache.edge, cache.edge), cornerRadius = CornerRadius(22f * s, 22f * s))
        drawRoundRect(brush = cache.layer2Brush, topLeft = Offset(cache.x0, cache.y0), size = Size(cache.edge, cache.edge), cornerRadius = CornerRadius(22f * s, 22f * s))
        drawRoundRect(brush = cache.layer3Brush, topLeft = Offset(cache.x0, cache.y0), size = Size(cache.edge, cache.edge), cornerRadius = CornerRadius(22f * s, 22f * s))
        drawRoundRect(brush = cache.layer4Brush, topLeft = Offset(cache.x0, cache.y0), size = Size(cache.edge, cache.edge), cornerRadius = CornerRadius(22f * s, 22f * s))
        drawRoundRect(brush = cache.domeBrush, topLeft = Offset(cache.x0, cache.y0), size = Size(cache.edge, cache.edge), cornerRadius = CornerRadius(22f * s, 22f * s))
        drawPath(path = cache.fresnelPath, brush = cache.fresnelBrush, style = Stroke(width = 2.4f * s))

        // Figure Behind (Peach)
        translate(top = 1.9f * s) {
            drawPath(path = cache.backFigurePath, brush = cache.backSidewallBrush)
        }
        drawPath(path = cache.backFigurePath, brush = cache.backFaceBrush)
        drawPath(path = cache.backFigurePath, brush = cache.backSeamBrush, style = Stroke(width = 1.5f * s))

        // Figure In Front (Dark Ember)
        translate(top = 2.8f * s) {
            drawPath(path = cache.frontFigurePath, brush = cache.frontSidewallBrush)
        }
        drawPath(path = cache.frontFigurePath, brush = cache.frontFaceBrush)
        drawPath(path = cache.frontBodyPath, brush = cache.frontShoulderLightBrush, style = Stroke(width = 1.9f * s))
        drawPath(path = cache.headRimPath, brush = cache.headRimBrush, style = Stroke(width = 1.9f * s, cap = StrokeCap.Round))

        // Glass bezel
        drawPath(path = cache.bezelPath, brush = cache.bezelBrush, style = Stroke(width = 1.4f * s))
    }
}

/**
 * QuantGitMark:
 * Obsidian squircle plate with iridescent chrome bezel border, top-right specular notch,
 * and Git's rotated diamond in vibrant ember (#FF8C42) with trunk and branch commits.
 * Fully cached with zero allocations during draw.
 */
@Composable
fun QuantGitMark(
    size: Dp = 40.dp,
    modifier: Modifier = Modifier
) {
    val density = LocalDensity.current
    val sizePx = with(density) { size.toPx() }
    val s = sizePx / 100f
    val cache = remember(sizePx) { QuantGitDrawingCache(s) }

    Canvas(modifier = modifier.size(size)) {
        // 0. Ambient glowing halo
        drawCircle(
            brush = cache.haloBrush,
            radius = cache.glowRadius,
            center = Offset(cache.cx, cache.cy)
        )

        // 1. Obsidian plate base & sheens
        drawRoundRect(
            brush = cache.obsidianBaseBrush,
            topLeft = Offset(cache.x0, cache.y0),
            size = Size(cache.edge, cache.edge),
            cornerRadius = CornerRadius(22f * s, 22f * s)
        )
        drawCircle(brush = cache.coolSheenBrush, radius = 38f * s, center = Offset(cache.cx - 15f * s, cache.cy - 18f * s))
        drawCircle(brush = cache.warmReflectionBrush, radius = 44f * s, center = Offset(cache.cx + 19f * s, cache.cy + 20f * s))

        // 2. Notch at Canvas level
        drawPath(path = cache.notchPath, brush = cache.notchBrush, style = Stroke(width = 3f * s))

        // 3. Rotated Diamond & Git Graph at Canvas level (zero nested clipping)
        rotate(45f, pivot = Offset(cache.cx, cache.cy)) {
            drawPath(path = cache.diamondWall, brush = cache.diamondWallBrush)
            drawPath(path = cache.diamondFace, brush = cache.diamondFaceBrush)
            drawRect(
                brush = cache.diamondDomeBrush,
                topLeft = Offset(cache.cx - cache.dHalf, cache.cy - cache.dHalf),
                size = Size(cache.dHalf * 2f, cache.dHalf * 2f)
            )
        }

        // Git Graph: Trunk and Branch
        drawPath(path = cache.graphPath, color = Color(74, 26, 4, 128), style = Stroke(width = 6.2f * s, cap = StrokeCap.Round, join = StrokeJoin.Round))
        drawPath(path = cache.graphPath, brush = cache.graphInkBrush, style = Stroke(width = 4f * s, cap = StrokeCap.Round, join = StrokeJoin.Round))

        for (node in listOf(cache.trunkA, cache.trunkB, cache.leaf)) {
            drawCircle(color = Color(74, 26, 4, 128), radius = 5.4f * s, center = node)
            drawCircle(color = Color(0xFF, 0xF6, 0xEC), radius = 4.2f * s, center = node)
        }

        // Iridescent Chrome Bezel
        drawPath(path = cache.chromeBezelPath, color = Color(9, 10, 14, 240), style = Stroke(width = 3.5f * s))
        drawPath(path = cache.chromeBezelPath, brush = cache.chromeSweepBrush, style = Stroke(width = 2.3f * s))
    }
}

/**
 * Individual Squircle Brand Mark badge fallback for secondary/ecosystem services.
 */
@Composable
fun QuantBrandMark(
    initials: String,
    icon: ImageVector? = null,
    accentColor: Color,
    size: Dp = 40.dp,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .size(size)
            .clip(RoundedCornerShape(9.dp))
            .background(
                Brush.linearGradient(
                    colors = listOf(
                        accentColor.copy(alpha = 0.22f),
                        accentColor.copy(alpha = 0.08f),
                        Color(0xFF14, 0x17, 0x20)
                    )
                )
            )
            .border(
                width = 1.dp,
                color = accentColor.copy(alpha = 0.40f),
                shape = RoundedCornerShape(9.dp)
            ),
        contentAlignment = Alignment.Center
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = initials,
                tint = accentColor,
                modifier = Modifier.size(19.dp)
            )
        } else {
            Text(
                text = initials,
                color = accentColor,
                fontSize = 12.5.sp,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = 0.5.sp
            )
        }
    }
}

// =============================================================================
// BRAND WORDMARK (DIRECTLY MATCHING APPS/QUANTMAIL BRANDWORDMARK.TSX)
// =============================================================================

/**
 * Official Brand Wordmark matching apps/quantmail/src/components/BrandWordmark.tsx.
 *
 * Renders:
 * - 'Quant' in pure crisp white (Color(0xFF, 0xF5, 0xF5, 0xF5)),
 *   fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.5).sp
 * - Followed by the app name ('Mail', 'Calendar', 'Drive', 'Contacts', 'Git')
 *   in the app's signature accent color:
 *   - 'Mail' in Color(0xFFFF, 0x8C, 0x42)
 *   - 'Calendar' in Color(0xFFF5, 0x9E, 0x0B)
 *   - 'Drive' in Color(0xFF38, 0xBD, 0xF8)
 *   - 'Contacts' in Color(0xFF10, 0xB9, 0x81)
 *   - 'Git' in Color(0xFFA7, 0x8B, 0xFA)
 *   fontSize = 20.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp.
 */
@Composable
fun BrandWordmark(
    app: String = "mail",
    fontSize: TextUnit = 20.sp,
    modifier: Modifier = Modifier
) {
    val norm = remember(app) { app.trim().lowercase() }
    val (brand, appName, accentColor) = remember(norm) {
        when {
            norm == "mail" || norm == "quantmail" -> Triple("Quant", "Mail", Color(0xFFFF, 0x8C, 0x42))
            norm == "calendar" || norm == "quantcalendar" -> Triple("Quant", "Calendar", Color(0xFFF5, 0x9E, 0x0B))
            norm == "drive" || norm == "quantdrive" -> Triple("Quant", "Drive", Color(0xFF38, 0xBD, 0xF8))
            norm == "contacts" || norm == "quantcontacts" || norm == "quantdex" || norm == "dex" -> Triple("Quant", "Contacts", Color(0xFF10, 0xB9, 0x81))
            norm == "git" || norm == "quantgit" || norm == "code" || norm == "codehub" -> Triple("Quant", "Git", Color(0xFFA7, 0x8B, 0xFA))
            norm.contains("chat") -> Triple("Quant", "Chat", Color(0xFF10, 0xB9, 0x81))
            norm.contains("tube") -> Triple("Quant", "Tube", Color(0xFFFF, 0x22, 0x22))
            norm.contains("ai") -> Triple("Quant", "AI", Color(0xFF8B, 0x5C, 0xF6))
            else -> Triple("Quant", app.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }, Color(0xFFFF, 0x8C, 0x42))
        }
    }

    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        Text(
            text = brand,
            color = Color(0xFF, 0xF5, 0xF5, 0xF5),
            fontSize = fontSize,
            fontWeight = FontWeight.ExtraBold,
            letterSpacing = (-0.5).sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Text(
            text = appName,
            color = accentColor,
            fontSize = fontSize,
            fontWeight = FontWeight.Bold,
            letterSpacing = (-0.5).sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

/**
 * Tab-aware Brand Logo for top app bars and headers.
 * Renders the glowing 40dp artisan mark + split BrandWordmark.
 */
@Composable
fun QuantBrandLogo(
    activeTab: ProductivityTab = ProductivityTab.Mail,
    title: String? = null,
    accentColor: Color = activeTab.tabAccentColor,
    showTitle: Boolean = true,
    size: Dp = 40.dp,
    onClick: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val haptic = LocalHapticFeedback.current

    val appKey = remember(activeTab, title) {
        if (title != null) {
            when {
                title.contains("Mail", ignoreCase = true) -> "mail"
                title.contains("Calendar", ignoreCase = true) -> "calendar"
                title.contains("Drive", ignoreCase = true) -> "drive"
                title.contains("Contact", ignoreCase = true) -> "contacts"
                title.contains("Git", ignoreCase = true) || title.contains("CodeHub", ignoreCase = true) -> "git"
                else -> title.lowercase()
            }
        } else {
            when (activeTab) {
                ProductivityTab.Mail -> "mail"
                ProductivityTab.Calendar -> "calendar"
                ProductivityTab.Drive -> "drive"
                ProductivityTab.Contacts -> "contacts"
                ProductivityTab.QuantGit -> "git"
            }
        }
    }

    Row(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .then(
                if (onClick != null) {
                    Modifier.clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = {
                            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                            onClick()
                        }
                    )
                } else Modifier
            ),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        when (activeTab) {
            ProductivityTab.Mail -> QuantMailLavaMark(size = size)
            ProductivityTab.Calendar -> QuantCalendarMark(size = size)
            ProductivityTab.Drive -> QuantDriveMark(size = size)
            ProductivityTab.Contacts -> QuantContactsMark(size = size)
            ProductivityTab.QuantGit -> QuantGitMark(size = size)
        }

        if (showTitle) {
            BrandWordmark(app = appKey, fontSize = 20.sp)
        }
    }
}

/**
 * Universal App Logo dispatcher for the Quant Ecosystem.
 * Routes core productivity apps to their mathematical canvas marks,
 * and secondary apps to their styled badges.
 */
@Composable
fun QuantAppLogo(
    appId: String,
    size: Dp = 40.dp,
    accentColor: Color = Color(0xFFFF, 0x8C, 0x42),
    modifier: Modifier = Modifier
) {
    val norm = appId.trim().lowercase()
    when {
        norm == "quantmail" || norm == "mail" || norm == "email" -> {
            QuantMailLavaMark(size = size, modifier = modifier)
        }
        norm == "quantcalendar" || norm == "calendar" || norm == "cal" -> {
            QuantCalendarMark(size = size, modifier = modifier)
        }
        norm == "quantdrive" || norm == "drive" || norm == "storage" -> {
            QuantDriveMark(size = size, modifier = modifier)
        }
        norm == "quantcontacts" || norm == "contacts" || norm == "quantdex" || norm == "dex" -> {
            QuantContactsMark(size = size, modifier = modifier)
        }
        norm == "quantgit" || norm == "git" || norm == "codehub" || norm == "code" -> {
            QuantGitMark(size = size, modifier = modifier)
        }
        norm.contains("calendar") -> QuantCalendarMark(size = size, modifier = modifier)
        norm.contains("drive") -> QuantDriveMark(size = size, modifier = modifier)
        norm.contains("contact") -> QuantContactsMark(size = size, modifier = modifier)
        norm.contains("git") || norm.contains("codehub") -> QuantGitMark(size = size, modifier = modifier)
        norm.contains("chat") -> QuantBrandMark(
            initials = "QC",
            icon = Icons.AutoMirrored.Filled.Send,
            accentColor = Color(0xFF10, 0xB9, 0x81),
            size = size,
            modifier = modifier
        )
        norm.contains("tube") -> QuantBrandMark(
            initials = "QT",
            icon = Icons.Default.PlayArrow,
            accentColor = Color(0xFFFF, 0x22, 0x22),
            size = size,
            modifier = modifier
        )
        norm.contains("ai") -> QuantBrandMark(
            initials = "QA",
            icon = Icons.Default.AutoAwesome,
            accentColor = Color(0xFF8B, 0x5C, 0xF6),
            size = size,
            modifier = modifier
        )
        else -> QuantMailLavaMark(size = size, modifier = modifier)
    }
}

/**
 * High-visibility wordmark header presenting the mathematical logo mark,
 * bold title, and optional badge pill (e.g. "Zero-mock", "v2.5").
 */
@Composable
fun QuantWordmarkHeader(
    appId: String,
    title: String,
    subtitle: String? = null,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        QuantAppLogo(appId = appId, size = 36.dp)
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = title,
                color = Color.White,
                fontSize = 18.sp,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = (-0.3).sp
            )
            if (!subtitle.isNullOrBlank()) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(Color(0xFF22, 0x16, 0x0E))
                        .border(
                            1.dp,
                            QuantBrandTokens.Ember.copy(alpha = 0.45f),
                            RoundedCornerShape(6.dp)
                        )
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = subtitle,
                        color = QuantBrandTokens.Ember,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.2.sp
                    )
                }
            }
        }
    }
}

package com.quant.app.ui.views

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color

/**
 * NativeQuantGitView - Sovereign 5-Pillar View for QuantGit Engine.
 * Implements GitHub Mobile-class sovereign repository exploration with in-repo Quanty AI Copilot.
 * 
 * Provides sovereign parity for:
 * 1. Smart HTTP / Git Tree inspection & Branch selection
 * 2. In-Repo Quanty AI Copilot drawer with interactive chat & code suggestions
 * 3. AI Code Review modal with rich quality/coverage/security metrics
 * 4. Active Pull Requests, Issues, Actions CI/CD pipelines, and verified commits timeline
 */
@Composable
fun NativeQuantGitView(
    onNewRepoClick: () -> Unit = {},
    onPrClick: (Int) -> Unit = {},
    onCommitClick: (String) -> Unit = {},
    accentColor: Color = Color(0xFF10, 0xB9, 0x81), // Sovereign Git Green
    modifier: Modifier = Modifier
) {
    NativeCodeHubView(
        onNewRepoClick = onNewRepoClick,
        onPrClick = onPrClick,
        onCommitClick = onCommitClick,
        accentColor = accentColor,
        modifier = modifier
    )
}

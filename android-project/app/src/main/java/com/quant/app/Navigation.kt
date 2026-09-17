package com.quant.app

import android.webkit.WebView
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import com.quant.app.ui.main.MainScreen

@Composable
fun MainNavigation(
  deepLinkUrl: String? = null,
  onWebViewAttached: (WebView) -> Unit = {},
) {
  val backStack = rememberNavBackStack(Main)

  NavDisplay(
    backStack = backStack,
    onBack = { backStack.removeLastOrNull() },
    entryProvider =
      entryProvider {
        entry<Main> {
          MainScreen(
            onItemClick = { navKey -> backStack.add(navKey) },
            deepLinkUrl = deepLinkUrl,
            onWebViewAttached = onWebViewAttached,
            modifier = Modifier.safeDrawingPadding().padding(16.dp)
          )
        }
      },
  )
}

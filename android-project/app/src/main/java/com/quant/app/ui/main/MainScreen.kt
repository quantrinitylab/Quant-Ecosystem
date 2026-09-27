package com.quant.app.ui.main

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.net.http.SslError
import android.view.ViewGroup
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.navigation3.runtime.NavKey
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.quant.app.BuildConfig
import com.quant.app.MainActivity

fun getAppAccentColor(): Color {
  return when (BuildConfig.FLAVOR) {
    "quantchat" -> Color(0xFF10, 0xB9, 0x81) // Emerald Green
    "quantgram" -> Color(0xFFE1, 0x30, 0x6C) // Instagram Pink / Rose
    "quantube" -> Color(0xFFFF, 0x22, 0x22) // YouTube Red
    "quantai" -> Color(0xFF8B, 0x5C, 0xF6) // Purple / Violet
    "quantdrive" -> Color(0xFF0E, 0xA5, 0xE9) // Sky Blue
    "quantcalendar" -> Color(0xFFF5, 0x9E, 0x0B) // Amber
    "codehub" -> Color(0xFF10, 0xB9, 0x81) // GitHub Green
    else -> Color(0xFFFF, 0x8C, 0x42) // Sovereign Orange (QuantMail & QuantApp)
  }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun MainScreen(
  onItemClick: (NavKey) -> Unit = {},
  deepLinkUrl: String? = null,
  onWebViewAttached: (WebView) -> Unit = {},
  modifier: Modifier = Modifier,
) {
  val accentColor = remember { getAppAccentColor() }
  var webViewRef by remember { mutableStateOf<WebView?>(null) }
  var swipeRefreshRef by remember { mutableStateOf<SwipeRefreshLayout?>(null) }
  var isLoading by remember { mutableStateOf(true) }
  var loadProgress by remember { mutableIntStateOf(0) }
  var isError by remember { mutableStateOf(false) }

  // Handle deep link restoration in active WebView
  LaunchedEffect(deepLinkUrl) {
    if (!deepLinkUrl.isNullOrBlank()) {
      webViewRef?.loadUrl(deepLinkUrl)
    }
  }

  // Native Android back press navigates WebView history
  BackHandler(enabled = webViewRef?.canGoBack() == true) {
    webViewRef?.goBack()
  }

  Box(
    modifier = modifier
      .fillMaxSize()
      .background(Color(0xFF0B, 0x0C, 0x0E))
  ) {
    if (isError) {
      Column(
        modifier = Modifier
          .fillMaxSize()
          .padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
      ) {
        Box(
          modifier = Modifier
            .size(64.dp)
            .background(Color(0xFF16, 0x18, 0x1D), shape = RoundedCornerShape(16.dp)),
          contentAlignment = Alignment.Center
        ) {
          Text(text = "⚡", fontSize = 32.sp)
        }
        Spacer(modifier = Modifier.height(20.dp))
        Text(
          text = "Connection Offline",
          color = Color.White,
          fontSize = 20.sp,
          fontWeight = FontWeight.Bold,
          modifier = Modifier.padding(bottom = 8.dp)
        )
        Text(
          text = "Unable to connect to ${BuildConfig.APP_NAME} sovereign server. Please check your internet connection and try again.",
          color = Color(0xFF9C, 0xA3, 0xAF),
          fontSize = 14.sp,
          textAlign = TextAlign.Center,
          modifier = Modifier.padding(bottom = 24.dp)
        )
        Button(
          onClick = {
            isError = false
            isLoading = true
            webViewRef?.reload()
          },
          colors = ButtonDefaults.buttonColors(
            containerColor = accentColor,
            contentColor = Color.Black
          ),
          shape = RoundedCornerShape(12.dp)
        ) {
          Text(text = "Retry Connection", fontWeight = FontWeight.Bold)
        }
      }
    } else {
      AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { context ->
          val swipeRefresh = SwipeRefreshLayout(context).apply {
            setColorSchemeColors(accentColor.toArgb())
            setProgressBackgroundColorSchemeColor(android.graphics.Color.parseColor("#16181D"))
            layoutParams = ViewGroup.LayoutParams(
              ViewGroup.LayoutParams.MATCH_PARENT,
              ViewGroup.LayoutParams.MATCH_PARENT
            )
          }

          val webView = WebView(context).apply {
            layoutParams = ViewGroup.LayoutParams(
              ViewGroup.LayoutParams.MATCH_PARENT,
              ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(android.graphics.Color.parseColor("#0B0C0E"))

            // Hardened production WebSettings
            MainActivity.configureWebSettings(settings)

            webViewClient = object : WebViewClient() {
              override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                isLoading = true
                isError = false
              }

              override fun onPageFinished(view: WebView?, url: String?) {
                isLoading = false
                swipeRefresh.isRefreshing = false
              }

              override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
              ) {
                if (request?.isForMainFrame == true) {
                  isError = true
                  isLoading = false
                  swipeRefresh.isRefreshing = false
                }
              }

              override fun onReceivedSslError(
                view: WebView?,
                handler: SslErrorHandler?,
                error: SslError?
              ) {
                // In production, proceed only for valid certs
                handler?.cancel()
              }

              override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
              ): Boolean {
                val url = request?.url?.toString() ?: return false
                return handleNavigation(url)
              }

              @Deprecated("Deprecated in Java")
              override fun shouldOverrideUrlLoading(
                view: WebView?,
                url: String?
              ): Boolean {
                if (url == null) return false
                return handleNavigation(url)
              }

              private fun handleNavigation(url: String): Boolean {
                // Intercept external OAuth providers (Google, GitHub, Apple)
                // Launch in secure Chrome Custom Tabs to prevent disallowed_useragent rejection
                if (MainActivity.isExternalAuthUrl(url)) {
                  MainActivity.launchCustomTab(context, url)
                  return true
                }
                return false
              }
            }

            webChromeClient = object : WebChromeClient() {
              override fun onProgressChanged(view: WebView?, newProgress: Int) {
                loadProgress = newProgress
                if (newProgress >= 100) {
                  isLoading = false
                  swipeRefresh.isRefreshing = false
                }
              }
            }

            // Load initial target URL
            val initialUrl = deepLinkUrl?.takeIf { it.isNotBlank() } ?: BuildConfig.DEFAULT_APP_URL
            loadUrl(initialUrl)
          }

          swipeRefresh.addView(webView)
          swipeRefresh.setOnRefreshListener {
            webView.reload()
          }

          webViewRef = webView
          swipeRefreshRef = swipeRefresh
          onWebViewAttached(webView)

          swipeRefresh
        },
        update = {
          // Keep references in sync
        }
      )
    }

    // Sleek Edge-to-Edge Progress Bar (Safari/Chrome/Telegram style)
    AnimatedVisibility(
      visible = isLoading,
      enter = fadeIn(),
      exit = fadeOut(),
      modifier = Modifier
        .align(Alignment.TopCenter)
        .statusBarsPadding()
    ) {
      LinearProgressIndicator(
        progress = { loadProgress / 100f },
        modifier = Modifier
          .fillMaxWidth()
          .height(2.5.dp),
        color = accentColor,
        trackColor = Color.Transparent
      )
    }
  }
}

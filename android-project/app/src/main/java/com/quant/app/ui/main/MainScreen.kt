package com.quant.app.ui.main

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.net.Uri
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.navigation3.runtime.NavKey
import com.quant.app.BuildConfig
import com.quant.app.MainActivity

data class NavigationTab(
  val title: String,
  val icon: String,
  val url: String
)

val NAV_TABS = listOf(
  NavigationTab("Mail", "✉", "https://quantmail.in/"),
  NavigationTab("QuantGit", "⑂", "https://quantmail.in/quantgit"),
  NavigationTab("Calendar", "📅", "https://quantmail.in/calendar"),
  NavigationTab("Drive", "☁", "https://quantmail.in/drive"),
  NavigationTab("Contacts", "👥", "https://quantmail.in/contacts")
)

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
  var selectedTabIndex by remember { mutableIntStateOf(0) }
  var isLoading by remember { mutableStateOf(true) }
  var loadProgress by remember { mutableIntStateOf(0) }
  var isError by remember { mutableStateOf(false) }
  var currentUrl by remember { mutableStateOf(BuildConfig.DEFAULT_APP_URL) }

  // Handle deep link restoration in active WebView
  LaunchedEffect(deepLinkUrl) {
    if (!deepLinkUrl.isNullOrBlank()) {
      webViewRef?.loadUrl(deepLinkUrl)
    }
  }

  BackHandler(enabled = webViewRef?.canGoBack() == true) {
    webViewRef?.goBack()
  }

  Scaffold(
    modifier = modifier.fillMaxSize(),
    containerColor = Color(0xFF0B, 0x0C, 0x0E),
    topBar = {
      Surface(
        color = Color(0xFF0B, 0x0C, 0x0E),
        modifier = Modifier.fillMaxWidth()
      ) {
        Column {
          Row(
            modifier = Modifier
              .fillMaxWidth()
              .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
          ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
              Box(
                modifier = Modifier
                  .size(28.dp)
                  .clip(CircleShape)
                  .background(accentColor),
                contentAlignment = Alignment.Center
              ) {
                Box(
                  modifier = Modifier
                    .size(10.dp)
                    .clip(CircleShape)
                    .background(Color(0xFF2B, 0x1A, 0x11))
                )
              }
              Spacer(modifier = Modifier.width(10.dp))
              Text(
                text = BuildConfig.APP_NAME,
                color = Color.White,
                fontSize = 17.sp,
                fontWeight = FontWeight.Bold
              )
              Text(
                text = " Sovereign",
                color = accentColor,
                fontSize = 17.sp,
                fontWeight = FontWeight.Bold
              )
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
              Surface(
                shape = RoundedCornerShape(12.dp),
                color = Color(0x22, 0x34, 0xD3, 0x99),
                border = BorderStroke(1.dp, Color(0x55, 0x34, 0xD3, 0x99))
              ) {
                Row(
                  modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                  verticalAlignment = Alignment.CenterVertically
                ) {
                  Box(
                    modifier = Modifier
                      .size(6.dp)
                      .clip(CircleShape)
                      .background(Color(0xFF34, 0xD3, 0x99))
                  )
                  Spacer(modifier = Modifier.width(5.dp))
                  Text(
                    text = "Live",
                    color = Color(0xFF34, 0xD3, 0x99),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold
                  )
                }
              }

              Spacer(modifier = Modifier.width(8.dp))

              Box(
                modifier = Modifier
                  .size(32.dp)
                  .clip(RoundedCornerShape(8.dp))
                  .background(Color(0xFF16, 0x18, 0x1D))
                  .clickable { webViewRef?.reload() },
                contentAlignment = Alignment.Center
              ) {
                Text(text = "↻", color = Color.White, fontSize = 16.sp)
              }
            }
          }

          if (isLoading) {
            LinearProgressIndicator(
              progress = { loadProgress / 100f },
              modifier = Modifier.fillMaxWidth().height(2.dp),
              color = accentColor,
              trackColor = Color(0xFF28, 0x2C, 0x35)
            )
          }
        }
      }
    },
    bottomBar = {
      if (BuildConfig.FLAVOR == "quantapp" || BuildConfig.FLAVOR.isEmpty()) {
        NavigationBar(
          containerColor = Color(0xFF0B, 0x0C, 0x0E),
          tonalElevation = 8.dp,
          modifier = Modifier.height(64.dp)
        ) {
          NAV_TABS.forEachIndexed { index, tab ->
            val isSelected = selectedTabIndex == index
            NavigationBarItem(
              selected = isSelected,
              onClick = {
                selectedTabIndex = index
                currentUrl = tab.url
                isError = false
                webViewRef?.loadUrl(tab.url)
              },
              icon = {
                Text(
                  text = tab.icon,
                  fontSize = 18.sp,
                  color = if (isSelected) accentColor else Color(0xFF6B, 0x72, 0x80)
                )
              },
              label = {
                Text(
                  text = tab.title,
                  fontSize = 11.sp,
                  fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                  color = if (isSelected) accentColor else Color(0xFF6B, 0x72, 0x80)
                )
              },
              colors = NavigationBarItemDefaults.colors(
                selectedIconColor = accentColor,
                selectedTextColor = accentColor,
                indicatorColor = accentColor.copy(alpha = 0.15f),
                unselectedIconColor = Color(0xFF6B, 0x72, 0x80),
                unselectedTextColor = Color(0xFF6B, 0x72, 0x80)
              )
            )
          }
        }
      }
    }
  ) { paddingValues ->
    Box(
      modifier = Modifier
        .fillMaxSize()
        .padding(paddingValues)
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
          Text(
            text = "⚡",
            fontSize = 48.sp,
            modifier = Modifier.padding(bottom = 16.dp)
          )
          Text(
            text = "Connection Offline",
            color = Color.White,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(bottom = 8.dp)
          )
          Text(
            text = "Unable to connect to ${BuildConfig.APP_NAME} sovereign server. Please check your network connection and retry.",
            color = Color(0xFF9C, 0xA3, 0xAF),
            fontSize = 14.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(bottom = 24.dp)
          )
          Button(
            onClick = {
              isError = false
              isLoading = true
              webViewRef?.loadUrl(currentUrl)
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
          factory = { context ->
            WebView(context).apply {
              layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
              )
              setBackgroundColor(android.graphics.Color.parseColor("#0B0C0E"))

              // Production WebView hardening:
              // - Disallow mixed content (never allow unencrypted content)
              // - Disallow local file and content access
              MainActivity.configureWebSettings(settings)

              webViewClient = object : WebViewClient() {
                override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                  isLoading = true
                  isError = false
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                  isLoading = false
                }

                override fun onReceivedError(
                  view: WebView?,
                  request: WebResourceRequest?,
                  error: WebResourceError?
                ) {
                  if (request?.isForMainFrame == true) {
                    isError = true
                    isLoading = false
                  }
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
                  // 1. Intercept Google OAuth and external auth providers:
                  // Launch them in secure Chrome Custom Tabs to avoid Google's disallowed_useragent error.
                  if (MainActivity.isExternalAuthUrl(url)) {
                    MainActivity.launchCustomTab(context, url)
                    return true
                  }

                  // 2. Internal app navigation: current app host or Quant ecosystem domain stays inside WebView
                  val parsedUri = try { Uri.parse(url) } catch (e: Exception) { null }
                  val host = parsedUri?.host?.lowercase() ?: ""
                  val appHost = BuildConfig.APP_HOST.lowercase()

                  val isInternalHost = host == appHost ||
                                       host == "www.$appHost" ||
                                       host == "quantmail.in" ||
                                       host == "www.quantmail.in" ||
                                       host.endsWith(".quantrinity.in")

                  if (isInternalHost) {
                    return false
                  }

                  // 3. Any other external links should be launched via Custom Tabs for security
                  if (parsedUri?.scheme == "http" || parsedUri?.scheme == "https") {
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
                  }
                }
              }

              loadUrl(currentUrl)
              webViewRef = this
              onWebViewAttached(this)
            }
          },
          update = {},
          modifier = Modifier.fillMaxSize()
        )
      }
    }
  }
}

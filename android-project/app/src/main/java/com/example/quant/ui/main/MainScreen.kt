package com.example.quant.ui.main

import android.annotation.SuppressLint
import android.graphics.Bitmap
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

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun MainScreen(
  onItemClick: (NavKey) -> Unit = {},
  modifier: Modifier = Modifier,
) {
  var webViewRef by remember { mutableStateOf<WebView?>(null) }
  var selectedTabIndex by remember { mutableIntStateOf(0) }
  var isLoading by remember { mutableStateOf(true) }
  var loadProgress by remember { mutableIntStateOf(0) }
  var isError by remember { mutableStateOf(false) }
  var currentUrl by remember { mutableStateOf("https://quantmail.in/") }

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
                  .background(Color(0xFFFF, 0x8C, 0x42)),
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
                text = "Quant",
                color = Color.White,
                fontSize = 17.sp,
                fontWeight = FontWeight.Bold
              )
              Text(
                text = " Sovereign",
                color = Color(0xFFFF, 0x8C, 0x42),
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
              color = Color(0xFFFF, 0x8C, 0x42),
              trackColor = Color(0xFF28, 0x2C, 0x35)
            )
          }
        }
      }
    },
    bottomBar = {
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
                fontSize = if (isSelected) 18.sp else 16.sp
              )
            },
            label = {
              Text(
                text = tab.title,
                fontSize = 10.sp,
                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
              )
            },
            colors = NavigationBarItemDefaults.colors(
              selectedIconColor = Color(0xFFFF, 0x8C, 0x42),
              selectedTextColor = Color(0xFFFF, 0x8C, 0x42),
              indicatorColor = Color(0xFF2B, 0x1A, 0x11),
              unselectedIconColor = Color(0xFFA1, 0xA4, 0xAC),
              unselectedTextColor = Color(0xFFA1, 0xA4, 0xAC)
            )
          )
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
            .padding(24.dp),
          horizontalAlignment = Alignment.CenterHorizontally,
          verticalArrangement = Arrangement.Center
        ) {
          Box(
            modifier = Modifier
              .size(64.dp)
              .clip(CircleShape)
              .background(Color(0xFF2B, 0x1A, 0x11)),
            contentAlignment = Alignment.Center
          ) {
            Text(text = "⚡", fontSize = 32.sp)
          }
          Spacer(modifier = Modifier.height(16.dp))
          Text(
            text = "Offline Mode",
            color = Color.White,
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold
          )
          Spacer(modifier = Modifier.height(8.dp))
          Text(
            text = "Could not reach sovereign gateway. Please check your internet connection.",
            color = Color(0xFFA1, 0xA4, 0xAC),
            fontSize = 13.sp,
            textAlign = TextAlign.Center
          )
          Spacer(modifier = Modifier.height(20.dp))
          Button(
            onClick = {
              isError = false
              webViewRef?.loadUrl(currentUrl)
            },
            colors = ButtonDefaults.buttonColors(
              containerColor = Color(0xFFFF, 0x8C, 0x42),
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
              settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = true
                cacheMode = WebSettings.LOAD_DEFAULT
                useWideViewPort = true
                loadWithOverviewMode = true
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                userAgentString = "${settings.userAgentString} QuantApp/1.0"
              }

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
            }
          },
          update = {},
          modifier = Modifier.fillMaxSize()
        )
      }
    }
  }
}
